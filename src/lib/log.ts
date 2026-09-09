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

function identityOf(r: ReadingRecord): string {
  if (r.birth?.date) {
    const raw = [r.birth.date, r.birth.time ?? "", r.birth.gender ?? "", r.birth.city ?? ""].join("|");
    return `birth:${createHash("sha256").update(raw).digest("hex").slice(0, 32)}`;
  }
  return `sess:${(r.sessionId ?? "anonymous").slice(0, 64)}`;
}

export async function logReading(r: ReadingRecord): Promise<void> {
  const base = process.env.SUPABASE_URL?.replace(/\/$/, "");
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key || !r.reply.trim()) return;

  const headers = {
    "Content-Type": "application/json",
    apikey: key,
    Authorization: `Bearer ${key}`,
  };
  const id = identityOf(r);
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
      `${base}/rest/v1/conversations?id=eq.${encodeURIComponent(id)}&select=id,messages,ask_count`,
      { headers, signal: AbortSignal.timeout(5000) }
    );
    if (!existingRes.ok) return;
    const rows = (await existingRes.json()) as ConversationRow[];
    const existing = rows[0];

    if (!existing) {
      await fetch(`${base}/rest/v1/conversations`, {
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
        signal: AbortSignal.timeout(5000),
      });
      return;
    }

    const messages = [...(Array.isArray(existing.messages) ? existing.messages : []), turn].slice(-MAX_TURNS);
    await fetch(`${base}/rest/v1/conversations?id=eq.${encodeURIComponent(id)}`, {
      method: "PATCH",
      headers: { ...headers, Prefer: "return=minimal" },
      body: JSON.stringify({
        updated_at: now,
        model: r.model,
        ask_count: (existing.ask_count ?? 0) + 1,
        last_duration_ms: r.durationMs,
        messages,
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // 记录失败不影响问事
  }
}
