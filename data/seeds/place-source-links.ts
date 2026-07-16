export interface PlaceSourceLinkSeed {
  sourceUrl: string
  placeNames: readonly string[]
  claimScope: string
  verifiedAt: string
}

const campusPlanMatchedPlaces = [
  '泽钏教学楼',
  '网络信息中心',
  '南洋楼',
  '长春楼',
  '长安楼',
  '宏船楼',
  '共和教学楼',
  '吉龙教学楼',
  '仰光楼',
  '新区行政楼',
  '旧区行政楼',
  '曼谷楼',
  '西苑餐厅',
  '校保卫处',
  '普照大礼堂',
  '祥贤楼',
  '和昌教学楼',
  '北苑餐厅',
  '东苑餐厅',
  '永康球场',
  '湖边舞池',
  '新区和昌教学楼',
  '仰恩教学楼',
  '普照教学楼',
  '图书馆'
] as const

export const placeSourceLinkSeeds = [
  {
    sourceUrl: 'https://www.yeu.edu.cn/xydt/list.htm',
    placeNames: campusPlanMatchedPlaces,
    claimScope: '官网校园平面图文字编号可确认地点名称或别名存在；不证明当前用途、开放状态、入口或坐标。',
    verifiedAt: '2026-07-14'
  },
  {
    sourceUrl: 'https://zwc.yeu.edu.cn/2026/0327/c498a55230/page.htm',
    placeNames: ['东苑餐厅', '西苑餐厅', '北苑餐厅'],
    claimScope: '2026 年食堂安全检查确认三座餐厅当前使用；不证明档口、营业时间、入口或坐标。',
    verifiedAt: '2026-07-15'
  },
  {
    sourceUrl: 'https://zwc.yeu.edu.cn/2026/0708/c496a57428/page.htm',
    placeNames: ['西苑餐厅', '北苑餐厅'],
    claimScope: '2026 年档口招租公告确认西苑餐厅位于第三教学区、北苑餐厅位于第一教学区。',
    verifiedAt: '2026-07-14'
  },
  {
    sourceUrl: 'https://www.yeu.edu.cn/2026/0114/c770a54471/page.htm',
    placeNames: ['东苑餐厅', '西苑餐厅'],
    claimScope: '2026 年校红十字会活动确认东苑餐厅位于第一教学区、西苑餐厅位于第三教学区。',
    verifiedAt: '2026-07-15'
  },
  {
    sourceUrl: 'https://xsb.yeu.edu.cn/2025/0512/c640a49290/page.htm',
    placeNames: ['创业园'],
    claimScope: '管理办法确认创业园 A/B 两区及其楼层关系；当前单一草稿点仍须拆分并现场核对。',
    verifiedAt: '2026-07-15'
  },
  {
    sourceUrl: 'https://cy.yeu.edu.cn/2026/0416/c539a55601/page.htm',
    placeNames: ['创业园'],
    claimScope: '2026 年第 22 批项目申报确认创业园体系仍在运作；申报已截止且不证明入口坐标。',
    verifiedAt: '2026-07-15'
  }
] as const satisfies readonly PlaceSourceLinkSeed[]

export const expectedPlaceSourceLinkCount = placeSourceLinkSeeds
  .reduce((total, seed) => total + seed.placeNames.length, 0)
