import type {
  ActivityItem,
  ClubProfile,
  DepartmentItem,
  NewsPost,
  ProjectItem,
  RecruitFormConfig,
  RecruitSubmission,
  ResourceItem,
} from '../types/portal';

export const SEED_PROFILE: ClubProfile = {
  slug: 'computer-association',
  name: '仰恩大学计算机协会',
  shortName: '仰恩计协',
  campus: '福建泉州 · 仰恩大学洛江校区',
  tagline: '在仰恩写能跑的代码、搭实用的 Agent，把想法做出实物。',
  intro:
    '仰恩大学校内计算机实践社团。围绕 AI 智能体工作流、校内 Web 工具、算法竞赛与界面设计每周共学，零基础也能从第一个可用作品做起。',
  contactWechat: '仰恩大学计算机协会（绑定后在此显示）',
  contactQqGroup: '秋季招新咨询群（提交报名表后自动获取入群方式）',
  yeuApiBase: 'https://yx.huiliyill.cn',
  syncMode: 'sandbox',
};

export const SEED_DEPARTMENTS: DepartmentItem[] = [
  {
    id: 'dept-ai',
    code: '01 / AI',
    name: 'AI 部',
    isFeatured: true,
    lead: '负责人待后台补充',
    summary:
      '围绕大模型应用开发、Agent 工作流编排与 RAG 知识库展开实践，重点解决实际学习与开发中的重复劳动，不只是空聊概念。',
    focusList: [
      'Agent 工作流搭建与工具调用（Tool Calling / MCP）',
      '校园问答知识库（RAG 切分、检索与评测）',
      'Prompt 结构化设计与本地模型接口容错',
    ],
    tools: ['Python', 'TypeScript', 'LLM API', 'RAG / SQLite-vec', 'Workflow'],
    recentTopic: 'Agent 工作流搭建实战：从单次对话到多步工具编排',
    recruitDesc:
      '不要求先会深度学习数学推导。会写基础 Python / JS 或对 AI 应用工具感兴趣就能跟进，入部后会带做可运行的小型 Agent。',
    acceptingRecruit: true,
  },
  {
    id: 'dept-dev',
    code: '02 / DEV',
    name: '技术研发部',
    lead: '负责人待后台补充',
    summary:
      '负责协会官网、校园效率工具与跨项目接口联调。和校内迎新指南系统（yeu）协同维护，让写出来的代码真正跑到线上服务同学。',
    focusList: [
      'Vue / Nuxt 前端页面开发与移动端走查',
      'Node / SQLite 轻量化接口设计与表单联调',
      'Git 分支协作、Linux 基础与制品发布流程',
    ],
    tools: ['Vue 3', 'Nuxt', 'TypeScript', 'SQLite', 'Nginx'],
    recentTopic: '把静态网页接进校园服务后端：CORS、表单校验与上线走查',
    recruitDesc:
      '适合想动手做网页、桌面工具或后端接口的同学。每周一次代码走读，新人可以从修复一个页面组件开始提交第一个 PR。',
    acceptingRecruit: true,
  },
  {
    id: 'dept-algo',
    code: '03 / ALGO',
    name: '算法竞赛部',
    lead: '负责人待后台补充',
    summary:
      '组织校内算法入门带练与蓝桥杯、团体程序设计天梯赛、ICPC 备赛集训。按梯度刷题、讲清思路，不做无效内卷。',
    focusList: [
      'C++ / Python 基础语法与复杂度分析入门',
      '二分、前缀和、搜索、动态规划阶梯训练',
      '赛前模拟赛组织与赛后题解归档',
    ],
    tools: ['C++17', 'Python 3', 'VS Code', 'OJ 评测'],
    recentTopic: '算法夜谈：从 A+B 到第一道省赛模拟真题怎么跨步',
    recruitDesc:
      '零比赛经验完全欢迎。我们会从标准输入输出、数组边界和 OJ 常见报错带起，逐步组队参加春季各类程序设计赛。',
    acceptingRecruit: true,
  },
  {
    id: 'dept-ux',
    code: '04 / DESIGN',
    name: '视觉与产品部',
    lead: '负责人待后台补充',
    summary:
      '承担社团活动海报、网站界面走查、技术文章配图与交互原型制作，让技术项目不只是能跑，还要好用、耐看。',
    focusList: [
      '校园活动主视觉海报与推文排版',
      'Web / 小程序界面原型设计与可用性走查',
      '技术分享实拍记录与视频剪辑',
    ],
    tools: ['Figma', 'HTML / CSS', 'Photoshop', '剪映'],
    recentTopic: '技术产品怎么告别粗糙表单脸：字距、留白与信息层级',
    recruitDesc:
      '会做图、会剪视频，或者对界面审美有想法都适合来。你会和 AI 部、技术研发部一起把真实的校园产品打磨落地。',
    acceptingRecruit: true,
  },
  {
    id: 'dept-ops',
    code: '05 / OPS',
    name: '组织办公室',
    lead: '负责人待后台补充',
    summary:
      '统筹协会日常运转、教室借用申请、招新名录归档与跨社团对接，保证每次讲座和比赛都有场地、有通知、有记录。',
    focusList: [
      '每学期活动排期、机房与教室借用报备',
      '招新报名表导出整理（按班级+姓名归档）',
      '社团物资管理与校外/友校技术社团联络',
    ],
    tools: ['飞书文档', 'Excel / docx 导出', 'YEU 组织后台'],
    recentTopic: '秋季招新流程标准化：线上填表到面试分组通知衔接',
    recruitDesc:
      '不写代码也能在计协发挥关键作用。适合做事细致、擅长协调沟通、想参与大型校园技术活动组织的同学。',
    acceptingRecruit: true,
  },
];

export const SEED_NEWS: NewsPost[] = [
  {
    id: 'news-1',
    slug: 'ai-agent-workflow-workshop',
    title: 'AI 部专场分享回顾：「Agent 工作流搭建」从零跑通一个资料助手',
    deptId: 'dept-ai',
    deptName: 'AI 部',
    tags: ['AI部', 'Agent', '技术分享'],
    summary:
      '周四晚两小时实战回顾：不堆砌数学公式，直接拆解 Prompt 结构化、工具调用与异常兜底，带现场同学跑通了第一个能查校园资料的工作流。',
    body: `这次 AI 部的专场分享没有从 Transformer 论文讲起，而是直接带着大家在笔记本上跑通一个真实可用的小工作流。

### 现场拆解的三个核心环节
1. **把单轮聊天拆成节点**：区分「意图识别 → 检索校园文档 → 组织带出处回答」，避免大模型直接瞎编校内规则。
2. **结构化输出与容错**：针对模型偶尔返回 Markdown 代码块包裹或字段缺失的问题，现场演示了 JSON Schema 校验与自动重试。
3. **环境变量与密钥安全**：演示如何通过 \`.env\` 管理接口密钥，不把 Token 写死在提交给 Git 仓库的代码里。

### 接下来 AI 部会做什么
下阶段会围绕「校内知识库评测」和「轻量端侧视觉应用」组织小组实战，感兴趣的同学可以直接在报名表里勾选「AI 部」。`,
    status: 'published',
    pinned: true,
    publishedAt: '2026-11-12',
  },
  {
    id: 'news-2',
    slug: 'yeu-portal-integration',
    title: '计协官网新版前端启动：将与仰恩迎新指南（yeu）后台打通联动',
    deptId: 'dept-dev',
    deptName: '技术研发部',
    tags: ['网站开发', '前后端联动', '公告'],
    summary:
      '新版官网不再把公告、活动和报名表写死在代码里。技术研发部正在对接学校迎新指南系统的组织后台，未来发动态和审报名表都在同一套后台完成。',
    body: `过去社团的信息经常散落在 QQ 群公告和过期海报里，换届一两次，很多活动记录和项目代码就找不到了。

为了解决维护断层问题，新版官网按以下思路重新梳理：
- **内容由后台发布**：动态、活动排期、部门职责和项目墙都可以直接在组织后台增删改，不用每次找人改代码。
- **纳新直连校内系统**：报名表直接对齐 \`yeu\` 迎新指南的正式纳新接口，支持意向部门多选、班级姓名校验，以及按「专业班级+姓名」自动整理入会文档。
- **保留纯前台浏览体验**：访客看到的官网依旧轻快克制，手机端打开无广告、无多余弹窗。`,
    status: 'published',
    pinned: false,
    publishedAt: '2026-11-08',
  },
  {
    id: 'news-3',
    slug: '2026-autumn-recruit',
    title: '2026 秋季纳新开放：五大部门同步招新，零基础亦可报名',
    deptId: 'dept-ops',
    deptName: '组织办公室',
    tags: ['招新', '通知'],
    summary:
      'AI 部、技术研发部、算法竞赛部、视觉与产品部、组织办公室同时开放线上报名。填写基本信息与感兴趣的方向即可，不限专业与年级。',
    body: `无论你是刚接触电脑想学写第一行代码的 26 级新生，还是已经做过小工具、打过比赛的同学，都可以申请加入仰恩大学计算机协会。

### 报名说明
- 支持同时勾选 **1～2 个意向部门**，不确定具体方向也可以在自我介绍里写上你想学或想做的事。
- 提交后由各部门负责人分批联系，后续见面会与破冰时间会在本网站「活动」页与招新群同步更新。
- 期末复习周与考试周期间协会暂停常规活动，保证大家的课程学习时间。`,
    status: 'published',
    pinned: false,
    publishedAt: '2026-10-28',
  },
];

export const SEED_ACTIVITIES: ActivityItem[] = [
  {
    id: 'act-1',
    slug: 'agent-workflow-lab-2',
    title: 'AI 部实战夜：用本地工具链搭一个校园课程/资料检索 Agent',
    deptId: 'dept-ai',
    deptName: 'AI 部',
    category: 'AI工作坊',
    date: '2026-11-21',
    timeRange: '19:00 - 21:00',
    place: '教学区机房（具体教室以群通知为准）',
    recruitState: 'open',
    status: 'published',
    capacity: '40 人（建议自带笔记本）',
    summary:
      '手把手带做：把一份 PDF/Markdown 校内资料切分入库，接入函数调用让 Agent 根据原文回答问题并附上参考页码。',
    body: `### 活动流程
- **19:00 - 19:25**：为什么直接把整篇文档塞给大模型会漏细节（上下文与检索原理简讲）
- **19:25 - 20:20**：上机实操——文档切分、关键词 + 向量召回、构造带引用约束的提示词
- **20:20 - 21:00**：现场答疑与小组成果演示，自由组队认领后续校园小工具开发任务

### 课前准备
- 电脑提前安装 Python 3.10+ 或 Node.js 22+（不会装可提前 15 分钟到现场找技术部学长协助）。
- 未加入协会的同学也可通过报名表备注「参加 AI 部实操夜」旁听。`,
  },
  {
    id: 'act-2',
    slug: 'algo-night-02',
    title: '算法夜谈 02：前缀和、二分与第一场 90 分钟校内模拟赛',
    deptId: 'dept-algo',
    deptName: '算法竞赛部',
    category: '算法训练',
    date: '2026-11-28',
    timeRange: '18:30 - 21:00',
    place: '计算机基础实验室（暂定）',
    recruitState: 'planned',
    status: 'published',
    capacity: '不限（按机房座位数安排）',
    summary:
      '面向准备参加蓝桥杯和校赛的同学：前 40 分钟串讲二分答案与前缀和常见模板，后 90 分钟 4 道阶梯题现场评测复盘。',
    body: `### 适合谁来
- 已经学过循环与数组，但碰到中等题还是容易超时（TLE）或找不到突破口的同学。
- 现场只讲思路拆解，不背玄学模板；赛后题解会整理发布到协会项目与资料库。`,
  },
  {
    id: 'act-3',
    slug: 'vue-yeu-workshop',
    title: 'Web 工程工作坊：前后端联调实战与社团后台体验',
    deptId: 'dept-dev',
    deptName: '技术研发部',
    category: '技术分享',
    date: '2026-11-05',
    timeRange: '19:00 - 20:45',
    place: '新区教学楼多媒体教室',
    recruitState: 'done',
    status: 'published',
    capacity: '已结束',
    summary:
      '拆解了一个完整表单如何从浏览器校验出发，经过接口鉴权、数据库落盘再到后台表格导出，现场完成了接口联调演示。',
    body: `本次工作坊已经顺利结束，重点带大家理清了：
1. 前端组件化拆分与接口类型契约（TypeScript Schema 共用）；
2. 表单提交时的防重复提交与友好的中文错误提示；
3. 如何从本地开发环境安全打包发布到线上服务器。`,
  },
];

export const SEED_PROJECTS: ProjectItem[] = [
  {
    id: 'proj-1',
    title: '智能工作台与校园 Agent 工作流实践',
    deptId: 'dept-ai',
    deptName: 'AI 部',
    track: 'AI / Agent',
    status: 'active',
    stack: ['Python', 'TypeScript', 'MCP / Tool Call', 'RAG'],
    summary:
      '围绕校内文档检索、双路召回与多工具路由打造的智能体工作台实践案例（关联软著作品 OmniAgent 架构），作为 AI 部带新研习主线。',
    highlights: [
      '文档切分 + 混合检索（BM25 / 向量召回），回答附原文出处',
      'Prompt 结构化约束 + 模型返回 JSON 自动修复与超时重试',
      '支持在部门分享会上拆解为 4 步可复现小实验',
    ],
    previewImage: '/images/proj-omni.jpg',
    imageCaption: '成员大模型工作台实景界面（AI 部工作流研习参照案例）',
    repoUrl: 'https://github.com/yeuca-lab/campus-agent-starter',
    demoUrl: '#news',
    updatedAt: '2026-11-12',
  },
  {
    id: 'proj-2',
    title: '仰恩迎新指南（yeu）与社团后台联动体系',
    deptId: 'dept-dev',
    deptName: '技术研发部',
    track: 'Web / 校内工具',
    status: 'active',
    stack: ['Vue 3', 'Nuxt', 'Drizzle', 'SQLite'],
    summary:
      '校内真实上线的迎新指南系统（yx.huiliyill.cn），涵盖校园地图、办事流程与社团纳新系统。计协官网可直接与其组织后台与纳新接口前后端联立。',
    highlights: [
      '对接 /api/public/clubs/computer-association 与 /api/public/recruit/*',
      '组织管理员在后台新建活动或动态，前台即时同步展示',
      '支持专业班级+姓名自动化归档导出入会 Word 申请表',
    ],
    previewImage: '/images/proj-yeu-map.jpg',
    imageCaption: '仰恩迎新指南实景：校内教学楼、宿舍区与活动场地坐标体系',
    repoUrl: 'https://github.com/yeuca-lab/yeuca-portal',
    demoUrl: '#join',
    updatedAt: '2026-11-16',
  },
  {
    id: 'proj-3',
    title: '蓝桥杯 / 天梯赛阶梯入门题单',
    deptId: 'dept-algo',
    deptName: '算法竞赛部',
    track: '算法竞赛',
    status: 'maintaining',
    stack: ['C++17', 'Python', 'Markdown'],
    summary:
      '按大一新生认知顺序梳理的 60 道基础练手题，从输入输出、模拟、二分到基础动态规划，每题附思路卡点提示，不做盲目刷题。',
    highlights: [
      '第 0 阶段：OJ 判题机制、输入输出加速、常见 WA/TLE 排查',
      '第 1–2 阶段：排序、前缀和、二分答案与基础搜索',
      '每周「算法夜谈」配合 90 分钟校内模拟题现场复盘',
    ],
    repoUrl: 'https://github.com/yeuca-lab/algo-ladder',
    demoUrl: '',
    updatedAt: '2026-10-30',
  },
  {
    id: 'proj-4',
    title: '校内课程表导出日历小工具（构想）',
    deptId: 'dept-dev',
    deptName: '技术研发部',
    track: 'Web / 校内工具',
    status: 'planning',
    stack: ['纯前端', 'ICS 生成'],
    summary:
      '把本地导出的课表文件在浏览器里直接解析成标准 .ics 日历文件，一键导入手机日程提醒，不经第三方服务器也不保存学号密码。',
    highlights: [
      '零后端存储，完全在本地浏览器完成文件解析与时间换算',
      '适配仰恩作息时间表与单双周课程排期规则',
    ],
    repoUrl: '',
    demoUrl: '',
    updatedAt: '2026-11-02',
  },
];

export const SEED_RESOURCES: ResourceItem[] = [
  {
    id: 'res-1',
    title: 'Agent 与大模型 API 接入避坑笔记',
    kind: '实践笔记',
    deptName: 'AI 部',
    summary:
      '整理了新手调用模型接口最常踩的四个坑：Key 泄露进仓库、JSON 解析被代码块包裹、超时重试和流式响应断行处理。',
    body: `### 1. 绝不把 API Key 写进前端或提交到 Git
在服务端或本地脚本中使用环境变量 \`process.env.OPENAI_API_KEY\`，仓库里只放 \`.env.example\`。

### 2. 结构化输出不要裸调 \`JSON.parse\`
不少模型即使在提示词里写了「只输出 JSON」，依然可能外包一层 \`\`\`json ... \`\`\`。解析前先做一次正则剥离围栏字符，再做字段 Schema 校验。

### 3. 设好超时与幂等重试
给每次请求设置合理 \`timeout\`，只在网络抖动或 429/5xx 时做指数退避重试，避免死循环消耗额度。`,
    externalUrl: '',
    updatedAt: '2026-11-12',
  },
  {
    id: 'res-2',
    title: '新生 Git 协作 5 条高频命令速查',
    kind: '入门手册',
    deptName: '技术研发部',
    summary:
      '给第一次和学长一起改代码的同学看：从 clone、切新分支、提交规范到提 PR 遇到冲突怎么先保住本地修改。',
    body: `### 社团项目日常协作流程
1. \`git clone <repo>\` 拉取仓库到本地。
2. \`git checkout -b feat/your-task\` 永远不在 main 分支直接硬改。
3. \`git status\` 和 \`git diff\` 先看清改了哪些文件再 \`git commit\`。
4. 推到远端后在仓库界面发起 Pull Request，等一位成员 Review 后再合并。`,
    externalUrl: '',
    updatedAt: '2026-10-25',
  },
  {
    id: 'res-3',
    title: '校内开发环境常用镜像与装机清单',
    kind: '环境清单',
    deptName: '技术研发部',
    summary:
      '校园网环境下 Node/pnpm、Python pip/uv、VS Code 扩展的国内加速源配置，以及大一同学买笔记本时的硬件底线建议。',
    body: `### 常用包管理加速源
- **npm / pnpm**：\`pnpm config set registry https://registry.npmmirror.com\`
- **pip / uv**：\`pip config set global.index-url https://mirrors.aliyun.com/pypi/simple/\`

### 新生购机三条硬原则
1. **内存优先 16GB 起步**（跑 IDE、浏览器多标签和本地实验环境最吃内存，8GB 很快见底；如果预算允许直接上 32GB）。
2. **硬盘至少 512GB NVMe**，不要买 256GB 丐版。
3. 不买花哨的所谓高刷新低色域噱头机，优先看屏幕素质、键盘手感和售后网点。`,
    externalUrl: '',
    updatedAt: '2026-10-15',
  },
];

export const SEED_RECRUIT_CONFIG: RecruitFormConfig = {
  status: 'open',
  title: '仰恩大学计算机协会 · 2026 秋季纳新报名表',
  slogan: '有想法就一起来搭出来——五大部门同步开放报名',
  intro:
    '表单数据与校内迎新指南（yeu）社团纳新系统同构。填写完成后可在右上角切换「组织后台」立即查看收件记录并测试前后端联动。',
  requireStudentNo: false,
  paymentEnabled: false,
  paymentNote: '当前免收线上报名费，提交后由对应部门负责人在群内或通过所留联系方式沟通。',
};

export const SEED_SUBMISSIONS: RecruitSubmission[] = [
  {
    id: 'sub-demo-1',
    name: '陈同学',
    gender: '男',
    studentNo: '126920260118',
    className: '26计算机1班',
    phone: '13800138001',
    qq: '1029384756',
    departments: ['AI 部', '技术研发部'],
    isLeagueMember: '是',
    intro: '之前用 Dify 试着搭过一个整理专业课笔记的小工作流，想来 AI 部系统学下代码接入和 RAG。',
    paymentConfirmed: false,
    createdAt: '2026-11-15 20:14',
  },
  {
    id: 'sub-demo-2',
    name: '林同学',
    gender: '女',
    studentNo: '126920260205',
    className: '26数字媒体1班',
    phone: '13900139002',
    qq: '2938475610',
    departments: ['视觉与产品部', 'AI 部'],
    isLeagueMember: '是',
    intro: '熟悉 Figma 和 PS，想参与协会网站和 AI 小工具的界面设计与海报排版。',
    paymentConfirmed: false,
    createdAt: '2026-11-16 14:32',
  },
];
