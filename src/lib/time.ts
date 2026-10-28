/**
 * 问事时间口径：
 * - 填了问事地点 → 按该地点真太阳时（北京时间做基准，加经度时差与均时差）；
 * - 未填地点 → 按浏览器的当地民用时间（用户看到几点就是几点）；
 * - 两者都没有（旧客户端/API）→ 退回北京时间。
 *
 * 术数里的时辰以当地时间为准；服务器可能部署在 UTC（如 Vercel），
 * 所以绝不能读服务器的本地时钟。
 */

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

export interface BeijingTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

/** 问事时间采用的基准：真太阳时 / 浏览器当地民用时 / 北京时间。 */
export type TimeBasis = "city" | "local" | "beijing";

export interface SolarTime extends BeijingTimeParts {
  /** 是否已按经度与均时差校正 */
  corrected: boolean;
  basis: TimeBasis;
  /** 相对北京时间的总修正分钟数（经度时差 + 均时差） */
  correctionMinutes: number;
  longitudeMinutes: number;
  equationMinutes: number;
}

/** 把任意时刻换算成北京时间的年月日时分（与运行环境时区无关）。 */
export function beijingTime(date: Date): BeijingTimeParts {
  const shifted = new Date(date.getTime() + BEIJING_OFFSET_MS);
  return {
    year: shifted.getUTCFullYear(),
    month: shifted.getUTCMonth() + 1,
    day: shifted.getUTCDate(),
    hour: shifted.getUTCHours(),
    minute: shifted.getUTCMinutes(),
  };
}

/** 均时差（分钟）：真太阳时 − 平太阳时，按日期的近似公式。 */
function equationOfTime(dayOfYear: number): number {
  const b = ((2 * Math.PI) / 365) * (dayOfYear - 81);
  return 9.87 * Math.sin(2 * b) - 7.53 * Math.cos(b) - 1.5 * Math.sin(b);
}

/** 按 IANA 时区取当地年月日时分；时区非法或环境不支持时返回 null。 */
function zonedTime(date: Date, timeZone: string): BeijingTimeParts | null {
  try {
    const parts = new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      hourCycle: "h23",
    }).formatToParts(date);
    const pick = (type: string) => Number(parts.find((p) => p.type === type)?.value);
    const year = pick("year");
    const month = pick("month");
    const day = pick("day");
    const hour = pick("hour");
    const minute = pick("minute");
    if (![year, month, day, hour, minute].every((n) => Number.isFinite(n))) return null;
    return { year, month, day, hour, minute };
  } catch {
    return null;
  }
}

/**
 * 将北京时间（东八区，中央经线 120°E）换算为某经度的真太阳时。
 * 返回的仍是「北京时间轴」上的读数，可直接用于农历与干支排盘；跨日界自动处理。
 */
export function toTrueSolarTime(
  y: number,
  m: number,
  d: number,
  hh: number,
  mi: number,
  longitude: number
): SolarTime {
  // 输入视为北京时间（UTC+8）
  const utcMs = Date.UTC(y, m - 1, d, hh - 8, mi);
  const dayOfYear = Math.floor((Date.UTC(y, m - 1, d) - Date.UTC(y, 0, 0)) / 86400000);
  const longitudeMinutes = (longitude - 120) * 4; // 每度 4 分钟
  const equationMinutes = equationOfTime(dayOfYear);
  const correctionMinutes = longitudeMinutes + equationMinutes;
  const corrected = new Date(utcMs + correctionMinutes * 60000);
  // 转回北京时间轴读数
  const beijing = new Date(corrected.getTime() + 8 * 3600000);
  return {
    year: beijing.getUTCFullYear(),
    month: beijing.getUTCMonth() + 1,
    day: beijing.getUTCDate(),
    hour: beijing.getUTCHours(),
    minute: beijing.getUTCMinutes(),
    corrected: true,
    basis: "city",
    correctionMinutes,
    longitudeMinutes,
    equationMinutes,
  };
}

/**
 * 问事时刻：优先按地点真太阳时；无地点则按浏览器 IANA 时区的当地民用时；
 * 两者都没有时退回北京时间。
 * @param longitude 问事地点经度，东经为正、西经为负；null 表示未提供或未收录
 * @param timeZone  浏览器 IANA 时区（如 Australia/Melbourne），可选
 */
export function questionTime(
  date: Date,
  longitude: number | null,
  timeZone?: string | null
): SolarTime {
  if (longitude !== null) {
    const b = beijingTime(date);
    return toTrueSolarTime(b.year, b.month, b.day, b.hour, b.minute, longitude);
  }
  if (timeZone) {
    const local = zonedTime(date, timeZone);
    if (local) {
      return {
        ...local,
        corrected: false,
        basis: "local",
        correctionMinutes: 0,
        longitudeMinutes: 0,
        equationMinutes: 0,
      };
    }
  }
  return {
    ...beijingTime(date),
    corrected: false,
    basis: "beijing",
    correctionMinutes: 0,
    longitudeMinutes: 0,
    equationMinutes: 0,
  };
}

const SHI_CHEN = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];

/** 按小时取钟表时辰（子=23–1 点，丑=1–3 点……）。 */
export function shiZhiOf(hour: number): string {
  return SHI_CHEN[hour === 23 ? 0 : Math.floor((hour + 1) / 2) % 12];
}

/** 把时刻读数格式化为 HH:mm。 */
export function clockOf(parts: BeijingTimeParts): string {
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}
