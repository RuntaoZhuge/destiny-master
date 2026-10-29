import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";

/**
 * /records 问答记录页的访问控制（HTTP Basic Auth，Next 16 的 proxy 约定）。
 * 只保护页面；页面本身在服务端用 service_role 读取 Supabase，数据不会进客户端接口。
 * 未配置 RECORDS_PASSWORD 时返回 503，避免默认公开。
 */
function decodeBasic(header: string): { user: string; pass: string } | null {
  if (!header.startsWith("Basic ")) return null;
  try {
    const bytes = Uint8Array.from(atob(header.slice(6)), (c) => c.charCodeAt(0));
    const decoded = new TextDecoder().decode(bytes);
    const idx = decoded.indexOf(":");
    if (idx < 0) return null;
    return { user: decoded.slice(0, idx), pass: decoded.slice(idx + 1) };
  } catch {
    return null;
  }
}

export function proxy(request: NextRequest) {
  const password = process.env.RECORDS_PASSWORD;
  if (!password) {
    return new NextResponse("问答记录页未启用：请配置 RECORDS_PASSWORD。", { status: 503 });
  }

  const user = process.env.RECORDS_USER ?? "admin";
  const auth = decodeBasic(request.headers.get("authorization") ?? "");
  if (auth && auth.user === user && auth.pass === password) {
    return NextResponse.next();
  }

  return new NextResponse("需要登录", {
    status: 401,
    headers: { "WWW-Authenticate": 'Basic realm="Records", charset="UTF-8"' },
  });
}

export const config = {
  matcher: ["/records", "/records/:path*"],
};
