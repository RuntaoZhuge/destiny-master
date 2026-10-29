import { NextResponse } from "next/server";
import { supabaseConfig } from "@/lib/log";

/**
 * Supabase 连接自检（只读）。
 * 打开 /api/db-health 即可看到：是否读到环境变量、能否连上 conversations 表、
 * 以及是表不存在、密钥无权限还是网络问题。不会返回任何问答数据或密钥。
 */
export const dynamic = "force-dynamic";
export const runtime = "nodejs";

type KeyType = "service_role" | "anon" | "secret" | "publishable" | "unknown";

/** 只解析密钥类型（JWT 的 role 或新式前缀），不返回密钥本身。 */
function keyTypeOf(key: string): KeyType {
  if (key.startsWith("sb_secret_")) return "secret";
  if (key.startsWith("sb_publishable_")) return "publishable";
  const parts = key.split(".");
  if (parts.length === 3) {
    try {
      const payload = JSON.parse(Buffer.from(parts[1], "base64url").toString("utf8")) as {
        role?: string;
      };
      if (payload.role === "service_role") return "service_role";
      if (payload.role === "anon") return "anon";
    } catch {
      // 忽略无法解析的 key
    }
  }
  return "unknown";
}

function hintFor(status: number): string {
  if (status === 401 || status === 403) {
    return "service_role 密钥无权限：确认用的是 service_role secret，而不是 anon key；RLS 只允许 service_role 写入。";
  }
  if (status === 404) {
    return "conversations 表不存在：请在 Supabase SQL Editor 执行 supabase/migrations/20260904000000_create_conversations.sql。";
  }
  if (status >= 500) {
    return "Supabase 项目异常或已暂停；请到 Supabase 控制台确认项目状态。";
  }
  return "连接失败；请检查 SUPABASE_URL 是否正确、项目是否暂停、函数是否能出网。";
}

export async function GET() {
  const config = supabaseConfig();
  if (!config) {
    return NextResponse.json({
      configured: false,
      ok: false,
      hint: "未找到 SUPABASE_URL / NEXT_PUBLIC_SUPABASE_URL 或 service_role 密钥。请确认 Vercel 环境变量已注入当前环境（Production / Preview）。",
    });
  }

  let host = "";
  try {
    host = new URL(config.url).host;
  } catch {
    return NextResponse.json({
      configured: true,
      ok: false,
      hint: "SUPABASE_URL 不是合法的 URL，应以 https:// 开头。",
    });
  }

  try {
    const res = await fetch(`${config.url}/rest/v1/conversations?select=id&limit=1`, {
      headers: {
        apikey: config.key,
        Authorization: `Bearer ${config.key}`,
      },
      cache: "no-store",
      signal: AbortSignal.timeout(8000),
    });
    const body = await res.text().catch(() => "");
    const keyType = keyTypeOf(config.key);
    // anon / publishable key 即使能读，默认也会被 RLS 拒绝写入
    const wrongKey = keyType === "anon" || keyType === "publishable";
    return NextResponse.json({
      configured: true,
      ok: res.ok && !wrongKey,
      host,
      keyType,
      readOk: res.ok,
      status: res.status,
      error: res.ok ? null : body.slice(0, 300),
      hint: wrongKey
        ? "当前密钥是 anon / publishable key，RLS 默认不允许写入；请把环境变量换成 service_role / secret key。"
        : res.ok
          ? "连接正常。若仍无记录，请查看 Vercel 函数日志中的 [log] 行（落库在响应结束后的 after() 中执行）。"
          : hintFor(res.status),
    });
  } catch (e) {
    return NextResponse.json({
      configured: true,
      ok: false,
      host,
      error: e instanceof Error ? e.message : String(e),
      hint: "无法连接 Supabase：检查项目 URL、项目是否暂停、函数是否能出网。",
    });
  }
}
