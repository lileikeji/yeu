import type { YeucaDepartment } from '../types/yeuca'

export const COMPUTER_ASSOCIATION_SLUG = 'computer-association'
export const COMPUTER_ASSOCIATION_TITLE = '计算机协会'

/**
 * 仰恩大学计算机协会（1999 年创立，2019 年电脑协会与编程协会合并更名）基础公开资料。
 * 部门配置对应实际运行架构：AI 部 + 原五大部门（编程 / 网络工程 / 网络安全 / 运维 / 宣传）。
 * 不包含任何假动态、假活动、假人员名单或虚构联系方式。
 */
export const YEUCA_HISTORY_FACTS = {
  foundedYear: 1999,
  mergedYear: 2019,
  formerName: '仰恩大学电脑协会',
  mergedWith: '编程协会',
  motto: '普及电脑知识、培养创新人才、提高专业技能、创造科技成果',
  campus: '福建泉州 · 仰恩大学洛江校区'
} as const

export const DEFAULT_YEUCA_TAGLINE = '写能跑的代码、做安全与组网实战，也一起写好用的 AI 工具。'

export const DEFAULT_YEUCA_INTRO
  = '官网可直接浏览，不用注册登录。零基础也能加入，第一天先不用挑部门，扫码进迎新群再跟着逛就行。'

export const DEFAULT_YEUCA_DEPARTMENTS: YeucaDepartment[] = [
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
      '约束返回 JSON 格式、加字段校验和接口报错重试'
    ],
    tools: ['Python', 'TypeScript', 'LLM API', 'RAG / SQLite-vec', 'Workflow'],
    recentTopic: 'Agent 工作流搭建',
    recruitDesc:
      '不用先懂机器学习数学推导。对 AI 应用有兴趣、愿意跟着写小脚本就能来。'
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
      '软件项目与校赛跨专业组队开发'
    ],
    tools: ['C / C++', 'Python', 'Java', 'OJ'],
    recentTopic: '每周刷题、赛前集训与改错复盘',
    recruitDesc:
      '没写过代码会从装编译器和语法基础带起；有基础可以直接参加模拟选拔进校队。'
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
      '机房排线排查和校外网工技术分享'
    ],
    tools: ['eNSP', 'HCL', 'TCP/IP', 'Linux 网络'],
    recentTopic: '华为 ICT 与新华三杯实操训练',
    recruitDesc:
      '对网络架构、路由交换或服务器通信原理感兴趣即可，会从基础组网实验带起。'
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
      '全国大学生信息安全竞赛及省数据安全大赛备赛'
    ],
    tools: ['Python', 'Burp Suite', 'IDA / Ghidra', 'Linux'],
    recentTopic: 'CTF 靶场刷题与安全比赛备赛',
    recruitDesc:
      '不限年级，刚入门先教搭靶场环境、用抓包工具看请求和打基础题。'
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
      '活动现场网络调试和设备排查'
    ],
    tools: ['Linux', 'Docker', 'Nginx', '硬件装机'],
    recentTopic: '机房服务器维护与装机实操',
    recruitDesc:
      '欢迎喜欢折腾系统服务、路由器或电脑硬件的同学，直接参与机房设备实操。'
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
      '写官网新动态并核对错别字'
    ],
    tools: ['Figma', 'Photoshop', '摄影剪辑', 'Markdown'],
    recentTopic: '活动图文记录与招新物料设计',
    recruitDesc:
      '不强制学代码，喜欢作图、拍照、剪视频或写点小文章都可以加入。'
  }
]

export const VERIFIED_YEUCA_COMPETITIONS: Array<{
  name: string
  category: string
  dept: string
}> = [
  { name: '第十七届蓝桥杯软件与网络安全双赛道省赛', category: '程序 / 安全', dept: '编程部 · 网络安全部' },
  { name: '第十届华为 ICT 大赛省赛', category: '网络工程', dept: '网络工程部' },
  { name: '第十九届全国大学生信息安全竞赛半决赛', category: '信息安全', dept: '网络安全部' },
  { name: '福建省大学生数据安全大赛', category: '数据安全', dept: '网络安全部' },
  { name: '「西门子杯」中国智能制造挑战赛校级选拔赛', category: '工程实践', dept: '编程部 · 运维部' }
]
