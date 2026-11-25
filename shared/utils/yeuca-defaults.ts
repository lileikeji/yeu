import type {
  YeucaAiWorkflowStep,
  YeucaAnnouncementConfig,
  YeucaChecklistRow,
  YeucaCompetitionItem,
  YeucaFaqItem,
  YeucaFeatureFlags,
  YeucaFriendLink,
  YeucaHomeEntryCard,
  YeucaHomeHeroConfig,
  YeucaMirrorEntry,
  YeucaPracticeTopic,
  YeucaScriptOption,
  YeucaSeasonalRhythmItem,
  YeucaSiteExtras,
  YeucaStarterLink,
  YeucaTimelineNode
} from '../types/yeuca'

export const DEFAULT_YEUCA_ANNOUNCEMENT: YeucaAnnouncementConfig = {
  enabled: false,
  tag: '招新提示',
  text: '新学期迎新交流群已开放，在册成员可前往会员入口激活 Git 站账号。',
  href: '/join/'
}

export const DEFAULT_YEUCA_HOME_HERO: YeucaHomeHeroConfig = {
  badge: '1999 年创会 · 仰恩大学洛江校区',
  headline: '仰恩大学计算机协会',
  joinBtnText: '报名加入协会',
  qrBtnText: '迎新群二维码',
  guideCardNote: '官网公开资料可直接浏览；在册成员激活后可登录 Git 代码站与报名活动。'
}

export const DEFAULT_YEUCA_HOME_ENTRIES: YeucaHomeEntryCard[] = [
  {
    id: 'departments',
    badge: '01 / 组织分工',
    title: '协会部门',
    desc: 'AI、编程、网络、安全、运维与宣传六个部门方向，入门不用先选，进群逛逛再定。',
    href: '/departments/',
    cta: '看 6 大部门 →',
    enabled: true
  },
  {
    id: 'competitions',
    badge: '02 / 学科竞赛',
    title: '协会竞赛',
    desc: '蓝桥杯、华为 ICT 大赛、全国信息安全竞赛等备赛安排、组队和常规练题节奏。',
    href: '/about/#competitions',
    cta: '看竞赛清单 →',
    enabled: true
  },
  {
    id: 'projects',
    badge: '03 / 实战积累',
    title: '协会项目',
    desc: '协会同学一起写的校内脚本、靶场实验记录与 Git 代码仓入口。',
    href: '/projects/',
    cta: '逛协会项目 →',
    enabled: true
  }
]

export const DEFAULT_YEUCA_FEATURE_FLAGS: YeucaFeatureFlags = {
  showGitNav: true,
  showMirrorsNav: true,
  showToolsNav: true,
  showMemberEntry: true,
  gitGateHint: 'Git 代码站已开启登录门禁：仅导入协会成员名录并完成官网注册的成员可登录访问与拉取代码。',
  mirrorNotice: '校内优先用自建 PyPI / npm 缓存；重型系统 ISO 与 Docker 镜像请走清华 TUNA 或中科大镜像站。'
}

export const DEFAULT_YEUCA_AI_WORKFLOW_STEPS: YeucaAiWorkflowStep[] = [
  {
    id: 'route',
    step: 'STEP 01',
    title: '意图识别与路由',
    role: '区分提问属于「社团与部门介绍」「活动排期查询」还是「技术资料检索」',
    logic: '先过关键词规则，再走轻量分类提示词，把模糊提问转成明确意图标签。',
    pitfall: '缺少文档依据时不猜测时间或地点。',
    sample: '{ "intent": "query_activity", "dept": "AI 部", "keyword": "Agent 工作流" }'
  },
  {
    id: 'rag',
    step: 'STEP 02',
    title: '文档切块与双路召回',
    role: '从社团活动档案和学习笔记中定位可核对原文片段',
    logic: '采用「标题层级切分 + 关键词 BM25 + 向量检索」混合召回，保留原文标题与出处。',
    pitfall: '专有名词、学号规则与命令参数不能只靠向量模糊匹配，必须保留关键词召回。',
    sample: '[chunk#08] notes/rag-guide.md · "检索片段需保留来源段落，回答附带核对出处"'
  },
  {
    id: 'tool',
    step: 'STEP 03',
    title: '工具调用与状态核验',
    role: '按显式参数签名调用后台只读接口获取实时活动与招新开关',
    logic: '把实时排期或报名通道开关作为结构化工具返回值注入上下文，避免使用静态旧通知。',
    pitfall: '接口无数据时直接说明暂未发布，不用模板话术凑答案。',
    sample: 'GET /api/public/yeuca/site -> 200 OK (real-time club status)'
  },
  {
    id: 'guard',
    step: 'STEP 04',
    title: 'Schema 校验与异常重试',
    role: '校验模型输出 JSON 结构，保证脚本与页面拿到的字段稳定可用',
    logic: '先正则剥离多余代码块围栏字符，再用 Zod 校验必填字段，异常时最多限次重试一次。',
    pitfall: '输出未经剥离与字段校验不直接渲染。',
    sample: '{ "status": "ok", "verified": true, "source": "dept-ai" }'
  }
]

export const DEFAULT_YEUCA_SEASONAL_RHYTHM: YeucaSeasonalRhythmItem[] = [
  {
    phase: '开学初',
    title: '招新与装环境',
    detail: '百团设点答疑，集中帮新生装编辑器、配置 Git / Python / 模拟器以及国内软件镜像源。',
    tags: ['招新', '环境准备']
  },
  {
    phase: '学期中',
    title: '分部小课与练习',
    detail: '按组开展 Agent 脚本、算法题单、路由交换、CTF 基础与 Linux 命令练习，一般放在晚间或周末。',
    tags: ['日常训练', '分享']
  },
  {
    phase: '赛事季',
    title: '校选、集训与参赛',
    detail: '配合蓝桥杯、信息安全竞赛、华为 ICT 等时间表搞校内模拟、跨年级组队与错题复盘。',
    tags: ['校赛', '组队参赛']
  },
  {
    phase: '考期与假期',
    title: '考试周停更与线上共学',
    detail: '期末复习和考试周暂停线下活动，优先保证大家不挂专业课；寒暑假自愿发起线上小项目。',
    tags: ['考期暂停', '线上自愿']
  }
]

export const DEFAULT_YEUCA_ARCHIVE_TIMELINE: YeucaTimelineNode[] = [
  {
    period: '1999 年',
    tag: '创立',
    title: '创立「仰恩大学电脑协会」',
    detail: '学校早期成立的学生技术社团之一，面向全校开展电脑应用、装机维护与软件普及交流。'
  },
  {
    period: '2019 年',
    tag: '合并',
    title: '电脑协会与编程协会合并更名',
    detail: '两支校内技术社团正式合并为「仰恩大学计算机协会」，把硬件运维与软件开发训练合在一起。'
  },
  {
    period: '延续至今',
    tag: '参赛',
    title: '学科竞赛校队常规训练',
    detail: '长期参加蓝桥杯、华为 ICT 大赛、全国大学生信息安全竞赛等赛事，按日常训练、赛前集训、赛后复盘节奏推进。'
  },
  {
    period: '近年拓展',
    tag: '新设',
    title: '增设 AI 部',
    detail: '在编程、网络、安全、运维与宣传五部基础上单设 AI 部，开展模型接口调用、文档检索（RAG）与工作流脚本训练。'
  }
]

export const DEFAULT_YEUCA_CHECKLIST: YeucaChecklistRow[] = [
  {
    item: '会长、副会长及各部门负责人',
    source: '当学年招新宣讲与通知群公告',
    note: '静态页面不写死往届姓名，换届后以当届成员名录为准。'
  },
  {
    item: '招新开关与报名截止时间',
    source: '「加入我们」页与后台实时开关',
    note: '表单直接读取后台开关；平时想来旁听可以在迎新群问值班同学。'
  },
  {
    item: '每周培训时段与机房教室',
    source: '「活动排期」页与通知群消息',
    note: '教室随学期课表微调，以当次活动通知注明的地点为准。'
  },
  {
    item: '官方迎新群二维码',
    source: '「加入我们」页与首页弹窗',
    note: '管理员在后台按学年更新，过期时以线下招新摊位新码为准。'
  }
]

export const DEFAULT_YEUCA_PRACTICE_TOPICS: YeucaPracticeTopic[] = [
  {
    dept: 'AI 部 · 练手题目',
    title: '校园 FAQ 文档检索与引用脚本',
    stack: ['Python', 'Markdown 切分', 'JSON Schema'],
    desc: '把几篇校内资料按标题拆段，写出能附上来源段落名并校验返回 JSON 结构的单轮问答脚本。'
  },
  {
    dept: '编程部 · 练手题目',
    title: 'C++ / Python 50 题基础题单记录',
    stack: ['C++17', 'Git', 'OJ 题解'],
    desc: '按语法、模拟、二分与前缀和顺序把刷过的错题和复杂度笔记传到自己的 Git 仓库里。'
  },
  {
    dept: '网工 / 网安 / 运维 · 练手题目',
    title: '双路由器 OSPF 互通与服务巡检脚本',
    stack: ['eNSP', 'SSH', 'Nginx / systemctl'],
    desc: '先用 eNSP 搭起三层转发并抓包核对路由，再写一段检查指定本地端口和 nginx 状态的小脚本。'
  }
]

export const DEFAULT_YEUCA_STARTER_LINKS: YeucaStarterLink[] = [
  {
    dept: 'AI 部',
    title: 'Prompt 与工具调用实验文档',
    host: 'api-docs.deepseek.com',
    url: 'https://api-docs.deepseek.com/',
    note: '阅读 Function Calling 与 JSON Schema 约束官方文档，动手跑通第一个带工具调用的 Python 脚本。'
  },
  {
    dept: '编程部',
    title: '洛谷与 PTA 程序设计练习平台',
    host: 'luogu.com.cn',
    url: 'https://www.luogu.com.cn/',
    note: '零基础从顺序、分支、循环题单切入，逐步过渡到二分、搜索与动态规划模板题库。'
  },
  {
    dept: '网络工程部',
    title: '华为数通人才与模拟器资料库',
    host: 'e.huawei.com',
    url: 'https://e.huawei.com/cn/talent/',
    note: '了解 HCIA / ICT 大赛考纲与 eNSP 常见 VLAN / OSPF 拓扑排错文档。'
  },
  {
    dept: '网络安全部',
    title: 'CTFHub 技能树与入门靶场',
    host: 'ctfhub.com',
    url: 'https://www.ctfhub.com/',
    note: '按 Web、Crypto、Misc、Reverse 与 Pwn 分类系统刷题，配合抓包分析原理。'
  },
  {
    dept: '运维部',
    title: '清华大学开源软件镜像站帮助文档',
    host: 'mirrors.tuna.tsinghua.edu.cn',
    url: 'https://mirrors.tuna.tsinghua.edu.cn/help/',
    note: '涵盖 Ubuntu / Debian / Docker / Conda 等常用系统源的替换指南。'
  },
  {
    dept: '宣传部',
    title: 'Markdown 基础语法与排版参考',
    host: 'markdown.com.cn',
    url: 'https://markdown.com.cn/basic-syntax/',
    note: '统一官网新闻公告与活动回顾的排版层级，确保标题、列表与代码块清晰可读。'
  }
]

export const DEFAULT_YEUCA_MIRRORS: YeucaMirrorEntry[] = [
  {
    id: 'yeuca-pypi',
    category: '语言与包',
    name: 'Python PyPI（计协自建缓存）',
    upstream: 'yeuca.huiliyill.cn/mirrors/pypi',
    note: '协会服务器热包本地反代缓存',
    cmd: 'pip config set global.index-url https://yeuca.huiliyill.cn/mirrors/pypi/simple/',
    snippetTitle: '临时单次加速用法',
    snippet: 'pip install -i https://yeuca.huiliyill.cn/mirrors/pypi/simple/ httpx',
    helpUrl: '/mirrors/',
    helpHost: 'yeuca.huiliyill.cn'
  },
  {
    id: 'yeuca-npm',
    category: '语言与包',
    name: 'Node.js / npm / pnpm（计协自建缓存）',
    upstream: 'yeuca.huiliyill.cn/mirrors/npm',
    note: '前端与 Node 依赖缓存加速',
    cmd: 'npm config set registry https://yeuca.huiliyill.cn/mirrors/npm/',
    snippetTitle: 'pnpm 同步切源',
    snippet: 'pnpm config set registry https://yeuca.huiliyill.cn/mirrors/npm/',
    helpUrl: '/mirrors/',
    helpHost: 'yeuca.huiliyill.cn'
  },
  {
    id: 'tuna-pypi',
    category: '语言与包',
    name: 'Python PyPI（清华 TUNA）',
    upstream: 'pypi.tuna.tsinghua.edu.cn',
    note: '国内备用直连，5 分钟同步',
    cmd: 'pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple',
    snippetTitle: 'pip.conf 写法',
    snippet: '[global]\nindex-url = https://pypi.tuna.tsinghua.edu.cn/simple',
    helpUrl: 'https://mirrors.tuna.tsinghua.edu.cn/help/pypi/',
    helpHost: 'mirrors.tuna.tsinghua.edu.cn'
  },
  {
    id: 'uv-pypi',
    category: '语言与包',
    name: 'uv (Python)',
    upstream: 'pypi.tuna.tsinghua.edu.cn',
    note: 'AI 部常用快速装包工具',
    cmd: 'uv pip install --default-index https://pypi.tuna.tsinghua.edu.cn/simple/ httpx',
    snippetTitle: 'uv.toml 写法',
    snippet: '[[index]]\nurl = "https://pypi.tuna.tsinghua.edu.cn/simple/"\ndefault = true',
    helpUrl: 'https://docs.astral.sh/uv/',
    helpHost: 'docs.astral.sh'
  },
  {
    id: 'conda-tuna',
    category: 'AI 与模型',
    name: 'Anaconda / Miniconda',
    upstream: 'mirrors.tuna.tsinghua.edu.cn',
    note: '装 PyTorch / CUDA 虚拟环境前先换源',
    cmd: 'conda config --add channels https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/main && conda config --set show_channel_urls yes',
    snippetTitle: '~/.condarc 完整配置',
    snippet: 'channels:\n  - defaults\nshow_channel_urls: true\ndefault_channels:\n  - https://mirrors.tuna.tsinghua.edu.cn/anaconda/pkgs/main',
    helpUrl: 'https://mirrors.tuna.tsinghua.edu.cn/help/anaconda/',
    helpHost: 'mirrors.tuna.tsinghua.edu.cn'
  },
  {
    id: 'hf-mirror',
    category: 'AI 与模型',
    name: 'HuggingFace 镜像',
    upstream: 'hf-mirror.com',
    note: '下载开源模型与词向量权重',
    cmd: 'export HF_ENDPOINT=https://hf-mirror.com',
    snippetTitle: 'PowerShell 持久变量',
    snippet: '[Environment]::SetEnvironmentVariable("HF_ENDPOINT", "https://hf-mirror.com", "User")',
    helpUrl: 'https://hf-mirror.com/',
    helpHost: 'hf-mirror.com'
  },
  {
    id: 'goproxy-cn',
    category: '语言与包',
    name: 'Go GOPROXY',
    upstream: 'goproxy.cn',
    note: 'Go 模块拉取代理',
    cmd: 'go env -w GOPROXY=https://goproxy.cn,direct',
    helpUrl: 'https://goproxy.cn/',
    helpHost: 'goproxy.cn'
  },
  {
    id: 'ubuntu-apt',
    category: '系统与容器',
    name: 'Ubuntu / Debian APT',
    upstream: 'mirrors.tuna.tsinghua.edu.cn',
    note: 'WSL2 / 服务器软件源',
    cmd: 'sudo sed -i "s@//.*archive.ubuntu.com@//mirrors.tuna.tsinghua.edu.cn@g" /etc/apt/sources.list.d/ubuntu.sources',
    helpUrl: 'https://mirrors.tuna.tsinghua.edu.cn/help/ubuntu/',
    helpHost: 'mirrors.tuna.tsinghua.edu.cn'
  },
  {
    id: 'docker-mirror',
    category: '系统与容器',
    name: 'Docker Engine 镜像加速',
    upstream: 'docker.1ms.run · ghcr.nju.edu.cn',
    note: '拉取容器镜像卡顿时配 daemon.json',
    cmd: 'sudo mkdir -p /etc/docker && printf \'{\\n  "registry-mirrors": ["https://docker.1ms.run"]\\n}\\n\' | sudo tee /etc/docker/daemon.json && sudo systemctl restart docker',
    helpUrl: 'https://mirrors.nju.edu.cn/',
    helpHost: 'mirrors.nju.edu.cn'
  }
]

export const DEFAULT_YEUCA_SCRIPT_OPTIONS: YeucaScriptOption[] = [
  {
    id: 'yeuca_pypi',
    label: 'pip 用计协 PyPI 缓存',
    ps1: ['pip config set global.index-url https://yeuca.huiliyill.cn/mirrors/pypi/simple/'],
    sh: ['pip config set global.index-url https://yeuca.huiliyill.cn/mirrors/pypi/simple/']
  },
  {
    id: 'tuna_pypi',
    label: 'pip 用清华 TUNA',
    ps1: ['pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple'],
    sh: ['pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple']
  },
  {
    id: 'yeuca_npm',
    label: 'npm / pnpm 用计协缓存',
    ps1: [
      'npm config set registry https://yeuca.huiliyill.cn/mirrors/npm/',
      'if (Get-Command pnpm -ErrorAction SilentlyContinue) { pnpm config set registry https://yeuca.huiliyill.cn/mirrors/npm/ }'
    ],
    sh: [
      'npm config set registry https://yeuca.huiliyill.cn/mirrors/npm/',
      'command -v pnpm >/dev/null 2>&1 && pnpm config set registry https://yeuca.huiliyill.cn/mirrors/npm/'
    ]
  },
  {
    id: 'uv_env',
    label: 'uv 国内索引变量',
    ps1: [
      '[Environment]::SetEnvironmentVariable("UV_INDEX_URL", "https://pypi.tuna.tsinghua.edu.cn/simple/", "User")',
      '$env:UV_INDEX_URL = "https://pypi.tuna.tsinghua.edu.cn/simple/"'
    ],
    sh: ['export UV_INDEX_URL="https://pypi.tuna.tsinghua.edu.cn/simple/"']
  },
  {
    id: 'hf_mirror',
    label: 'HuggingFace 镜像',
    ps1: [
      '[Environment]::SetEnvironmentVariable("HF_ENDPOINT", "https://hf-mirror.com", "User")',
      '$env:HF_ENDPOINT = "https://hf-mirror.com"'
    ],
    sh: ['export HF_ENDPOINT="https://hf-mirror.com"']
  },
  {
    id: 'git_init',
    label: 'Git 默认分支与大文件缓冲',
    ps1: [
      'git config --global init.defaultBranch main',
      'git config --global core.longpaths true',
      'git config --global http.postBuffer 524288000'
    ],
    sh: [
      'git config --global init.defaultBranch main',
      'git config --global http.postBuffer 524288000'
    ]
  }
]

export const DEFAULT_YEUCA_COMPETITIONS: YeucaCompetitionItem[] = [
  {
    name: '第十七届蓝桥杯软件与网络安全双赛道省赛',
    track: '软件 / 安全',
    dept: '编程部 · 网络安全部',
    site: 'dasai.lanqiao.cn',
    href: 'https://dasai.lanqiao.cn/'
  },
  {
    name: '第十届华为 ICT 大赛省赛',
    track: '网络工程',
    dept: '网络工程部',
    site: 'e.huawei.com',
    href: 'https://e.huawei.com/cn/talent/ict-academy/'
  },
  {
    name: '第十九届全国大学生信息安全竞赛半决赛',
    track: '信息安全',
    dept: '网络安全部',
    site: 'ciscn.cn',
    href: 'https://www.ciscn.cn/'
  },
  {
    name: '福建省大学生数据安全大赛',
    track: '数据安全',
    dept: '网络安全部',
    site: '校内外赛事公告',
    href: ''
  },
  {
    name: '「西门子杯」中国智能制造挑战赛校级选拔赛',
    track: '工程实践',
    dept: '编程部 · 运维部',
    site: 'siemenscup-cimc.org.cn',
    href: 'https://www.siemenscup-cimc.org.cn/'
  }
]

export const DEFAULT_YEUCA_FAQS: YeucaFaqItem[] = [
  {
    q: '完全零基础，电脑都没怎么折腾过，可以加入吗？',
    a: '可以。不管什么专业、以前有没有敲过代码，开学各部门都会从装编辑器和配置环境开始带。'
  },
  {
    q: '加入计协跟专业课学习会冲突吗？',
    a: '交流和培训一般放在晚上或周末非上课时间，自愿过来；期末复习周和考试周会暂停常规活动，先顾好自己课程考试。'
  },
  {
    q: '在册协会成员怎么使用 Git 站？',
    a: '只有已录入协会成员名单且在官网「会员入口」完成核验注册的成员才能登录使用协会 Git 站，使用同一套账号密码即可登录与克隆代码。'
  },
  {
    q: '参加竞赛需要很厉害才让报名吗？',
    a: '不用很厉害才能报。平时都是从简单题和基础拓扑练起，赛前按当前进度组队报名，会有模拟赛帮忙挑出问题。'
  }
]

export const DEFAULT_YEUCA_FRIEND_LINKS: YeucaFriendLink[] = [
  { label: '仰恩校园指南 (YeU)', href: 'https://yx.huiliyill.cn/' },
  { label: '仰恩大学官网', href: 'https://www.yeu.edu.cn/' }
]

export interface EditableYeucaExtrasState {
  heroImageUrl: string
  flagshipNote: string
  footerNote: string
  homeAnnouncement: YeucaAnnouncementConfig
  homeHero: YeucaHomeHeroConfig
  homeEntries: YeucaHomeEntryCard[]
  featureFlags: YeucaFeatureFlags
  aiWorkflowSteps: YeucaAiWorkflowStep[]
  seasonalRhythm: YeucaSeasonalRhythmItem[]
  archiveTimeline: YeucaTimelineNode[]
  volatileChecklist: YeucaChecklistRow[]
  practiceTopics: YeucaPracticeTopic[]
  starterLinks: YeucaStarterLink[]
  mirrors: YeucaMirrorEntry[]
  scriptOptions: YeucaScriptOption[]
  friendLinks: YeucaFriendLink[]
  competitions: YeucaCompetitionItem[]
  faqs: YeucaFaqItem[]
}

export function createEditableExtrasState(extras: YeucaSiteExtras | undefined): EditableYeucaExtrasState {
  const e = extras ?? {}
  return {
    heroImageUrl: e.heroImageUrl ?? '',
    flagshipNote: e.flagshipNote ?? '',
    footerNote: e.footerNote ?? '',
    homeAnnouncement: e.homeAnnouncement ? { ...e.homeAnnouncement } : { ...DEFAULT_YEUCA_ANNOUNCEMENT },
    homeHero: e.homeHero ? { ...e.homeHero } : { ...DEFAULT_YEUCA_HOME_HERO },
    homeEntries: Array.isArray(e.homeEntries) && e.homeEntries.length
      ? e.homeEntries.map(x => ({ ...x }))
      : DEFAULT_YEUCA_HOME_ENTRIES.map(x => ({ ...x })),
    featureFlags: e.featureFlags ? { ...DEFAULT_YEUCA_FEATURE_FLAGS, ...e.featureFlags } : { ...DEFAULT_YEUCA_FEATURE_FLAGS },
    aiWorkflowSteps: Array.isArray(e.aiWorkflowSteps) && e.aiWorkflowSteps.length
      ? e.aiWorkflowSteps.map(x => ({ ...x }))
      : DEFAULT_YEUCA_AI_WORKFLOW_STEPS.map(x => ({ ...x })),
    seasonalRhythm: Array.isArray(e.seasonalRhythm) && e.seasonalRhythm.length
      ? e.seasonalRhythm.map(x => ({ ...x, tags: [...x.tags] }))
      : DEFAULT_YEUCA_SEASONAL_RHYTHM.map(x => ({ ...x, tags: [...x.tags] })),
    archiveTimeline: Array.isArray(e.archiveTimeline) && e.archiveTimeline.length
      ? e.archiveTimeline.map(x => ({ ...x }))
      : DEFAULT_YEUCA_ARCHIVE_TIMELINE.map(x => ({ ...x })),
    volatileChecklist: Array.isArray(e.volatileChecklist) && e.volatileChecklist.length
      ? e.volatileChecklist.map(x => ({ ...x }))
      : DEFAULT_YEUCA_CHECKLIST.map(x => ({ ...x })),
    practiceTopics: Array.isArray(e.practiceTopics) && e.practiceTopics.length
      ? e.practiceTopics.map(x => ({ ...x, stack: [...x.stack] }))
      : DEFAULT_YEUCA_PRACTICE_TOPICS.map(x => ({ ...x, stack: [...x.stack] })),
    starterLinks: Array.isArray(e.starterLinks) && e.starterLinks.length
      ? e.starterLinks.map(x => ({ ...x }))
      : DEFAULT_YEUCA_STARTER_LINKS.map(x => ({ ...x })),
    mirrors: Array.isArray(e.mirrors) && e.mirrors.length
      ? e.mirrors.map(x => ({ ...x }))
      : DEFAULT_YEUCA_MIRRORS.map(x => ({ ...x })),
    scriptOptions: Array.isArray(e.scriptOptions) && e.scriptOptions.length
      ? e.scriptOptions.map(x => ({ ...x, ps1: [...x.ps1], sh: [...x.sh] }))
      : DEFAULT_YEUCA_SCRIPT_OPTIONS.map(x => ({ ...x, ps1: [...x.ps1], sh: [...x.sh] })),
    friendLinks: Array.isArray(e.friendLinks) && e.friendLinks.length
      ? e.friendLinks.map(x => ({ ...x }))
      : DEFAULT_YEUCA_FRIEND_LINKS.map(x => ({ ...x })),
    competitions: Array.isArray(e.competitions) && e.competitions.length
      ? e.competitions.map(x => ({ ...x }))
      : DEFAULT_YEUCA_COMPETITIONS.map(x => ({ ...x })),
    faqs: Array.isArray(e.faqs) && e.faqs.length
      ? e.faqs.map(x => ({ ...x }))
      : DEFAULT_YEUCA_FAQS.map(x => ({ ...x }))
  }
}
