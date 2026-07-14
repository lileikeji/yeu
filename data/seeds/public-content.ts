export interface PublicSource {
  title: string
  publisher: string
  url: string
  accessedAt: string
  context?: string
}

export interface GuideSection {
  title: string
  icon: string
  description?: string
  items: string[]
  notice?: string
  sources?: PublicSource[]
}

export interface FreshmanGuide {
  slug: string
  title: string
  shortTitle: string
  summary: string
  icon: string
  category: 'arrival' | 'campus' | 'life' | 'community'
  audience: Array<'本科新生' | '专升本新生'>
  readMinutes: number
  status: 'verified' | 'partial' | 'awaiting-notice'
  statusText: string
  updatedAt: string
  leadNotice: string
  sections: GuideSection[]
  sources: PublicSource[]
}

export interface OfficialDepartment {
  name: string
  summary: string
  website: string
  phone?: string
  email?: string
}

export interface OfficialClub {
  slug: string
  name: string
  summary: string
  source: PublicSource
}

const accessedAt = '2026-07-13'

export const officialSources = {
  university: {
    title: '仰恩大学官网',
    publisher: '仰恩大学',
    url: 'https://web.yeu.edu.cn/',
    accessedAt
  },
  schoolProfile: {
    title: '学校概况',
    publisher: '仰恩大学',
    url: 'https://www.yeu.edu.cn/xxgk_1271/list.htm',
    accessedAt
  },
  serviceGuide: {
    title: '服务指南',
    publisher: '仰恩大学',
    url: 'https://web.yeu.edu.cn/fwzn/list.htm',
    accessedAt
  },
  admissions: {
    title: '仰恩大学招生办公室',
    publisher: '仰恩大学招生办公室',
    url: 'https://zhaosheng.yeu.edu.cn/',
    accessedAt
  },
  undergraduatePlan2026: {
    title: '2026年普通本科招生计划',
    publisher: '仰恩大学招生办公室',
    url: 'https://zhaosheng.yeu.edu.cn/2026/0625/c184a57138/page.htm',
    accessedAt
  },
  undergraduateRules2026: {
    title: '仰恩大学2026年普通高考招生章程',
    publisher: '仰恩大学招生办公室',
    url: 'https://zhaosheng.yeu.edu.cn/2026/0512/c185a56087/page.htm',
    accessedAt
  },
  transferRules2026: {
    title: '2026年专升本招生章程',
    publisher: '仰恩大学招生办公室',
    url: 'https://zhaosheng.yeu.edu.cn/2026/0413/c185a55523/page.htm',
    accessedAt
  },
  transferArchive2026: {
    title: '仰恩大学2026年专升本学生档案邮寄说明',
    publisher: '仰恩大学招生办公室',
    url: 'https://zhaosheng.yeu.edu.cn/2026/0429/c183a55895/page.htm',
    accessedAt: '2026-07-15'
  },
  academicCalendar2026Fall: {
    title: '仰恩大学2026-2027学年第一学期校历',
    publisher: '仰恩大学学校办公室',
    url: 'https://bgs.yeu.edu.cn/2026/0710/c1102a57503/page.htm',
    accessedAt
  },
  teachingOffice: {
    title: '仰恩大学教务部',
    publisher: '仰恩大学教务部',
    url: 'https://jwb.yeu.edu.cn/',
    accessedAt
  },
  financeContact: {
    title: '仰恩大学财务处联系方式',
    publisher: '仰恩大学财务处',
    url: 'https://uf.yeu.edu.cn/2023/1218/c1138a41864/page.htm',
    accessedAt
  },
  studentAffairs: {
    title: '学生事务部',
    publisher: '仰恩大学学生事务部',
    url: 'https://xsb.yeu.edu.cn/',
    accessedAt
  },
  informationOffice: {
    title: '实验室与信息化管理处',
    publisher: '仰恩大学实验室与信息化管理处',
    url: 'https://metc.yeu.edu.cn/',
    accessedAt
  },
  campusNetwork: {
    title: '仰恩大学校园网使用指南（2025版）',
    publisher: '仰恩大学实验室与信息化管理处',
    url: 'https://metc.yeu.edu.cn/2025/1006/c1324a51853/page.htm',
    accessedAt: '2026-07-14'
  },
  dormRules2025: {
    title: '仰恩大学学生宿舍管理办法',
    publisher: '仰恩大学总务处',
    url: 'https://zwc.yeu.edu.cn/2025/1015/c497a52035/page.htm',
    accessedAt: '2026-07-14'
  },
  dormAirConditioning2025: {
    title: '学生宿舍空调使用管理规定',
    publisher: '仰恩大学总务处',
    url: 'https://zwc.yeu.edu.cn/2025/1016/c1350a52106/page.htm',
    accessedAt
  },
  dormMaintenance2025: {
    title: '学生宿舍维修管理规定',
    publisher: '仰恩大学总务处',
    url: 'https://zwc.yeu.edu.cn/2025/1016/c1350a52107/page.htm',
    accessedAt: '2026-07-14'
  },
  repairProcess2025: {
    title: '报修流程',
    publisher: '仰恩大学总务处',
    url: 'https://zwc.yeu.edu.cn/2025/1015/c500a52071/page.htm',
    accessedAt: '2026-07-14'
  },
  dormChangeProcess2025: {
    title: '学生宿舍调换申请流程',
    publisher: '仰恩大学总务处',
    url: 'https://zwc.yeu.edu.cn/2025/1015/c500a52072/page.htm',
    accessedAt: '2026-07-14'
  },
  diningStallLease2026: {
    title: '仰恩大学餐厅档口招租公告',
    publisher: '仰恩大学总务处',
    url: 'https://zwc.yeu.edu.cn/2026/0708/c496a57428/page.htm',
    accessedAt: '2026-07-14'
  },
  libraryHours: {
    title: '图书馆开馆时间',
    publisher: '仰恩大学图书馆',
    url: 'https://library.yeu.edu.cn/161/list.htm',
    accessedAt
  },
  libraryContact: {
    title: '图书馆联系方式',
    publisher: '仰恩大学图书馆',
    url: 'https://library.yeu.edu.cn/164/list.htm',
    accessedAt
  },
  libraryBorrowingRules: {
    title: '图书馆借阅规定',
    publisher: '仰恩大学图书馆',
    url: 'https://library.yeu.edu.cn/198/list.htm',
    accessedAt: '2026-07-14'
  },
  libraryWechatBinding2025: {
    title: '微信平台绑定借阅证流程',
    publisher: '仰恩大学图书馆',
    url: 'https://library.yeu.edu.cn/2025/0226/c193a47629/page.htm',
    accessedAt: '2026-07-14'
  },
  medicalOfficeProfile2025: {
    title: '仰恩大学医务室简介',
    publisher: '仰恩大学医务室',
    url: 'https://www.yeu.edu.cn/2025/1031/c1382a53106/page.htm',
    accessedAt
  },
  admissionFraudWarning2026: {
    title: '高考诈骗话术全披露',
    publisher: '仰恩大学保卫处',
    url: 'https://bwc.yeu.edu.cn/2026/0611/c665a56691/page.htm',
    accessedAt
  },
  welcomeReport2025: {
    title: '仰恩大学喜迎2025级新同学',
    publisher: '仰恩大学',
    url: 'https://www.yeu.edu.cn/2025/0911/c770a51430/page.htm',
    accessedAt
  },
  organizations: {
    title: '组织机构',
    publisher: '仰恩大学',
    url: 'https://web.yeu.edu.cn/zzjg/list.htm',
    accessedAt
  },
  youthLeague: {
    title: '仰恩大学团委',
    publisher: '共青团仰恩大学委员会',
    url: 'https://youth.yeu.edu.cn/',
    accessedAt
  },
  clubOverview: {
    title: '学生社团简介',
    publisher: '共青团仰恩大学委员会',
    url: 'https://youth.yeu.edu.cn/347/list.htm',
    accessedAt: '2026-07-14'
  },
  clubCarnival2025: {
    title: '2025年社团嘉年华活动回顾',
    publisher: '共青团仰恩大学委员会',
    url: 'https://youth.yeu.edu.cn/2025/1029/c530a53000/page.htm',
    accessedAt
  },
  clubShowcase2026: {
    title: '2026年学生社团风采展示大赛',
    publisher: '共青团仰恩大学委员会',
    url: 'https://youth.yeu.edu.cn/2026/0606/c530a56580/page.htm',
    accessedAt: '2026-07-14'
  },
  clubAwards2026: {
    title: '2024-2025学年优秀学生社团表彰决定',
    publisher: '共青团仰恩大学委员会',
    url: 'https://youth.yeu.edu.cn/2026/0322/c516a55029/page.htm',
    accessedAt: '2026-07-15'
  },
  freshmanPreparation2026: {
    title: '人文学院2026级新生工作启动会',
    publisher: '仰恩大学人文学院',
    url: 'https://rwxy.yeu.edu.cn/2026/0626/c868a57193/page.htm',
    accessedAt: '2026-07-15'
  },
  nationalGrantRules2025: {
    title: '国家助学金评审办法（修订）',
    publisher: '仰恩大学学生事务部',
    url: 'https://xsb.yeu.edu.cn/2025/0311/c644a47889/page.htm',
    accessedAt: '2026-07-15'
  },
  mentalHealthAppointment2025: {
    title: '心理咨询预约方式',
    publisher: '仰恩大学心理健康教育与咨询中心',
    url: 'https://xl.yeu.edu.cn/2025/0225/c564a47514/page.htm',
    accessedAt: '2026-07-15'
  },
  mentalHealthVisitorNotice: {
    title: '心理咨询来访须知',
    publisher: '仰恩大学心理健康教育与咨询中心',
    url: 'https://xl.yeu.edu.cn/2020/0110/c564a13891/page.htm',
    accessedAt: '2026-07-15'
  },
  campusFireSafety2025: {
    title: '“寝”注意：宿舍消防安全指南',
    publisher: '仰恩大学保卫处',
    url: 'https://bwc.yeu.edu.cn/2025/0409/c665a48580/page.htm',
    accessedAt: '2026-07-15'
  },
  campusMap: {
    title: '校园地图',
    publisher: '仰恩大学',
    url: 'https://www.yeu.edu.cn/xydt/list.htm',
    accessedAt
  }
} satisfies Record<string, PublicSource>

export const researchSources = {
  dormQuestions: {
    title: '最关心的问题大揭秘',
    publisher: '小红书公开笔记',
    url: 'https://www.xiaohongshu.com/explore/6a45ba77000000000702a5ff',
    accessedAt: '2026-07-15',
    context: '社交平台待核验线索；宿舍设施描述须以学校通知或现场核验为准。'
  },
  dormPhotos: {
    title: '仰恩大学普通型宿舍什么样呢',
    publisher: '小红书公开笔记',
    url: 'https://www.xiaohongshu.com/explore/6a4883f4000000001603ffc7',
    accessedAt: '2026-07-15',
    context: '社交平台视频线索；楼栋、房型与拍摄时间仍待确认。'
  },
  freshmanSurvival: {
    title: '仰恩新生生存指南｜吃喝住行全攻略',
    publisher: '小红书公开笔记',
    url: 'https://www.xiaohongshu.com/explore/69fd5e380000000036018f53',
    accessedAt: '2026-07-15',
    context: '社交平台待核验线索；拉练可概述为约35–40公里，2025年学校官方报道口径为35公里。'
  },
  food: {
    title: '仰恩大学吃什么',
    publisher: '小红书公开笔记',
    url: 'https://www.xiaohongshu.com/explore/6a4526e900000000200388d6',
    accessedAt: '2026-07-15',
    context: '与高德 POI 交叉命中的商铺候选；营业状态和菜品仍待实地确认。'
  },
  expressMap: {
    title: '仰恩大学新区快递驿站地图',
    publisher: '小红书公开笔记',
    url: 'https://www.xiaohongshu.com/explore/689c97e4000000001b023cb9',
    accessedAt: '2026-07-15',
    context: '2025 年社交平台旧线索；站点数量、品牌和营业状态均待复核。'
  },
  clubs: {
    title: '仰恩大学社团列表',
    publisher: '小红书公开笔记',
    url: 'https://www.xiaohongshu.com/explore/6875d6f70000000017037779',
    accessedAt: '2026-07-15',
    context: '2025 年不完整线索；不能替代校团委当年注册名册。'
  },
  campusShuttle: {
    title: '仰恩叮叮车保姆级攻略｜夏令+冬令时段',
    publisher: '小红书公开笔记',
    url: 'https://www.xiaohongshu.com/explore/686f0ee4000000001202cb14',
    accessedAt: '2026-07-15',
    context: '校内用户确认该交通工具通称“叮叮车”；票价、时段、上下车点仍待核验，争议配图禁止发布。'
  }
} satisfies Record<string, PublicSource>

export const freshmanGuides: FreshmanGuide[] = [
  {
    slug: 'arrival',
    title: '新生报到流程',
    shortTitle: '报到流程',
    summary: '2026级新生9月5至6日报到，本科与专升本仍需分别核对录取材料和现场安排。',
    icon: 'i-lucide-clipboard-check',
    category: 'arrival',
    audience: ['本科新生', '专升本新生'],
    readMinutes: 6,
    status: 'partial',
    statusText: '报到日期已确认，地点材料待通知',
    updatedAt: accessedAt,
    leadNotice: '学校2026-2027学年第一学期校历已确认新生于9月5至6日注册报到；具体到校时段、报到校区或点位、材料清单和接站安排仍以录取通知书及招生网后续公告为准。',
    sections: [
      {
        title: '现在可以确认',
        icon: 'i-lucide-circle-check',
        items: [
          '先确认自己的录取类型是普通本科还是专升本，分别查看对应的当年招生页面。',
          '保存招生办公室官网入口；涉及日期、缴费、材料和报到地点时，只认录取通知书或学校官方通知。',
          '学校办公室发布的校历明确：2026级新生9月5至6日注册报到，9月7至9日参加入学教育，9月10日上课。',
          '同一份校历将2026级新生军训暂定为12月13日至26日，并注明这是部队初定时间；若后续通知调整，以最新官方安排为准。',
          '校历统一写作“新生”，没有区分普通本科与专升本；个人通知如有更具体安排，以对应录取材料为准。',
          '2026年招生章程公布的校址为福建省泉州市洛江区马甲镇仰恩大学，邮编362014。',
          '招生咨询电话为 0595-22091988、0595-22085622，邮箱为 yeu@yeu.edu.cn。'
        ]
      },
      {
        title: '收到通知后逐项核对',
        icon: 'i-lucide-list-checks',
        items: [
          '9月5至6日中为你安排的具体日期和时段、允许提前或延后到校的规则，以及迟到请假方式。',
          '通知要求携带的原件、复印件、照片及线上预办理事项。',
          '缴费渠道、宿舍分配、绿色通道、接站安排和现场报到点。'
        ]
      },
      {
        title: '专升本档案（2026已发布）',
        icon: 'i-lucide-folder-input',
        items: [
          '招生办公室说明，《调档函》会随录取通知书寄出；收到后，携调档函到档案所在单位办理调档。',
          '档案须通过 EMS 或机要件邮寄，接收单位为“仰恩大学档案室”，地址为福建省泉州市洛江区马甲镇仰恩大学档案室，邮编362014。',
          '档案室公开联系电话为0595-22082012；寄出前按录取通知书和招生网页再次核对收件信息，不使用群聊转发的私人地址。',
          '这一流程仅适用于2026年专升本学生，普通本科新生不要照搬。'
        ]
      },
      {
        title: '安全提醒',
        icon: 'i-lucide-shield-alert',
        items: [
          '不要根据群聊、私人二维码或搜索广告缴费。',
          '保卫处2026年6月提醒，骗子可能冒充教育局或高校招生办；不要支付所谓“罚款”“内部指标”费用，也不要向陌生渠道提供身份证号或银行卡信息。',
          '任何与学校正式通知冲突的信息，都应回到招生办公室或主管部门核实。'
        ]
      },
      {
        title: '常用官方咨询',
        icon: 'i-lucide-phone-call',
        items: [
          '教务部官网公开电话为0595-22082006，邮箱为 yeujwb@yeu.edu.cn；学籍与教学事项先查看教务部官网，再向对应业务科室确认。',
          '财务处联系方式页公开电话为0595-22082010，办公地点为旧区行政楼一楼；缴费政策与票据问题只通过财务处官方入口核对。'
        ]
      },
      {
        title: '往年流程只作参考',
        icon: 'i-lucide-history',
        items: [
          '2025级迎新曾在第一、第三教学区设置报到点，并安排泉州火车站接站和校内电瓶车。',
          '这些安排不能推定为2026级方案；本页会在学校发布当年通知后再更新具体日期、材料和路线。'
        ]
      },
      {
        title: '学生经验线索（待核验）',
        icon: 'i-lucide-message-circle-warning',
        items: [
          '公开经验笔记提到校内坡路、叮叮车高峰排队、不同校区外卖送达边界、公用晾晒和自习空间等生活细节；这些内容会作为后续现场核验清单，不作为学校规则。',
          '校内用户已确认该交通工具通称“叮叮车”；笔记中的票价、座位数、上下车点和支付方式仍是待核验变化信息，争议配图不作为真实车辆照片。',
          '军训拉练可概述为约35–40公里；学校2025年官方报道标题为35公里，学生常用说法约40公里，具体以当年安排为准。'
        ],
        notice: '经验内容可能随学期、校区和管理安排变化，请优先查看录取材料及学校最新通知。',
        sources: [researchSources.freshmanSurvival, researchSources.campusShuttle]
      },
      {
        title: '资助与校内前置准备',
        icon: 'i-lucide-hand-coins',
        items: [
          '学生事务部现行页面说明，全日制本科家庭经济困难学生可按规定申请国家助学金；页面列出每年3000元和5000元两档，并写明原则上每年9月20日前通过福建省精准资助学生信息管理系统申请。',
          '金额、申请入口和截止时间仍应在2026学年资助通知中再次确认；不要向私人账号提交身份证、银行卡或家庭经济材料。',
          '人文学院2026级新生工作启动会确认校内已开展班级联络群、预报到摸排、档案归集和团组织关系转接准备；这只表示校方前置工作已启动，不是面向所有新生的办理步骤。'
        ],
        notice: '资助申请和团组织关系转接以学生事务部、学院及录取材料的当年正式通知为准。',
        sources: [officialSources.nationalGrantRules2025, officialSources.freshmanPreparation2026]
      }
    ],
    sources: [
      officialSources.admissions,
      officialSources.undergraduateRules2026,
      officialSources.undergraduatePlan2026,
      officialSources.transferRules2026,
      officialSources.transferArchive2026,
      officialSources.academicCalendar2026Fall,
      officialSources.teachingOffice,
      officialSources.financeContact,
      officialSources.admissionFraudWarning2026,
      officialSources.welcomeReport2025,
      officialSources.nationalGrantRules2025,
      officialSources.freshmanPreparation2026
    ]
  },
  {
    slug: 'find-campus',
    title: '找宿舍与教学楼',
    shortTitle: '找宿舍 / 教学楼',
    summary: '用校园地图搜索地点，同时区分“已导入”和“已核验坐标”。',
    icon: 'i-lucide-map-pinned',
    category: 'campus',
    audience: ['本科新生', '专升本新生'],
    readMinutes: 5,
    status: 'partial',
    statusText: '地图目录已导入，坐标核验中',
    updatedAt: '2026-07-14',
    leadNotice: '工作地图的 76 个标点与 8 个原始不规则区域边界已按“未独立现场核验”状态显示，并支持地图内步行路线与外部高德导航；区域只绘制边界线，避免遮挡内部高德商铺。',
    sections: [
      {
        title: '地图里可以做什么',
        icon: 'i-lucide-search',
        items: [
          '按教学楼、宿舍、餐饮、服务、快递和校门等分类筛选。',
          '用地点正式名称或常见用途搜索，例如“校园网”“取件”“宿舍”。',
          '查看地点的数据状态、来源和最后核验日期。'
        ]
      },
      {
        title: '到校前',
        icon: 'i-lucide-route',
        items: [
          '等学校公布当年报到点后，再从报到指南跳转对应地点。',
          '不要仅凭工作地图中的反向地址判断楼栋；部分地址会落到相邻建筑。',
          '优先保存校门、报到点、宿舍和主要教学楼四类位置。'
        ]
      },
      {
        title: '住宿与分配',
        icon: 'i-lucide-bed-double',
        items: [
          '2026年招生章程列明：女生舒适型4人间2780元/学年，男生舒适型5人间2580元/学年，普通型4至5人间1300元/学年。',
          '住宿费含每生每月5度电、2吨水；空调用电由学生承担。',
          '新生入学时由学校统一安排入住，无需提交宿舍申请；具体分楼仍以入学安排为准。',
          '未经允许不得私自调换宿舍或床位。确需调换时，应提交包含班级、学号、姓名、现住宿舍号和具体理由的书面申请。',
          '因房间问题调换的，携申请单和原宿舍钥匙到总务处办理；因舍友矛盾或身体健康原因调换的，按官方流程完成辅导员、学院和学生事务部审批后再到总务处办理。',
          '遗失宿舍钥匙等需要开启宿舍门时，应凭本人有效证件到总务处借用备份钥匙。'
        ]
      },
      {
        title: '宿舍报修流程',
        icon: 'i-lucide-wrench',
        items: [
          '宿舍水电、设施或家具需要维修时，可拨校园110报修：0595-22076110。',
          '总务处公布的流程要求说明故障位置和现象，并登记可联系渠道；校园110指挥中心形成维修单后派发给对应维修人员。',
          '宿舍管理办法要求维修人员在24小时内响应，一般故障48小时内修复，紧急故障立即处理。',
          '宿舍内电路、电器设备、设施家具报修后由维修人员及时维修；人为或非自然损坏是否需要赔偿，以宿舍管理规定和现场认定为准。',
          '维修完成后，由报修人或其授权人检查并确认结果。'
        ]
      },
      {
        title: '当前可核验的餐厅名称',
        icon: 'i-lucide-utensils',
        items: [
          '总务处2026年7月招租公告明确：第一教学区设北苑餐厅，第三教学区设西苑餐厅。',
          '公告只支持餐厅名称和所属教学区，不代表具体档口已经营业；入口、营业时间和精确坐标仍需现场核验。'
        ]
      },
      {
        title: '图书馆与医务室',
        icon: 'i-lucide-heart-pulse',
        items: [
          '图书馆官网当前列明：书库和自习室周一至周日8:00至22:00开放，周四12:00至18:00暂停办理借还；节假日或特殊情况另行通知。',
          '图书馆借阅部公开电话为0595-22099025、0595-22099026；临时开放调整应先查看图书馆通知。',
          '校医务室2025年10月公开简介注明实行全年全天候24小时值班制，承担医疗卫生、预防保健和传染病防控等工作；具体入口和直拨电话仍待当学期复核。'
        ]
      },
      {
        title: '宿舍实拍与答疑线索（待核验）',
        icon: 'i-lucide-image-search',
        items: [
          '近期公开笔记提供普通型宿舍图片和视频线索，并描述上床下桌、空调、风扇和公共卫浴隔间等情况。',
          '这些笔记没有形成可覆盖所有楼栋和房型的证据；房型、床位和设施仍以录取安排、学校规定及实际分配为准。',
          '系统只在内部资料目录保存少量带来源和版权状态的核验图片，不在前台发布，也不复制完整正文或评论用户资料。'
        ],
        sources: [researchSources.dormQuestions, researchSources.dormPhotos]
      },
      {
        title: '心理咨询与支持',
        icon: 'i-lucide-heart-handshake',
        items: [
          '心理健康教育与咨询中心公开预约页注明旧区长春楼二楼可提供心理咨询，并支持企业微信、电话、邮件或现场预约。',
          '预约方式和开放时间可能随学期调整，使用前请打开下方官网原文核对最新联系方式；紧急危险情况应立即联系校方、急救或公安渠道。'
        ],
        sources: [officialSources.mentalHealthAppointment2025]
      }
    ],
    sources: [
      officialSources.campusMap,
      officialSources.undergraduateRules2026,
      officialSources.transferRules2026,
      officialSources.dormRules2025,
      officialSources.dormAirConditioning2025,
      officialSources.dormMaintenance2025,
      officialSources.repairProcess2025,
      officialSources.dormChangeProcess2025,
      officialSources.diningStallLease2026,
      officialSources.libraryHours,
      officialSources.libraryContact,
      officialSources.medicalOfficeProfile2025,
      officialSources.mentalHealthAppointment2025
    ]
  },
  {
    slug: 'campus-card-network',
    title: '校园卡与校园网',
    shortTitle: '校园卡与网络',
    summary: '校园网、图书馆借阅和宿舍门禁场景已有官方说明，校园卡综合服务仍待核验。',
    icon: 'i-lucide-wifi',
    category: 'campus',
    audience: ['本科新生', '专升本新生'],
    readMinutes: 3,
    status: 'partial',
    statusText: '校园网与校园卡部分场景已核验，综合流程待确认',
    updatedAt: '2026-07-14',
    leadNotice: '校园网接入、图书馆借阅权限和宿舍门禁场景已有官方说明；校园卡发放、激活、充值、资金账户挂失、补卡及费用仍待主管部门确认。',
    sections: [
      {
        title: '校园网',
        icon: 'i-lucide-router',
        items: [
          '校园网有线覆盖教学楼、行政办公楼、实验室和室内场馆；无线网 YEU 覆盖教学楼、实验室、公共机房、行政办公楼、图书馆、普照礼堂、文体中心和室外体育场。官方指南明确以上范围不包括教师、学生宿舍区。',
          '连接后通过浏览器认证。新生注册后以学号获得校园网和VPN账号，首次登录按官方通知操作并立即修改密码。',
          '宿舍或校外访问教务等校内资源时，可按官方指南使用 https://vpn.yeu.edu.cn:444。',
          '网络问题可联系第二校区网络信息中心楼三楼，电话0595-22098521；资费和设备限制仍以入学时最新通知为准。',
          '系统不会收集或保存校园网、教务系统、邮箱等账号密码。'
        ]
      },
      {
        title: '校园卡',
        icon: 'i-lucide-credit-card',
        items: [
          '图书馆按学校相关部门提供的全日制学生名单统一审核后开通校园卡借阅权限，可刷卡或刷脸入馆。',
          '校园卡遗失后，可到图书馆办理借阅权限挂失；这不等于校园卡资金账户挂失。',
          '总务处发布的宿舍管理办法写明，学生通过校园一卡通门禁系统刷脸进出宿舍区；这只证明宿舍门禁场景，不代表校园卡资金账户或完整服务流程。',
          '图书馆2025年微信平台绑定借阅证说明明确，借阅账号为学号；具体绑定步骤以图书馆当前页面为准，本系统不收集账号或密码。',
          '发卡地点、激活方式、充值渠道、资金账户挂失、补卡流程和费用仍待核验。',
          '涉及费用或转账时，只使用学校明确公布的渠道。'
        ]
      }
    ],
    sources: [
      officialSources.serviceGuide,
      officialSources.informationOffice,
      officialSources.campusNetwork,
      officialSources.dormRules2025,
      officialSources.libraryBorrowingRules,
      officialSources.libraryWechatBinding2025
    ]
  },
  {
    slug: 'study-library',
    title: '学习、选课与图书馆',
    shortTitle: '学习 / 图书馆',
    summary: '汇总开学时间、教务入口、图书馆开放和借阅规则，具体选课安排等待学院通知。',
    icon: 'i-lucide-book-open-check',
    category: 'campus',
    audience: ['本科新生', '专升本新生'],
    readMinutes: 4,
    status: 'partial',
    statusText: '校历与图书馆规则已核验，选课安排待通知',
    updatedAt: '2026-07-14',
    leadNotice: '2026级新生9月7至9日参加入学教育、9月10日上课；课表、选课批次、教材和学院报到后的具体安排，以教务部及所在学院当年通知为准。',
    sections: [
      {
        title: '开学后的关键日期',
        icon: 'i-lucide-calendar-days',
        items: [
          '学校办公室发布的2026-2027学年第一学期校历明确：新生9月5至6日注册报到，9月7至9日参加入学教育，9月10日开始上课。',
          '校历将2026级新生军训暂定为12月13日至26日，并注明部队安排仍可能调整；不要按往年9月军训时间准备。',
          '个人课表、分班、教材领取、选课轮次及补退选时间尚未在面向2026级新生的公开通知中确认。'
        ]
      },
      {
        title: '教务入口与账号安全',
        icon: 'i-lucide-graduation-cap',
        items: [
          '教务部官网提供教务系统、选课主页、超星网络教学平台等官方入口；优先从教务部页面跳转，不点击搜索广告或群聊中的仿冒登录页。',
          '教务部公开电话为0595-22082006，邮箱为 yeujwb@yeu.edu.cn；涉及学籍、课表和成绩事项时，先查看官网办事指南，再按学院或教务部通知办理。',
          '本系统不会代登录教务、选课、超星或邮箱，也不会要求提交学号密码、短信验证码或人脸信息。',
          '首次登录、默认口令、统一身份认证和忘记密码流程必须以学校当年页面为准，本指南不公开或猜测默认密码。'
        ]
      },
      {
        title: '图书馆开放与借阅',
        icon: 'i-lucide-library',
        items: [
          '图书馆官网当前列明，书库和自习室周一至周日8:00至22:00开放，周四12:00至18:00暂停办理借还；节假日和特殊情况另行通知。',
          '学校相关部门提供全日制学生名单后，图书馆统一审核并开通校园卡借阅权限；可刷校园卡或通过人脸识别入馆借阅。',
          '借阅规定列明，非毕业班学生每人限借10册，借期30天，可续借1次30天；实际执行前仍应查看图书馆最新规定。',
          '遗失校园卡后应及时到图书馆办理借阅权限挂失；这不能替代校园卡资金账户挂失。',
          '图书馆借阅部公开电话为0595-22099025、0595-22099026。'
        ]
      },
      {
        title: '收到学院通知后再确认',
        icon: 'i-lucide-list-checks',
        items: [
          '自己的班级、辅导员、班主任和学院官方通知渠道。',
          '培养方案、公共课与专业课选课顺序，以及是否需要购买或领取教材。',
          '专升本课程衔接、学分认定和补修要求；不要直接套用普通本科新生安排。'
        ]
      }
    ],
    sources: [
      officialSources.academicCalendar2026Fall,
      officialSources.teachingOffice,
      officialSources.libraryHours,
      officialSources.libraryContact,
      officialSources.libraryBorrowingRules,
      officialSources.libraryWechatBinding2025
    ]
  },
  {
    slug: 'safety-health',
    title: '校园安全、医疗与心理支持',
    shortTitle: '安全 / 医疗',
    summary: '保存校园110和官方求助入口，了解宿舍消防、医务室与心理咨询的使用边界。',
    icon: 'i-lucide-shield-plus',
    category: 'life',
    audience: ['本科新生', '专升本新生'],
    readMinutes: 4,
    status: 'partial',
    statusText: '官方求助入口已核验，医务室直拨电话待确认',
    updatedAt: '2026-07-15',
    leadNotice: '校内火情、治安或紧急故障可拨校园110：0595-22076110；危及生命或需要公安、消防、急救时，同时按实际情况拨打110、119或120，不要只在群聊中求助。',
    sections: [
      {
        title: '先保存这些求助入口',
        icon: 'i-lucide-phone-call',
        items: [
          '校园110：0595-22076110。保卫处消防指南要求，报警时清楚说明地点、火势或事件情况和涉及楼栋。',
          '医务室官网简介注明实行全年全天候24小时值班，承担医疗卫生、预防保健和传染病防控等工作；具体入口可在校园地图搜索“新区医务所”或“旧区医务所”。',
          '医务室直拨电话和2026级体检安排尚未从当前公开资料确认；急症不要等待网页更新，立即联系校方并按情况拨打120。',
          '心理健康教育与咨询中心位于第一教学区长春楼二楼，预约方式以中心当前官网页面为准。'
        ]
      },
      {
        title: '宿舍消防与用电',
        icon: 'i-lucide-flame-kindling',
        items: [
          '不使用热得快、电炉、电煮锅等违规大功率电器，不私拉乱接电线，不在宿舍卧床吸烟。',
          '离开宿舍时关闭电源并拔除不需要持续工作的电器；楼道、楼梯间和消防通道不得堆放物品。',
          '发现火情先报警并迅速疏散；火势较大时用湿毛巾捂住口鼻、弯腰低姿撤离，不乘电梯，不折返取物。',
          '只有在火势较小、退路安全且本人会使用灭火器时才尝试处置；任何情况下都不要为了拍照或取贵重物品延误撤离。'
        ]
      },
      {
        title: '防诈骗与缴费安全',
        icon: 'i-lucide-shield-alert',
        items: [
          '学校保卫处2026年提醒，骗子可能冒充教育局、高校招生办或工作人员，以“内部指标”“补录”“罚款”等名义诱导转账。',
          '招生、学费、住宿费和资助办理只认录取通知书、学校官网及主管部门明确公布的渠道。',
          '不要向陌生人提供身份证照片、银行卡、短信验证码、屏幕共享或远程控制权限；遇到可疑信息先联系招生办、财务处或辅导员核实。'
        ]
      },
      {
        title: '心理咨询与隐私边界',
        icon: 'i-lucide-heart-handshake',
        items: [
          '学校心理咨询面向在校学生，可通过中心公布的电话、企业微信或现场方式预约；不能按时来访时应提前联系。',
          '中心来访须知说明咨询遵循尊重、理解、真诚和保密原则；咨询并不等同于普通聊天，也不要求问题严重到“撑不住”才可求助。',
          '当来访者存在伤害自己或他人的倾向，或问题涉及法律责任时，保密会有必要例外，中心可联系相关人员或机构采取保护措施。',
          '出现立即危险、自伤或伤人风险时，不等待常规预约，立刻联系身边可信任的人、辅导员、校园110或紧急服务。'
        ]
      }
    ],
    sources: [
      officialSources.campusFireSafety2025,
      officialSources.admissionFraudWarning2026,
      officialSources.medicalOfficeProfile2025,
      officialSources.mentalHealthAppointment2025,
      officialSources.mentalHealthVisitorNotice
    ]
  },
  {
    slug: 'express-delivery',
    title: '快递、外卖与取餐',
    shortTitle: '快递 / 外卖',
    summary: '整理站点、取件和配送边界，所有营业与入校规则都需当期复核。',
    icon: 'i-lucide-package-open',
    category: 'life',
    audience: ['本科新生', '专升本新生'],
    readMinutes: 3,
    status: 'awaiting-notice',
    statusText: '站点与配送规则待现场核验',
    updatedAt: accessedAt,
    leadNotice: '已收录2025年快递地图和新生经验笔记作为待核验线索，但仍没有足以公开的当前站点营业时间、取餐点或配送边界证据。',
    sections: [
      {
        title: '上线前会核对',
        icon: 'i-lucide-scan-search',
        items: [
          '站点正式名称、位置、覆盖快递、营业及取件时间。',
          '取件所需凭证、寄件方式、假期安排和公开联系电话。',
          '外卖允许送达的边界、指定取餐点和临时管控变化。'
        ]
      },
      {
        title: '使用时注意',
        icon: 'i-lucide-clock-3',
        items: [
          '营业时间和入校规则变化较快，查看页面的最后核验日期。',
          '平台显示“可配送”不代表学校允许骑手进入对应区域。'
        ]
      },
      {
        title: '当前搜索到的线索',
        icon: 'i-lucide-file-search-2',
        items: [
          '一篇2025年公开笔记称新区约有6个快递点，并附有新区、旧区站点地图线索；由于品牌和位置主要在图片中，当前不直接转录为地点。',
          '另一篇新生经验笔记提到新旧区外卖送达边界不同；边界属于易变化规则，必须在2026级报到前重新现场核验。',
          '当站点名称、精确位置、覆盖品牌和营业状态至少完成两项独立核验后，再发布到地图。'
        ],
        notice: '以下链接用于追溯线索，不表示学校或本系统已经确认其内容。',
        sources: [researchSources.expressMap, researchSources.freshmanSurvival]
      }
    ],
    sources: []
  },
  {
    slug: 'clubs',
    title: '社团与招新',
    shortTitle: '社团招新',
    summary: '官网列出23个学生社团及类别分布，2026级招新时间、地点和公开渠道仍待发布。',
    icon: 'i-lucide-users-round',
    category: 'community',
    audience: ['本科新生', '专升本新生'],
    readMinutes: 3,
    status: 'partial',
    statusText: '2026招新安排待发布',
    updatedAt: '2026-07-14',
    leadNotice: '校团委社团简介页列出23个学生社团，2026年活动报道另可确认7个近期活跃社团；完整名称清单和2026级招新安排仍待校团委发布。',
    sections: [
      {
        title: '官方社团概况',
        icon: 'i-lucide-layout-grid',
        items: [
          '校团委当前社团简介页列出23个学生社团：思想政治类2个、学术科技类1个、文化体育类12个、创新创业类5个、其他类2个、志愿公益类1个。',
          '该页面未列出23个社团的完整名称，也没有可见更新日期；类别和数量只作当前官网概况，不能替代当年注册名册或招新公告。'
        ]
      },
      {
        title: '2026年已核验活跃社团',
        icon: 'i-lucide-badge-check',
        items: [
          '国旗班、音乐协会、公共关系协会。',
          '青年志愿者先锋队、就业与创业者协会。',
          '青云汉服社、舞蹈协会。',
          '以上名单来自2026年社团风采赛决赛报道，仅表示近期活动可核验，不代表全校完整社团名单。'
        ]
      },
      {
        title: '往年招新形式',
        icon: 'i-lucide-history',
        items: [
          '2025年社团嘉年华曾在第三教学区碑林广场开展纳新，并在普照大礼堂举行晚会。',
          '往年地点和日期只用于了解形式，不能作为2026级招新安排。'
        ]
      },
      {
        title: '社交平台名单线索',
        icon: 'i-lucide-list-tree',
        items: [
          '一篇2025年公开笔记整理了“23个社团”名单；校内用户确认计算机协会、电子数模协会确实存在，说明图片名单并不完整。',
          '存在性反馈不能替代校团委当年注册名册，也不能证明协会当前正在招新；招新时间和联系方式仍需逐项确认。'
        ],
        sources: [researchSources.clubs]
      },
      {
        title: '官网名称差异待确认',
        icon: 'i-lucide-scan-alert',
        items: [
          '2024-2025学年优秀社团表彰决定使用“青年志愿者协会”，而2026年社团风采大赛报道使用“青年志愿者先锋队”。',
          '在校团委确认两者是否为同一组织前，系统保留名称差异，不自动合并社团档案。'
        ],
        sources: [officialSources.clubAwards2026]
      },
      {
        title: '招新信息发布规则',
        icon: 'i-lucide-badge-check',
        items: [
          '正式名称和存续状态由校团委名册或社团负责人当年确认。',
          '私人手机号、微信号和群二维码未经明确同意不会公开。',
          '过期招新活动会归档，不长期展示失效二维码。'
        ]
      }
    ],
    sources: [
      officialSources.youthLeague,
      officialSources.clubOverview,
      officialSources.clubShowcase2026,
      officialSources.clubCarnival2025,
      officialSources.clubAwards2026
    ]
  },
  {
    slug: 'nearby',
    title: '周边商铺与生活',
    shortTitle: '周边生活',
    summary: '按位置、营业状态和最后核验日期查看，不做无依据的主观排名。',
    icon: 'i-lucide-store',
    category: 'life',
    audience: ['本科新生', '专升本新生'],
    readMinutes: 3,
    status: 'awaiting-notice',
    statusText: '首批商铺待实地核验',
    updatedAt: accessedAt,
    leadNotice: '工作地图和社交平台中的商铺只能作为候选线索。门店位置、营业状态和营业时间至少经过平台当前页面与实地或电话两项一致后才会公开。',
    sections: [
      {
        title: '首版展示字段',
        icon: 'i-lucide-list-filter',
        items: [
          '门店名称、类别、位置、营业时间、服务标签和最后核验日期。',
          '价格只记录带日期的区间或样例，不承诺长期不变。',
          '不复制点评、评分、菜单图片或用户图片。'
        ]
      },
      {
        title: '后续商业功能',
        icon: 'i-lucide-badge-percent',
        items: [
          '商家认领需要验证门店控制权，客观资料修改与购买推广分开。',
          '优惠注明提供方、条件和有效期；付费位置显著标注“推广”。',
          '推广不会改变地图的客观排序或核验结论。'
        ]
      },
      {
        title: '首批交叉命中候选',
        icon: 'i-lucide-badge-help',
        items: [
          '公开美食笔记提到旧区“喜又”和新区二街“思念小馆”，两家名称均能在高德 POI 中命中，因此提升为优先实地核验对象。',
          '跨平台同名只能证明候选关联度较高，不能证明当前营业、菜品、价格、评价或门店控制权。'
        ],
        notice: '完成营业状态和位置复核前，这两家不会作为已核验推荐商铺展示。',
        sources: [researchSources.food]
      }
    ],
    sources: []
  }
]

const recentClubSummary = '校团委2026年活动报道可确认该社团近期参与校级活动；简介、联系方式和2026级招新安排仍待当年确认。'

export const officialClubs: OfficialClub[] = [
  { slug: 'national-flag-team', name: '国旗班', summary: recentClubSummary, source: officialSources.clubShowcase2026 },
  { slug: 'music-association', name: '音乐协会', summary: recentClubSummary, source: officialSources.clubShowcase2026 },
  { slug: 'public-relations-association', name: '公共关系协会', summary: recentClubSummary, source: officialSources.clubShowcase2026 },
  { slug: 'young-volunteer-vanguard', name: '青年志愿者先锋队', summary: recentClubSummary, source: officialSources.clubShowcase2026 },
  { slug: 'employment-entrepreneurship-association', name: '就业与创业者协会', summary: recentClubSummary, source: officialSources.clubShowcase2026 },
  { slug: 'qingyun-hanfu-club', name: '青云汉服社', summary: recentClubSummary, source: officialSources.clubShowcase2026 },
  { slug: 'dance-association', name: '舞蹈协会', summary: recentClubSummary, source: officialSources.clubShowcase2026 }
]

export const officialDepartments: OfficialDepartment[] = [
  {
    name: '经济学院',
    summary: '经济学相关专业与学院通知的官方入口。',
    website: 'https://jjxy.yeu.edu.cn/'
  },
  {
    name: '管理学院',
    summary: '管理学相关专业与学院通知的官方入口。',
    website: 'https://glxy.yeu.edu.cn/'
  },
  {
    name: '会计学院',
    summary: '会计学相关专业与学院通知的官方入口。',
    website: 'https://kjxy.yeu.edu.cn/'
  },
  {
    name: '计算机科学与工程学院',
    summary: '计算机相关专业与学院通知的官方入口。',
    website: 'https://computer.yeu.edu.cn/'
  },
  {
    name: '人文学院',
    summary: '人文类专业与学院通知的官方入口。',
    website: 'https://rwxy.yeu.edu.cn/'
  },
  {
    name: '外国语学院',
    summary: '外语类专业与学院通知的官方入口。',
    website: 'https://sofl.yeu.edu.cn/'
  },
  {
    name: '法学院',
    summary: '法学相关专业与学院通知的官方入口。',
    website: 'https://fxy.yeu.edu.cn/'
  },
  {
    name: '艺术与教育学院',
    summary: '艺术与教育类专业及学院通知的官方入口。',
    website: 'https://art.yeu.edu.cn/'
  },
  {
    name: '马克思主义学院',
    summary: '思想政治理论教学与学院通知的官方入口。',
    website: 'https://marx.yeu.edu.cn/'
  },
  {
    name: '继续教育学院',
    summary: '继续教育业务与学院通知的官方入口。',
    website: 'https://jxjy.yeu.edu.cn/'
  },
  {
    name: '体育教研部',
    summary: '体育教学与相关通知的官方入口。',
    website: 'https://tiyu.yeu.edu.cn/'
  },
  {
    name: '军事理论教研部（党委武装部）',
    summary: '军事理论教学、国防教育与相关通知的官方入口。',
    website: 'https://wzb.yeu.edu.cn/'
  },
  {
    name: '人工智能与数据科学学院',
    summary: '人工智能与数据科学相关专业及学院通知的官方入口。',
    website: 'https://ai.yeu.edu.cn/'
  },
  {
    name: '电气工程与自动化学院',
    summary: '电气与自动化相关专业及学院通知的官方入口。',
    website: 'https://dqgc.yeu.edu.cn/'
  },
  {
    name: '教务部',
    summary: '学籍、教学运行、选课与教学管理的官方入口。',
    website: 'https://jwb.yeu.edu.cn/',
    phone: '0595-22082006',
    email: 'yeujwb@yeu.edu.cn'
  },
  {
    name: '学校办公室',
    summary: '校历、校级通知和学校办公室信息的官方入口。',
    website: 'https://bgs.yeu.edu.cn/'
  },
  {
    name: '招生办公室',
    summary: '招生章程、招生计划、录取与咨询官方入口。',
    website: 'https://zhaosheng.yeu.edu.cn/',
    phone: '0595-22091988 / 0595-22085622',
    email: 'yeu@yeu.edu.cn'
  },
  {
    name: '学生事务部',
    summary: '学生资助、心理健康、就业指导、一站式社区及规章制度入口。',
    website: 'https://xsb.yeu.edu.cn/',
    phone: '0595-22082008'
  },
  {
    name: '实验室与信息化管理处',
    summary: '校园网络与校内信息服务的主管部门入口。',
    website: 'https://metc.yeu.edu.cn/',
    phone: '0595-22098521 / 0595-22087606'
  },
  {
    name: '学生资助中心',
    summary: '学生资助政策和业务咨询官方入口。',
    website: 'https://xsb.yeu.edu.cn/127/list.htm',
    phone: '0595-22099018'
  },
  {
    name: '心理健康教育与咨询中心',
    summary: '心理健康教育和咨询服务官方入口。',
    website: 'https://xsb.yeu.edu.cn/128/list.htm',
    phone: '0595-22099033'
  },
  {
    name: '财务处',
    summary: '学生缴费、票据与学校财务政策的官方入口。',
    website: 'https://uf.yeu.edu.cn/',
    phone: '财务咨询：0595-22082010'
  },
  {
    name: '总务处',
    summary: '宿舍管理、维修维护和校园生活服务的官方入口。',
    website: 'https://zwc.yeu.edu.cn/',
    phone: '宿舍水电/家具报修：0595-22076110'
  },
  {
    name: '保卫处',
    summary: '校园安全与保卫部门官方入口。',
    website: 'https://bwc.yeu.edu.cn/'
  },
  {
    name: '医务室',
    summary: '官网简介注明全年全天候24小时值班；具体入口和直拨电话仍需当学期复核。',
    website: 'https://www.yeu.edu.cn/yws/list.htm'
  },
  {
    name: '校团委',
    summary: '校园文化、学生社团及青年活动官方入口。',
    website: 'https://youth.yeu.edu.cn/',
    phone: '0595-22098512'
  },
  {
    name: '图书馆',
    summary: '馆藏、借阅、开放安排与学习空间的官方入口。',
    website: 'https://library.yeu.edu.cn/',
    phone: '借阅部：0595-22099025 / 0595-22099026'
  }
]

export function findFreshmanGuide(slug: string) {
  return freshmanGuides.find(guide => guide.slug === slug)
}
