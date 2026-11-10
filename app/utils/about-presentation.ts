export interface AboutProjectFact {
  label: string
  value: string
  icon: string
  tone: AboutTone
}

export interface AboutBoundary {
  title: string
  icon: string
  text: string
  tone: AboutTone
}

export interface AboutGovernanceLink {
  title: string
  description: string
  to: string
  icon: string
  tone: AboutTone
}

export interface AboutHeroAction {
  label: string
  to: string
  icon: string
}

export type AboutTone = 'amber' | 'green' | 'sky' | 'zinc'

export interface AboutMaintainer {
  name: string
  handle: string
  role: string
  focus: string[]
  note: string
  icon: string
  tone: AboutTone
}

export interface AboutContributionTrack {
  title: string
  detail: string
  icon: string
}

export interface AboutRepository {
  name: string
  description: string
  url: string
  label: string
  meta: string
  icon: string
  tone: AboutTone
}

export const aboutHeroActions: AboutHeroAction[] = [
  {
    label: '查看参考页面',
    to: '/sources',
    icon: 'i-lucide-file-check-2'
  },
  {
    label: '发现错误，告诉我们',
    to: '/feedback',
    icon: 'i-lucide-message-square-warning'
  }
]

export const aboutProjectFacts: AboutProjectFact[] = [
  {
    label: '这是什么',
    value: '非官方新生指南',
    icon: 'i-lucide-compass',
    tone: 'sky'
  },
  {
    label: '谁在整理',
    value: '学生个人维护',
    icon: 'i-lucide-users-round',
    tone: 'green'
  },
  {
    label: '适合谁',
    value: '本科与专升本新生',
    icon: 'i-lucide-graduation-cap',
    tone: 'amber'
  },
  {
    label: '怎么使用',
    value: '不登录也能看',
    icon: 'i-lucide-log-in',
    tone: 'zinc'
  }
]

export const aboutBoundaries: AboutBoundary[] = [
  {
    title: '重要事项看学校通知',
    icon: 'i-lucide-file-warning',
    text: '报到、缴费、学籍、住宿、安全和材料，以录取通知书及学校最新通知为准。',
    tone: 'amber'
  },
  {
    title: '地图不猜位置',
    icon: 'i-lucide-map-pinned',
    text: '只标确认过的位置，不确定的会说明，不会为了看起来完整而随便标位置。',
    tone: 'sky'
  },
  {
    title: '往年消息只作参考',
    icon: 'i-lucide-calendar-clock',
    text: '往年安排可能已变，出发前看今年通知。',
    tone: 'zinc'
  },
  {
    title: '没有付费排名',
    icon: 'i-lucide-badge-percent',
    text: '没有商家推广和付费排名，合作内容会明确标出。',
    tone: 'green'
  }
]

export const aboutGovernanceLinks: AboutGovernanceLink[] = [
  {
    title: '看看信息从哪里来',
    description: '查看学校通知、部门页面和地图资料',
    to: '/sources',
    icon: 'i-lucide-list-checks',
    tone: 'sky'
  },
  {
    title: '告诉我们哪里不对',
    description: '说明出错的页面和正确情况，不登录也能提交',
    to: '/feedback',
    icon: 'i-lucide-message-square-warning',
    tone: 'amber'
  },
  {
    title: '看看隐私说明',
    description: '会记录哪些信息，怎么查、怎么删',
    to: '/privacy',
    icon: 'i-lucide-shield-check',
    tone: 'green'
  }
]

/** 现在实际在维护的人。名字与仓库账号都对得上，改这条要同时改提交记录里的身份。 */
export const aboutMaintainers: AboutMaintainer[] = [
  {
    name: '李磊',
    handle: 'GitHub @lileikeji · Gitee @lilei1529',
    role: '维护者',
    focus: ['内容整理与核验', '地图与地点数据', '页面与交互', '问答与查找', '发布与运维'],
    note: '2026 年 7 月开始搭这个站，950 多次提交，改动都能在提交记录里查。',
    icon: 'i-lucide-user-round',
    tone: 'green'
  }
]

/** 一起做的话，现在真的缺这些活。顺序按“补上以后读者立刻能用”排。 */
export const aboutContributionTracks: AboutContributionTrack[] = [
  {
    title: '拍入口照片',
    detail: '每栋宿舍、每个场馆的正门和侧门，从路口拍过去，再写一句“从哪边进”。最后 50 米现在还是空的。',
    icon: 'i-lucide-camera'
  },
  {
    title: '核校车和公交时刻',
    detail: '班次会变。每月核一次首末班和间隔，记下采样时间，比写死一张表有用。',
    icon: 'i-lucide-bus'
  },
  {
    title: '把长句改短',
    detail: '指南里还有读着费劲的段落。改一句算一句，不用整篇重写。',
    icon: 'i-lucide-pen-line'
  },
  {
    title: '补测试和守卫',
    detail: '每条新数据都要有测试盯着，防止下次改坏。不会写代码也能提需求。',
    icon: 'i-lucide-shield-check'
  }
]

/** 两个仓库地址都从 git remote 里取，不写死分支名。 */
export const aboutRepositories: AboutRepository[] = [
  {
    name: 'lileikeji/yeu',
    description: '主仓库。页面、内容数据、测试和发布脚本都在同一个仓库里。',
    url: 'https://github.com/lileikeji/yeu',
    label: '去 GitHub 看看',
    meta: 'GitHub',
    icon: 'i-lucide-github',
    tone: 'zinc'
  },
  {
    name: 'lilei1529/yeu',
    description: '国内访问快一些，和 GitHub 同步。两个仓库内容一样，在哪边提 issue 都行。',
    url: 'https://gitee.com/lilei1529/yeu',
    label: '去 Gitee 看看',
    meta: 'Gitee',
    icon: 'i-lucide-git-branch',
    tone: 'amber'
  }
]
