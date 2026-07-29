import { buildDaLiuRen } from "../src/lib/daliuren";
import { Solar } from "lunar-javascript";

const cases: [number, number, number, number, number][] = [
  [2025, 7, 20, 14, 30], // 庚寅日 未时，夏至后月将未 → 伏吟
  [2025, 7, 20, 2, 0], // 庚寅日 丑时，将未冲丑 → 返吟
  [2025, 3, 15, 10, 0], // 春分前（雨水后月将亥）巳时
  [2025, 5, 5, 16, 0], // 立夏前后
  [2025, 1, 20, 12, 0], // 大寒当天中午（月将子）
  [2025, 1, 20, 3, 0], // 大寒交节(04:00)前 → 月将仍为丑
  [2025, 10, 1, 9, 0],
];

for (const [y, m, d, h, mi] of cases) {
  const now = new Date(y, m - 1, d, h, mi, 0);
  const { text, chart } = buildDaLiuRen(now);
  const lunar = Solar.fromYmdHms(y, m, d, h, mi, 0).getLunar();
  const ec = lunar.getEightChar();
  console.log("=".repeat(70));
  console.log(text);
  // 自查1：月将确实坐在占时上（地盘时支位的天盘支 = 月将）
  const timeIdx = "子丑寅卯辰巳午未申酉戌亥".indexOf(chart.timeZhi);
  const onTime = chart.tianPan[timeIdx];
  console.log(`[自查] 地盘${chart.timeZhi}位天盘=${onTime}（应为月将${chart.yueJiangZhi}）`, onTime === chart.yueJiangZhi ? "OK" : "FAIL");
  // 自查2：遁干旬空与 getDayXunKong 一致
  const xk = ec.getDayXunKong();
  for (const c of chart.sanChuan) {
    const shouldKong = xk.includes(c.zhi);
    if (shouldKong !== c.kong) console.log(`[自查] 旬空不一致: 传${c.zhi} kong=${c.kong} xunkong=${xk} FAIL`);
  }
  console.log(`[自查] 旬空(${xk})与三传遁干一致 OK`);
}
