import { NextRequest, NextResponse } from "next/server";
import { computeDivination, type BirthInfo } from "@/lib/divination";
import { buildSystemPrompt } from "@/lib/prompt";
import { searchCurrentAffairs } from "@/lib/search";

interface ChatMessage {
  role: "user" | "assistant";
  content: string;
}

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

export async function POST(req: NextRequest) {
  const apiKey = process.env.LLM_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "服务端未配置 LLM_API_KEY，请在 .env.local 中配置后重启。" },
      { status: 500 }
    );
  }

  let body: { messages?: ChatMessage[]; birth?: unknown };
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
  // 排盘以「此刻问事时间」起卦，八字以用户提交的生辰排
  const divination = computeDivination(birth, new Date());
  // 涉及时势的问题联网打探（需配置 TAVILY_API_KEY，未配置自动跳过）
  const currentAffairs = await searchCurrentAffairs(messages[messages.length - 1].content);
  const systemPrompt = buildSystemPrompt(divination, currentAffairs);

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

  let upstream: Response;
  try {
    upstream = await fetch(`${baseUrl}/chat/completions`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify(requestBody),
    });
  } catch {
    return NextResponse.json({ error: "无法连接模型服务，请稍后再试。" }, { status: 502 });
  }

  if (!upstream.ok) {
    const detail = await upstream.text().catch(() => "");
    return NextResponse.json(
      { error: `模型服务返回 ${upstream.status}：${detail.slice(0, 300)}` },
      { status: 502 }
    );
  }

  const data = await upstream.json();
  const reply: string | undefined = data?.choices?.[0]?.message?.content;
  if (!reply) {
    return NextResponse.json({ error: "模型未返回内容。" }, { status: 502 });
  }

  const reasoning: string | undefined = data?.choices?.[0]?.message?.reasoning_content;
  return NextResponse.json({
    reply,
    reasoning: reasoning || undefined,
    chart: { bazi: divination.bazi, meihua: divination.meihua, xiaoliuren: divination.xiaoliuren, daliuren: divination.daliuren },
  });
}
