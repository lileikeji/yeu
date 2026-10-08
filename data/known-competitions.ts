/**
 * 已知学科与技能竞赛表：赛事名 → 它在国家级/省级各算什么类别。
 *
 * 依据《仰恩大学2021年A、B类学科与技能竞赛项目一览表》与 2025 版综合测评办法的
 * 类别定义：
 *   A类 = 教育部国家级竞赛、全国职业院校技能大赛、省厅认定重大赛事
 *   B类 = A类省赛选拔、全国性行业协会学会赛事、福建省级赛事
 *   C类 = A/B 以外的学科技能竞赛
 *
 * 为什么必须按赛事名建表：同一项赛事在国家级和省级算不同类别（一览表里几乎都写
 * 「国家级/省级，A、B类」）。只按用户说的「国一/省二」推类别会推错，只按赛事名也
 * 不对——两者要一起看。这里存每个赛事在两级上的类别，再由调用方结合用户说的级别
 * 选择。
 *
 * 表里没有的赛事交给 AI 判定（server/modules/assistant/competition-classifier.ts），
 * 判定结果同样缓存。
 */

export type CompetitionCategory = 'academic' | 'culture' | 'sports' | 'research'
export type CompetitionClass = 'A类' | 'B类' | 'C类'

export interface KnownCompetition {
  /** 赛事正式名（用于展示） */
  name: string
  /** 用户可能写的简称/别名；匹配时用「包含」判定，短别名要够特征化 */
  aliases: string[]
  category: CompetitionCategory
  /** 国家级（全国赛/国赛）算哪一类 */
  nationalClass?: CompetitionClass
  /** 省级（省赛/省厅主办）算哪一类 */
  provincialClass?: ClassBOrC
  /** 主办方说明，出现在答案里便于用户核对 */
  host?: string
}

type ClassBOrC = 'B类' | 'C类'

export const knownCompetitions: KnownCompetition[] = [
  // ── 一览表明确列出的 A、B 类赛事（国家级 A类 / 省级 B类）──────────────
  {
    name: '中国“互联网+”大学生创新创业大赛',
    aliases: ['互联网+', '互联网＋', '互联网加大赛', '互联网+大学生创新创业'],
    category: 'academic', nationalClass: 'A类', provincialClass: 'B类', host: '教育部主办'
  },
  {
    // 裸说「挑战杯」时两个赛事都可能是本意，两者国家级都是 A类、省级都是 B类，
    // 所以单独给一条泛化条目承接裸名，避免落到关键词表的最低档（校级 1 分）。
    name: '“挑战杯”系列竞赛（课外学术科技作品竞赛 / 创业计划竞赛）',
    aliases: ['挑战杯'],
    category: 'academic', nationalClass: 'A类', provincialClass: 'B类', host: '共青团中央、中国科协、教育部、全国学联'
  },
  {
    name: '“挑战杯”全国大学生课外学术科技作品竞赛',
    aliases: ['挑战杯课外学术', '课外学术科技作品竞赛'],
    category: 'academic', nationalClass: 'A类', provincialClass: 'B类', host: '共青团中央、中国科协、教育部、全国学联'
  },
  {
    name: '“挑战杯”中国大学生创业计划竞赛',
    aliases: ['挑战杯创业计划', '创青春'],
    category: 'academic', nationalClass: 'A类', provincialClass: 'B类', host: '共青团中央、中国科协、教育部、全国学联'
  },
  {
    name: 'ACM-ICPC国际大学生程序设计竞赛',
    aliases: ['ACM-ICPC', 'ACM', 'ICPC'],
    category: 'academic', nationalClass: 'A类', provincialClass: 'B类', host: '国际计算机协会（ACM）'
  },
  {
    name: '全国大学生电子设计竞赛',
    aliases: ['电子设计竞赛', '电子设计'],
    category: 'academic', nationalClass: 'A类', provincialClass: 'B类', host: '教育部高教司、信息产业部'
  },
  {
    name: '全国大学生工程训练综合能力竞赛',
    aliases: ['工程训练综合能力竞赛', '工程训练'],
    category: 'academic', nationalClass: 'A类', provincialClass: 'B类'
  },
  {
    name: '全国大学生广告艺术大赛',
    aliases: ['广告艺术大赛', '大广赛'],
    category: 'academic', nationalClass: 'A类', provincialClass: 'B类'
  },
  {
    name: '全国大学生化学实验竞赛',
    aliases: ['化学实验竞赛'],
    category: 'academic', nationalClass: 'A类', provincialClass: 'B类'
  },
  {
    name: '全国大学生机械创新设计大赛',
    aliases: ['机械创新设计大赛', '机械创新'],
    category: 'academic', nationalClass: 'A类', provincialClass: 'B类'
  },
  {
    name: '全国大学生结构设计竞赛',
    aliases: ['结构设计竞赛'],
    category: 'academic', nationalClass: 'A类', provincialClass: 'B类'
  },
  // ── 教育部/省厅体系的常见赛事 ────────────────────────────────────────
  {
    name: '全国大学生数学建模竞赛',
    aliases: ['数学建模竞赛', '数学建模', '数模竞赛'],
    category: 'academic', nationalClass: 'A类', provincialClass: 'B类', host: '教育部高教司、中国工业与应用数学学会'
  },
  {
    name: '全国职业院校技能大赛',
    aliases: ['职业院校技能大赛', '省职业院校技能大赛'],
    // 办法把「全国职业院校技能大赛」直接写进 A类定义
    category: 'academic', nationalClass: 'A类', provincialClass: 'B类', host: '教育部'
  },
  {
    name: '全国大学生统计建模大赛',
    aliases: ['统计建模大赛', '统计建模'],
    category: 'academic', nationalClass: 'B类', provincialClass: 'B类', host: '中国统计教育学会'
  },
  {
    name: '全国大学生英语竞赛（NECCS）',
    aliases: ['全国大学生英语竞赛', '英语竞赛'],
    category: 'academic', nationalClass: 'B类', provincialClass: 'B类', host: '高等学校大学外语教学研究会'
  },
  {
    name: '蓝桥杯全国软件和信息技术专业人才大赛',
    aliases: ['蓝桥杯'],
    // 工信部人才交流中心 + 行业协会 → 办法里的「全国性行业协会学会赛事」= B类
    category: 'academic', nationalClass: 'B类', provincialClass: 'B类', host: '工信部人才交流中心'
  },
  {
    name: '全国大学生数学竞赛',
    aliases: ['大学生数学竞赛'],
    category: 'academic', nationalClass: 'B类', provincialClass: 'B类', host: '中国数学会'
  }
]
