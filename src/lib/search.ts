/**
 * 联网搜索（Tavily）：让道长能参照当下时事作答。
 * 配置 TAVILY_API_KEY 后启用；未配置时静默跳过。
 */

// 涉及当下、时势的问题才触发搜索，避免每个问题都白白联网
const TIME_SENSITIVE = [
  "最近", "近期", "如今", "现在", "目前", "当下", "时下",
  "新闻", "时事", "热点", "政策", "行情", "趋势",
  "股市", "股票", "房价", "楼市", "经济", "就业", "求职", "行业",
  "疫情", "战争", "金价", "汇率",
];

export function needsSearch(question: string): boolean {
  return TIME_SENSITIVE.some((kw) => question.includes(kw));
}

interface TavilyResult {
  title?: string;
  url?: string;
  content?: string;
}

/** 搜索并格式化为注入提示词的文本；失败或未配置时返回 null。 */
export async function searchCurrentAffairs(question: string): Promise<string | null> {
  const apiKey = process.env.TAVILY_API_KEY;
  if (!apiKey || !needsSearch(question)) return null;

  try {
    const res = await fetch("https://api.tavily.com/search", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        api_key: apiKey,
        query: question,
        max_results: 5,
        search_depth: "basic",
        include_answer: true,
      }),
      signal: AbortSignal.timeout(8000),
    });
    if (!res.ok) return null;

    const data = await res.json();
    const lines: string[] = [];
    if (typeof data.answer === "string" && data.answer) {
      lines.push(`综述：${data.answer}`);
    }
    for (const r of (data.results ?? []) as TavilyResult[]) {
      if (r.title && r.content) {
        lines.push(`- ${r.title}：${r.content.slice(0, 200)}（${r.url ?? "来源不明"}）`);
      }
    }
    if (lines.length === 0) return null;
    return lines.join("\n");
  } catch {
    return null; // 搜索失败不影响问事
  }
}
