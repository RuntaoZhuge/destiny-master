# 宇玄问道 · 大师问答网站

模拟一位道教师傅（道号「宇玄子」）的在线问答：单一问答窗口，综合**八字（子平四柱）、梅花易数、小六壬**参断，给出断语、预测与建议，也可传授口诀与修身养性之法。

## 核心设计：排盘准确度

大模型不擅长演算干支卦象，因此本项目将「排盘」与「解读」分离：

- **排盘全部由代码确定性计算**（`src/lib/divination.ts`、`src/lib/daliuren.ts`），大模型只做解读：
  - 八字四柱、十神、纳音、五行统计 —— 基于 `lunar-javascript`（精确节气交接）；提供出生城市后按经度时差 + 均时差换算**真太阳时**再排盘（`src/lib/cities.ts` 收录 50 个常用城市经度）
  - 梅花易数时间起卦：本卦 / 互卦 / 变卦 / 动爻 / 体用生克
  - 小六壬：月、日、时三宫
  - 大六壬：月将加时排天地盘、四课、九宗门发三传（贼克/比用/涉害/遥克/昴星/别责/八专/伏吟/返吟）、十二天将、遁干旬空（`src/lib/daliuren.ts`，自查脚本 `scripts/test-daliuren.ts`）
- 计算结果以【盘面数据】注入系统提示词（`src/lib/prompt.ts`），提示词明令模型**不得自行重排盘面**，只许依盘断事。
- 调准确度 = 改 `src/lib/prompt.ts` 里的方法论段落；盘面本身无需模型介入。

梅花易数与小六壬以**用户发问的当下时刻**起卦（传统「问事之时」），八字以用户提交的生辰排。

## 运行

```bash
npm install
cp .env.example .env.local   # 填入 LLM_API_KEY
npm run dev
```

打开 http://localhost:3000。

模型接口走 OpenAI 兼容协议（`/chat/completions`），可用 OpenAI、DeepSeek、通义千问、Kimi 等任一兼容服务，通过 `.env.local` 的 `LLM_BASE_URL` / `LLM_MODEL` 切换。

### 思考模式（thinking）

支持 DeepSeek V4 等模型的思考模式：`LLM_THINKING=1` 开启后，模型先输出推理链再给断语，推理链通过 `reasoning_content` 返回，界面上可展开「道长掐算心路」查看；`LLM_REASONING_EFFORT` 可调力度（`high`/`max`）。注意思考模式下 `temperature` 会被模型忽略。

### 联网搜索（紧跟时事）

配置 `TAVILY_API_KEY`（[Tavily](https://tavily.com)）后，问题中含「最近、行情、行业、政策」等时势关键词时，服务端会先搜索当下资讯，以【时事资料】注入提示词，道长断事时可引时事佐证（术数为主、时事为参）。未配置则自动跳过，不影响正常使用。搜索触发逻辑在 `src/lib/search.ts`。

### 问答记录（复盘优化用）

配置 Supabase 免费层后，每次问答（问题、断语、思考链、生辰、模型、耗时）会写入数据库，供事后复盘、调优提示词。未配置则自动跳过，不影响正常使用。

1. 建表：`supabase/migrations/` 下的建表脚本（含 RLS：不开任何 policy，anon key 不可读写），随部署自动执行。记录按「人」聚合在 `conversations` 表：提供了生辰以来访者生辰哈希为身份（同一八字视为同一人），未提供生辰以浏览器会话 id 为身份；同一身份的问答追加在同一行的 `messages` 数组里（只留最近 50 条）。
2. 环境变量：Supabase 已与 Vercel 集成时，`SUPABASE_URL` 和 `SUPABASE_SERVICE_ROLE_KEY` 会自动注入 Vercel 项目；本地开发用 `vercel env pull` 拉取，或手动填入 `.env.local`。service_role key 仅服务端可见，勿暴露给前端。代码也兼容 `NEXT_PUBLIC_SUPABASE_URL` / `SUPABASE_SERVICE_KEY` 两个别名。
3. 自检：`npm run db:check`（只读）会依次检查环境变量、项目连通性、`conversations` 表与 service_role 权限；写入失败时服务端日志会打印 `[log] ...` 和 HTTP 状态，不再静默。

写入逻辑在 `src/lib/log.ts`（纯 fetch 调 PostgREST，无额外依赖），通过 Next 的 `after()` 在响应结束后落库，不拖慢回答。

## 结构

```
src/
├── app/
│   ├── page.tsx            # 聊天界面（单一问答窗口 + 可选生辰面板）
│   └── api/chat/route.ts   # POST /api/chat：排盘 → 搜时事 → 组提示词 → 调模型
└── lib/
    ├── divination.ts       # 八字（真太阳时）/ 梅花 / 小六壬 确定性排盘
    ├── cities.ts           # 城市经度表（真太阳时换算用）
    ├── search.ts           # Tavily 联网搜索与时势关键词判断
    ├── log.ts              # 问答记录写入 Supabase（可选，未配置自动跳过）
    └── prompt.ts           # 道长人设 + 方法论系统提示词
```

## API

`POST /api/chat`

```json
{
  "messages": [{ "role": "user", "content": "今年运势如何？" }],
  "birth": { "date": "1990-05-20", "time": "14:30", "gender": "男" }
}
```

- `messages`：对话历史（最多取最近 20 条），最后一条须为 user。
- `birth`：可选；缺省时八字不排，提示词会引导道长主动向求测者索要生辰。

响应为 SSE 流（`text/event-stream`）：先推 `chart` 事件（盘面数据，侧栏即时显示），随后逐段推 `delta` 事件（`content` 为正文、`reasoning` 为思考链），最后以 `done` 结束；上游中断时推 `error` 事件。请求阶段的错误（配置缺失、参数非法、连不上模型等）仍返回 JSON `{"error": "..."}`。
