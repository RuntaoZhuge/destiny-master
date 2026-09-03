/**
 * 问答记录：写入 Supabase（PostgREST 接口，纯 fetch，无额外依赖）。
 * 用于事后复盘优化提示词。未配置 SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY 时静默跳过。
 */

export interface ReadingRecord {
  question: string;
  reply: string;
  reasoning?: string;
  birth?: { date?: string; time?: string; gender?: string; city?: string } | null;
  model: string;
  durationMs: number;
}

export async function logReading(r: ReadingRecord): Promise<void> {
  const url = process.env.SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key || !r.reply.trim()) return;

  try {
    await fetch(`${url.replace(/\/$/, "")}/rest/v1/readings`, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        apikey: key,
        Authorization: `Bearer ${key}`,
        Prefer: "return=minimal",
      },
      body: JSON.stringify({
        question: r.question.slice(0, 2000),
        reply: r.reply,
        reasoning: r.reasoning || null,
        birth_date: r.birth?.date ?? null,
        birth_time: r.birth?.time ?? null,
        gender: r.birth?.gender ?? null,
        city: r.birth?.city ?? null,
        model: r.model,
        duration_ms: r.durationMs,
      }),
      signal: AbortSignal.timeout(5000),
    });
  } catch {
    // 记录失败不影响问事
  }
}
