/**
 * 问答记录：写入 Supabase（PostgREST 接口，纯 fetch，无额外依赖）。
 * 按「人」聚合：提供了生辰则以生辰哈希为身份（同一八字视为同一人），
 * 未提供生辰则以来访者的浏览器会话 id 为身份；同一身份的问答追加到同一行。
 * 用于事后复盘优化提示词。未配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 时静默跳过。
 */

import { createHash } from "node:crypto";

export interface ReadingRecord {
  question: string;
  reply: string;
  reasoning?: string;
  birth?: { date?: string; time?: string; gender?: string; city?: string } | null;
  /** 未提供生辰时的身份来源：前端生成并持久化在 localStorage 的会话 id */
  sessionId?: string;
  model: string;
  durationMs: number;
}

/** 写入结果：便于脚本/日志排查，路由本身不依赖返回值。 */
export interface LogResult {
  ok: boolean;
  /** 未配置、空回复等“预期内跳过” */
  skipped?: boolean;
  status?: number;
  error?: string;
}

interface ConversationRow {
  id: string;
  messages: unknown[];
  ask_count: number;
}

/** 每条问答在 messages 数组中的形态 */
interface Turn {
  q: string;
  a: string;
  reasoning?: string;
  at: string;
}

const MAX_TURNS = 50; // 每人只保留最近 50 条问答，防止行无限膨胀

let warnedMissingConfig = false;

/**
 * 读取 Supabase 配置。
 * 兼容 Vercel Supabase 集成可能注入的变量名，并容忍误填成 `/rest/v1` 的 URL。
 */
export function supabaseConfig(): { url: string; key: string } | null {
  const rawUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
  const url = rawUrl.replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "";
  return url && key ? { url, key } : null;
}

function identityOf(r: ReadingRecord): string {
  if (r.birth?.date) {
    const raw = [r.birth.date, r.birth.time ?? "", r.birth.gender ?? "", r.birth.city ?? ""].join("|");
    return `birth:${createHash("sha256").update(raw).digest("hex").slice(0, 32)}`;
  }
  return `sess:${(r.sessionId ?? "anonymous").slice(0, 64)}`;
}

/** 同一身份的写入串行化：避免「读-改-写」在连续两次提问时互相覆盖。
 *  单实例内有效；多实例并发仍可能丢一次，但概率很低。 */
const writeQueues = new Map<string, Promise<LogResult>>();

export function logReading(r: ReadingRecord): Promise<LogResult> {
  const id = identityOf(r);
  const previous = writeQueues.get(id) ?? Promise.resolve<LogResult>({ ok: true });
  const run = previous
    .catch(() => ({ ok: false } as LogResult))
    .then(() => writeReading(r, id));
  writeQueues.set(id, run);
  return run.finally(() => {
    if (writeQueues.get(id) === run) writeQueues.delete(id);
  });
}

async function writeReading(r: ReadingRecord, id: string): Promise<LogResult> {
  const config = supabaseConfig();
  if (!config) {
    if (!warnedMissingConfig) {
      warnedMissingConfig = true;
      console.warn("[log] 未配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY，问答记录已跳过");
    }
    return { ok: false, skipped: true, error: "missing-config" };
  }
  if (!r.reply.trim()) return { ok: false, skipped: true, error: "empty-reply" };

  const headers = {
    "Content-Type": "application/json",
    apikey: config.key,
    Authorization: `Bearer ${config.key}`,
  };
  const turn: Turn = {
    q: r.question.slice(0, 2000),
    a: r.reply,
    reasoning: r.reasoning || undefined,
    at: new Date().toISOString(),
  };
  const now = new Date().toISOString();

  try {
    // 读出现有会话（读改写；低流量下可接受的竞态）
    const existingRes = await fetch(
      `${config.url}/rest/v1/conversations?id=eq.${encodeURIComponent(id)}&select=id,messages,ask_count`,
      { headers, cache: "no-store", signal: AbortSignal.timeout(5000) }
    );
    if (!existingRes.ok) {
      const detail = await existingRes.text().catch(() => "");
      console.warn(
        `[log] 读取 conversations 失败 ${existingRes.status}: ${detail.slice(0, 300)}`
      );
      return { ok: false, status: existingRes.status, error: detail.slice(0, 300) };
    }
    const rows = (await existingRes.json()) as ConversationRow[];
    const existing = rows[0];

    if (!existing) {
      const created = await fetch(`${config.url}/rest/v1/conversations`, {
        method: "POST",
        headers: { ...headers, Prefer: "return=minimal" },
        body: JSON.stringify({
          id,
          updated_at: now,
          birth_date: r.birth?.date ?? null,
          birth_time: r.birth?.time ?? null,
          gender: r.birth?.gender ?? null,
          city: r.birth?.city ?? null,
          model: r.model,
          ask_count: 1,
          last_duration_ms: r.durationMs,
          messages: [turn],
        }),
        cache: "no-store",
        signal: AbortSignal.timeout(5000),
      });
      if (!created.ok) {
        const detail = await created.text().catch(() => "");
        console.warn(
          `[log] 新建 conversations 失败 ${created.status}: ${detail.slice(0, 300)}`
        );
        return { ok: false, status: created.status, error: detail.slice(0, 300) };
      }
      return { ok: true, status: created.status };
    }

    const messages = [...(Array.isArray(existing.messages) ? existing.messages : []), turn].slice(-MAX_TURNS);
    const updated = await fetch(`${config.url}/rest/v1/conversations?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({
        updated_at: now,
        model: r.model,
        ask_count: (existing.ask_count ?? 0) + 1,
        last_duration_ms: r.durationMs,
        messages,
      }),
      cache: "no-store",
      signal: AbortSignal.timeout(5000),
    });
    if (!updated.ok) {
      const detail = await updated.text().catch(() => "");
      console.warn(
        `[log] 追加 conversations 失败 ${updated.status}: ${detail.slice(0, 300)}`
      );
      return { ok: false, status: updated.status, error: detail.slice(0, 300) };
    }
    return { ok: true, status: updated.status };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    console.warn("[log] 写入失败:", message);
    return { ok: false, error: message };
  }
}
