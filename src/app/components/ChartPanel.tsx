import type { BaZiChart, DaLiuRenChart, MeiHuaChart, XiaoLiuRenChart } from "@/lib/divination";

export interface ChartData {
  bazi: BaZiChart | null;
  meihua: MeiHuaChart;
  xiaoliuren: XiaoLiuRenChart;
  daliuren: DaLiuRenChart;
}

/** 单爻：阳爻通连，阴爻中断；动爻右侧缀青点 */
function YaoLine({ yang, moving }: { yang: boolean; moving?: boolean }) {
  return (
    <div className="flex h-2.5 items-center gap-1">
      {yang ? (
        <div className="h-1.5 flex-1 rounded-sm bg-stone-800" />
      ) : (
        <div className="flex h-full flex-1 gap-2">
          <div className="h-1.5 flex-1 rounded-sm bg-stone-800" />
          <div className="h-1.5 flex-1 rounded-sm bg-stone-800" />
        </div>
      )}
      <div className={`h-1.5 w-1.5 rounded-full ${moving ? "bg-teal-700" : "bg-transparent"}`} />
    </div>
  );
}

/** 六爻卦画（lines 自下而上，显示时上爻在顶） */
function Hexagram({
  lines,
  name,
  dongYao,
  label,
}: {
  lines: number[];
  name: string;
  dongYao?: number;
  label: string;
}) {
  return (
    <div className="flex flex-col items-center gap-1.5">
      <div className="text-[10px] text-stone-400">{label}</div>
      <div className="flex w-16 flex-col gap-1">
        {[...lines].reverse().map((v, idx) => (
          <YaoLine key={idx} yang={v === 1} moving={dongYao !== undefined && 6 - idx === dongYao} />
        ))}
      </div>
      <div className="text-xs font-medium text-stone-700">{name}</div>
    </div>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-2xl border border-stone-200/80 bg-white p-4 shadow-sm">
      <h3 className="mb-3 text-xs font-semibold tracking-widest text-stone-400">{title}</h3>
      {children}
    </section>
  );
}

const WUXING_COLORS: Record<string, string> = {
  金: "bg-amber-400",
  木: "bg-emerald-500",
  水: "bg-sky-500",
  火: "bg-red-400",
  土: "bg-yellow-600",
};

function BaZiPanel({ bazi }: { bazi: BaZiChart }) {
  return (
    <Card title="八字命盘">
      <div className="grid grid-cols-4 gap-2">
        {bazi.pillars.map((p) => {
          const isDay = p.label === "日";
          return (
            <div
              key={p.label}
              className={`flex flex-col items-center gap-0.5 rounded-xl py-2 ${
                isDay ? "bg-teal-800/8 ring-1 ring-teal-700/30" : "bg-stone-50"
              }`}
            >
              <span className="text-[10px] text-stone-400">
                {p.label}柱{isDay ? "·日主" : ""}
              </span>
              <span className="text-[10px] text-stone-500">{p.shiShenGan}</span>
              <span className="text-xl font-semibold leading-7 text-stone-900">{p.gan}</span>
              <span className="text-xl font-semibold leading-7 text-stone-900">{p.zhi}</span>
              <span className="mt-0.5 text-[10px] text-stone-400">{p.naYin}</span>
            </div>
          );
        })}
      </div>
      {!bazi.hasTime && (
        <p className="mt-2 text-[10px] text-stone-400">时辰未提供，时柱按午时暂排</p>
      )}
      <div className="mt-3 flex flex-col gap-1">
        {Object.entries(bazi.wuXingCount).map(([wx, n]) => (
          <div key={wx} className="flex items-center gap-2 text-[10px] text-stone-500">
            <span className="w-3">{wx}</span>
            <div className="h-1.5 flex-1 rounded-full bg-stone-100">
              <div
                className={`h-1.5 rounded-full ${WUXING_COLORS[wx]}`}
                style={{ width: `${(n / 8) * 100}%` }}
              />
            </div>
            <span className="w-3 text-right">{n}</span>
          </div>
        ))}
      </div>
      <div className="mt-3 border-t border-stone-100 pt-2 text-[10px] leading-5 text-stone-400">
        <div>{bazi.lunarText}｜生肖属{bazi.shengXiao}</div>
        <div>{bazi.timeNote}</div>
      </div>
    </Card>
  );
}

function MeiHuaPanel({ meihua }: { meihua: MeiHuaChart }) {
  return (
    <Card title="梅花易数">
      <div className="flex items-center justify-center gap-3">
        <Hexagram lines={meihua.benLines} name={meihua.benName} dongYao={meihua.dongYao} label="本卦" />
        <div className="pb-5 text-stone-300">→</div>
        <Hexagram lines={meihua.bianLines} name={meihua.bianName} label="变卦" />
      </div>
      <div className="mt-3 text-center text-xs text-stone-500">互卦 · {meihua.huName}</div>
      <div className="mt-3 flex items-center justify-center gap-2 text-xs">
        <span className="rounded-full bg-teal-800/8 px-2.5 py-1 text-teal-800">
          体 {meihua.ti.name}
          {meihua.ti.wuXing}
        </span>
        <span className="rounded-full bg-stone-100 px-2.5 py-1 text-stone-600">
          用 {meihua.yong.name}
          {meihua.yong.wuXing}
        </span>
      </div>
      <div className="mt-2 text-center text-[10px] text-stone-400">{meihua.relation}</div>
      <div className="mt-3 border-t border-stone-100 pt-2 text-center text-[10px] text-stone-400">
        {meihua.timeText}
      </div>
    </Card>
  );
}

function DaLiuRenPanel({ daliuren }: { daliuren: DaLiuRenChart }) {
  const chuanLabels = ["初传", "中传", "末传"];
  return (
    <Card title="大六壬">
      {/* 课名 */}
      <div className="flex justify-center">
        <span className="rounded-full bg-teal-800/8 px-2.5 py-1 text-xs text-teal-800">
          {daliuren.keMing}课
        </span>
      </div>
      {/* 三传：初→中→末竖排 */}
      <div className="mt-3 flex flex-col items-center gap-1">
        {daliuren.sanChuan.map((c, i) => (
          <div key={chuanLabels[i]} className="flex flex-col items-center gap-1">
            {i > 0 && <span className="text-[10px] leading-none text-stone-300">↓</span>}
            <div
              className={`flex items-center gap-2 rounded-xl px-3 py-1.5 ${
                i === 0 ? "bg-teal-800/8 ring-1 ring-teal-700/30" : "bg-stone-50"
              }`}
            >
              <span className="text-[10px] text-stone-400">{chuanLabels[i]}</span>
              <span className={`text-sm font-semibold ${c.kong ? "text-stone-400" : "text-stone-900"}`}>
                {c.dunGan}
                {c.zhi}
              </span>
              <span className="text-[10px] text-stone-500">{c.tianJiang}</span>
              {c.kong && <span className="text-[10px] text-stone-400">空</span>}
            </div>
          </div>
        ))}
      </div>
      {/* 四课 2×2：上神在天盘带天将，下神在地盘 */}
      <div className="mt-3 grid grid-cols-2 gap-2">
        {daliuren.siKe.map((k, i) => (
          <div key={i} className="flex flex-col items-center gap-0.5 rounded-xl bg-stone-50 py-1.5">
            <span className="text-sm font-medium text-stone-900">{k.shangZhi}</span>
            <span className="text-[10px] text-stone-500">{k.shangJiang}</span>
            <span className="my-0.5 h-px w-8 bg-stone-200" />
            <span className={`text-xs ${k.xiaIsDayGan ? "font-medium text-teal-800" : "text-stone-600"}`}>
              {k.xiaLabel}
            </span>
          </div>
        ))}
      </div>
      {/* 底部注：月将与占时 */}
      <div className="mt-3 border-t border-stone-100 pt-2 text-center text-[10px] leading-5 text-stone-400">
        <div>
          月将 {daliuren.yueJiangZhi}·{daliuren.yueJiangName}（{daliuren.zhongQi}后）｜旬空 {daliuren.xunKong.join("")}
        </div>
        <div>{daliuren.timeText}</div>
      </div>
    </Card>
  );
}

function XiaoLiuRenPanel({ xiaoliuren }: { xiaoliuren: XiaoLiuRenChart }) {
  const steps = [
    { label: "月", palace: xiaoliuren.monthPalace },
    { label: "日", palace: xiaoliuren.dayPalace },
    { label: "时", palace: xiaoliuren.hourPalace, final: true },
  ];
  return (
    <Card title="小六壬">
      <div className="flex items-center justify-center gap-1.5">
        {steps.map((s, i) => (
          <div key={s.label} className="flex items-center gap-1.5">
            {i > 0 && <span className="text-stone-300">→</span>}
            <div
              className={`flex flex-col items-center rounded-xl px-3 py-2 ${
                s.final ? "bg-teal-800/8 ring-1 ring-teal-700/30" : "bg-stone-50"
              }`}
            >
              <span className="text-[10px] text-stone-400">{s.label}</span>
              <span className={`text-sm font-medium ${s.final ? "text-teal-800" : "text-stone-700"}`}>
                {s.palace}
              </span>
            </div>
          </div>
        ))}
      </div>
      <div className="mt-3 border-t border-stone-100 pt-2 text-center text-[10px] text-stone-400">
        {xiaoliuren.lunarText}
      </div>
    </Card>
  );
}

export default function ChartPanel({ chart }: { chart: ChartData | null }) {
  if (!chart) {
    return (
      <div className="rounded-2xl border border-dashed border-stone-200 p-6 text-center text-xs leading-6 text-stone-400">
        盘面未开
        <br />
        发问之后，卦象命盘显于此处
      </div>
    );
  }
  return (
    <div className="flex flex-col gap-4">
      <MeiHuaPanel meihua={chart.meihua} />
      <DaLiuRenPanel daliuren={chart.daliuren} />
      {chart.bazi && <BaZiPanel bazi={chart.bazi} />}
      <XiaoLiuRenPanel xiaoliuren={chart.xiaoliuren} />
    </div>
  );
}
