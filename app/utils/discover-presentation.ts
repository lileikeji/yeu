export interface DiscoverLinkEntry {
  title: string
  description: string
  to: string
  icon: string
}

export interface DiscoverTaskEntry extends DiscoverLinkEntry {
  tone: string
  when: string
}

export function buildDiscoverAccountEntries(authenticated: boolean): DiscoverLinkEntry[] {
  return [
    authenticated
      ? {
          title: '个人中心',
          description: '修改昵称、专业和宿舍楼',
          to: '/me',
          icon: 'i-lucide-user-round'
        }
      : {
          title: '登录已有账号',
          description: '暂不开放自行注册；不登录也能使用地图、清单和指南',
          to: '/login',
          icon: 'i-lucide-log-in'
        },
    {
      title: authenticated ? '进入新生群聊' : '新生群聊',
      description: authenticated
        ? '进入公共群或自己的宿舍楼群'
        : '公共群和宿舍楼群，登录后才能发消息',
      to: '/chat',
      icon: 'i-lucide-messages-square'
    }
  ]
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
    tone: 'bg-emerald-50 text-emerald-700',
    when: '现在就能准备'
  },
  {
    title: '新生报到',
    description: '查看 2026 级报到日期、要带的材料和安全提醒',
    to: '/procedures/arrival',
    icon: 'i-lucide-clipboard-check',
    tone: 'bg-green-50 text-green-700',
    when: '9 月 5—6 日'
  },
  {
    title: '学费与资助',
    description: '查 2026 年学费、住宿费、助学贷款和助学金，缴费入口等学校通知',
    to: '/guides/fees-aid',
    icon: 'i-lucide-wallet-cards',
    tone: 'bg-amber-50 text-amber-700',
    when: '缴费前先核对'
  },
  {
    title: '找宿舍 / 教学楼',
    description: '搜索宿舍和教学楼；位置不确定时会提醒你到现场确认',
    to: '/guides/find-campus',
    icon: 'i-lucide-map-pinned',
    tone: 'bg-blue-50 text-blue-700',
    when: '到校找路'
  },
  {
    title: '校园一卡通与网络',
    description: '查看校园网、校外访问和图书馆登录说明',
    to: '/guides/campus-card-network',
    icon: 'i-lucide-wifi',
    tone: 'bg-cyan-50 text-cyan-700',
    when: '注册后再办理'
  },
  {
    title: '食堂在哪里',
    description: '先看东苑、北苑和西苑餐厅说明，再去地图找位置；开放时间与档口到校确认',
    to: '/guides/find-campus#dining',
    icon: 'i-lucide-utensils',
    tone: 'bg-orange-50 text-orange-700',
    when: '到校就会用'
  },
  {
    title: '学习 / 图书馆',
    description: '查看开学日期、教务入口、开放时间和借阅规则',
    to: '/guides/study-library',
    icon: 'i-lucide-book-open-check',
    tone: 'bg-indigo-50 text-indigo-700',
    when: '开学后常用'
  },
  {
    title: '军训安排（暂定）',
    description: '校历暂定 12 月 13—26 日；地点、服装和请假要求等学校后续通知',
    to: '/campus#military-training',
    icon: 'i-lucide-shield',
    tone: 'bg-lime-50 text-lime-700',
    when: '12 月 13—26 日'
  },
  {
    title: '安全 / 医疗',
    description: '保存校园 110，查看医务室和心理求助方式',
    to: '/guides/safety-health',
    icon: 'i-lucide-shield-plus',
    tone: 'bg-red-50 text-red-700',
    when: '现在先保存'
  },
  {
    title: '快递 / 外卖',
    description: '查快递站、取餐点和配送范围，出发前再看营业情况',
    to: '/map?category=express',
    icon: 'i-lucide-package-open',
    tone: 'bg-orange-50 text-orange-700',
    when: '入住后确认'
  },
  {
    title: '周边商铺',
    description: '找学校附近的餐饮、便利店、快递和生活服务',
    to: '/nearby',
    icon: 'i-lucide-store',
    tone: 'bg-amber-50 text-amber-700',
    when: '到店前确认'
  },
  {
    title: '社团与招新',
    description: '了解社团方向和近期活动，招新时间看最新消息',
    to: '/clubs',
    icon: 'i-lucide-users-round',
    tone: 'bg-violet-50 text-violet-700',
    when: '开学后留意'
  },
  {
    title: '全景云游校园',
    description: '在手机或电脑上先看大门、教学楼、部分宿舍和校史馆',
    to: '/panorama',
    icon: 'i-lucide-orbit',
    tone: 'bg-emerald-50 text-emerald-700',
    when: '报到前先逛一遍'
  },
  {
    title: '宿舍实拍',
    description: '分别查看普通型和舒适型宿舍，以及公共洗衣、洗漱和卫生间区域',
    to: '/dorms',
    icon: 'i-lucide-bed-double',
    tone: 'bg-sky-50 text-sky-700',
    when: '选宿舍前先看看'
  }
]

export const discoverDirectoryEntries: DiscoverLinkEntry[] = [
  { title: '全部指南', description: '查看入学、校园、生活与社团事项', to: '/guides', icon: 'i-lucide-notebook-tabs' },
  { title: '校园概览', description: '学校简介、当前公告和常用入口', to: '/campus', icon: 'i-lucide-school' },
  { title: '校内部门', description: '按要办的事查职责和公开联系方式', to: '/departments', icon: 'i-lucide-landmark' },
  { title: '学生社团', description: '按兴趣找社团，留意本学期招新消息', to: '/clubs', icon: 'i-lucide-users-round' }
]

export const discoverTrustEntries: DiscoverLinkEntry[] = [
  { title: '联系我们 / 加新生群', description: '扫码联系整理者，咨询问题或申请加入新生交流群', to: '/contact', icon: 'i-lucide-message-circle' },
  { title: '参考页面', description: '看看学校通知、部门页面和地图资料', to: '/sources', icon: 'i-lucide-list-checks' },
  { title: '告诉我们哪里不对', description: '说明出错的页面和正确情况，不登录也能提交', to: '/feedback', icon: 'i-lucide-message-square-warning' },
  { title: '隐私说明', description: '了解会记录哪些信息，以及如何查询或删除', to: '/privacy', icon: 'i-lucide-shield-check' },
  { title: '关于这份指南', description: '了解本站能帮你做什么，哪些事项要看学校通知', to: '/about', icon: 'i-lucide-info' },
  { title: '网络提示', description: '没有网络时能看什么，以及怎样回到原页面', to: '/offline', icon: 'i-lucide-cloud-off' }
]
