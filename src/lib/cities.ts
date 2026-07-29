/** 常用城市经度表（东经度数），用于真太阳时换算。 */
export const CITY_LONGITUDES: Record<string, number> = {
  北京: 116.4,
  天津: 117.2,
  上海: 121.5,
  重庆: 106.5,
  哈尔滨: 126.6,
  长春: 125.3,
  沈阳: 123.4,
  大连: 121.6,
  呼和浩特: 111.7,
  石家庄: 114.5,
  太原: 112.6,
  济南: 117.0,
  青岛: 120.4,
  郑州: 113.6,
  洛阳: 112.5,
  开封: 114.4,
  南京: 118.8,
  苏州: 120.6,
  无锡: 120.3,
  杭州: 120.2,
  宁波: 121.6,
  温州: 120.7,
  合肥: 117.3,
  福州: 119.3,
  厦门: 118.1,
  泉州: 118.6,
  南昌: 115.9,
  武汉: 114.3,
  长沙: 113.0,
  广州: 113.3,
  深圳: 114.1,
  佛山: 113.1,
  东莞: 113.8,
  南宁: 108.3,
  桂林: 110.3,
  海口: 110.3,
  三亚: 109.5,
  成都: 104.1,
  贵阳: 106.7,
  昆明: 102.7,
  拉萨: 91.1,
  西安: 108.9,
  兰州: 103.8,
  西宁: 101.8,
  银川: 106.2,
  乌鲁木齐: 87.6,
  香港: 114.2,
  澳门: 113.5,
  台北: 121.5,
};

/** 查城市经度；未收录时返回 null。 */
export function lookupLongitude(city: string): number | null {
  const key = city.trim().replace(/市$/, "");
  if (key in CITY_LONGITUDES) return CITY_LONGITUDES[key];
  // 允许「北京市海淀区」这类输入做前缀匹配
  for (const name of Object.keys(CITY_LONGITUDES)) {
    if (key.startsWith(name)) return CITY_LONGITUDES[name];
  }
  return null;
}
