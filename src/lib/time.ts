/**
 * 问事时间口径：以北京时间为基准，按问事地点做真太阳时校正。
 *
 * 术数里的时辰以当地太阳位置为准，而不是服务器时区或行政时区。
 * 服务器可能部署在 UTC（如 Vercel），所以先取北京时间（UTC+8），
 * 再按问事地点的经度与均时差校正；未提供地点时退回北京时间。
 * 中国大陆自 1991 年起不再实行夏令时，UTC+8 固定即可。
 */

const BEIJING_OFFSET_MS = 8 * 60 * 60 * 1000;

export interface BeijingTimeParts {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
}

export interface SolarTime extends BeijingTimeParts {
  /** 是否已按经度与均时差校正 */
  corrected: boolean;
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
    correctionMinutes,
    longitudeMinutes,
    equationMinutes,
  };
}

/**
 * 问事时刻：无经度时按北京时间（不校正）；有经度时换算为当地真太阳时。
 * @param longitude 问事地点经度，东经为正、西经为负；null 表示未提供或未收录
 */
export function questionTime(date: Date, longitude: number | null): SolarTime {
  const b = beijingTime(date);
  if (longitude === null) {
    return {
      ...b,
      corrected: false,
      correctionMinutes: 0,
      longitudeMinutes: 0,
      equationMinutes: 0,
    };
  }
  return toTrueSolarTime(b.year, b.month, b.day, b.hour, b.minute, longitude);
}

const SHI_CHEN = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];

/** 按小时取钟表时辰（子=23–1 点，丑=1–3 点……）。 */
export function shiZhiOf(hour: number): string {
  return SHI_CHEN[hour === 23 ? 0 : Math.floor((hour + 1) / 2) % 12];
}

/** 北京时间对应的钟表时辰。 */
export function beijingShiZhi(date: Date): string {
  return shiZhiOf(beijingTime(date).hour);
}

/** 把时刻读数格式化为 HH:mm。 */
export function clockOf(parts: BeijingTimeParts): string {
  return `${String(parts.hour).padStart(2, "0")}:${String(parts.minute).padStart(2, "0")}`;
}

/** 北京时间 HH:mm。 */
export function beijingClock(date: Date): string {
  return clockOf(beijingTime(date));
}
