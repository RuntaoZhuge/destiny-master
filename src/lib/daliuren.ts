import { Solar } from "lunar-javascript";

/**
 * 大六壬排盘：月将加时布天盘，立四课，依九宗门发三传，
 * 布十二天将，配遁干旬空。全部由确定性算法计算，大模型只解读。
 */

// ---------------------------------------------------------------------------
// 基础数据
// ---------------------------------------------------------------------------

const GAN = ["甲", "乙", "丙", "丁", "戊", "己", "庚", "辛", "壬", "癸"];
const ZHI = ["子", "丑", "寅", "卯", "辰", "巳", "午", "未", "申", "酉", "戌", "亥"];
// 支五行：子亥水、寅卯木、巳午火、申酉金、辰戌丑未土
const ZHI_WX = ["水", "土", "木", "木", "土", "火", "火", "土", "金", "金", "土", "水"];
// 干五行：甲乙木、丙丁火、戊己土、庚辛金、壬癸水
const GAN_WX = ["木", "木", "火", "火", "土", "土", "金", "金", "水", "水"];
// 五行相克：key 克 value
const KE: Record<string, string> = { 木: "土", 土: "水", 水: "火", 火: "金", 金: "木" };
const isYangGan = (g: number) => g % 2 === 0; // 甲丙戊庚壬
const isYangZhi = (z: number) => z % 2 === 0; // 子寅辰午申戌

// 月将神名（按所临之支）
const JIANG_NAME = ["神后", "大吉", "功曹", "太冲", "天罡", "太乙", "胜光", "小吉", "传送", "从魁", "河魁", "登明"];

// 中气换将：中气名 → 月将支序
const ZHONGQI_JIANG: Record<string, number> = {
  雨水: 11, // 亥 登明
  春分: 10, // 戌 河魁
  谷雨: 9, // 酉 从魁
  小满: 8, // 申 传送
  夏至: 7, // 未 小吉
  大暑: 6, // 午 胜光
  处暑: 5, // 巳 太乙
  秋分: 4, // 辰 天罡
  霜降: 3, // 卯 太冲
  小雪: 2, // 寅 功曹
  冬至: 1, // 丑 大吉
  大寒: 0, // 子 神后
};

// 干寄宫：甲寅、乙辰、丙戊巳、丁己未、庚申、辛戌、壬亥、癸丑
const JI_GONG = [2, 4, 5, 7, 5, 7, 8, 10, 11, 1];

// 三刑：寅巳申互刑、丑戌未互刑、子卯互刑、辰午酉亥自刑
const XING = [3, 10, 5, 0, 4, 8, 6, 1, 2, 9, 7, 11];
// 六冲
const chong = (z: number) => (z + 6) % 12;

// 驿马：申子辰马在寅、寅午戌马在申、巳酉丑马在亥、亥卯未马在巳
const YI_MA = [2, 11, 8, 5, 2, 11, 8, 5, 2, 11, 8, 5];

// 三合局（生→旺→墓序）：申子辰、寅午戌、巳酉丑、亥卯未
const SAN_HE = [
  [8, 0, 4],
  [2, 6, 10],
  [5, 9, 1],
  [11, 3, 7],
];
/** 支前三合：该支在其三合循环中的前一位（如子→申、午→寅、申→辰） */
function sanHePrev(z: number): number {
  for (const cycle of SAN_HE) {
    const i = cycle.indexOf(z);
    if (i >= 0) return cycle[(i + 2) % 3];
  }
  return z;
}

// 十二天将序
const TIAN_JIANG = ["贵人", "螣蛇", "朱雀", "六合", "勾陈", "青龙", "天空", "白虎", "太常", "玄武", "太阴", "天后"];

// 贵人起法：[昼支, 夜支]。甲戊庚昼丑夜未、乙己昼子夜申、丙丁昼亥夜酉、壬癸昼卯夜巳、辛昼午夜寅
const GUI_REN: [number, number][] = [
  [1, 7], // 甲
  [0, 8], // 乙
  [11, 9], // 丙
  [11, 9], // 丁
  [1, 7], // 戊
  [0, 8], // 己
  [1, 7], // 庚
  [6, 2], // 辛
  [3, 5], // 壬
  [3, 5], // 癸
];

// 别责阳日：干合之寄宫。甲→己寄未、乙→庚寄申、丙→辛寄戌、丁→壬寄亥、戊→癸寄丑
const HE_GONG: Record<number, number> = { 0: 7, 1: 8, 2: 10, 3: 11, 4: 1 };

// 四孟：寅申巳亥
const SI_MENG = [2, 8, 5, 11];

// ---------------------------------------------------------------------------
// 类型
// ---------------------------------------------------------------------------

export interface DaLiuRenChuan {
  /** 传支 */
  zhi: string;
  /** 支之神名（如胜光、太乙） */
  shenName: string;
  /** 遁干（旬空时为 "空"） */
  dunGan: string;
  /** 所乘天将 */
  tianJiang: string;
  /** 该支是否旬空 */
  kong: boolean;
}

export interface DaLiuRenKe {
  /** 上神（天盘支） */
  shangZhi: string;
  /** 上神所乘天将 */
  shangJiang: string;
  /** 下神：第一课为日干，其余为地盘支 */
  xiaLabel: string;
  xiaIsDayGan: boolean;
}

export interface DaLiuRenChart {
  keMing: string;
  dayGanZhi: string;
  xun: string;
  xunKong: string[];
  timeZhi: string;
  dayNight: "昼" | "夜";
  yueJiangZhi: string;
  yueJiangName: string;
  zhongQi: string;
  /** 天盘：index 为地盘支序，值为天盘支 */
  tianPan: string[];
  siKe: DaLiuRenKe[];
  /** [初传, 中传, 末传] */
  sanChuan: DaLiuRenChuan[];
  timeText: string;
}

/** 核心排盘结果（全部用地支序数表示，便于测试与复用） */
export interface DaLiuRenCoreResult {
  keMing: string;
  /** 天盘：index 为地盘支序，值为天盘支序 */
  tianPanIdx: number[];
  /** 四课上神支序（一~四课） */
  keShang: number[];
  /** 四课下神支序（第一课为日干寄宫支） */
  keXia: number[];
  /** 三传支序 [初, 中, 末] */
  sanChuanZhi: number[];
  /** 十二天将：index 为天盘支序 */
  tianJiangMap: string[];
  guiZhi: number;
  guiLin: number;
  isDay: boolean;
}

// ---------------------------------------------------------------------------
// 核心排盘（与历法解耦，输入干支/时支/月将序数）
// ---------------------------------------------------------------------------

export function computeDaLiuRenCore(
  ganIdx: number,
  zhiIdx: number,
  timeIdx: number,
  jiangIdx: number
): DaLiuRenCoreResult {
  const yangDay = isYangGan(ganIdx);

  // --- 天盘：月将加占时。地盘位 p 上的天盘支 = (将 + p − 时) mod 12 ---
  const shangShen = (p: number) => (jiangIdx + p - timeIdx + 12) % 12;
  /** 天盘支 z 所临之地盘位 */
  const linDi = (z: number) => (z - jiangIdx + timeIdx + 12) % 12;
  const tianPanIdx = ZHI.map((_, p) => shangShen(p));

  // --- 四课 ---
  const jiGong = JI_GONG[ganIdx];
  const keShang = [shangShen(jiGong), 0, shangShen(zhiIdx), 0];
  keShang[1] = shangShen(keShang[0]);
  keShang[3] = shangShen(keShang[2]);
  const keXia = [jiGong, keShang[0], zhiIdx, keShang[2]]; // 第一课的下神以日干论
  // 各课「下」之五行：第一课取日干五行，其余取支五行
  const xiaWX = [GAN_WX[ganIdx], ZHI_WX[keXia[1]], ZHI_WX[keXia[2]], ZHI_WX[keXia[3]]];
  const shangWX = keShang.map((z) => ZHI_WX[z]);

  // --- 十二天将 ---
  const isDay = timeIdx >= 3 && timeIdx <= 8; // 卯辰巳午未申为昼
  const guiZhi = GUI_REN[ganIdx][isDay ? 0 : 1];
  const guiLin = linDi(guiZhi); // 贵人临地盘位 = (贵 − 将 + 时) mod 12
  // 贵人临地盘亥子丑寅卯辰顺布，临巳午未申酉戌逆布
  const shun = [11, 0, 1, 2, 3, 4].includes(guiLin);
  const jiangOf = (z: number) =>
    shun ? TIAN_JIANG[(z - guiZhi + 12) % 12] : TIAN_JIANG[(guiZhi - z + 12) % 12];

  // --- 九宗门发三传 ---
  const distinctKe = new Set(keXia.map((x, i) => `${x}/${keShang[i]}`)).size;
  const dedupe = (arr: number[]) => [...new Set(arr)];

  /** 涉害简化法：从所临地盘位顺行回本家，计沿途（含本家）受地盘支所克之数，
   *  深者取之；等深取临四孟者；俱孟或俱不孟则阳日取干上神、阴日取支上神。
   *  （古法是按孟仲季分段取机，此处简化为全程逐位计克。） */
  const sheHai = (cands: number[]): number => {
    const depth = (z: number) => {
      const start = linDi(z);
      let n = 0;
      for (let p = start; ; p = (p + 1) % 12) {
        if (KE[ZHI_WX[p]] === ZHI_WX[z]) n += 1; // 地盘支克候选上神
        if (p === z) break; // 回到本家为止（含本家）
      }
      return n;
    };
    const depths = cands.map((z) => depth(z));
    const max = Math.max(...depths);
    let pool = cands.filter((_, i) => depths[i] === max);
    if (pool.length > 1) {
      const meng = pool.filter((z) => SI_MENG.includes(linDi(z)));
      if (meng.length > 0 && meng.length < pool.length) pool = meng;
    }
    if (pool.length === 1) return pool[0];
    return yangDay ? keShang[0] : keShang[2];
  };

  /** 贼克取初传：先下贼上（重审），无上克下（元首）；多克比用（知一），比用不定转涉害。 */
  const zeiKe = (): { chu: number; name: string } | null => {
    let cands: number[];
    let name: string;
    const zei = keShang.filter((_, i) => KE[xiaWX[i]] === shangWX[i]); // 下贼上
    if (zei.length > 0) {
      cands = dedupe(zei);
      name = "重审";
    } else {
      const ke = keShang.filter((_, i) => KE[shangWX[i]] === xiaWX[i]); // 上克下
      if (ke.length === 0) return null;
      cands = dedupe(ke);
      name = "元首";
    }
    if (cands.length === 1) return { chu: cands[0], name };
    // 比用：取上神支阴阳与日干相同者
    const bi = cands.filter((z) => isYangZhi(z) === yangDay);
    if (bi.length === 1) return { chu: bi[0], name: "知一" };
    // 比用不定 → 涉害（简化：比用余下多位则以余者计，否则以全部候选计）
    return { chu: sheHai(bi.length > 1 ? bi : cands), name: "涉害" };
  };

  /** 遥克：四课无上下之克时，先查上神克日干（蒿矢），再查日干克上神（弹射）。 */
  const yaoKe = (): { chu: number; name: string } | null => {
    for (const [list, name] of [
      [keShang.filter((z) => KE[ZHI_WX[z]] === GAN_WX[ganIdx]), "蒿矢"],
      [keShang.filter((z) => KE[GAN_WX[ganIdx]] === ZHI_WX[z]), "弹射"],
    ] as [number[], string][]) {
      const cands = dedupe(list);
      if (cands.length === 0) continue;
      if (cands.length === 1) return { chu: cands[0], name };
      const bi = cands.filter((z) => isYangZhi(z) === yangDay);
      if (bi.length === 1) return { chu: bi[0], name };
      return { chu: sheHai(bi.length > 1 ? bi : cands), name }; // 比用不定转涉害简化法
    }
    return null;
  };

  let chu: number;
  let zhong: number;
  let mo: number;
  let keMing: string;

  if (jiangIdx === timeIdx) {
    // 伏吟：天盘全同地盘
    keMing = "伏吟";
    const zk = zeiKe();
    chu = zk ? zk.chu : yangDay ? keShang[0] : keShang[2]; // 无克：阳日取干上神、阴日取支上神
    // 中传=初传之刑，末传=中传之刑。
    // 简化约定：初传自刑时中传改取支上神；中传再自刑时末传改取中传之冲。
    zhong = XING[chu];
    if (zhong === chu) zhong = keShang[2];
    mo = XING[zhong];
    if (mo === zhong) mo = chong(zhong);
  } else if ((jiangIdx - timeIdx + 12) % 12 === 6) {
    // 返吟：月将冲占时
    keMing = "返吟";
    const zk = zeiKe();
    if (zk) {
      chu = zk.chu;
      zhong = shangShen(chu);
      mo = shangShen(zhong);
    } else {
      chu = YI_MA[zhiIdx]; // 无克取驿马为初传
      zhong = keShang[2]; // 中传=支上神
      mo = keShang[0]; // 末传=干上神
    }
  } else if (jiGong === zhiIdx) {
    // 八专日：干寄宫即日支，只有两课
    keMing = "八专";
    const zk = zeiKe();
    if (zk) {
      chu = zk.chu;
      zhong = shangShen(chu);
      mo = shangShen(zhong);
    } else {
      // 无克：阳日从干上神顺数三辰（干上为第1），阴日逆数三辰；中末传俱取干上神
      chu = (keShang[0] + (yangDay ? 2 : 10)) % 12;
      zhong = mo = keShang[0];
    }
  } else {
    const zk = zeiKe();
    if (zk) {
      chu = zk.chu;
      keMing = zk.name;
      zhong = shangShen(chu);
      mo = shangShen(zhong);
    } else {
      const yk = yaoKe();
      if (yk) {
        chu = yk.chu;
        keMing = yk.name;
        zhong = shangShen(chu);
        mo = shangShen(zhong);
      } else if (distinctKe === 4) {
        // 昴星：四课全、无克无遥
        if (yangDay) {
          keMing = "虎视";
          chu = shangShen(9); // 地盘酉上之天盘神
          zhong = keShang[2];
          mo = keShang[0];
        } else {
          keMing = "冬蛇掩目";
          chu = linDi(9); // 天盘酉所临之地盘支
          zhong = keShang[0];
          mo = keShang[2];
        }
      } else if (distinctKe === 3) {
        // 别责：四课只有三课、无克无遥
        keMing = "别责";
        chu = yangDay ? shangShen(HE_GONG[ganIdx]) : sanHePrev(zhiIdx);
        zhong = mo = keShang[0]; // 中末传俱取干上神
      } else {
        // 理论上两课必为八专（已在前判定），此处兜底按八专无克处理
        keMing = "八专";
        chu = (keShang[0] + (yangDay ? 2 : 10)) % 12;
        zhong = mo = keShang[0];
      }
    }
  }

  return {
    keMing,
    tianPanIdx,
    keShang,
    keXia,
    sanChuanZhi: [chu, zhong, mo],
    tianJiangMap: ZHI.map((_, z) => jiangOf(z)),
    guiZhi,
    guiLin,
    isDay,
  };
}

// ---------------------------------------------------------------------------
// 按占时起课（历法解析 + 遁干旬空 + 文本生成）
// ---------------------------------------------------------------------------

/**
 * 大六壬起课。
 * @param now 占时（公历）
 * @param dayGanZhi 日干支（如 "庚寅"），缺省按占时当日取
 * @param baoShu 善信所报之数（可选）。同一时辰再问时以报数取活时：(n-1)%12 为占时支，日干支与月将不变
 */
export function buildDaLiuRen(now: Date, dayGanZhi?: string, baoShu?: number): { text: string; chart: DaLiuRenChart } {
  const solar = Solar.fromYmdHms(
    now.getFullYear(),
    now.getMonth() + 1,
    now.getDate(),
    now.getHours(),
    now.getMinutes(),
    0
  );
  const lunar = solar.getLunar();
  const ec = lunar.getEightChar();

  const gz = dayGanZhi ?? ec.getDay();
  const ganIdx = GAN.indexOf(gz.charAt(0));
  const zhiIdx = ZHI.indexOf(gz.charAt(1));
  // 活时：报数 1-12 对应 子-亥
  const timeIdx = baoShu !== undefined ? (((baoShu - 1) % 12) + 12) % 12 : ZHI.indexOf(lunar.getTimeZhi());

  // --- 月将：以中气换将（getPrevQi(false) 按精确交节时刻回溯最近的中气） ---
  const zhongQi = lunar.getPrevQi(false).getName();
  const jiangIdx = ZHONGQI_JIANG[zhongQi];
  if (jiangIdx === undefined) throw new Error(`未能由中气「${zhongQi}」定月将`);

  const core = computeDaLiuRenCore(ganIdx, zhiIdx, timeIdx, jiangIdx);
  const { keMing, keShang, isDay } = core;
  const tianPan = core.tianPanIdx.map((z) => ZHI[z]);
  const jiangOf = (z: number) => core.tianJiangMap[z];

  // --- 遁干与旬空：以日干支所在旬推，offset≥10 者旬空 ---
  let J = 0;
  for (let j = 0; j < 60; j++) {
    if (j % 10 === ganIdx && j % 12 === zhiIdx) {
      J = j;
      break;
    }
  }
  const J0 = J - (J % 10); // 旬首六十甲子序
  const xunShouZhi = J0 % 12;
  const dunGan = (z: number): string | null => {
    const offset = (z - xunShouZhi + 12) % 12;
    return offset < 10 ? GAN[offset] : null;
  };
  const xunKongStr = ec.getDayXunKong(); // 如 "午未"
  const xunKong = [xunKongStr.charAt(0), xunKongStr.charAt(1)];

  const makeChuan = (z: number): DaLiuRenChuan => {
    const dg = dunGan(z);
    return {
      zhi: ZHI[z],
      shenName: JIANG_NAME[z],
      dunGan: dg ?? "空",
      tianJiang: jiangOf(z),
      kong: dg === null,
    };
  };
  const sanChuan = core.sanChuanZhi.map(makeChuan);

  const siKe: DaLiuRenKe[] = keShang.map((shang, i) => ({
    shangZhi: ZHI[shang],
    shangJiang: jiangOf(shang),
    xiaLabel: i === 0 ? gz.charAt(0) : ZHI[core.keXia[i]],
    xiaIsDayGan: i === 0,
  }));

  const hh = String(now.getHours()).padStart(2, "0");
  const mi = String(now.getMinutes()).padStart(2, "0");
  const timeText = `${solar.toYmd()} ${hh}:${mi}｜${gz}日 ${ZHI[timeIdx]}时`;

  // --- 注入提示词的文本 ---
  const lines: string[] = [];
  lines.push(
    baoShu !== undefined
      ? `【大六壬课】（同一时辰再问，以善信报数 ${baoShu} 取活时起课，月将加时顺布天盘）`
      : `【大六壬课】（以问事之时起课，月将加时顺布天盘）`
  );
  lines.push(
    `占时：公历 ${solar.toYmd()} ${hh}:${mi}｜日干支 ${gz}（${ec.getDayXun()}旬，旬空：${xunKong.join("")}）｜时支 ${ZHI[timeIdx]}（${isDay ? "昼" : "夜"}占${baoShu !== undefined ? "，活时" : ""}）`
  );
  lines.push(`月将：${ZHI[jiangIdx]}·${JIANG_NAME[jiangIdx]}（${zhongQi}后所用之将，加于占时${ZHI[timeIdx]}上）`);
  lines.push(`天盘（地盘→天盘）：${ZHI.map((d, p) => `${d}→${tianPan[p]}`).join("　")}`);
  lines.push(`四课：`);
  const keName = ["一", "二", "三", "四"];
  siKe.forEach((k, i) => {
    const xia = k.xiaIsDayGan
      ? `日干${k.xiaLabel}（寄宫${ZHI[JI_GONG[ganIdx]]}）`
      : `${k.xiaLabel}${i === 2 ? "（日支）" : ""}`;
    lines.push(`　第${keName[i]}课：上神 ${k.shangZhi}·${JIANG_NAME[ZHI.indexOf(k.shangZhi)]}（乘${k.shangJiang}）／下神 ${xia}`);
  });
  const chuanName = ["初传（起因）", "中传（过程）", "末传（结果）"];
  lines.push(
    `三传：${sanChuan.map((c, i) => `${chuanName[i]} ${c.dunGan}${c.zhi}·${c.shenName}（乘${c.tianJiang}）${c.kong ? "【旬空】" : ""}`).join("　→　")}`
  );
  lines.push(`课名：${keMing}课`);

  const chart: DaLiuRenChart = {
    keMing,
    dayGanZhi: gz,
    xun: ec.getDayXun(),
    xunKong,
    timeZhi: ZHI[timeIdx],
    dayNight: isDay ? "昼" : "夜",
    yueJiangZhi: ZHI[jiangIdx],
    yueJiangName: JIANG_NAME[jiangIdx],
    zhongQi,
    tianPan,
    siKe,
    sanChuan,
    timeText,
  };
  return { text: lines.join("\n"), chart };
}
