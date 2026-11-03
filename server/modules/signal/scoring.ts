/**
 * 双评分入选。
 *
 * 两科独立打分，都过线才算数：
 * - A 科（相关度）：这条东西跟新生有没有关系。全是教职工、科研、招标的，分数自然低。
 * - B 科（证据强度）：这条东西新不新、是不是官方发的、有没有具体日期金额电话附件。
 *
 * 为什么要两科：单看相关度，「宿舍」两个字能把食堂菜单抬上去；
 * 单看证据强度，一篇措辞工整的旧公告也能混进来。两科一起卡，噪音漏不进来，
 * 也不会把短小但关键的官方通知错杀。
 */
import { SIGNAL_TIER_GAP, signalTierThreshold } from './tiers'
import type { SignalTier } from './tiers'

export interface SignalScoreInput {
  title: string
  summary?: string
  body?: string
  publishedAt?: number | null
  itemKind: 'notice' | 'document'
  tier: SignalTier
  isOfficial: boolean
  hasAttachment?: boolean
}

export interface SignalScoreDetail {
  score: number
  hits: string[]
}

export interface SignalDecision extends SignalScoreDetail {
  scoreA: number
  scoreB: number
  threshold: number
  passed: boolean
  reasons: string[]
}

interface KeywordGroup {
  key: string
  weight: number
  words: string[]
}

const DAY_MS = 24 * 60 * 60 * 1000

/** 命中即加分：这些词背后是新生真的会去办的事。 */
const RELEVANCE_GROUPS: KeywordGroup[] = [
  { key: '新生入学', weight: 10, words: ['新生', '迎新', '报到', '入学', '录取', '招生', '开学'] },
  { key: '缴费资助', weight: 8, words: ['学费', '住宿费', '缴费', '缴费', '收费', '绿色通道', '助学贷款'] },
  { key: '奖助学金', weight: 8, words: ['奖学金', '助学金', '资助', '勤工助学', '困难认定', '补助'] },
  { key: '住宿', weight: 7, words: ['宿舍', '寝室', '床位', '住宿', '公寓', '查寝'] },
  { key: '教学教务', weight: 6, words: ['选课', '课表', '教务', '学分', '考试', '补考', '重修', '转专业', '辅修', '培养方案', '学籍'] },
  { key: '军训体检', weight: 6, words: ['军训', '体检', '医保', '疫苗', '接种', '保险'] },
  { key: '校园卡生活', weight: 5, words: ['校园卡', '一卡通', '饭卡', '热水', '水电', '快递', '食堂', '超市', '校车', '叮叮车'] },
  { key: '安全应急', weight: 5, words: ['防诈', '诈骗', '消防', '应急', '停水', '停电', '返校', '门禁', '安全'] },
  { key: '档案证照', weight: 5, words: ['档案', '户口', '迁移', '证明', '证件', '学号'] },
  { key: '校历假期', weight: 4, words: ['校历', '放假', '假期', '寒假', '暑假', '调休', '考试周'] },
  { key: '办事流程', weight: 3, words: ['申请', '报名', '截止', '流程', '指南', '办理', '预约'] },
  { key: '就业实习', weight: 2, words: ['实习', '就业', '招聘', '双选会', '宣讲'] }
]

/** 命中即减分：面向教职工和行政的公文，对新生是噪音。 */
const NOISE_GROUPS: KeywordGroup[] = [
  { key: '教职工', weight: 16, words: ['教职工', '专任教师', '辅导员', '人才引进'] },
  { key: '科研申报', weight: 16, words: ['课题', '科研', '基金', '项目申报', '申报指南', '教改', '论文'] },
  { key: '行政公文', weight: 12, words: ['招标', '采购', '询价', '中标', '基建', '维修工程', '干部', '任免'] },
  { key: '会议活动', weight: 10, words: ['座谈会', '论坛', '研讨会', '讲座', '报告会', '党建', '党委'] },
  { key: '校园动态', weight: 10, words: ['党支部', '党课', '主题党日', '团日活动', '实践队', '三下乡', '社会实践', '表彰', '运动会', '校运会', '合唱', '文艺汇演', '风采', '佳绩', '纷呈', '纪实', '掠影', '专访', '推优', '入党', '荣获', '获奖', '三等奖', '榜样'] },
  { key: '升学考试', weight: 8, words: ['考研', '保研', '专升本考试'] },
  { key: '会议报道', weight: 8, words: ['召开', '举办', '圆满', '落幕', '专题会议'] },
  // 招生类公告是给考生看的，在校生不需要：志愿、批次、计划都算噪音。
  { key: '招生录取', weight: 12, words: ['征求志愿', '招生计划', '招生简章', '投档线', '批次线', '招生宣传', '录取批次', '生源'] },
  { key: '校友捐赠', weight: 12, words: ['校友', '捐赠', '基金会', '理事会'] },
  // 表格、模板、流程图是办事材料，不是「最近在发」的消息。
  { key: '表格附件', weight: 14, words: ['申请表', '确认表', '承诺书', '申请书', '登记表', '审批表', '交底书', '模板', '流程图', '表格', '填写说明', '样表'] },
  { key: '研究生', weight: 6, words: ['研究生', '硕士', '博士', '学位点'] }
]

const NOISE_PENALTY_CAP = 40
const RELEVANCE_BODY_BONUS_CAP = 10

const DATE_RE = /\d{4}\s*[-/年]\s*\d{1,2}\s*[-/月]\s*\d{1,2}|\d{1,2}\s*月\s*\d{1,2}\s*日/
const MONEY_RE = /[¥￥]\s*\d|\d+\s*(?:元|块)/
const DEADLINE_RE = /截止|截至|之前完成|逾期/
const PHONE_RE = /\b0\d{2,3}-\d{7,8}\b|\b1[3-9]\d{9}\b/

function normalize(text: string): string {
  return text.normalize('NFKC').toLowerCase().replace(/\s+/g, ' ')
}

function scoreText(input: SignalScoreInput): string {
  return normalize(`${input.title} ${input.summary ?? ''} ${(input.body ?? '').slice(0, 4000)}`)
}

function recencyPoints(publishedAt: number | null | undefined, now: number): number {
  if (!publishedAt) return 6
  const days = (now - publishedAt) / DAY_MS
  if (days <= 1) return 38
  if (days <= 3) return 34
  if (days <= 7) return 30
  if (days <= 14) return 24
  if (days <= 30) return 18
  if (days <= 90) return 10
  if (days <= 180) return 4
  return 0
}

function clamp(value: number): number {
  return Math.max(0, Math.min(100, Math.round(value * 10) / 10))
}

/**
 * A 科：跟新生有没有关系。
 *
 * 以标题为主：一篇通知的标题基本就说清了它想让人干什么。
 * 正文只按四分之一权重补一点分，并且最多补 10 分，
 * 否则任何一篇长文都能把「新生」「缴费」「档案」凑齐，分数被字数抬上去。
 */
export function scoreFreshmanRelevance(input: SignalScoreInput): SignalScoreDetail {
  const title = normalize(input.title)
  const body = normalize(`${input.summary ?? ''} ${input.body ?? ''}`)
  const hits: string[] = []
  let score = 48
  let bodyBonus = 0

  for (const group of RELEVANCE_GROUPS) {
    if (group.words.some(word => title.includes(word))) {
      score += group.weight
      hits.push(group.key)
      continue
    }
    if (bodyBonus < RELEVANCE_BODY_BONUS_CAP && group.words.some(word => body.includes(word))) {
      bodyBonus += group.weight / 4
    }
  }
  score += Math.min(bodyBonus, RELEVANCE_BODY_BONUS_CAP)
  // 标题没命中新生关键词，只要不是噪音词，也按「校内通知」对待：
  // 教务处/学生处发的东西本来就该看；噪音由 NOISE_GROUPS 扣，不在这里重复罚。

  let penalty = 0
  for (const group of NOISE_GROUPS) {
    if (group.words.some(word => title.includes(word))) {
      penalty += group.weight
      hits.push(`-${group.key}`)
    }
  }
  score -= Math.min(penalty, NOISE_PENALTY_CAP)
  return { score: clamp(score), hits }
}

/** B 科：这条信息本身够不够硬。 */
export function scoreEvidenceStrength(input: SignalScoreInput, now = Date.now()): SignalScoreDetail {
  const text = scoreText(input)
  const hits: string[] = []
  let score = 18

  score += recencyPoints(input.publishedAt, now)
  if (input.isOfficial) {
    score += 14
    hits.push('官方发布')
  } else if (input.tier === 'B') {
    score += 6
  }

  if (DATE_RE.test(text)) {
    score += 6
    hits.push('含日期')
  }
  if (DEADLINE_RE.test(text)) {
    score += 4
    hits.push('含截止')
  }
  if (MONEY_RE.test(text)) {
    score += 4
    hits.push('含金额')
  }
  if (PHONE_RE.test(text)) {
    score += 3
    hits.push('含电话')
  }
  if (input.hasAttachment) {
    score += 7
    hits.push('带附件')
  }

  const length = (input.body ?? '').length
  if (length >= 400) score += 5
  if (length >= 1200) score += 5

  return { score: clamp(score), hits }
}

/** 两科的合议结果。 */
export function decideSignalScore(input: SignalScoreInput, now = Date.now()): SignalDecision {
  const relevance = scoreFreshmanRelevance(input)
  const evidence = scoreEvidenceStrength(input, now)
  const threshold = signalTierThreshold(input.tier)
  const score = Math.round((relevance.score + evidence.score) / 2 * 10) / 10
  // 标题本身就是通知/公告的，相关度这条线放宽：教务处发的东西未必命中新生关键词，
  // 但它确实是要办的事；文件类、制度类没有这层豁免，照样卡住。
  const announcement = /通知|公告|公示|名单|安排|须知|报名|申请|办理|提醒|预告/.test(input.title)
  const floor = threshold - SIGNAL_TIER_GAP - (announcement ? 12 : 0)
  const reasons: string[] = []

  if (relevance.score < floor) reasons.push('与新生关系偏弱')
  if (evidence.score < floor) reasons.push('证据强度不足')
  if (score < threshold) reasons.push('总分未达线')

  // 旧通知也是通知：文件类、动态类靠总分挡，标题明确是通知/公告且有真实发布时间的，
  // 只要跟新生挂得上（相关度达线）就收进来，热度只用于排序，不用于准入。
  const archiveAdmitted = announcement && input.publishedAt > 0 && relevance.score >= floor + 12

  return {
    score,
    hits: [...relevance.hits.filter(hit => !hit.startsWith('-')), ...evidence.hits],
    scoreA: relevance.score,
    scoreB: evidence.score,
    threshold,
    passed: (score >= threshold && relevance.score >= floor && evidence.score >= floor) || archiveAdmitted,
    reasons
  }
}

interface CategoryRule {
  category: string
  words: string[]
}

// 顺序即优先级：越具体的类目越靠前，「新生宿舍分配」应该归住宿而不是报到。
const CATEGORY_RULES: CategoryRule[] = [
  { category: '住宿', words: ['宿舍', '寝室', '床位', '公寓', '查寝'] },
  { category: '缴费', words: ['学费', '住宿费', '缴费', '收费', '绿色通道', '贷款'] },
  { category: '奖助', words: ['奖学金', '助学金', '资助', '困难认定', '勤工助学'] },
  { category: '报到', words: ['迎新', '新生', '报到', '入学', '录取'] },
  { category: '教学', words: ['选课', '课表', '教务', '学分', '考试', '转专业', '辅修', '学籍'] },
  { category: '军训体检', words: ['军训', '体检', '医保', '疫苗', '保险'] },
  { category: '学习', words: ['图书馆', '自习', '借阅', '数据库'] },
  { category: '生活', words: ['食堂', '快递', '超市', '校车', '叮叮车', '校园卡', '热水'] },
  { category: '安全', words: ['防诈', '诈骗', '消防', '应急', '停水', '停电', '门禁'] },
  { category: '就业', words: ['实习', '就业', '招聘', '双选会', '宣讲'] }
]

const ANNOUNCEMENT_RE = /通知|公告|公示|名单|安排|须知|日程|报名|申请|办理|提醒|预告|调整|来袭|招募|征集|选拔|评审|答辩|讲座|活动|比赛|竞赛|培训|考试|选课|补考|缴费|报到|注册|领取|开放|预约|停水|停电|搬迁|放假|开学|登记|认定|选聘|招聘|宣讲|公示|征求意见/
const FILENAME_RE = /^[\w\-.()（）\s]+\.(?:docx?|pdf|xlsx?|pptx?|zip|rar|7z)$/i
const HASH_NAME_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
const CJK_RE = /[一-鿿]/
const FORM_TITLE_RE = /申请表|报名表|汇总表|明细表|一览表|确认表|登记表|审批表|评估表|交底书|承诺书|委托书|模板|流程图|表格|样表|填写说明/
/**
 * 抓来的正文页里混着一堆制度文本与目录页：办法、法条、指南、清单、条文摘录。
 * 它们永远是「新抓的」，但不是新消息，标题层面直接挡掉。
 */
const JUNK_TITLE_RE = /办法$|法$|实施细则|条例$|暂行规定|章程$|指南$|手册$|流程表|清单$|简表|评分表|评分标准|申报表|第一条|版权登记|官方资料|官方附件|学校简介|学院简介|专业介绍|课程表$|作息时间表|申报书|申请书|论证报告|预期成果|统计表|推荐表|座位|安排表|目录$|期刊|八项规定|^附件|^\d+[.、]|^[A-Za-z(（]/

/**
 * 抓来的文档不都是「新消息」：学院简介、专业目录、师资名单一躺就是几年。
 * 只放行标题或开头像通知的那一批，免得常青页面把热度榜占满。
 */
export function looksLikeAnnouncement(title: string, body = ''): boolean {
  if (ANNOUNCEMENT_RE.test(title)) return true
  return ANNOUNCEMENT_RE.test(body.slice(0, 300))
}

/** 标题得像句话：文件名、纯哈希、两个字的分栏名都不要。 */
export function isUsableSignalTitle(title: string): boolean {
  const trimmed = title.trim()
  if (trimmed.length < 8) return false
  if (HASH_NAME_RE.test(trimmed.replace(/\.[a-z0-9]+$/i, ''))) return false
  // 表格类材料（申请表、评估表、模板、流程图）不是消息，除非标题本身是通知/公告/公示。
  // 这里只看这三个词：ANNOUNCEMENT_RE 里的「申请」本身就把大量表格放行了。
  if (FORM_TITLE_RE.test(trimmed) && !/通知|公告|公示/.test(trimmed)) return false
  if (JUNK_TITLE_RE.test(trimmed) && !/通知|公告|公示|名单/.test(trimmed)) return false
  // 标题里带逗号句号的，基本是从正文里截出来的一段话，不是标题。
  if (/[，。]/.test(trimmed)) return false
  if (FILENAME_RE.test(trimmed)) {
    const base = trimmed.replace(/\.[a-z0-9]+$/i, '')
    if (!CJK_RE.test(base) || base.length < 12) return false
  }
  return true
}

export function signalCategoryFor(title: string): string {
  const text = normalize(title)
  for (const rule of CATEGORY_RULES) {
    if (rule.words.some(word => text.includes(word))) return rule.category
  }
  return '综合'
}
