import { Solar, Lunar } from "lunar-javascript";
import { lookupLongitude } from "./cities";
import { buildDaLiuRen, type DaLiuRenChart } from "./daliuren";
import {
  beijingTime,
  clockOf,
  questionTime,
  toTrueSolarTime,
  type BeijingTimeParts,
  type SolarTime,
} from "./time";

/**
 * 排盘计算模块：所有术数盘面都在这里用确定性算法计算，
 * 大模型只负责解读，不负责计算，以保证排盘准确。
 */

// ---------------------------------------------------------------------------
// 八卦基础数据
// ---------------------------------------------------------------------------

// 先天卦序：1乾 2兑 3离 4震 5巽 6坎 7艮 8坤
const TRIGRAM_NAMES = ["", "乾", "兑", "离", "震", "巽", "坎", "艮", "坤"];
// 各经卦爻画（自下而上，1 为阳爻，0 为阴爻）
const TRIGRAM_LINES: number[][] = [
  [],
  [1, 1, 1], // 乾 ☰
  [1, 1, 0], // 兑 ☱
  [1, 0, 1], // 离 ☲
  [1, 0, 0], // 震 ☳
  [0, 1, 1], // 巽 ☴
  [0, 1, 0], // 坎 ☵
  [0, 0, 1], // 艮 ☶
  [0, 0, 0], // 坤 ☷
];
const TRIGRAM_WUXING = ["", "金", "金", "火", "木", "木", "水", "土", "土"];

// 六十四卦名表：[上卦序][下卦序]
const HEXAGRAM_NAMES: string[][] = [
  [],
  ["", "乾为天", "天泽履", "天火同人", "天雷无妄", "天风姤", "天水讼", "天山遁", "天地否"],
  ["", "泽天夬", "兑为泽", "泽火革", "泽雷随", "泽风大过", "泽水困", "泽山咸", "泽地萃"],
  ["", "火天大有", "火泽睽", "离为火", "火雷噬嗑", "火风鼎", "火水未济", "火山旅", "火地晋"],
  ["", "雷天大壮", "雷泽归妹", "雷火丰", "震为雷", "雷风恒", "雷水解", "雷山小过", "雷地豫"],
  ["", "风天小畜", "风泽中孚", "风火家人", "风雷益", "巽为风", "风水涣", "风山渐", "风地观"],
  ["", "水天需", "水泽节", "水火既济", "水雷屯", "水风井", "坎为水", "水山蹇", "水地比"],
  ["", "山天大畜", "山泽损", "山火贲", "山雷颐", "山风蛊", "山水蒙", "艮为山", "山地剥"],
  ["", "地天泰", "地泽临", "地火明夷", "地雷复", "地风升", "地水师", "地山谦", "坤为地"],
];

const EARTHLY_BRANCHES = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];

const XIAO_LIU_REN = ["大安", "留连", "速喜", "赤口", "小吉", "空亡"];

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export interface BirthInfo {
  /** 公历日期 YYYY-MM-DD */
  date: string;
  /** 时间 HH:mm（可选，不知时辰则八字只排三柱） */
  time?: string;
  /** 性别 */
  gender?: string;
  /** 出生城市（可选，提供后按经度与均时差换算真太阳时） */
  city?: string;
}

export interface DivinationContext {
  /** 给模型注入的完整排盘文本 */
  text: string;
  /** 八字盘面（未提供生辰时为 null） */
  bazi: BaZiChart | null;
  /** 梅花易数盘面 */
  meihua: MeiHuaChart;
  /** 小六壬盘面 */
  xiaoliuren: XiaoLiuRenChart;
  /** 大六壬盘面 */
  daliuren: DaLiuRenChart;
}

export interface BaZiPillar {
  /** 年 / 月 / 日 / 时 */
  label: string;
  gan: string;
  zhi: string;
  naYin: string;
  shiShenGan: string;
}

export interface BaZiChart {
  pillars: BaZiPillar[];
  dayMaster: string;
  dayMasterWuXing: string;
  wuXingCount: Record<string, number>;
  lunarText: string;
  shengXiao: string;
  /** 排盘依据说明（真太阳时校正 / 按北京时间等） */
  timeNote: string;
  hasTime: boolean;
}

export interface MeiHuaChart {
  /** 本卦六爻（自下而上，1 阳 0 阴） */
  benLines: number[];
  benName: string;
  huName: string;
  /** 变卦六爻（自下而上） */
  bianLines: number[];
  bianName: string;
  /** 动爻位（1-6，自下而上） */
  dongYao: number;
  ti: { name: string; wuXing: string };
  yong: { name: string; wuXing: string };
  relation: string;
  timeText: string;
}

export interface XiaoLiuRenChart {
  monthPalace: string;
  dayPalace: string;
  hourPalace: string;
  lunarText: string;
}

// ---------------------------------------------------------------------------
// 八字（子平四柱）
// ---------------------------------------------------------------------------

function buildBaZi(birth: BirthInfo): { text: string; chart: BaZiChart } {
  const [y, m, d] = birth.date.split("-").map(Number);
  let hh = 12;
  let mi = 0;
  const hasTime = !!birth.time;
  if (hasTime) {
    const parts = birth.time!.split(":").map(Number);
    hh = parts[0];
    mi = parts[1] ?? 0;
  }

  // 真太阳时换算：提供了时辰且能查到出生地经度时才换算
  let longitude: number | null = null;
  if (birth.city) longitude = lookupLongitude(birth.city);
  const useTrueSolar = hasTime && longitude !== null;

  let py = y;
  let pm = m;
  let pd = d;
  let ph = hh;
  let pmi = mi;
  let tst: SolarTime | null = null;
  if (useTrueSolar && longitude !== null) {
    tst = toTrueSolarTime(y, m, d, hh, mi, longitude);
    py = tst.year;
    pm = tst.month;
    pd = tst.day;
    ph = tst.hour;
    pmi = tst.minute;
  }

  const solar = Solar.fromYmdHms(py, pm, pd, ph, pmi, 0);
  const lunar = solar.getLunar();
  const ec = lunar.getEightChar();

  const pad = (n: number) => String(n).padStart(2, "0");
  const lines: string[] = [];
  lines.push(`【八字命盘】`);
  lines.push(
    `公历（北京时间）：${birth.date}${hasTime ? ` ${birth.time}` : "（时辰未提供，时柱按午时暂排，解读时勿论时柱）"}`
  );
  let timeNote: string;
  if (useTrueSolar && tst) {
    const sign = tst.correctionMinutes >= 0 ? "+" : "−";
    lines.push(
      `出生地：${birth.city}（东经${longitude}°），真太阳时校正 ${sign}${Math.abs(tst.correctionMinutes).toFixed(1)}分钟（经度时差${tst.longitudeMinutes.toFixed(1)}分＋均时差${tst.equationMinutes.toFixed(1)}分）`
    );
    lines.push(
      `真太阳时：${tst.year}-${pad(tst.month)}-${pad(tst.day)} ${pad(tst.hour)}:${pad(tst.minute)}（八字依此排定）`
    );
    timeNote = `真太阳时 ${pad(tst.hour)}:${pad(tst.minute)}（${birth.city}）`;
  } else if (birth.city && longitude === null) {
    lines.push(`出生地：${birth.city}（未收录该城市经度，按北京时间排盘）`);
    timeNote = "按北京时间排盘（城市未收录）";
  } else {
    lines.push(`未提供出生地，按北京时间（东经120°）排盘；如需精排请报出生城市以换算真太阳时。`);
    timeNote = "按北京时间排盘";
  }
  lines.push(`农历：${lunar.getYearInChinese()}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()} ${lunar.getTimeZhi()}时`);
  lines.push(`生肖：${lunar.getYearShengXiao()}`);
  if (birth.gender) lines.push(`性别：${birth.gender}`);
  lines.push(
    `四柱：年柱 ${ec.getYear()}（纳音${ec.getYearNaYin()}）｜月柱 ${ec.getMonth()}（纳音${ec.getMonthNaYin()}）｜日柱 ${ec.getDay()}（纳音${ec.getDayNaYin()}）｜时柱 ${ec.getTime()}（纳音${ec.getTimeNaYin()}）`
  );
  lines.push(`日主：${ec.getDayGan()}（${ec.getDayWuXing().charAt(0)}）`);
  const joinArr = (v: string | string[]) => (Array.isArray(v) ? v.join("、") : v);
  lines.push(
    `十神：年干${ec.getYearShiShenGan()}、月干${ec.getMonthShiShenGan()}、时干${ec.getTimeShiShenGan()}；年支${joinArr(ec.getYearShiShenZhi())}、月支${joinArr(ec.getMonthShiShenZhi())}、日支${joinArr(ec.getDayShiShenZhi())}、时支${joinArr(ec.getTimeShiShenZhi())}`
  );
  lines.push(`五行分布：年柱${ec.getYearWuXing()}、月柱${ec.getMonthWuXing()}、日柱${ec.getDayWuXing()}、时柱${ec.getTimeWuXing()}`);

  // 五行个数统计
  const count: Record<string, number> = { 金: 0, 木: 0, 水: 0, 火: 0, 土: 0 };
  const wx = `${ec.getYearWuXing()}${ec.getMonthWuXing()}${ec.getDayWuXing()}${ec.getTimeWuXing()}`;
  for (const ch of wx) {
    if (ch in count) count[ch] += 1;
  }
  lines.push(
    `五行个数：${Object.entries(count)
      .map(([k, v]) => `${k}${v}`)
      .join("、")}`
  );
  lines.push(`当前节气：${lunar.getPrevJieQi().getName()}（${lunar.getPrevJieQi().getSolar().toYmd()}交节）`);

  const chart: BaZiChart = {
    pillars: [
      { label: "年", gan: ec.getYear().charAt(0), zhi: ec.getYear().charAt(1), naYin: ec.getYearNaYin(), shiShenGan: ec.getYearShiShenGan() },
      { label: "月", gan: ec.getMonth().charAt(0), zhi: ec.getMonth().charAt(1), naYin: ec.getMonthNaYin(), shiShenGan: ec.getMonthShiShenGan() },
      { label: "日", gan: ec.getDay().charAt(0), zhi: ec.getDay().charAt(1), naYin: ec.getDayNaYin(), shiShenGan: "日主" },
      { label: "时", gan: ec.getTime().charAt(0), zhi: ec.getTime().charAt(1), naYin: ec.getTimeNaYin(), shiShenGan: ec.getTimeShiShenGan() },
    ],
    dayMaster: ec.getDayGan(),
    dayMasterWuXing: ec.getDayWuXing().charAt(0),
    wuXingCount: count,
    lunarText: `${lunar.getYearInChinese()}年${lunar.getMonthInChinese()}月${lunar.getDayInChinese()} ${lunar.getTimeZhi()}时`,
    shengXiao: lunar.getYearShengXiao(),
    timeNote,
    hasTime,
  };
  return { text: lines.join("\n"), chart };
}

// ---------------------------------------------------------------------------
// 梅花易数（按问事时间起卦）
// ---------------------------------------------------------------------------

/** 排盘时刻：既接受真实 Date，也接受已按真太阳时校正过的读数。 */
type TimeInput = Date | BeijingTimeParts;

function timePartsOf(input: TimeInput): BeijingTimeParts {
  return input instanceof Date ? beijingTime(input) : input;
}

function buildMeiHua(
  time: TimeInput,
  baoShu?: number,
  timeLabel = "北京时间，未校正真太阳时"
): { text: string; chart: MeiHuaChart } {
  // 问事时间一律按问事地点的真太阳时解读，避免服务器时区（如 Vercel 的 UTC）带偏时支与日干支
  const t = timePartsOf(time);
  const clock = clockOf(t);
  const solar = Solar.fromYmdHms(t.year, t.month, t.day, t.hour, t.minute, 0);
  const lunar = solar.getLunar();

  const yearZhiNum = EARTHLY_BRANCHES.indexOf(lunar.getYearZhi()) + 1; // 子1…亥12
  const monthNum = lunar.getMonth(); // 农历月 1-12
  const dayNum = lunar.getDay(); // 农历日 1-30
  const hourZhiNum = EARTHLY_BRANCHES.indexOf(lunar.getTimeZhi()) + 1;

  let upperNum: number;
  let lowerNum: number;
  let dongYao: number;
  if (baoShu !== undefined) {
    // 报数起卦（一数法）：同一时辰再问，以所报之数为上卦，数加正时时支数为下卦、取动爻
    upperNum = baoShu % 8 || 8;
    lowerNum = (baoShu + hourZhiNum) % 8 || 8;
    dongYao = (baoShu + hourZhiNum) % 6 || 6;
  } else {
    upperNum = (yearZhiNum + monthNum + dayNum) % 8 || 8;
    lowerNum = (yearZhiNum + monthNum + dayNum + hourZhiNum) % 8 || 8;
    dongYao = (yearZhiNum + monthNum + dayNum + hourZhiNum) % 6 || 6;
  }

  // 本卦六爻（自下而上）
  const benLines = [...TRIGRAM_LINES[lowerNum], ...TRIGRAM_LINES[upperNum]];
  // 互卦：下互取二三四爻，上互取三四五爻
  const huLower = trigramNumFromLines([benLines[1], benLines[2], benLines[3]]);
  const huUpper = trigramNumFromLines([benLines[2], benLines[3], benLines[4]]);
  // 变卦：动爻阴阳互换
  const bianLines = [...benLines];
  bianLines[dongYao - 1] = bianLines[dongYao - 1] === 1 ? 0 : 1;
  const bianLower = trigramNumFromLines(bianLines.slice(0, 3));
  const bianUpper = trigramNumFromLines(bianLines.slice(3, 6));

  // 体用：动爻所在之经卦为用，无动爻之经卦为体
  const tiIsUpper = dongYao <= 3;
  const tiNum = tiIsUpper ? upperNum : lowerNum;
  const yongNum = tiIsUpper ? lowerNum : upperNum;

  const lines: string[] = [];
  if (baoShu !== undefined) {
    lines.push(`【梅花易数·报数起卦】（同一时辰再问，依例以善信所报之数起卦）`);
    lines.push(
      `起卦时间：公历 ${solar.toYmd()} ${clock}（${timeLabel}）｜农历 ${lunar.getMonthInChinese()}月${lunar.getDayInChinese()} ${lunar.getTimeZhi()}时`
    );
    lines.push(`起数：善信报数${baoShu}为上卦；报数加正时时支数${hourZhiNum}＝${baoShu + hourZhiNum}，为下卦并取动爻`);
  } else {
    lines.push(`【梅花易数·时间起卦】（以问事之时起卦）`);
    lines.push(
      `起卦时间：公历 ${solar.toYmd()} ${clock}（${timeLabel}）｜农历 ${lunar.getMonthInChinese()}月${lunar.getDayInChinese()} ${lunar.getTimeZhi()}时`
    );
    lines.push(`起数：年支数${yearZhiNum}＋月数${monthNum}＋日数${dayNum}＝${yearZhiNum + monthNum + dayNum}；加时支数${hourZhiNum}＝${yearZhiNum + monthNum + dayNum + hourZhiNum}`);
  }
  lines.push(
    `本卦：${HEXAGRAM_NAMES[upperNum][lowerNum]}（上${TRIGRAM_NAMES[upperNum]}${TRIGRAM_WUXING[upperNum]} 下${TRIGRAM_NAMES[lowerNum]}${TRIGRAM_WUXING[lowerNum]}），第${["初", "二", "三", "四", "五", "上"][dongYao - 1]}爻动`
  );
  lines.push(`互卦：${HEXAGRAM_NAMES[huUpper][huLower]}`);
  lines.push(`变卦：${HEXAGRAM_NAMES[bianUpper][bianLower]}`);
  lines.push(
    `体用：体卦 ${TRIGRAM_NAMES[tiNum]}（${TRIGRAM_WUXING[tiNum]}），用卦 ${TRIGRAM_NAMES[yongNum]}（${TRIGRAM_WUXING[yongNum]}），${wuxingRelation(TRIGRAM_WUXING[tiNum], TRIGRAM_WUXING[yongNum])}`
  );

  const chart: MeiHuaChart = {
    benLines,
    benName: HEXAGRAM_NAMES[upperNum][lowerNum],
    huName: HEXAGRAM_NAMES[huUpper][huLower],
    bianLines,
    bianName: HEXAGRAM_NAMES[bianUpper][bianLower],
    dongYao,
    ti: { name: TRIGRAM_NAMES[tiNum], wuXing: TRIGRAM_WUXING[tiNum] },
    yong: { name: TRIGRAM_NAMES[yongNum], wuXing: TRIGRAM_WUXING[yongNum] },
    relation: wuxingRelation(TRIGRAM_WUXING[tiNum], TRIGRAM_WUXING[yongNum]),
    timeText: `${solar.toYmd()} ${clock}（${timeLabel}）｜农历${lunar.getMonthInChinese()}月${lunar.getDayInChinese()} ${lunar.getTimeZhi()}时`,
  };
  return { text: lines.join("\n"), chart };
}

function trigramNumFromLines(lines: number[]): number {
  for (let i = 1; i <= 8; i++) {
    if (TRIGRAM_LINES[i].every((v, idx) => v === lines[idx])) return i;
  }
  return 1;
}

const SHENG: Record<string, string> = { 木: "火", 火: "土", 土: "金", 金: "水", 水: "木" };
const KE: Record<string, string> = { 木: "土", 土: "水", 水: "火", 火: "金", 金: "木" };

function wuxingRelation(ti: string, yong: string): string {
  if (ti === yong) return "体用比和";
  if (SHENG[yong] === ti) return "用生体（吉，事有外力相助）";
  if (SHENG[ti] === yong) return "体生用（耗泄，事多付出）";
  if (KE[yong] === ti) return "用克体（凶，事有阻碍）";
  return "体克用（小吉，事需主动争取）";
}

// ---------------------------------------------------------------------------
// 小六壬（按问事时间起课）
// ---------------------------------------------------------------------------

function buildXiaoLiuRen(time: TimeInput, baoShu?: number): { text: string; chart: XiaoLiuRenChart } {
  const t = timePartsOf(time);
  const solar = Solar.fromYmdHms(t.year, t.month, t.day, t.hour, t.minute, 0);
  const lunar = solar.getLunar();

  const monthNum = lunar.getMonth();
  const dayNum = lunar.getDay();
  const hourZhiIdx = EARTHLY_BRANCHES.indexOf(lunar.getTimeZhi()); // 子0…亥11

  // 大安起正月，月上起日，日上起时；报数起课时以所报之数代时数
  const monthPos = (monthNum - 1) % 6;
  const dayPos = (monthPos + dayNum - 1) % 6;
  const hourPos = baoShu !== undefined ? (dayPos + ((baoShu - 1) % 6)) % 6 : (dayPos + hourZhiIdx) % 6;

  const lines: string[] = [];
  if (baoShu !== undefined) {
    lines.push(`【小六壬课】（同一时辰再问，以善信报数 ${baoShu} 代时数起课）`);
    lines.push(
      `农历${lunar.getMonthInChinese()}月${lunar.getDayInChinese()} ${lunar.getTimeZhi()}时：月落${XIAO_LIU_REN[monthPos]}，日落${XIAO_LIU_REN[dayPos]}，报数（最终结果）落【${XIAO_LIU_REN[hourPos]}】`
    );
  } else {
    lines.push(`【小六壬课】（以问事之时起课）`);
    lines.push(
      `农历${lunar.getMonthInChinese()}月${lunar.getDayInChinese()} ${lunar.getTimeZhi()}时：月落${XIAO_LIU_REN[monthPos]}，日落${XIAO_LIU_REN[dayPos]}，时（最终结果）落【${XIAO_LIU_REN[hourPos]}】`
    );
  }

  const chart: XiaoLiuRenChart = {
    monthPalace: XIAO_LIU_REN[monthPos],
    dayPalace: XIAO_LIU_REN[dayPos],
    hourPalace: XIAO_LIU_REN[hourPos],
    lunarText: `农历${lunar.getMonthInChinese()}月${lunar.getDayInChinese()} ${lunar.getTimeZhi()}时`,
  };
  return { text: lines.join("\n"), chart };
}

// ---------------------------------------------------------------------------
// 入口
// ---------------------------------------------------------------------------

/**
 * 计算所有盘面，返回注入模型的文本与结构化盘面数据。
 * @param birth 生辰信息（可选，有则排八字）
 * @param now   问事时刻（任意时区；内部按问事地点的真太阳时解读）
 * @param baoShu 善信所报之数（可选）。同一时辰内再问时由前端收集报数传入，
 *               梅花改报数起卦、小六壬以报数代时数、大六壬以报数取活时。
 * @param askCity 问事地点（可选）。有经度则按当地真太阳时排盘，否则按北京时间。
 */
export function computeDivination(
  birth: BirthInfo | null,
  now: Date,
  baoShu?: number,
  askCity?: string | null
): DivinationContext {
  const parts: string[] = [];
  let bazi: BaZiChart | null = null;
  if (birth?.date) {
    try {
      const r = buildBaZi(birth);
      parts.push(r.text);
      bazi = r.chart;
    } catch {
      parts.push("【八字命盘】生辰信息有误，未能排盘。");
    }
  }

  // 问事盘按问事地点的真太阳时起课；未提供或未收录地点时退回北京时间
  const askLongitude = askCity ? lookupLongitude(askCity) : null;
  const qt = questionTime(now, askLongitude);
  const sign = qt.correctionMinutes >= 0 ? "+" : "−";
  const lonLabel =
    askLongitude === null
      ? ""
      : askLongitude >= 0
        ? `东经${askLongitude}°`
        : `西经${Math.abs(askLongitude)}°`;
  const timeLabel = qt.corrected
    ? `真太阳时，${askCity}，${lonLabel}，校正${sign}${Math.abs(qt.correctionMinutes).toFixed(1)}分`
    : askCity
      ? `北京时间，${askCity}未收录经度，未校正`
      : "北京时间，未校正真太阳时";

  const meihua = buildMeiHua(qt, baoShu, timeLabel);
  const xiaoliuren = buildXiaoLiuRen(qt, baoShu);
  const daliuren = buildDaLiuRen(qt, undefined, baoShu, timeLabel);
  parts.push(meihua.text, xiaoliuren.text, daliuren.text);
  return { text: parts.join("\n\n"), bazi, meihua: meihua.chart, xiaoliuren: xiaoliuren.chart, daliuren: daliuren.chart };
}

export type { Lunar };
export type { DaLiuRenChart } from "./daliuren";
