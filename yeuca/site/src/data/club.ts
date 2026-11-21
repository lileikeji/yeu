/**
 * 仰恩大学计算机协会真实社团静态基础资料。
 * 数据来源：校团委公开社团档案及协会正式公布资料，不含虚构人名、虚构联系方式或假动态。
 */
export interface DeptItem {
  id: string;
  code: string;
  name: string;
  lead: string;
  isFeatured: boolean;
  acceptingRecruit: boolean;
  summary: string;
  focusList: string[];
  tools: string[];
  recentTopic: string;
  recruitDesc: string;
}

export const CLUB_META = {
  name: '仰恩大学计算机协会',
  shortName: '仰恩计协',
  enName: 'YEUCA',
  foundedYear: 1999,
  mergedYear: 2019,
  formerName: '仰恩大学电脑协会',
  mergedWith: '编程协会',
  campus: '福建泉州 · 仰恩大学洛江校区',
  motto: '普及电脑知识、培养创新人才、提高专业技能、创造科技成果',
  tagline: '写能跑的代码、做安全与组网实战，也一起写好用的 AI 工具。',
  intro:
    '官网可直接浏览，不用注册登录。零基础也能加入，第一天先不用挑部门，扫码进迎新群再跟着逛就行。',
} as const;

export const VERIFIED_DEPARTMENTS: DeptItem[] = [
  {
    id: 'dept-ai',
    code: '01 / AI',
    name: 'AI 部',
    lead: '',
    isFeatured: true,
    acceptingRecruit: true,
    summary:
      '一起折腾大模型接口、Agent 工作流和本地文档检索（RAG），把单次问答改写成稳定能用的校内小脚本。',
    focusList: [
      '用脚本串起大模型和外部工具（Tool Calling / MCP）',
      '把长文档拆段，做关键词加向量的检索和效果核对',
      '约束返回 JSON 格式、加字段校验和接口报错重试',
    ],
    tools: ['Python', 'TypeScript', 'LLM API', 'RAG', 'Workflow'],
    recentTopic: 'Agent 工作流搭建与工具调用',
    recruitDesc:
      '不用先懂机器学习数学推导。对 AI 应用有兴趣、愿意跟着写小脚本就能来。',
  },
  {
    id: 'dept-coding',
    code: '02 / CODE',
    name: '编程部',
    lead: '',
    isFeatured: false,
    acceptingRecruit: true,
    summary:
      '平时练蓝桥杯、天梯赛和 ACM 算法题，按周刷题和做模拟测试，有余力也会组队写小工具。',
    focusList: [
      'C++ / Python 基础语法和调试排错',
      '模拟、二分、搜索、动态规划这些常见竞赛题型',
      '软件项目与校赛跨专业组队开发',
    ],
    tools: ['C / C++', 'Python', 'Java', 'OJ'],
    recentTopic: '每周刷题、赛前集训与改错复盘',
    recruitDesc: '没写过代码会从装编译器和语法基础带起；有基础可以直接参加模拟选拔进校队。',
  },
  {
    id: 'dept-network',
    code: '03 / NET',
    name: '网络工程部',
    lead: '',
    isFeatured: false,
    acceptingRecruit: true,
    summary:
      '主要用模拟器练路由交换、VLAN 和 OSPF 配置，备战华为 ICT 大赛和新华三杯，也会请校外网工来做分享。',
    focusList: [
      '路由交换原理、VLAN / OSPF 配置和常见断网排查',
      '华为 ICT 大赛与新华三杯真题拓扑练习',
      '机房排线排查和校外网工技术分享',
    ],
    tools: ['eNSP', 'HCL', 'TCP/IP', 'Linux 网络'],
    recentTopic: '华为 ICT 与新华三杯实操训练',
    recruitDesc: '对网络架构、路由交换或服务器通信原理感兴趣即可，会从基础组网实验带起。',
  },
  {
    id: 'dept-security',
    code: '04 / SEC',
    name: '网络安全部',
    lead: '',
    isFeatured: false,
    acceptingRecruit: true,
    summary:
      '主练 CTF 竞赛和靶场攻防，涉及 Web 漏洞审计、Reverse 逆向和 Pwn 二进制，组队打信息安全竞赛和数据安全大赛。',
    focusList: [
      '常见 Web 漏洞原理与代码排查（SQLi / XSS / SSRF）',
      'Reverse 逆向分析和 Pwn 二进制安全入门',
      '全国大学生信息安全竞赛及省数据安全大赛备赛',
    ],
    tools: ['Python', 'Burp Suite', 'IDA / Ghidra', 'Linux'],
    recentTopic: 'CTF 靶场刷题与安全比赛备赛',
    recruitDesc: '不限年级，刚入门先教搭靶场环境、用抓包工具看请求和打基础题。',
  },
  {
    id: 'dept-ops',
    code: '05 / OPS',
    name: '运维部',
    lead: '',
    isFeatured: false,
    acceptingRecruit: true,
    summary:
      '平时管协会机房服务器、网络和实验硬件，和兄弟社团一起修机房网络，喜欢折腾 Linux 服务和电脑装机的可以直接来。',
    focusList: [
      'Linux 服务器部署、监控与常规故障排查',
      '机房硬件装机、网线压制与实验设备整理',
      '活动现场网络调试和设备排查',
    ],
    tools: ['Linux', 'Docker', 'Nginx', '硬件装机'],
    recentTopic: '机房服务器维护与装机实操',
    recruitDesc: '欢迎喜欢折腾系统服务、路由器或电脑硬件的同学，直接参与机房设备实操。',
  },
  {
    id: 'dept-media',
    code: '06 / MEDIA',
    name: '宣传部',
    lead: '',
    isFeatured: false,
    acceptingRecruit: true,
    summary:
      '负责给平时活动拍照、写官网通知、做招新和比赛海报，把协会做出来的作品和比赛结果清楚记录下来。',
    focusList: [
      '技术分享和比赛现场拍照、剪视频整理成图文',
      '招新海报、活动视觉图排版和官网走查',
      '写官网新动态并核对错别字',
    ],
    tools: ['Figma', 'Photoshop', '摄影剪辑', 'Markdown'],
    recentTopic: '活动图文记录与招新物料设计',
    recruitDesc: '不强制学代码，喜欢作图、拍照、剪视频或写点小文章都可以加入。',
  },
];

export const VERIFIED_COMPETITIONS = [
  {
    name: '第十七届蓝桥杯软件与网络安全双赛道省赛',
    track: '软件 / 安全',
    dept: '编程部 · 网络安全部',
    site: 'dasai.lanqiao.cn',
    href: 'https://dasai.lanqiao.cn/',
  },
  {
    name: '第十届华为 ICT 大赛省赛',
    track: '网络工程',
    dept: '网络工程部',
    site: 'e.huawei.com',
    href: 'https://e.huawei.com/cn/talent/ict-academy/',
  },
  {
    name: '第十九届全国大学生信息安全竞赛半决赛',
    track: '信息安全',
    dept: '网络安全部',
    site: 'ciscn.cn',
    href: 'https://www.ciscn.cn/',
  },
  {
    name: '福建省大学生数据安全大赛',
    track: '数据安全',
    dept: '网络安全部',
    site: '校内外赛事公告',
    href: '',
  },
  {
    name: '「西门子杯」中国智能制造挑战赛校级选拔赛',
    track: '工程实践',
    dept: '编程部 · 运维部',
    site: 'siemenscup-cimc.org.cn',
    href: 'https://www.siemenscup-cimc.org.cn/',
  },
] as const;

export const ARCHIVE_TIMELINE = [
  {
    period: '1999 年',
    tag: '创立',
    title: '创立「仰恩大学电脑协会」',
    detail: '学校早期成立的学生技术社团之一，面向全校开展电脑应用、装机维护与软件普及交流。',
  },
  {
    period: '2019 年',
    tag: '合并',
    title: '电脑协会与编程协会合并更名',
    detail: '两支校内技术社团正式合并为「仰恩大学计算机协会」，把硬件运维与软件开发训练合在一起。',
  },
  {
    period: '延续至今',
    tag: '参赛',
    title: '学科竞赛校队常规训练',
    detail: '长期参加蓝桥杯、华为 ICT 大赛、全国大学生信息安全竞赛等赛事，按日常训练、赛前集训、赛后复盘节奏推进。',
  },
  {
    period: '近年拓展',
    tag: '新设',
    title: '增设 AI 部',
    detail: '在编程、网络、安全、运维与宣传五部基础上单设 AI 部，聚焦大模型工具链、知识检索（RAG）与 Agent 脚本实践。',
  },
] as const;

export const VOLATILE_CHECKLIST = [
  {
    item: '会长、副会长及各部门负责人',
    source: '当学年招新宣讲与通知群公告',
    note: '静态页面不写死往届姓名，换届后以当届群名录为准。',
  },
  {
    item: '招新开关与报名截止时间',
    source: '「加入我们」页与后台实时开关',
    note: '表单直接读取后台开关；平时想来旁听可以在迎新群问值班同学。',
  },
  {
    item: '每周培训时段与机房教室',
    source: '「活动排期」页与通知群消息',
    note: '教室随学期课表微调，以当次活动通知注明的地点为准。',
  },
  {
    item: '官方迎新群二维码',
    source: '「加入我们」页右侧联络区',
    note: '管理员在后台按学年更新，过期时以线下招新摊位新码为准。',
  },
] as const;

export const SEASONAL_RHYTHM = [
  {
    phase: '开学初',
    title: '招新与装环境',
    detail: '百团设点答疑，集中帮新生装编辑器、配置 Git / Python / 模拟器以及国内软件镜像源。',
    tags: ['招新', '环境准备'],
  },
  {
    phase: '学期中',
    title: '分部小课与练习',
    detail: '按组开展 Agent 脚本、算法题单、路由交换、CTF 基础与 Linux 命令练习，一般放在晚间或周末。',
    tags: ['日常训练', '分享'],
  },
  {
    phase: '赛事季',
    title: '校选、集训与参赛',
    detail: '配合蓝桥杯、信息安全竞赛、华为 ICT 等时间表搞校内模拟、跨年级组队与错题复盘。',
    tags: ['校赛', '组队参赛'],
  },
  {
    phase: '考期与假期',
    title: '考试周停更与线上共学',
    detail: '期末复习和考试周暂停线下活动，优先保证大家挂不掉专业课；寒暑假自愿发起线上小项目。',
    tags: ['考期暂停', '线上自愿'],
  },
] as const;

export const DEV_MIRRORS = [
  {
    id: 'npm',
    name: 'Node.js / npm / pnpm 国内镜像',
    source: 'registry.npmmirror.com',
    desc: '解决校内前端包安装卡顿与超时，执行后 pnpm 与 npm 均走国内镜像节点。',
    cmd: 'npm config set registry https://registry.npmmirror.com',
  },
  {
    id: 'pypi',
    name: 'Python pip 国内镜像',
    source: 'pypi.tuna.tsinghua.edu.cn',
    desc: '清华大学开源镜像站 PyPI 源，配置一次即可加速日常科学计算与脚本库安装。',
    cmd: 'pip config set global.index-url https://pypi.tuna.tsinghua.edu.cn/simple',
  },
  {
    id: 'uv',
    name: 'uv Python 环境源环境变量',
    source: 'mirrors.aliyun.com',
    desc: '在使用现代高速工具 uv 创建虚拟环境及装包时指定国内源。',
    cmd: '$env:UV_INDEX_URL="https://mirrors.aliyun.com/pypi/simple/"',
  },
  {
    id: 'git',
    name: 'Git 基础身份初始化（必做）',
    source: 'git-scm.com',
    desc: '提交第一行代码前先设置姓名与校内/常用邮箱，保留清晰提交归属。',
    cmd: 'git config --global user.name "YourName" && git config --global user.email "you@example.com"',
  },
] as const;

export const STARTER_LINKS = [
  {
    dept: 'AI 部',
    title: 'Prompt 与工具调用实验平台',
    host: 'platform.openai.com / deepseek.com',
    url: 'https://api-docs.deepseek.com/',
    note: '阅读 Function Calling 与 JSON Schema 约束官方文档，动手跑通第一个带工具调用的 Python 脚本。',
  },
  {
    dept: '编程部',
    title: '洛谷与 PTA 程序设计练习平台',
    host: 'luogu.com.cn · pintia.cn',
    url: 'https://www.luogu.com.cn/',
    note: '零基础从顺序、分支、循环题单切入，逐步过渡到二分、搜索与动态规划模板题库。',
  },
  {
    dept: '网络工程部',
    title: '华为数通人才与模拟器资料库',
    host: 'e.huawei.com',
    url: 'https://e.huawei.com/cn/talent/',
    note: '了解 HCIA / ICT 大赛考纲与 eNSP 常见 VLAN / OSPF 拓扑排错文档。',
  },
  {
    dept: '网络安全部',
    title: 'CTFHub 技能树与入门靶场',
    host: 'ctfhub.com',
    url: 'https://www.ctfhub.com/',
    note: '按 Web、Crypto、Misc、Reverse 与 Pwn 分类系统刷题，配合 Burp Suite 抓包分析原理。',
  },
  {
    dept: '运维部',
    title: '清华大学开源软件镜像站帮助文档',
    host: 'mirrors.tuna.tsinghua.edu.cn',
    url: 'https://mirrors.tuna.tsinghua.edu.cn/help/',
    note: '涵盖 Ubuntu / Debian / Docker / Conda 等常用系统源的一键替换指南。',
  },
  {
    dept: '宣传部',
    title: 'Markdown 语法与协会规范参考',
    host: 'markdown.com.cn',
    url: 'https://markdown.com.cn/basic-syntax/',
    note: '统一官网新闻公告与活动回顾的基础排版，确保标题层级、列表与代码块清晰可读。',
  },
] as const;

export const PRACTICE_TOPICS = [
  {
    dept: 'AI 部 · 练手题目',
    title: '校园 FAQ 文档检索与引用脚本',
    stack: ['Python', 'Markdown 切分', 'JSON Schema'],
    desc: '把几篇校内资料按标题拆段，写出能附上来源段落名并校验返回 JSON 结构的单轮问答脚本。',
  },
  {
    dept: '编程部 · 练手题目',
    title: 'C++ / Python 50 题基础题单记录',
    stack: ['C++17', 'Git', 'OJ 题解'],
    desc: '按语法、模拟、二分与前缀和顺序把刷过的错题和复杂度笔记传到自己的 Git 仓库里。',
  },
  {
    dept: '网工 / 网安 / 运维 · 练手题目',
    title: '双路由器 OSPF 互通与服务巡检脚本',
    stack: ['eNSP', 'SSH', 'Nginx / systemctl'],
    desc: '先用 eNSP 搭起三层转发并抓包核对路由，再写一段检查指定本地端口和 nginx 状态的小脚本。',
  },
] as const;

export const AI_WORKFLOW_STEPS = [
  {
    id: 'route',
    step: 'STEP 01',
    title: '意图识别与路由',
    role: '区分提问属于「社团与部门介绍」「活动排期查询」还是「技术资料检索」',
    logic: '先过关键词规则，再走轻量分类提示词，把模糊提问转成明确意图标签。',
    pitfall: '不让大模型在缺少明确文档数据时猜测时间或地点。',
    sample: '{ "intent": "query_activity", "dept": "AI 部", "keyword": "Agent 工作流" }',
  },
  {
    id: 'rag',
    step: 'STEP 02',
    title: '文档切块与双路召回',
    role: '从社团活动档案和学习笔记中定位可核对原文片段',
    logic: '采用「标题层级切分 + 关键词 BM25 + 向量检索」混合召回，保留原文标题与出处。',
    pitfall: '专有名词、学号规则与命令参数不能只靠向量模糊匹配，必须保留关键词召回。',
    sample: '[chunk#08] notes/rag-guide.md · "检索片段需保留来源段落，回答附带核对出处"',
  },
  {
    id: 'tool',
    step: 'STEP 03',
    title: '工具调用与状态核验',
    role: '按显式参数签名调用后台只读接口获取实时活动与招新开关',
    logic: '把实时排期或报名通道开关作为结构化工具返回值注入上下文，避免使用静态旧通知。',
    pitfall: '接口无数据时直接说明暂未发布，不用模板话术凑答案。',
    sample: 'GET /api/public/yeuca/site -> 200 OK (real-time club status)',
  },
  {
    id: 'guard',
    step: 'STEP 04',
    title: 'Schema 校验与异常重试',
    role: '校验模型输出 JSON 结构，保证脚本与页面拿到的字段稳定可用',
    logic: '先正则剥离多余代码块围栏字符，再用 Zod 校验必填字段，异常时最多限次重试一次。',
    pitfall: '绝不在未经剥离与校验的情况下直接假设 LLM 输出可直接渲染。',
    sample: '{ "status": "ok", "verified": true, "source": "dept-ai" }',
  },
] as const;

export const CLUB_FAQS = [
  {
    q: '完全零基础，电脑都没怎么折腾过，可以加入吗？',
    a: '可以。不管什么专业、以前有没有敲过代码，开学各部门都会从装编辑器和配置环境开始带。',
  },
  {
    q: '加入计协跟专业课学习会冲突吗？',
    a: '交流和培训一般放在晚上或周末非上课时间，自愿过来；期末复习周和考试周会暂停常规活动，先顾好自己课程考试。',
  },
  {
    q: '各个部门之间怎么选？能不能跨组旁听？',
    a: '想做 AI 应用和小脚本选 AI 部；想练算法题打蓝桥杯选编程部；偏爱配路由交换选网络工程部；对 CTF 靶场安全感兴趣选网络安全部；爱折腾 Linux 和拆装电脑选运维部；想做海报摄影或写文选宣传部。协会内公开分享课都可以跨组旁听。',
  },
  {
    q: '参加竞赛需要很厉害才让报名吗？',
    a: '不用很厉害才能报。平时都是从简单题和基础拓扑练起，赛前按当前进度组队报名，会有模拟赛帮忙挑出问题。',
  },
  {
    q: '没有独立显卡或高性能电脑，也能参与 AI 部和编程训练吗？',
    a: '可以。入门写 Python 脚本、工作流编排和算法题在普通轻薄本上都能跑，大模型调用走接口就行，不用本地显卡。',
  },
  {
    q: '加入以后一定要一直写代码或者强制打比赛吗？',
    a: '不强制。比赛是自愿报名；不喜欢一直写代码也可以去运维部摸真机器材，或去宣传部拍照、做海报和整理文章。',
  },
  {
    q: '错过了集中招新时间还能加入吗？',
    a: '可以看看「加入我们」页的表单有没有开放；就算错过了集中招新，也可以加群找值班学长打声招呼，平时先来旁听再补登记。',
  },
  {
    q: '提交报名信息后多久会有回复？我的隐私安全吗？',
    a: '报名表由负责人定期统一查看，一般当周或集中迎新后通过你留的 QQ/微信联系；手机号和学号绝不会上公开网页。',
  },
] as const;

export const FLAGSHIP_LINKED_PROJECT = {
  id: 'yeu-campus-guide',
  tag: '在跑大项目 · 仰恩校园服务',
  name: 'YeU · 仰恩大学迎新指南与校园服务平台',
  host: 'yx.huiliyill.cn',
  url: 'https://yx.huiliyill.cn/',
  clubProfileUrl: 'https://yx.huiliyill.cn/clubs/computer-association',
  githubUrl: 'https://github.com/lileikeji/yeu',
  giteeUrl: 'https://gitee.com/lilei1529/yeu',
  maintainersNote: '协会成员自己写出来并一直在维护的校内应用，和主站共用活动和报名后台数据。',
  summary:
    '给仰恩新生查校车路线、看校园地图、查报到问题和社团信息的网站，背后也管着计协官网的动态发布和招新表数据。',
  modules: [
    '新生报到清单、宿舍分区、校园网与常见问答检索',
    '校园地点地图、公交校巴班次和常用电话查询',
    '全校社团索引以及计算机协会简介、活动和招新表',
    '适配手机和微信打开的轻快网页',
  ],
  stack: ['Nuxt 4', 'Vue 3', 'Nitro', 'Drizzle ORM', 'SQLite', '本地检索', 'Tailwind CSS'],
} as const;
