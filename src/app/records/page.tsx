import type { Metadata } from "next";
import Link from "next/link";
import { fetchRecords, type RecordRow, type RecordTurn } from "@/lib/records";
import RecordMarkdown from "../components/RecordMarkdown";

export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "问答记录 · 宇玄问道",
  robots: { index: false, follow: false },
};

function formatTime(value?: string | null): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  const text = new Intl.DateTimeFormat("zh-CN", {
    timeZone: "Asia/Shanghai",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
  }).format(date);
  return `${text}（北京时间）`;
}

function identityOf(row: RecordRow): string {
  if (row.birth_date) {
    return [row.birth_date, row.birth_time, row.city, row.gender].filter(Boolean).join(" · ");
  }
  const sid = row.id.replace(/^sess:/, "");
  if (!sid || sid === "anonymous") return "未识别会话";
  return `会话 ${sid.slice(0, 8)}…`;
}

export default async function RecordsPage() {
  const { ok, rows, total, status, error } = await fetchRecords(20);

  return (
    <div className="flex-1 bg-[#f7f6f3]">
      <header className="border-b border-stone-200/80 bg-white/80 backdrop-blur">
        <div className="mx-auto flex max-w-5xl items-center justify-between px-4 py-4">
          <div>
            <h1 className="text-lg font-semibold tracking-wide text-stone-900">问答记录</h1>
            <p className="mt-0.5 text-xs text-stone-400">
              按人聚合 · 最近 {rows.length}
              {total !== null ? ` / 共 ${total}` : ""} 位
            </p>
          </div>
          <Link href="/" className="text-sm text-teal-800 hover:underline">
            返回问道
          </Link>
        </div>
      </header>

      <main className="mx-auto max-w-5xl px-4 py-8">
        {!ok && (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
            读取失败{status ? `（${status}）` : ""}：{error}
          </div>
        )}

        {ok && rows.length === 0 && (
          <div className="rounded-xl border border-stone-200 bg-white px-4 py-10 text-center text-sm text-stone-400">
            暂无问答记录。
          </div>
        )}

        <div className="space-y-5">
          {rows.map((row) => (
            <ConversationCard key={row.id} row={row} />
          ))}
        </div>
      </main>
    </div>
  );
}

function ConversationCard({ row }: { row: RecordRow }) {
  const turns = row.messages;
  return (
    <article className="rounded-2xl border border-stone-200/80 bg-white p-5 shadow-sm">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <div className="text-sm font-medium text-stone-800">{identityOf(row)}</div>
          <div className="mt-1 text-xs text-stone-400">
            {row.ask_count ?? turns.length} 问 · 更新于 {formatTime(row.updated_at)}
          </div>
        </div>
        <span className="rounded-full bg-stone-100 px-2.5 py-0.5 text-xs text-stone-500">
          {row.model ?? "未知模型"}
        </span>
      </div>

      {turns.length === 0 ? (
        <p className="mt-4 text-xs text-stone-400">暂无问答内容。</p>
      ) : (
        <details className="mt-4">
          <summary className="cursor-pointer select-none text-sm text-teal-800 hover:underline">
            展开 {turns.length} 条问答
          </summary>
          <div className="mt-5 space-y-8">
            {turns.map((turn, index) => (
              <TurnView key={index} turn={turn} index={index} />
            ))}
          </div>
        </details>
      )}
    </article>
  );
}

function TurnView({ turn, index }: { turn: RecordTurn; index: number }) {
  return (
    <section className="border-t border-stone-100 pt-5 first:border-0 first:pt-0">
      <div className="mb-2 flex flex-wrap items-center justify-between gap-2 text-xs text-stone-400">
        <span>第 {index + 1} 问</span>
        <span>{formatTime(turn.at)}</span>
      </div>

      <div className="mb-3 rounded-xl bg-teal-800/5 px-4 py-3 text-sm leading-7 text-stone-700">
        {turn.q || "（无问题）"}
      </div>

      <div className="text-sm leading-7 text-stone-800">
        <RecordMarkdown content={turn.a || ""} />
      </div>

      {turn.reasoning && (
        <details className="mt-3 rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-500">
          <summary className="cursor-pointer select-none text-stone-400">道长掐算心路</summary>
          <div className="mt-2 whitespace-pre-wrap leading-6">{turn.reasoning}</div>
        </details>
      )}
    </section>
  );
}
