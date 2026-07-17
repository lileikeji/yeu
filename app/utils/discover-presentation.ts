export interface DiscoverLinkEntry {
  title: string
  description: string
  to: string
  icon: string
}

export interface DiscoverTaskEntry extends DiscoverLinkEntry {
  tone: string
}

export const discoverTaskEntries: DiscoverTaskEntry[] = [
  {
    title: '新生清单',
    description: '到校前到第一周任务勾选，进度只保存在本机',
    to: '/checklist',
    icon: 'i-lucide-list-checks',
    tone: 'bg-emerald-50 text-emerald-700'
  },
  {
    title: '新生报到',
    description: '核对2026级日期、待通知材料与安全提醒',
    to: '/procedures/arrival',
    icon: 'i-lucide-clipboard-check',
    tone: 'bg-green-50 text-green-700'
  },
  {
    title: '找宿舍 / 教学楼',
    description: '先查地点目录和坐标状态，未核验点不导航',
    to: '/guides/find-campus',
    icon: 'i-lucide-map-pinned',
    tone: 'bg-blue-50 text-blue-700'
  },
  {
    title: '校园卡与网络',
    description: '查看校园网、VPN与图书馆借阅权限资料',
    to: '/guides/campus-card-network',
    icon: 'i-lucide-wifi',
    tone: 'bg-cyan-50 text-cyan-700'
  },
  {
    title: '学习 / 图书馆',
    description: '核对开学日期、教务入口、开放时间与借阅规则',
    to: '/guides/study-library',
    icon: 'i-lucide-book-open-check',
    tone: 'bg-indigo-50 text-indigo-700'
  },
  {
    title: '安全 / 医疗',
    description: '保存校园110，查看消防、医务室与心理求助入口',
    to: '/guides/safety-health',
    icon: 'i-lucide-shield-plus',
    tone: 'bg-red-50 text-red-700'
  },
  {
    title: '快递 / 外卖',
    description: '查看站点、取餐点和配送边界的当前核验状态',
    to: '/map?category=express',
    icon: 'i-lucide-package-open',
    tone: 'bg-orange-50 text-orange-700'
  },
  {
    title: '周边商铺',
    description: '只展示达到位置与营业状态发布标准的地点',
    to: '/nearby',
    icon: 'i-lucide-store',
    tone: 'bg-amber-50 text-amber-700'
  },
  {
    title: '社团与招新',
    description: '查看近期活动可核验社团，当年招新以新通知为准',
    to: '/clubs',
    icon: 'i-lucide-users-round',
    tone: 'bg-violet-50 text-violet-700'
  }
]

export const discoverDirectoryEntries: DiscoverLinkEntry[] = [
  { title: '新生清单', description: '本地勾选报到与入学事项，无需登录', to: '/checklist', icon: 'i-lucide-list-checks' },
  { title: '校园地图', description: '搜索地点、筛选类别、查看坐标核验状态', to: '/map', icon: 'i-lucide-map' },
  { title: '全部指南', description: '按入学、校园、生活与社团浏览', to: '/guides', icon: 'i-lucide-notebook-tabs' },
  { title: '校园概览', description: '学校简介、常用入口与当前公告', to: '/campus', icon: 'i-lucide-school' },
  { title: '校内部门', description: '按办理事项查找职责、官网与公开联系方式', to: '/departments', icon: 'i-lucide-landmark' },
  { title: '学生社团', description: '搜索已发布社团资料与招新状态', to: '/clubs', icon: 'i-lucide-users-round' },
  { title: '全站搜索', description: '同时搜索指南、地点、部门和社团', to: '/search', icon: 'i-lucide-search' }
]

export const discoverTrustEntries: DiscoverLinkEntry[] = [
  { title: '来源说明', description: '资料分级、核验方法与已发布引用', to: '/sources', icon: 'i-lucide-list-checks' },
  { title: '反馈纠错', description: '提交位置错误、过期内容或可靠来源', to: '/feedback', icon: 'i-lucide-message-square-warning' },
  { title: '隐私说明', description: '定位、反馈、缓存与数据删除边界', to: '/privacy', icon: 'i-lucide-shield-check' },
  { title: '关于项目', description: '维护主体、非官方声明与服务边界', to: '/about', icon: 'i-lucide-info' },
  { title: '离线状态', description: '网络不可用时的缓存边界和重试入口', to: '/offline', icon: 'i-lucide-cloud-off' }
]
