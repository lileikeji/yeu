/**
 * Freshman local checklist catalog + pure helpers.
 * Progress is stored only on-device (localStorage); nothing is uploaded.
 */

export type ChecklistAudience = 'all' | 'undergraduate' | 'transfer'
export type ChecklistStageId = 'before-arrival' | 'arrival-day' | 'first-week' | 'daily' | 'packing'

export interface ChecklistItem {
  id: string
  stageId: ChecklistStageId
  title: string
  description: string
  /** Optional deep link into existing product surfaces */
  to?: string
  icon: string
  audience: Array<'undergraduate' | 'transfer'>
  /** Soft priority for default sort within a stage */
  priority: number
  /** When true, copy emphasizes "以学校通知为准" */
  awaitingNotice?: boolean
}

export interface ChecklistStage {
  id: ChecklistStageId
  label: string
  title: string
  description: string
  icon: string
  tone: string
}

export interface ChecklistProgressSnapshot {
  completedIds: string[]
  audience: ChecklistAudience
  updatedAt: string | null
}

export interface ChecklistStageProgress {
  stage: ChecklistStage
  items: ChecklistItem[]
  completedCount: number
  totalCount: number
  percent: number
}

export interface ChecklistOverview {
  completedCount: number
  totalCount: number
  percent: number
  remainingCount: number
  nextItem: ChecklistItem | null
  stageProgress: ChecklistStageProgress[]
  packing: ChecklistStageProgress
  tasks: ChecklistStageProgress[]
}

export const CHECKLIST_STORAGE_KEY = 'yeu-freshman-checklist-v1'

export const checklistStages: ChecklistStage[] = [
  {
    id: 'before-arrival',
    label: '到校前',
    title: '先把资料和路线确认好',
    description: '到校前把官方通知、材料和个人时段核对清楚，少靠群聊截图猜。',
    icon: 'i-lucide-calendar-check-2',
    tone: 'bg-green-50 text-green-700'
  },
  {
    id: 'arrival-day',
    label: '报到当天',
    title: '先定位，再按现场指引办理',
    description: '报到窗口、材料和个人时段以录取通知书及现场通知为准。',
    icon: 'i-lucide-map-pinned',
    tone: 'bg-blue-50 text-blue-700'
  },
  {
    id: 'first-week',
    label: '入学第一周',
    title: '把学习和生活入口补齐',
    description: '校园卡、网络、图书馆、安全电话和课程入口尽量第一周搞定。',
    icon: 'i-lucide-sparkles',
    tone: 'bg-violet-50 text-violet-700'
  },
  {
    id: 'daily',
    label: '日常',
    title: '把校园生活跑顺',
    description: '快递外卖、周边生活和社团招新可在报到后逐步了解。',
    icon: 'i-lucide-store',
    tone: 'bg-orange-50 text-orange-700'
  },
  {
    id: 'packing',
    label: '行李材料',
    title: '出发前再核对一遍',
    description: '材料以学校当年通知和录取通知书为准；下列为常见准备项，便于自查。',
    icon: 'i-lucide-package-open',
    tone: 'bg-amber-50 text-amber-700'
  }
]

const allFreshmen = ['undergraduate', 'transfer'] as const

export const checklistItems: ChecklistItem[] = [
  // —— 到校前 ——
  {
    id: 'save-admission-notice',
    stageId: 'before-arrival',
    title: '保存录取通知书与官方通知',
    description: '把录取通知书、学校官网/招生办最新通知截图或收藏，避免只依赖群聊转发。',
    to: '/procedures/arrival',
    icon: 'i-lucide-file-text',
    audience: [...allFreshmen],
    priority: 10
  },
  {
    id: 'confirm-report-date',
    stageId: 'before-arrival',
    title: '确认报到日期与个人时段',
    description: '2026 级注册报到日为 9 月 5–6 日；个人时段、窗口和点位仍以通知书与学校后续通知为准。',
    to: '/procedures/arrival',
    icon: 'i-lucide-calendar-days',
    audience: [...allFreshmen],
    priority: 20,
    awaitingNotice: true
  },
  {
    id: 'bookmark-map',
    stageId: 'before-arrival',
    title: '收藏校园地图，先搜宿舍/教学楼',
    description: '到校前先在地图里搜自己的宿舍和教学楼，减少现场找路时间。',
    to: '/map',
    icon: 'i-lucide-map',
    audience: [...allFreshmen],
    priority: 30
  },
  {
    id: 'plan-transport',
    stageId: 'before-arrival',
    title: '规划到校交通与行李',
    description: '确认车站/机场到学校路线；接站安排以学校当年通知为准。',
    to: '/guides/arrival',
    icon: 'i-lucide-bus-front',
    audience: [...allFreshmen],
    priority: 40,
    awaitingNotice: true
  },
  {
    id: 'transfer-archive-mail',
    stageId: 'before-arrival',
    title: '专升本：核对档案邮寄要求',
    description: '专升本学生档案邮寄/交接方式与本科可能不同，按当年流程逐项核对。',
    to: '/procedures',
    icon: 'i-lucide-files',
    audience: ['transfer'],
    priority: 50,
    awaitingNotice: true
  },

  // —— 报到当天 ——
  {
    id: 'locate-report-point',
    stageId: 'arrival-day',
    title: '在地图定位报到点或宿舍',
    description: '到校后先打开地图搜索报到点、宿舍或教学楼，再按现场指引排队办理。',
    to: '/map',
    icon: 'i-lucide-crosshair',
    audience: [...allFreshmen],
    priority: 10
  },
  {
    id: 'complete-registration',
    stageId: 'arrival-day',
    title: '完成注册报到相关手续',
    description: '按现场窗口顺序办理；材料有变化时以现场通知为准，不要只看往年经验。',
    to: '/procedures/arrival',
    icon: 'i-lucide-clipboard-check',
    audience: [...allFreshmen],
    priority: 20,
    awaitingNotice: true
  },
  {
    id: 'check-dorm-keys',
    stageId: 'arrival-day',
    title: '确认宿舍入住与楼栋位置',
    description: '拿到宿舍信息后，在地图中再次确认楼栋，方便同学和家长接送。',
    to: '/map?q=%E5%AE%BF%E8%88%8D',
    icon: 'i-lucide-bed-double',
    audience: [...allFreshmen],
    priority: 30
  },
  {
    id: 'save-campus-110',
    stageId: 'arrival-day',
    title: '保存校园 110 与紧急求助入口',
    description: '第一天就保存安全、医疗相关电话和指南，紧急情况不慌找。',
    to: '/guides/safety-health',
    icon: 'i-lucide-shield-plus',
    audience: [...allFreshmen],
    priority: 40
  },

  // —— 入学第一周 ——
  {
    id: 'campus-card-network',
    stageId: 'first-week',
    title: '办理校园卡与校园网',
    description: '尽快弄清校园卡充值、校园网连接和常见问题。',
    to: '/guides/campus-card-network',
    icon: 'i-lucide-wifi',
    audience: [...allFreshmen],
    priority: 10
  },
  {
    id: 'library-binding',
    stageId: 'first-week',
    title: '图书馆借阅与微信绑定',
    description: '按流程开通借阅权限，并完成必要的微信和图书馆账号绑定。',
    to: '/procedures',
    icon: 'i-lucide-book-open-check',
    audience: [...allFreshmen],
    priority: 20
  },
  {
    id: 'confirm-classes',
    stageId: 'first-week',
    title: '确认课表与开学上课日',
    description: '2026 级 9 月 10 日开始上课；课表与教室以教务系统/学院通知为准。',
    to: '/guides/study-library',
    icon: 'i-lucide-graduation-cap',
    audience: [...allFreshmen],
    priority: 30
  },
  {
    id: 'orientation-education',
    stageId: 'first-week',
    title: '参加入学教育（9 月 7–9 日）',
    description: '入学教育时段已确认；具体地点和日程以学校与学院通知为准。',
    to: '/procedures/arrival',
    icon: 'i-lucide-users-round',
    audience: [...allFreshmen],
    priority: 40,
    awaitingNotice: true
  },
  {
    id: 'dorm-repair-channel',
    stageId: 'first-week',
    title: '了解宿舍报修入口',
    description: '水电门窗等问题先记上报修渠道，避免临时找不到人。',
    to: '/procedures',
    icon: 'i-lucide-wrench',
    audience: [...allFreshmen],
    priority: 50
  },

  // —— 日常 ——
  {
    id: 'express-pickup',
    stageId: 'daily',
    title: '熟悉快递取件与外卖边界',
    description: '确认取件点位置和外卖能否进校；现场规则可能调整。',
    to: '/guides/express-delivery',
    icon: 'i-lucide-package-open',
    audience: [...allFreshmen],
    priority: 10
  },
  {
    id: 'nearby-life',
    stageId: 'daily',
    title: '了解周边餐饮与生活服务',
    description: '学生街、便利和常用商铺可按需浏览，先确认位置和营业状态再去。',
    to: '/nearby',
    icon: 'i-lucide-store',
    audience: [...allFreshmen],
    priority: 20
  },
  {
    id: 'club-recruit',
    stageId: 'daily',
    title: '了解社团与招新安排',
    description: '招新时间以当年通知为准；可先按兴趣浏览社团方向。',
    to: '/clubs',
    icon: 'i-lucide-users-round',
    audience: [...allFreshmen],
    priority: 30,
    awaitingNotice: true
  },
  {
    id: 'department-contacts',
    stageId: 'daily',
    title: '收藏常用部门入口',
    description: '招生、教务、学生事务等部门入口可在需要时快速找到。',
    to: '/departments',
    icon: 'i-lucide-landmark',
    audience: [...allFreshmen],
    priority: 40
  },

  // —— 行李材料 ——
  {
    id: 'pack-id-docs',
    stageId: 'packing',
    title: '身份证、录取通知书及相关证件',
    description: '原件与复印件按学校要求准备；具体清单以通知书为准。',
    icon: 'i-lucide-badge-check',
    audience: [...allFreshmen],
    priority: 10,
    awaitingNotice: true
  },
  {
    id: 'pack-photos',
    stageId: 'packing',
    title: '证件照与常用照片',
    description: '准备若干张一寸/二寸照片备用（数量与底色以学校要求为准）。',
    icon: 'i-lucide-image',
    audience: [...allFreshmen],
    priority: 20,
    awaitingNotice: true
  },
  {
    id: 'pack-cash-card',
    stageId: 'packing',
    title: '银行卡与少量现金',
    description: '用于学费、生活费和校园卡充值；收费项目以学校通知为准。',
    icon: 'i-lucide-credit-card',
    audience: [...allFreshmen],
    priority: 30
  },
  {
    id: 'pack-bedding',
    stageId: 'packing',
    title: '床上用品与洗漱日用品',
    description: '是否统一采购以学校/学院通知为准；也可到校后购买。',
    icon: 'i-lucide-bed-single',
    audience: [...allFreshmen],
    priority: 40,
    awaitingNotice: true
  },
  {
    id: 'pack-electronics',
    stageId: 'packing',
    title: '手机、充电器、电脑与排插',
    description: '注意宿舍用电安全，大功率电器以宿舍管理规定为准。',
    icon: 'i-lucide-monitor',
    audience: [...allFreshmen],
    priority: 50
  },
  {
    id: 'pack-meds',
    stageId: 'packing',
    title: '常用药品与个人必需品',
    description: '常备感冒肠胃药与个人处方药；就医优先走校内医务与正规医院。',
    to: '/guides/safety-health',
    icon: 'i-lucide-heart-pulse',
    audience: [...allFreshmen],
    priority: 60
  },
  {
    id: 'pack-transfer-archive',
    stageId: 'packing',
    title: '专升本：档案与学籍相关材料',
    description: '档案邮寄回执、学籍材料等按专升本当年要求单独准备。',
    to: '/procedures',
    icon: 'i-lucide-folder-open',
    audience: ['transfer'],
    priority: 70,
    awaitingNotice: true
  }
]

export const checklistAudienceOptions: Array<{ value: ChecklistAudience, label: string }> = [
  { value: 'all', label: '全部新生' },
  { value: 'undergraduate', label: '本科' },
  { value: 'transfer', label: '专升本' }
]

export function isChecklistAudience(value: unknown): value is ChecklistAudience {
  return value === 'all' || value === 'undergraduate' || value === 'transfer'
}

export function itemMatchesAudience(item: ChecklistItem, audience: ChecklistAudience): boolean {
  if (audience === 'all') return true
  return item.audience.includes(audience)
}

export function filterChecklistItems(
  items: ChecklistItem[],
  audience: ChecklistAudience
): ChecklistItem[] {
  return items
    .filter(item => itemMatchesAudience(item, audience))
    .slice()
    .sort((a, b) => {
      if (a.stageId !== b.stageId) {
        return stageOrder(a.stageId) - stageOrder(b.stageId)
      }
      return a.priority - b.priority || a.title.localeCompare(b.title, 'zh-CN')
    })
}

function stageOrder(stageId: ChecklistStageId): number {
  const index = checklistStages.findIndex(stage => stage.id === stageId)
  return index < 0 ? 999 : index
}

export function findChecklistStage(stageId: ChecklistStageId): ChecklistStage | undefined {
  return checklistStages.find(stage => stage.id === stageId)
}

export function percentComplete(completed: number, total: number): number {
  if (total <= 0) return 0
  return Math.min(100, Math.round((completed / total) * 100))
}

export function buildChecklistOverview(
  completedIds: Iterable<string>,
  audience: ChecklistAudience = 'all',
  catalog: ChecklistItem[] = checklistItems
): ChecklistOverview {
  const done = new Set(completedIds)
  const visible = filterChecklistItems(catalog, audience)
  const completedCount = visible.filter(item => done.has(item.id)).length
  const totalCount = visible.length
  const remaining = visible.filter(item => !done.has(item.id))

  const stageProgress = checklistStages.map((stage) => {
    const items = visible.filter(item => item.stageId === stage.id)
    const stageCompleted = items.filter(item => done.has(item.id)).length
    return {
      stage,
      items,
      completedCount: stageCompleted,
      totalCount: items.length,
      percent: percentComplete(stageCompleted, items.length)
    }
  }).filter(entry => entry.totalCount > 0)

  const packing = stageProgress.find(entry => entry.stage.id === 'packing') ?? {
    stage: findChecklistStage('packing')!,
    items: [],
    completedCount: 0,
    totalCount: 0,
    percent: 0
  }
  const tasks = stageProgress.filter(entry => entry.stage.id !== 'packing')

  return {
    completedCount,
    totalCount,
    percent: percentComplete(completedCount, totalCount),
    remainingCount: Math.max(0, totalCount - completedCount),
    nextItem: remaining[0] ?? null,
    stageProgress,
    packing,
    tasks
  }
}

export function createEmptyChecklistProgress(): ChecklistProgressSnapshot {
  return {
    completedIds: [],
    audience: 'all',
    updatedAt: null
  }
}

export function parseChecklistProgress(raw: unknown): ChecklistProgressSnapshot {
  const empty = createEmptyChecklistProgress()
  if (!raw || typeof raw !== 'object') return empty

  const record = raw as Record<string, unknown>
  const completedIds = Array.isArray(record.completedIds)
    ? record.completedIds.filter((id): id is string => typeof id === 'string' && id.trim().length > 0)
    : []
  const audience = isChecklistAudience(record.audience) ? record.audience : 'all'
  const updatedAt = typeof record.updatedAt === 'string' ? record.updatedAt : null

  // Drop unknown ids so old storage stays healthy after catalog changes
  const known = new Set(checklistItems.map(item => item.id))
  return {
    completedIds: [...new Set(completedIds.filter(id => known.has(id)))],
    audience,
    updatedAt
  }
}

export function serializeChecklistProgress(snapshot: ChecklistProgressSnapshot): string {
  return JSON.stringify({
    completedIds: [...new Set(snapshot.completedIds)],
    audience: snapshot.audience,
    updatedAt: snapshot.updatedAt
  })
}

export function toggleCompletedId(completedIds: string[], itemId: string, completed: boolean): string[] {
  const set = new Set(completedIds)
  if (completed) set.add(itemId)
  else set.delete(itemId)
  return [...set]
}

export function buildHomeChecklistSummary(
  completedIds: Iterable<string>,
  audience: ChecklistAudience = 'all'
): { percent: number, remainingCount: number, nextTitle: string | null, to: string } {
  const overview = buildChecklistOverview(completedIds, audience)
  return {
    percent: overview.percent,
    remainingCount: overview.remainingCount,
    nextTitle: overview.nextItem?.title ?? null,
    to: '/checklist'
  }
}
