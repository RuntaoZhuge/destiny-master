import { supabaseConfig } from "./log";

/** conversations.messages 里的一条问答 */
export interface RecordTurn {
  q?: string;
  a?: string;
  reasoning?: string;
  at?: string;
}

/** conversations 表的一行 */
export interface RecordRow {
  id: string;
  birth_date: string | null;
  birth_time: string | null;
  gender: string | null;
  city: string | null;
  model: string | null;
  ask_count: number | null;
  last_duration_ms: number | null;
  updated_at: string | null;
  messages: RecordTurn[];
}

export interface RecordsResult {
  ok: boolean;
  rows: RecordRow[];
  /** 表里的总人数（content-range），拿不到则为 null */
  total: number | null;
  status?: number;
  error?: string;
}

/** 服务端读取问答记录（service_role，仅用于 /records 页面）。 */
export async function fetchRecords(limit = 20): Promise<RecordsResult> {
  const config = supabaseConfig();
  if (!config) {
    return {
      ok: false,
      rows: [],
      total: null,
      error: "未配置 Supabase（SUPABASE_URL / SUPABASE_SERVICE_ROLE_KEY）",
    };
  }

  const capped = Math.min(Math.max(1, limit), 100);
  const params = new URLSearchParams({
    select:
      "id,birth_date,birth_time,gender,city,model,ask_count,last_duration_ms,updated_at,messages",
    order: "updated_at.desc",
    limit: String(capped),
  });

  try {
    const res = await fetch(`${config.url}/rest/v1/conversations?${params.toString()}`, {
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
        Prefer: "count=exact",
      },
      cache: "no-store",
      signal: AbortSignal.timeout(10000),
    });
    const body = await res.text();
    if (!res.ok) {
      return { ok: false, rows: [], total: null, status: res.status, error: body.slice(0, 300) };
    }
    const rows = (JSON.parse(body) as RecordRow[]).map((row) => ({
      ...row,
      messages: Array.isArray(row.messages) ? row.messages : [],
    }));
    const total = Number(res.headers.get("content-range")?.split("/")[1] ?? NaN);
    return { ok: true, rows, total: Number.isFinite(total) ? total : null };
  } catch (e) {
    return {
      ok: false,
      rows: [],
      total: null,
      error: e instanceof Error ? e.message : String(e),
    };
  }
}
