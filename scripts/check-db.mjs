#!/usr/bin/env node
/**
 * Supabase 写入链路自检（只读）：
 *   npm run db:check
 * 或：
 *   node --env-file-if-exists=.env.local scripts/check-db.mjs
 *
 * 检查顺序：环境变量 → 项目连通性 → conversations 表 → RLS/密钥。
 */

const rawUrl = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL ?? "";
const url = rawUrl.replace(/\/rest\/v1\/?$/i, "").replace(/\/+$/, "");
const key = process.env.SUPABASE_SERVICE_ROLE_KEY ?? process.env.SUPABASE_SERVICE_KEY ?? "";

if (!url || !key) {
  console.error("✗ 未配置 Supabase。请在 .env.local（或 Vercel 环境变量）中设置：");
  console.error("  SUPABASE_URL=https://<project-ref>.supabase.co");
  console.error("  SUPABASE_SERVICE_ROLE_KEY=<service_role secret>");
  console.error("  也兼容 NEXT_PUBLIC_SUPABASE_URL / SUPABASE_SERVICE_KEY 这两个别名。");
  process.exit(2);
}

const headers = {
  apikey: key,
  Authorization: `Bearer ${key}`,
  Prefer: "count=exact",
};

try {
  const res = await fetch(
    `${url}/rest/v1/conversations?select=id,ask_count,updated_at&order=updated_at.desc&limit=5`,
    { headers, cache: "no-store", signal: AbortSignal.timeout(8000) }
  );
  const body = await res.text().catch(() => "");
  console.log(`GET ${url}/rest/v1/conversations -> ${res.status}`);
  console.log(`count: ${res.headers.get("content-range") ?? "未知"}`);
  console.log(body.slice(0, 2000) || "(空)");

  if (res.ok) {
    console.log("✓ 配置、表与密钥均正常；问答落库时应有新行/追加。");
    process.exit(0);
  }
  if (res.status === 404) {
    console.error("✗ conversations 表不存在：请在 Supabase SQL Editor 执行");
    console.error("  supabase/migrations/20260904000000_create_conversations.sql");
  } else if (res.status === 401 || res.status === 403) {
    console.error("✗ 密钥无权限：请确认使用的是 service_role secret，而不是 anon key。");
  } else {
    console.error("✗ 请求失败，请检查 SUPABASE_URL、项目是否暂停、网络是否可达。");
  }
  process.exit(1);
} catch (e) {
  console.error("✗ 无法连接 Supabase：", e instanceof Error ? e.message : e);
  console.error("  请检查项目 URL、项目是否暂停，以及本机网络。");
  process.exit(1);
}
