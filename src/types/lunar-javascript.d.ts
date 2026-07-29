declare module "lunar-javascript" {
  export interface Solar {
    toYmd(): string;
    toYmdHms(): string;
  }

  export interface JieQi {
    getName(): string;
    getSolar(): Solar;
  }

  export interface EightChar {
    getYear(): string;
    getMonth(): string;
    getDay(): string;
    getTime(): string;
    getYearGan(): string;
    getMonthGan(): string;
    getDayGan(): string;
    getTimeGan(): string;
    getYearNaYin(): string;
    getMonthNaYin(): string;
    getDayNaYin(): string;
    getTimeNaYin(): string;
    getYearWuXing(): string;
    getMonthWuXing(): string;
    getDayWuXing(): string;
    getTimeWuXing(): string;
    getYearShiShenGan(): string;
    getMonthShiShenGan(): string;
    getDayShiShenGan(): string;
    getTimeShiShenGan(): string;
    getDayXun(): string;
    getDayXunKong(): string;
    getYearShiShenZhi(): string[];
    getMonthShiShenZhi(): string[];
    getDayShiShenZhi(): string[];
    getTimeShiShenZhi(): string[];
  }

  export interface Lunar {
    getYearInChinese(): string;
    getMonthInChinese(): string;
    getDayInChinese(): string;
    getYearShengXiao(): string;
    getYearZhi(): string;
    getTimeZhi(): string;
    getMonth(): number;
    getDay(): number;
    getEightChar(): EightChar;
    getPrevJieQi(): JieQi;
    /** 前一个中气（wholeDay=false 按精确交节时刻比较） */
    getPrevQi(wholeDay: boolean): JieQi;
  }

  export const Solar: {
    fromYmdHms(y: number, m: number, d: number, h: number, i: number, s: number): Solar & {
      getLunar(): Lunar;
    };
  };

  export const Lunar: unknown;
}
