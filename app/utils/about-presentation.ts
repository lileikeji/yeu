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
    title: '学校通知优先',
    icon: 'i-lucide-file-warning',
    text: '报到、缴费、学籍、住宿、安全和材料，以录取通知书及学校最新通知为准。',
    tone: 'amber'
  },
  {
    title: '地图标确认过的位置',
    icon: 'i-lucide-map-pinned',
    text: '只标核对过的位置。没核对的不标。',
    tone: 'sky'
  },
  {
    title: '往年安排会过期',
    icon: 'i-lucide-calendar-clock',
    text: '往年安排可能已变，出发前看今年通知。',
    tone: 'zinc'
  },
  {
    title: '错误会改',
    icon: 'i-lucide-file-pen-line',
    text: '指出错误后对照原文核对，改完在提交记录里留下改动。',
    tone: 'green'
  }
]

export const aboutGovernanceLinks: AboutGovernanceLink[] = [
  {
    title: '信息从哪里来',
    description: '学校通知、部门页面、地图资料',
    to: '/sources',
    icon: 'i-lucide-list-checks',
    tone: 'sky'
  },
  {
    title: '告诉我们哪里不对',
    description: '写清哪一页、哪里不对，不用登录',
    to: '/feedback',
    icon: 'i-lucide-message-square-warning',
    tone: 'amber'
  },
  {
    title: '隐私说明',
    description: '记录了什么、怎么查、怎么删',
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
    note: '仰恩 25 级专升本，2026-07 起整理；提交 950 次以上。',
    icon: 'i-lucide-user-round',
    tone: 'green'
  }
]

/** 一起做的话，现在真的缺这些活。顺序按“补上以后读者立刻能用”排。 */
export const aboutContributionTracks: AboutContributionTrack[] = [
  {
    title: '拍入口照片',
    detail: '宿舍和场馆的正门、侧门，从路口拍一张，写明从哪边进。',
    icon: 'i-lucide-camera'
  },
  {
    title: '核校车和公交时刻',
    detail: '每月核一次首末班和班次间隔，记下核对日期。',
    icon: 'i-lucide-bus'
  },
  {
    title: '把长句改短',
    detail: '指南里读着费劲的段落，一条一条改短。',
    icon: 'i-lucide-pen-line'
  },
  {
    title: '补测试和守卫',
    detail: '新加的数据配一条测试，防止后面改坏。',
    icon: 'i-lucide-shield-check'
  }
]

/** 两个仓库地址都从 git remote 里取，不写死分支名。 */
export const aboutRepositories: AboutRepository[] = [
  {
    name: 'lileikeji/yeu',
    description: '页面、数据、测试、发布脚本都在这里。',
    url: 'https://github.com/lileikeji/yeu',
    label: '去 GitHub',
    meta: 'GitHub',
    icon: 'i-lucide-github',
    tone: 'zinc'
  },
  {
    name: 'lilei1529/yeu',
    description: '国内访问用这个，和 GitHub 同步。',
    url: 'https://gitee.com/lilei1529/yeu',
    label: '去 Gitee',
    meta: 'Gitee',
    icon: 'i-lucide-git-branch',
    tone: 'amber'
  }
]
