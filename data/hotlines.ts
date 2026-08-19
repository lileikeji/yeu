/**
 * 首页「校内求助与常用电话」的精选联系电话。
 *
 * 这些号码来自学校公开的部门联系方式（见 data/seeds/public-content.ts 的
 * 部门目录），挑选的是新生在报到与入学阶段最可能用到的校内求助入口。
 * 号码与用途标签统一在这里维护，模板只负责渲染。
 *
 * 注意：医务室直拨电话仍未公开核验，因此不写入本表；页面用一句
 * 「医务室全年 24 小时值班，入口可在校园地图搜索『医务所』」代替。
 */

export interface HomeHotline {
  id: string
  /** 卡片主标题，如「拨打校园 110」 */
  label: string
  /** 卡片右侧用途副文案，如「报修 / 求助」 */
  note: string
  /** 可拨打的电话号码（不含 tel: 前缀） */
  phone: string
  /** 图标名（lucide） */
  icon: string
  /** 该号码对应的部门来源说明（用于「信息来源」核对） */
  source: string
}

export const homeHotlines = [
  {
    id: 'campus-110',
    label: '拨打校园 110',
    note: '报修 / 求助',
    phone: '0595-22076110',
    icon: 'i-lucide-shield',
    source: '总务处（宿舍水电/家具报修）与保卫处共用号码'
  },
  {
    id: 'mental-health',
    label: '心理健康中心',
    note: '咨询 / 适应支持',
    phone: '0595-22099033',
    icon: 'i-lucide-heart-handshake',
    source: '心理健康教育与咨询中心公开电话'
  },
  {
    id: 'academic-affairs',
    label: '教务部',
    note: '学籍 / 课表',
    phone: '0595-22082006',
    icon: 'i-lucide-graduation-cap',
    source: '教务部公开电话'
  },
  {
    id: 'financial-aid',
    label: '学生资助中心',
    note: '贷款 / 助学金',
    phone: '0595-22099018',
    icon: 'i-lucide-hand-coins',
    source: '学生资助中心公开电话'
  }
] as const satisfies ReadonlyArray<HomeHotline>
