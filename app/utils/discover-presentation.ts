export interface DiscoverLinkEntry {
  title: string
  description: string
  to: string
  icon: string
}

export interface DiscoverTaskEntry extends DiscoverLinkEntry {
  tone: string
}

export const discoverTaskPreviewLimit = 6

export function buildDiscoverTaskPreview<T>(
  entries: ReadonlyArray<T>,
  expanded: boolean,
  limit = discoverTaskPreviewLimit
): { items: T[], hiddenCount: number } {
  const safeLimit = Math.max(1, Math.floor(limit))
  if (expanded || entries.length <= safeLimit) {
    return { items: [...entries], hiddenCount: 0 }
  }
  return {
    items: entries.slice(0, safeLimit),
    hiddenCount: entries.length - safeLimit
  }
}

export const discoverTaskEntries: DiscoverTaskEntry[] = [
  {
    title: '新生清单',
    description: '按到校前、报到当天和第一周逐项勾选，进度只保存在这台设备',
    to: '/checklist',
    icon: 'i-lucide-list-checks',
    tone: 'bg-emerald-50 text-emerald-700'
  },
  {
    title: '新生报到',
    description: '查看 2026 级报到日期、要带的材料和安全提醒',
    to: '/procedures/arrival',
    icon: 'i-lucide-clipboard-check',
    tone: 'bg-green-50 text-green-700'
  },
  {
    title: '找宿舍 / 教学楼',
    description: '搜索宿舍和教学楼；位置不确定时会提醒你到现场确认',
    to: '/guides/find-campus',
    icon: 'i-lucide-map-pinned',
    tone: 'bg-blue-50 text-blue-700'
  },
  {
    title: '校园卡与网络',
    description: '查看校园网、校外访问和图书馆登录说明',
    to: '/guides/campus-card-network',
    icon: 'i-lucide-wifi',
    tone: 'bg-cyan-50 text-cyan-700'
  },
  {
    title: '学习 / 图书馆',
    description: '查看开学日期、教务入口、开放时间和借阅规则',
    to: '/guides/study-library',
    icon: 'i-lucide-book-open-check',
    tone: 'bg-indigo-50 text-indigo-700'
  },
  {
    title: '安全 / 医疗',
    description: '保存校园 110，查看医务室和心理求助方式',
    to: '/guides/safety-health',
    icon: 'i-lucide-shield-plus',
    tone: 'bg-red-50 text-red-700'
  },
  {
    title: '快递 / 外卖',
    description: '查快递站、取餐点和配送范围，出发前再看营业情况',
    to: '/map?category=express',
    icon: 'i-lucide-package-open',
    tone: 'bg-orange-50 text-orange-700'
  },
  {
    title: '周边商铺',
    description: '找学校附近的餐饮、便利店、快递和生活服务',
    to: '/nearby',
    icon: 'i-lucide-store',
    tone: 'bg-amber-50 text-amber-700'
  },
  {
    title: '社团与招新',
    description: '了解社团方向和近期活动，招新时间看最新消息',
    to: '/clubs',
    icon: 'i-lucide-users-round',
    tone: 'bg-violet-50 text-violet-700'
  },
  {
    title: '新生群聊',
    description: '登录后进入公共群与宿舍楼群；不登录不能聊天',
    to: '/chat',
    icon: 'i-lucide-messages-square',
    tone: 'bg-teal-50 text-teal-700'
  }
]

export const discoverDirectoryEntries: DiscoverLinkEntry[] = [
  { title: '新生群聊', description: '公共群与宿舍楼群，需登录', to: '/chat', icon: 'i-lucide-messages-square' },
  { title: '账号登录', description: '个人中心改名、专业与宿舍楼', to: '/login', icon: 'i-lucide-log-in' },
  { title: '新生清单', description: '在这台设备勾选报到与入学事项，无需登录', to: '/checklist', icon: 'i-lucide-list-checks' },
  { title: '校园地图', description: '搜索地点、筛选类别、查看入口与导航', to: '/map', icon: 'i-lucide-map' },
  { title: '全部指南', description: '按入学、校园、生活与社团浏览', to: '/guides', icon: 'i-lucide-notebook-tabs' },
  { title: '校园概览', description: '学校简介、常用入口与当前公告', to: '/campus', icon: 'i-lucide-school' },
  { title: '校内部门', description: '按办理事项查找职责、官网与公开联系方式', to: '/departments', icon: 'i-lucide-landmark' },
  { title: '学生社团', description: '搜索社团方向、近期活动和招新消息', to: '/clubs', icon: 'i-lucide-users-round' },
  { title: '全站搜索', description: '同时搜索指南、地点、部门和社团', to: '/search', icon: 'i-lucide-search' }
]

export const discoverTrustEntries: DiscoverLinkEntry[] = [
  { title: '信息出处', description: '看看学校通知、部门页面和地图资料', to: '/sources', icon: 'i-lucide-list-checks' },
  { title: '告诉我们哪里不对', description: '说明出错的页面和正确情况，不登录也能提交', to: '/feedback', icon: 'i-lucide-message-square-warning' },
  { title: '隐私说明', description: '了解会记录哪些信息，以及如何查询或删除', to: '/privacy', icon: 'i-lucide-shield-check' },
  { title: '关于这份指南', description: '了解本站能帮你做什么，哪些事项要看学校通知', to: '/about', icon: 'i-lucide-info' },
  { title: '网络提示', description: '没有网络时能看什么，以及怎样回到原页面', to: '/offline', icon: 'i-lucide-cloud-off' }
]
