"use client";

import { memo, useEffect, useRef, useState } from "react";
import ReactMarkdown from "react-markdown";
import { CITY_LONGITUDES } from "@/lib/cities";
import ChartPanel, { type ChartData } from "./components/ChartPanel";

interface Message {
  role: "user" | "assistant";
  content: string;
  reasoning?: string;
}

interface BirthForm {
  date: string;
  time: string;
  gender: string;
  city: string;
}

const SUGGESTIONS = [
  "请师傅看看我今年的运势如何",
  "我近来想换工作，此事可成否？",
  "请道长传授一段静心养气的口诀",
  "给我接下来一周的穿搭颜色和佩戴",
  "我什么时候会遇到正缘",
];

const BIRTH_STORAGE_KEY = "xuanwei-birth";

const EMPTY_BIRTH: BirthForm = { date: "", time: "", gender: "", city: "" };

// 消息气泡做 memo：流式更新时只有正在生成的那条重渲染，
// 历史消息的 Markdown 不会被反复重解析
const UserBubble = memo(function UserBubble({ content }: { content: string }) {
  return (
    <div className="flex justify-end">
      <div className="max-w-[80%] rounded-2xl rounded-br-md bg-teal-800 px-4 py-3 text-sm leading-7 text-white shadow-sm">
        {content}
      </div>
    </div>
  );
});

const AssistantBubble = memo(function AssistantBubble({
  content,
  reasoning,
}: {
  content: string;
  reasoning?: string;
}) {
  return (
    <div className="flex items-start gap-3">
      <div className="mt-1 flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-teal-800/10 text-sm text-teal-800">
        ☯
      </div>
      <div className="max-w-[85%] rounded-2xl rounded-tl-md border border-stone-200/80 bg-white px-5 py-4 text-sm leading-7 text-stone-800 shadow-sm">
        {reasoning && (
          <details className="mb-3 rounded-lg bg-stone-50 px-3 py-2 text-xs text-stone-500">
            <summary className="cursor-pointer select-none font-medium text-stone-400 transition-colors hover:text-teal-700">
              道长掐算心路（思考过程）
            </summary>
            <div className="mt-2 whitespace-pre-wrap leading-6">{reasoning}</div>
          </details>
        )}
        <ReactMarkdown components={markdownComponents}>{content}</ReactMarkdown>
      </div>
    </div>
  );
});

/** 道长回复的 Markdown 渲染样式 */
const markdownComponents = {
  p: ({ children }: { children?: React.ReactNode }) => (
    <p className="mb-3 last:mb-0">{children}</p>
  ),
  strong: ({ children }: { children?: React.ReactNode }) => (
    <strong className="font-semibold text-stone-900">{children}</strong>
  ),
  h1: ({ children }: { children?: React.ReactNode }) => (
    <h1 className="mt-4 mb-2 text-base font-semibold first:mt-0">{children}</h1>
  ),
  h2: ({ children }: { children?: React.ReactNode }) => (
    <h2 className="mt-4 mb-2 text-base font-semibold first:mt-0">{children}</h2>
  ),
  h3: ({ children }: { children?: React.ReactNode }) => (
    <h3 className="mt-3 mb-1.5 text-sm font-semibold first:mt-0">{children}</h3>
  ),
  ul: ({ children }: { children?: React.ReactNode }) => (
    <ul className="mb-3 list-disc space-y-1 pl-5 last:mb-0">{children}</ul>
  ),
  ol: ({ children }: { children?: React.ReactNode }) => (
    <ol className="mb-3 list-decimal space-y-1 pl-5 last:mb-0">{children}</ol>
  ),
  blockquote: ({ children }: { children?: React.ReactNode }) => (
    <blockquote className="mb-3 border-l-2 border-teal-700/40 pl-3 text-stone-500 last:mb-0">
      {children}
    </blockquote>
  ),
  code: ({ children }: { children?: React.ReactNode }) => (
    <code className="rounded bg-stone-100 px-1 py-0.5 text-[0.85em] text-teal-800">
      {children}
    </code>
  ),
  a: ({ children, href }: { children?: React.ReactNode; href?: string }) => (
    <a
      href={href}
      target="_blank"
      rel="noopener noreferrer"
      className="text-teal-700 underline"
    >
      {children}
    </a>
  ),
};

export default function Home() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [input, setInput] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [showBirth, setShowBirth] = useState(false);
  const [birth, setBirth] = useState<BirthForm>(EMPTY_BIRTH);
  const [chart, setChart] = useState<ChartData | null>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  // 是否贴底跟随：流式输出时只有用户本就在底部才自动滚动，否则把滚轮还给用户
  const stickToBottomRef = useRef(true);

  // 生辰信息暂存本地：挂载时读取（localStorage 仅客户端可用，必须在 effect 中回填），变更时写入
  useEffect(() => {
    try {
      const saved = localStorage.getItem(BIRTH_STORAGE_KEY);
      if (saved) {
        const parsed = JSON.parse(saved) as Partial<BirthForm>;
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setBirth({ ...EMPTY_BIRTH, ...parsed });
        // eslint-disable-next-line react-hooks/set-state-in-effect
        setShowBirth(true);
      }
    } catch {
      // 本地数据损坏则忽略
    }
  }, []);

  useEffect(() => {
    try {
      if (birth.date || birth.time || birth.gender || birth.city) {
        localStorage.setItem(BIRTH_STORAGE_KEY, JSON.stringify(birth));
      } else {
        localStorage.removeItem(BIRTH_STORAGE_KEY);
      }
    } catch {
      // 隐私模式等场景下静默失败
    }
  }, [birth]);

  useEffect(() => {
    // 贴底时才跟随滚动；用瞬时滚动，避免平滑动画在流式输出期间被反复重启、卡住滚轮
    if (stickToBottomRef.current) {
      bottomRef.current?.scrollIntoView({ behavior: "auto" });
    }
  }, [messages, loading]);

  // 实际滚动发生在 window（main 高度未受约束，overflow-y-auto 不生效），
  // 用 capture 监听以兼容任何滚动容器；距底 80px 内视为贴底
  useEffect(() => {
    const onScroll = () => {
      const doc = document.documentElement;
      stickToBottomRef.current =
        doc.scrollHeight - window.scrollY - window.innerHeight < 80;
    };
    window.addEventListener("scroll", onScroll, { passive: true, capture: true });
    return () => window.removeEventListener("scroll", onScroll, { capture: true });
  }, []);

  async function ask(question: string) {
    const q = question.trim();
    if (!q || loading) return;
    setError(null);
    setInput("");

    const next: Message[] = [...messages, { role: "user", content: q }];
    stickToBottomRef.current = true; // 发问后强制回到底部
    setMessages(next);
    setLoading(true);

    try {
      const res = await fetch("/api/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next,
          birth: birth.date
            ? {
                date: birth.date,
                time: birth.time || undefined,
                gender: birth.gender || undefined,
                city: birth.city || undefined,
              }
            : null,
        }),
      });
      if (!res.ok || !res.body) {
        const data = await res.json().catch(() => ({}));
        setError(data.error ?? "请示未成，请稍后再试。");
        return;
      }

      // 流式回复：先插入空气泡，随模型输出逐段填充，避免长时间无反馈
      setMessages([...next, { role: "assistant", content: "" }]);
      setLoading(false);

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let buffer = "";
      let event = "";
      let received = "";

      // delta 攒批：每个 token 都 setState 会导致 ReactMarkdown 每秒重渲染数十次，
      // 主线程被占满、滚轮卡死；攒 100ms 批量更新一次
      let pendingContent = "";
      let pendingReasoning = "";
      let flushTimer: ReturnType<typeof setTimeout> | null = null;
      const flush = () => {
        flushTimer = null;
        const c = pendingContent;
        const r = pendingReasoning;
        if (!c && !r) return;
        pendingContent = "";
        pendingReasoning = "";
        received += c;
        setMessages((prev) => {
          const copy = [...prev];
          const last = { ...copy[copy.length - 1] };
          last.content += c;
          if (r) last.reasoning = (last.reasoning ?? "") + r;
          copy[copy.length - 1] = last;
          return copy;
        });
      };
      const applyDelta = (payload: {
        content?: string;
        reasoning?: string;
      }) => {
        if (payload.content) pendingContent += payload.content;
        if (payload.reasoning) pendingReasoning += payload.reasoning;
        if (!flushTimer) flushTimer = setTimeout(flush, 100);
      };

      for (;;) {
        const { done, value } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value, { stream: true });
        const lines = buffer.split("\n");
        buffer = lines.pop() ?? "";
        for (const line of lines) {
          const trimmed = line.trim();
          if (trimmed.startsWith("event:")) {
            event = trimmed.slice(6).trim();
          } else if (trimmed.startsWith("data:")) {
            let payload: Record<string, string | undefined>;
            try {
              payload = JSON.parse(trimmed.slice(5).trim());
            } catch {
              continue;
            }
            if (event === "chart") setChart(payload as unknown as ChartData);
            else if (event === "delta") applyDelta(payload);
            else if (event === "error" && payload.error)
              setError(payload.error);
          }
        }
      }

      // 流结束：先冲刷攒批的最后一段，再判断是否为空
      if (flushTimer) clearTimeout(flushTimer);
      flush();

      if (!received) {
        // 流结束但无内容：移除空气泡并提示
        setMessages((prev) => prev.slice(0, -1));
        setError((prev) => prev ?? "模型未返回内容，请稍后再试。");
      }
    } catch {
      setError("山路不通（网络异常），请稍后再试。");
    } finally {
      setLoading(false);
    }
  }

  const birthSummary = birth.date
    ? `${birth.date}${birth.time ? ` ${birth.time}` : "（时辰未填）"}${birth.city ? ` · ${birth.city}` : ""}${birth.gender ? ` · ${birth.gender}` : ""}`
    : "";

  const fieldClass =
    "rounded-lg border border-stone-200 bg-white px-3 py-2 text-sm text-stone-800 outline-none transition-colors focus:border-teal-600 focus:ring-2 focus:ring-teal-600/15";

  return (
    <div className="flex flex-col flex-1 min-h-screen">
      {/* 顶栏 */}
      <header className="sticky top-0 z-10 border-b border-stone-200/80 bg-[#f7f6f3]/80 backdrop-blur">
        <div className="mx-auto flex max-w-6xl items-center justify-between px-4 py-3">
          <div className="flex items-center gap-3">
            <div className="flex h-9 w-9 items-center justify-center rounded-xl bg-teal-800 text-lg text-white shadow-sm">
              ☯
            </div>
            <div>
              <h1 className="text-base font-semibold tracking-wide text-stone-900">
                宇玄问道
              </h1>
              <p className="text-xs text-stone-400">
                八字 · 梅花易数 · 小六壬，综合参断
              </p>
            </div>
          </div>
          <span className="hidden rounded-full border border-stone-200 bg-white px-3 py-1 text-xs text-stone-500 sm:inline">
            道长在席
          </span>
        </div>
      </header>

      {/* 消息区 + 右侧盘面 */}
      <main className="flex-1 overflow-y-auto">
        <div className="mx-auto flex w-full max-w-6xl gap-8 px-4 py-8">
          <div className="flex min-w-0 flex-1 flex-col gap-5">
            {messages.length === 0 && (
              <div className="mt-10 flex flex-col items-center gap-7 text-center">
                <div className="flex h-16 w-16 items-center justify-center rounded-2xl bg-teal-800 text-3xl text-white shadow-md">
                  ☯
                </div>
                <div>
                  <p className="text-lg font-medium text-stone-800">
                    善信远道而来，所为何事？
                  </p>
                  <p className="mt-2 text-sm leading-6 text-stone-500">
                    无论问事、问命，还是求口诀、问修身之法，但说无妨。
                  </p>
                </div>
                <div className="flex w-full max-w-md flex-col gap-2.5">
                  {SUGGESTIONS.map((s) => (
                    <button
                      key={s}
                      onClick={() => ask(s)}
                      className="rounded-xl border border-stone-200 bg-white px-4 py-2.5 text-sm text-stone-600 shadow-sm transition-all hover:-translate-y-px hover:border-teal-700/40 hover:text-teal-800 hover:shadow"
                    >
                      {s}
                    </button>
                  ))}
                </div>
              </div>
            )}

            {messages.map((m, i) =>
              m.role === "user" ? (
                <UserBubble key={i} content={m.content} />
              ) : (
                <AssistantBubble key={i} content={m.content} reasoning={m.reasoning} />
              ),
            )}

            {loading && (
              <div className="flex items-start gap-3">
                <div className="mt-1 flex h-8 w-8 shrink-0 animate-pulse items-center justify-center rounded-full bg-teal-800/10 text-sm text-teal-800">
                  ☯
                </div>
                <div className="rounded-2xl rounded-tl-md border border-stone-200/80 bg-white px-5 py-4 text-sm text-stone-400 shadow-sm">
                  道长掐指推算中…
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-600">
                {error}
              </div>
            )}
            <div ref={bottomRef} />
          </div>

          {/* 右侧盘面侧栏 */}
          <aside className="hidden w-72 shrink-0 lg:block xl:w-80">
            <div className="sticky top-20">
              <ChartPanel chart={chart} />
            </div>
          </aside>
        </div>
      </main>

      {/* 输入区 */}
      <footer className="sticky bottom-0 border-t border-stone-200/80 bg-[#f7f6f3]/80 backdrop-blur">
        <div className="mx-auto flex w-full max-w-6xl gap-8 px-4 py-4">
          <div className="min-w-0 flex-1">
            {/* 生辰面板 */}
            <div className="mb-2 flex items-center gap-2">
              <button
                onClick={() => setShowBirth(!showBirth)}
                className="flex items-center gap-1.5 text-xs text-stone-400 transition-colors hover:text-teal-700"
              >
                <span
                  className={`inline-block transition-transform ${showBirth ? "rotate-90" : ""}`}
                >
                  ▸
                </span>
                提供生辰（问八字填此，公历，按出生地换算真太阳时）
              </button>
              {birthSummary && (
                <span className="rounded-full bg-teal-800/8 px-2.5 py-0.5 text-xs text-teal-800">
                  {birthSummary}
                </span>
              )}
            </div>
            {showBirth && (
              <div className="mb-3 flex flex-wrap items-center gap-2 rounded-xl border border-stone-200 bg-white p-3 shadow-sm">
                <input
                  type="date"
                  value={birth.date}
                  onChange={(e) => setBirth({ ...birth, date: e.target.value })}
                  className={fieldClass}
                />
                <input
                  type="time"
                  value={birth.time}
                  onChange={(e) => setBirth({ ...birth, time: e.target.value })}
                  className={fieldClass}
                />
                <input
                  type="text"
                  list="birth-cities"
                  value={birth.city}
                  onChange={(e) => setBirth({ ...birth, city: e.target.value })}
                  placeholder="出生城市（真太阳时）"
                  className={`${fieldClass} w-44`}
                />
                <datalist id="birth-cities">
                  {Object.keys(CITY_LONGITUDES).map((name) => (
                    <option key={name} value={name} />
                  ))}
                </datalist>
                <select
                  value={birth.gender}
                  onChange={(e) =>
                    setBirth({ ...birth, gender: e.target.value })
                  }
                  className={fieldClass}
                >
                  <option value="">性别</option>
                  <option value="男">男</option>
                  <option value="女">女</option>
                </select>
                <button
                  onClick={() => setBirth(EMPTY_BIRTH)}
                  className="text-xs text-stone-400 transition-colors hover:text-red-500"
                >
                  清除
                </button>
              </div>
            )}

            <form
              onSubmit={(e) => {
                e.preventDefault();
                ask(input);
              }}
              className="flex items-center gap-2 rounded-2xl border border-stone-200 bg-white p-2 shadow-sm transition-shadow focus-within:border-teal-700/50 focus-within:shadow"
            >
              <input
                value={input}
                onChange={(e) => setInput(e.target.value)}
                placeholder="写下你想问的事…"
                disabled={loading}
                className="flex-1 bg-transparent px-3 py-2 text-sm text-stone-800 placeholder-stone-300 outline-none disabled:opacity-50"
              />
              <button
                type="submit"
                disabled={loading || !input.trim()}
                className="rounded-xl bg-teal-800 px-5 py-2.5 text-sm font-medium text-white shadow-sm transition-all hover:bg-teal-700 disabled:opacity-40 disabled:hover:bg-teal-800"
              >
                问
              </button>
            </form>
            <p className="mt-2.5 text-center text-xs text-stone-300">
              命由己造，相由心生。所断所测，聊作参考，行善积德方为根本。
            </p>
          </div>
          {/* 与右侧盘面同宽的占位，保持输入区与聊天列对齐 */}
          <div className="hidden w-72 shrink-0 lg:block xl:w-80" />
        </div>
      </footer>
    </div>
  );
}
