import { after, NextRequest, NextResponse } from "next/server";
import { computeDivination, type BirthInfo } from "@/lib/divination";
import { buildSystemPrompt } from "@/lib/prompt";
import { searchCurrentAffairs } from "@/lib/search";
import { logReading } from "@/lib/log";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

// thinking 模式下模型响应可达数十秒到数分钟，放宽执行时限（部署平台按此值生效）
export const maxDuration = 300;

// 上游模型请求的超时时间：避免上游挂起导致请求无限等待（须小于 maxDuration）
const UPSTREAM_TIMEOUT_MS = 280_000;

function sanitizeBirth(raw: unknown): BirthInfo | null {
  if (!raw || typeof raw !== "object") return null;
  const b = raw as Record<string, unknown>;
  if (typeof b.date !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(b.date)) return null;
  const birth: BirthInfo = { date: b.date };
  if (typeof b.time === "string" && /^\d{2}:\d{2}$/.test(b.time)) birth.time = b.time;
  if (typeof b.gender === "string" && b.gender.trim()) birth.gender = b.gender.trim();
  if (typeof b.city === "string" && b.city.trim()) birth.city = b.city.trim().slice(0, 30);
  return birth;
}

/** 起课时刻：同一件事的追问沿用首次起课的时刻，盘面才不会随请求漂移。
 *  只接受合理范围内的 ISO 时间，异常值回退到此刻。 */
function parseCastAt(raw: unknown): Date {
  const now = Date.now();
  if (typeof raw === "string") {
    const t = Date.parse(raw);
    // 可沿用数日内的旧课；容忍客户端时钟略有超前，但不接受离谱的未来时刻
    if (Number.isFinite(t) && t <= now + 24 * 60 * 60 * 1000 && t >= now - 7 * 24 * 60 * 60 * 1000) {
      return new Date(t);
    }
  }
  return new Date(now);
}

export async function POST(req: NextRequest) {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "服务端未配置 LLM_API_KEY，请在 .env.local 中配置后重启。" },
      { status: 500 }
    );
  }

  let body: {
    messages?: ChatMessage[];
    birth?: unknown;
    sessionId?: unknown;
    baoShu?: unknown;
    castAt?: unknown;
    recase?: unknown;
    askCity?: unknown;
  };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: "请求体不是合法的 JSON。" }, { status: 400 });
  }

  const messages = (body.messages ?? [])
    .filter(
      (m) =>
        (m?.role === "user" || m?.role === "assistant") &&
        typeof m?.content === "string" &&
        m.content.trim()
    )
    .slice(-20); // 只保留最近 20 条，控制 token

  if (messages.length === 0 || messages[messages.length - 1].role !== "user") {
    return NextResponse.json({ error: "消息列表为空或最后一条不是用户提问。" }, { status: 400 });
  }

  const birth = sanitizeBirth(body.birth);
  // 未提供生辰时的身份标识（问答记录按人聚合用）
  const sessionId =
    typeof body.sessionId === "string" ? body.sessionId.slice(0, 64) : undefined;
  // 报数：同一时辰内再问时，前端收集善信所报之数以活时起课（传统「初筮告，再三渎」）
  const baoShu =
    typeof body.baoShu === "number" && Number.isInteger(body.baoShu) && body.baoShu >= 1 && body.baoShu <= 999
      ? body.baoShu
      : undefined;
  // 问事地点：未单独填写时沿用出生地；都没有则按北京时间（未校正真太阳时）
  const askCity =
    typeof body.askCity === "string" && body.askCity.trim()
      ? body.askCity.trim().slice(0, 30)
      : birth?.city ?? null;
  // 起课：默认沿用前端传来的「本课」时刻；只有明确另起一课才换新时刻。
  // 「一事一占」——同一件事多轮追问始终读同一张盘，避免盘面变了而模型自认算错。
  const castAt = parseCastAt(body.castAt);
  const recast = body.recase === true;
  const divination = computeDivination(birth, castAt, baoShu, askCity);
  // 涉及时势的问题联网打探（需配置 TAVILY_API_KEY，未配置自动跳过）
  const currentAffairs = await searchCurrentAffairs(messages[messages.length - 1].content);
  const systemPrompt = buildSystemPrompt(divination, currentAffairs, recast);

  const baseUrl = (process.env.LLM_BASE_URL ?? "https://api.openai.com/v1").replace(/\/$/, "");
  const model = process.env.LLM_MODEL ?? "gpt-4o-mini";

  // thinking 模式（DeepSeek V4 等）：LLM_THINKING=1 开启，0 显式关闭，不设置则随服务商默认。
  // 注意 thinking 模式下 temperature 等采样参数会被模型忽略（见 DeepSeek 文档）。
  const thinkingEnv = process.env.LLM_THINKING;
  const requestBody: Record<string, unknown> = {
    model,
    messages: [{ role: "system", content: systemPrompt }, ...messages],
  };
  if (thinkingEnv === "1" || thinkingEnv === "true") {
    requestBody.thinking = { type: "enabled" };
    requestBody.reasoning_effort = process.env.LLM_REASONING_EFFORT ?? "high";
  } else if (thinkingEnv === "0" || thinkingEnv === "false") {
    requestBody.thinking = { type: "disabled" };
    requestBody.temperature = 0.8;
  } else {
    requestBody.temperature = 0.8;
  }

  // 流式请求：thinking 模式下完整响应需数十秒到数分钟，非流式会让前端长时间无反馈
  requestBody.stream = true;

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
      signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS),
    });
  } catch (e) {
    if (e instanceof Error && e.name === "TimeoutError") {
      return NextResponse.json(
        { error: "模型推算超时，请稍后再问（可尝试关闭 thinking 模式）。" },
        { status: 504 }
      );
    }
    return NextResponse.json({ error: "无法连接模型服务，请稍后再试。" }, { status: 502 });
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    return NextResponse.json(
      { error: `模型服务返回 ${upstream.status}：${detail.slice(0, 300)}` },
      { status: 502 }
    );
  }

  if (!upstream.body) {
    return NextResponse.json({ error: "模型未返回内容。" }, { status: 502 });
  }

  // 以 SSE 转发给前端：先发盘面数据（侧栏即时显示），再逐段转发模型输出
  const startedAt = Date.now();
  let fullReply = "";
  let fullReasoning = "";
  const encoder = new TextEncoder();
  const upstreamBody = upstream.body;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (event: string, data: unknown) =>
        controller.enqueue(encoder.encode(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`));
      try {
        send("chart", {
          bazi: divination.bazi,
          meihua: divination.meihua,
          xiaoliuren: divination.xiaoliuren,
          daliuren: divination.daliuren,
        });

        const reader = upstreamBody.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        for (;;) {
          const { done, value } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() ?? ""; // 末行可能不完整，留待下一块
          for (const line of lines) {
            const trimmed = line.trim();
            if (!trimmed.startsWith("data:")) continue;
            const payload = trimmed.slice(5).trim();
            if (payload === "[DONE]") continue;
            try {
              const delta = JSON.parse(payload)?.choices?.[0]?.delta;
              const content: string | undefined = delta?.content;
              const reasoning: string | undefined = delta?.reasoning_content;
              if (content) fullReply += content;
              if (reasoning) fullReasoning += reasoning;
              if (content || reasoning) {
                send("delta", {
                  content: content || undefined,
                  reasoning: reasoning || undefined,
                });
              }
            } catch {
              // 单条数据损坏则跳过，不中断整段回复
            }
          }
        }
        send("done", {});
      } catch {
        // 上游中途断开（含超时）：通知前端保留已收到的内容
        send("error", { error: "模型服务连接中断，回复可能不完整。" });
      } finally {
        controller.close();
      }
    },
  });

  // 响应结束后记录问答（after 不阻塞流；未配置 Supabase 则静默跳过）
  const question = messages[messages.length - 1].content;
  after(() =>
    logReading({
      question,
      reply: fullReply,
      reasoning: fullReasoning || undefined,
      birth,
      sessionId,
      model,
      durationMs: Date.now() - startedAt,
    })
  );

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache",
    },
  });
}
