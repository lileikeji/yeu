export interface PublicSource {
  title: string
  publisher: string
  url: string
  accessedAt: string
  context?: string
  status?: 'active' | 'unavailable' | 'disputed'
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
  slug: string
  name: string
  summary: string
  website: string
  profileUrl?: string
  contactUrl?: string
  phone?: string
  email?: string
  address?: string
  verifiedAt?: string
  verificationState?: 'verified' | 'partial'
  verificationNote?: string
}

export interface OfficialClub {
  slug: string
  name: string
  summary: string
  group: string
  direction: string
  source: PublicSource
  verification?: 'active' | 'lead'
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
  campusNetworkRules2025: {
    title: '仰恩大学信息网络管理规定',
    publisher: '仰恩大学实验室与信息化管理处',
    url: 'https://metc.yeu.edu.cn/2025/0804/c1241a50868/page.htm',
    accessedAt: '2026-07-15'
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
  dormSafetyInspection2026: {
    title: '仰恩大学开展学生宿舍安全防线检查',
    publisher: '仰恩大学保卫处',
    url: 'https://bwc.yeu.edu.cn/2026/0506/c663a55976/page.htm',
    accessedAt: '2026-07-15'
  },
  diningStallLease2026: {
    title: '仰恩大学餐厅档口招租公告',
    publisher: '仰恩大学总务处',
    url: 'https://zwc.yeu.edu.cn/2026/0708/c496a57428/page.htm',
    accessedAt: '2026-07-14'
  },
  diningSafetyInspection2026: {
    title: '筑牢食安防线 守护师生健康',
    publisher: '仰恩大学总务处',
    url: 'https://zwc.yeu.edu.cn/2026/0327/c498a55230/page.htm',
    accessedAt: '2026-07-15'
  },
  foodSafetyCommittee2025: {
    title: '仰恩大学食品安全膳食管理委员会章程',
    publisher: '仰恩大学总务处',
    url: 'https://zwc.yeu.edu.cn/2025/1015/c497a52038/page.htm',
    accessedAt: '2026-07-15'
  },
  entrepreneurshipParkRules2025: {
    title: '仰恩大学大学生创业园管理办法（修订）',
    publisher: '仰恩大学学生事务部',
    url: 'https://xsb.yeu.edu.cn/2025/0512/c640a49290/page.htm',
    accessedAt: '2026-07-15'
  },
  entrepreneurshipParkBatch2026: {
    title: '关于启动大学生创业园第22批创业项目申报工作的通知',
    publisher: '仰恩大学创业信息网',
    url: 'https://cy.yeu.edu.cn/2026/0416/c539a55601/page.htm',
    accessedAt: '2026-07-15',
    context: '申报时间已经结束，只用于确认创业园当前仍在运行及其支持方向。'
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
  libraryReaderNotice: {
    title: '图书馆读者须知',
    publisher: '仰恩大学图书馆',
    url: 'https://library.yeu.edu.cn/197/list.htm',
    accessedAt: '2026-07-15'
  },
  libraryStudyRoomRules: {
    title: '图书馆自习室使用规定',
    publisher: '仰恩大学图书馆',
    url: 'https://library.yeu.edu.cn/200/list.htm',
    accessedAt: '2026-07-15'
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
  telecomFraudGuide2025: {
    title: '电信诈骗全知晓：类型、手段与防范',
    publisher: '仰恩大学保卫处',
    url: 'https://bwc.yeu.edu.cn/2025/1015/c665a52028/page.htm',
    accessedAt: '2026-07-15'
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
  clubSemesterMeeting2026: {
    title: '校团委召开团学干部工作例会部署新学期工作',
    publisher: '共青团仰恩大学委员会',
    url: 'https://youth.yeu.edu.cn/2026/0314/c517a54902/page.htm',
    accessedAt: '2026-07-15'
  },
  electronicModelingAssociation2025: {
    title: '仰恩大学2025年校内数学建模竞赛的通知',
    publisher: '仰恩大学数学系',
    url: 'https://shuxuexi.yeu.edu.cn/2025/0603/c474a49678/page.htm',
    accessedAt: '2026-07-15'
  },
  psychologyAssociationActivity2026: {
    title: '“心知识，进社区”心理健康宣传活动',
    publisher: '仰恩大学心理健康教育与咨询中心',
    url: 'https://xl.yeu.edu.cn/2026/0326/c562a55202/page.htm',
    accessedAt: '2026-07-15'
  },
  redCrossRecognition2026: {
    title: '福建省红十字会通报表扬仰恩大学红十字会',
    publisher: '仰恩大学',
    url: 'https://web.yeu.edu.cn/2026/0618/c770a56830/page.htm',
    accessedAt: '2026-07-15'
  },
  redCrossBazaar2026: {
    title: '仰恩大学红十字会开展爱心义卖活动',
    publisher: '仰恩大学',
    url: 'https://www.yeu.edu.cn/2026/0114/c770a54471/page.htm',
    accessedAt: '2026-07-15'
  },
  transportRouteReference2025: {
    title: '仰恩大学2025年校园招聘会邀请函（乘车路线）',
    publisher: '仰恩大学',
    url: 'https://www.yeu.edu.cn/2025/0509/c771a49255/page.htm',
    accessedAt: '2026-07-15',
    context: '只用于证明2025年官方到校路线曾包含11路、K2、K6和罗马专线，不代表2026班次、票价或临时调整。'
  },
  clubCadreAttachment2024: {
    title: '校团委公开社团干部任职附件',
    publisher: '共青团仰恩大学委员会',
    url: 'https://youth.yeu.edu.cn/_upload/article/files/fe/47/63e81ed64e55a3f180c92193486e/a756ee67-257e-4cbb-84a5-4cdf940b88ea.docx',
    accessedAt: '2026-07-15',
    context: '公开附件中的任职线索，只用于补齐可追溯社团名称，不等同于当前注册名册或招新公告。'
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
    context: '社交平台待核验线索；宿舍设施描述须以学校通知或现场核验为准。原外链当前不可稳定访问，前台仅保留为归档线索。',
    status: 'unavailable'
  },
  dormPhotos: {
    title: '仰恩大学普通型宿舍什么样呢',
    publisher: '小红书公开笔记',
    url: 'https://www.xiaohongshu.com/explore/6a4883f4000000001603ffc7',
    accessedAt: '2026-07-15',
    context: '社交平台视频线索；楼栋、房型与拍摄时间仍待确认。原外链当前不可稳定访问，前台仅保留为归档线索。',
    status: 'unavailable'
  },
  freshmanSurvival: {
    title: '仰恩新生生存指南｜吃喝住行全攻略',
    publisher: '小红书公开笔记',
    url: 'https://www.xiaohongshu.com/explore/69fd5e380000000036018f53',
    accessedAt: '2026-07-15',
    context: '社交平台待核验线索；拉练可概述为约35–40公里，2025年学校官方报道口径为35公里。原外链当前不可稳定访问，前台仅保留为归档线索。',
    status: 'unavailable'
  },
  food: {
    title: '仰恩大学吃什么',
    publisher: '小红书公开笔记',
    url: 'https://www.xiaohongshu.com/explore/6a4526e900000000200388d6',
    accessedAt: '2026-07-15',
    context: '与高德 POI 交叉命中的商铺候选；营业状态和菜品仍待实地确认。原外链当前不可稳定访问，前台仅保留为归档线索。',
    status: 'unavailable'
  },
  expressMap: {
    title: '仰恩大学新区快递驿站地图',
    publisher: '小红书公开笔记',
    url: 'https://www.xiaohongshu.com/explore/689c97e4000000001b023cb9',
    accessedAt: '2026-07-15',
    context: '2025 年社交平台旧线索；站点数量、品牌和营业状态均待复核。原外链当前不可稳定访问，前台仅保留为归档线索。',
    status: 'unavailable'
  },
  clubs: {
    title: '仰恩大学社团列表',
    publisher: '小红书公开笔记',
    url: 'https://www.xiaohongshu.com/explore/6875d6f70000000017037779',
    accessedAt: '2026-07-15',
    context: '2025 年不完整线索；不能替代校团委当年注册名册。原外链当前不可稳定访问，前台仅保留为归档线索。',
    status: 'unavailable'
  },
  campusShuttle: {
    title: '仰恩叮叮车保姆级攻略｜夏令+冬令时段',
    publisher: '小红书公开笔记',
    url: 'https://www.xiaohongshu.com/explore/686f0ee4000000001202cb14',
    accessedAt: '2026-07-15',
    context: '校内用户确认该交通工具通称“叮叮车”；票价、时段、上下车点仍待核验，争议配图禁止发布。原外链当前不可稳定访问，前台仅保留为归档线索。',
    status: 'unavailable'
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
        title: '资助、助学贷款与校内前置准备',
        icon: 'i-lucide-hand-coins',
        items: [
          '学生事务部现行页面说明，全日制本科家庭经济困难学生可按规定申请国家助学金；页面列出每年3000元和5000元两档，并写明原则上每年9月20日前通过福建省精准资助学生信息管理系统申请。',
          '金额、申请入口和截止时间仍应在2026学年资助通知中再次确认；不要向私人账号提交身份证、银行卡或家庭经济材料。',
          '2026年普通高考招生章程明确：家庭经济困难学生入学前可在户籍所在地教育局申请生源地信用助学贷款，每生每年最高20000元。',
          '有意申请校园地国家助学贷款的学生可在入校后提交申请，每生每年最高6000元；生源地信用助学贷款和校园地国家助学贷款不能同时申请获得。',
          '贷款材料、绿色通道、到账时间和余额退款方式仍要等待2026级资助通知；不要照搬其他学校的时间、银行卡或系统操作。',
          '人文学院2026级新生工作启动会确认校内已开展班级联络群、预报到摸排、档案归集和团组织关系转接准备；这只表示校方前置工作已启动，不是面向所有新生的办理步骤。'
        ],
        notice: '贷款额度以2026年招生章程为准；具体资助申请和团组织关系转接以学生事务部、学院及录取材料的当年正式通知为准。',
        sources: [officialSources.undergraduateRules2026, officialSources.nationalGrantRules2025, officialSources.freshmanPreparation2026]
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
    summary: '用校园地图搜索宿舍、教学楼和服务点；高德导入标点可先导航，入口细节仍需现场确认。',
    icon: 'i-lucide-map-pinned',
    category: 'campus',
    audience: ['本科新生', '专升本新生'],
    readMinutes: 5,
    status: 'partial',
    statusText: '地图目录已导入，坐标核验中',
    updatedAt: '2026-07-15',
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
          '2026年3月学校食堂安全检查同时出现西苑、北苑、东苑餐厅，确认三处餐厅当前仍被学校使用。',
          '2026年1月红十字会活动进一步确认东苑餐厅位于第一教学区、西苑餐厅位于第三教学区。',
          '以上证据不代表具体档口已经营业；入口、楼层、营业时间和精确坐标仍需现场核验。'
        ],
        sources: [officialSources.diningStallLease2026, officialSources.diningSafetyInspection2026, officialSources.redCrossBazaar2026]
      },
      {
        title: '创业园 A / B 区位置',
        icon: 'i-lucide-briefcase-business',
        items: [
          '学生事务部2025年管理办法明确：创业园A区位于第一教学区图书馆一楼，B区位于第三教学区图书馆一楼。',
          'A区为电商孵化区，B区为实体创意区；2026年第22批项目申报证明创业园体系当前仍在运行。',
          '工作地图目前只有一个“创业园”标点，后续应拆分为A、B两个地点并分别核对入口坐标。'
        ],
        sources: [officialSources.entrepreneurshipParkRules2025, officialSources.entrepreneurshipParkBatch2026]
      },
      {
        title: '校外到校公交（历史参考）',
        icon: 'i-lucide-bus-front',
        items: [
          '学校2025年招聘会邀请函给出的到校路线曾包含11路、K2路、K6路和罗马专线。',
          '该材料只能证明2025年这些线路可用于到校，不代表2026年新生报到时的班次、票价、首末站或接站安排。',
          '出发前应通过泉州公交当前渠道或地图实时公交重新查询，并以学校2026级迎新通知为准。'
        ],
        sources: [officialSources.transportRouteReference2025]
      },
      {
        title: '食堂意见与食品安全',
        icon: 'i-lucide-message-square-warning',
        items: [
          '学校食品安全膳食管理委员会负责收集师生对餐饮服务的意见，监督食堂卫生、质量、服务和价格，并协助处理投诉。',
          '官网当前未给出固定线上投诉表单；遇到问题时先保留时间、餐厅、档口、订单或实物照片，再通过总务处或学校当期公布渠道反映。'
        ],
        sources: [officialSources.foodSafetyCommittee2025]
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
      officialSources.diningSafetyInspection2026,
      officialSources.foodSafetyCommittee2025,
      officialSources.entrepreneurshipParkRules2025,
      officialSources.entrepreneurshipParkBatch2026,
      officialSources.redCrossBazaar2026,
      officialSources.transportRouteReference2025,
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
    updatedAt: '2026-07-15',
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
          '信息网络管理规定禁止未经批准私设代理或DHCP、把校园网扩展到校外、向非校内用户提供接入，或利用校园网开展经营活动。',
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
      officialSources.campusNetworkRules2025,
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
    updatedAt: '2026-07-15',
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
          '图书馆读者须知和自习室规定明确禁止占座、进食和违规用电；离开座位时带好个人物品，自习空间不提供财物保管。',
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
      officialSources.libraryReaderNotice,
      officialSources.libraryStudyRoomRules,
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
          '医务室官网简介注明现有医护人员8名，实行全年全天候24小时值班，承担医疗卫生、预防保健和传染病防控等工作；具体入口可在校园地图搜索“新区医务所”或“旧区医务所”。',
          '医务室页面页脚的0595-22082001明确标注为校办电话，不作为医务室直拨电话；医务室直拨电话和2026级体检安排尚未从当前公开资料确认。急症不要等待网页更新，立即联系校方并按情况拨打120。',
          '心理健康教育与咨询中心位于第一教学区长春楼二楼，预约方式以中心当前官网页面为准。'
        ]
      },
      {
        title: '宿舍消防与用电',
        icon: 'i-lucide-flame-kindling',
        items: [
          '不使用热得快、电炉、电煮锅等违规大功率电器，不私拉乱接电线，不在宿舍卧床吸烟。',
          '学校2026年宿舍专项检查还将劣质插排列为重点风险；插排破损、发热、异味或接触不良时应立即停用并报修。',
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
          '保卫处综合反诈指南还列出冒充老师、网络刷单、冒充公检法、AI换脸、网络贷款和冒充亲友等常见骗局。',
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
      officialSources.dormSafetyInspection2026,
      officialSources.admissionFraudWarning2026,
      officialSources.telecomFraudGuide2025,
      officialSources.medicalOfficeProfile2025,
      officialSources.mentalHealthAppointment2025,
      officialSources.mentalHealthVisitorNotice
    ]
  },
  {
    slug: 'express-delivery',
    title: '快递、外卖与取餐',
    shortTitle: '快递 / 外卖',
    summary: '整理快递站点、取件方向、外卖配送边界和当期复核清单，避免把往年经验当成今年规则。',
    icon: 'i-lucide-package-open',
    category: 'life',
    audience: ['本科新生', '专升本新生'],
    readMinutes: 3,
    status: 'awaiting-notice',
    statusText: '站点与配送规则待现场核验',
    updatedAt: '2026-07-15',
    leadNotice: '已收录2025年快递地图和新生经验笔记作为待核验线索；这些内容可以帮助新生先知道要问什么、去哪里看，但具体站点、取餐点和配送边界仍要以当学期现场规则为准。',
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
    sources: [officialSources.campusMap, researchSources.expressMap, researchSources.freshmanSurvival]
  },
  {
    slug: 'clubs',
    title: '社团与招新',
    shortTitle: '社团招新',
    summary: '官网列出23个学生社团及类别分布，9个组织有2026年活动证据，2026级招新安排仍待发布。',
    icon: 'i-lucide-users-round',
    category: 'community',
    audience: ['本科新生', '专升本新生'],
    readMinutes: 4,
    status: 'partial',
    statusText: '2026招新安排待发布',
    updatedAt: '2026-07-15',
    leadNotice: '校团委社团简介页列出23个学生社团，2026年活动报道可确认9个组织近期活动；完整注册名册和2026级招新安排仍待校团委发布。',
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
        title: '2026年已核验近期活动组织',
        icon: 'i-lucide-badge-check',
        items: [
          '国旗班、音乐协会、公共关系协会。',
          '青年志愿者先锋队、就业与创业者协会。',
          '青云汉服社、舞蹈协会。',
          '心理协会承办了2026年“心知识，进社区”活动；仰恩大学红十字会在2026年持续开展公益活动。',
          '以上名单来自不同官方活动报道，仅表示近期活动可核验，不代表校团委完整注册名册，也不代表当前正在招新。'
        ],
        sources: [officialSources.clubShowcase2026, officialSources.psychologyAssociationActivity2026, officialSources.redCrossRecognition2026]
      },
      {
        title: '当前已整理的23个社团名称',
        icon: 'i-lucide-list-checks',
        items: [
          '近期活动可确认：国旗班、音乐协会、公共关系协会、青年志愿者先锋队、就业与创业者协会、青云汉服社、舞蹈协会。',
          '学术兴趣与表达类线索：孙子兵法研究会、演讲与口才协会、书画社、创新发明协会、计算机协会、电子数模协会、红城文学社、英语学习社、习近平新时代中国特色社会主义思想读书社。',
          '体育类线索：体育协会排球分会、体育协会乒乓球分会、体育协会跆拳道分会、体育协会足球分会、体育协会定向越野分会。',
          '另有2026年活动可确认：心理协会、红十字会。电子数模协会另有2025年校内数学建模竞赛协办证据。',
          '其余名称主要来自校团委公开附件中的干部任职线索，适合做招新前索引，不适合直接写成“2026正在招新”。'
        ],
        sources: [officialSources.clubShowcase2026, officialSources.psychologyAssociationActivity2026, officialSources.redCrossRecognition2026, officialSources.electronicModelingAssociation2025, officialSources.clubCadreAttachment2024]
      },
      {
        title: '当前社团体系运行证据',
        icon: 'i-lucide-calendar-check-2',
        items: [
          '2026年3月校团委工作例会由校团学组织干部和各学生社团负责人参加，各社团汇报本学期工作计划。',
          '这可以证明学生社团管理体系当前仍在运行，但会议报道没有给出完整社团名称、招新时间或报名渠道。'
        ],
        sources: [officialSources.clubSemesterMeeting2026]
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
      officialSources.clubAwards2026,
      officialSources.clubSemesterMeeting2026,
      officialSources.psychologyAssociationActivity2026,
      officialSources.redCrossRecognition2026,
      officialSources.electronicModelingAssociation2025,
      officialSources.clubCadreAttachment2024
    ]
  },
  {
    slug: 'nearby',
    title: '周边商铺与生活',
    shortTitle: '周边生活',
    summary: '按位置、营业状态、服务类型和最后确认时间查看周边商铺，不做无依据的主观排名或推广推荐。',
    icon: 'i-lucide-store',
    category: 'life',
    audience: ['本科新生', '专升本新生'],
    readMinutes: 3,
    status: 'awaiting-notice',
    statusText: '首批商铺待实地核验',
    updatedAt: '2026-07-15',
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
    sources: [officialSources.campusMap, researchSources.food]
  }
]

function clubSummary(direction: string, sourceType: 'active' | 'lead'): string {
  const sourceNote = sourceType === 'active'
    ? '学校2026年官方活动报道中出现该组织名称，可确认近期参与过校内活动'
    : '校团委公开附件中出现该社团干部任职信息，可作为社团名称线索'
  return `${sourceNote}。适合想了解“${direction}”的新生先收藏；具体招新摊位、群号和报名方式等当年信息，等官方或社团负责人发布后再更新。`
}

export function officialClubBody(club: OfficialClub): string {
  const isRecent = club.verification === 'active' || club.source === officialSources.clubShowcase2026
  const sourceType = isRecent ? '近期活动可确认' : '名称线索待确认'
  const confidenceText = isRecent
    ? `可信度较高：这个名字出现在${club.source.publisher}的2026年官方活动页面里，说明近期确实开展或参加过校内活动。`
    : `可信度中等：这个名字出现在${club.source.publisher}的公开资料里，可以作为找社团时的名称索引；是否仍按同名注册和招新，需要等当年公告或现场确认。`
  return [
    `这个社团目前属于「${club.group}」方向，资料状态是：${sourceType}。`,
    `你可以把它理解成：主要围绕 ${club.direction}。如果你对这个方向感兴趣，开学社团招新时可以优先去找它的摊位或公告。`,
    `适合的新生：想尝试 ${club.direction}，或者想找同好、参加校内活动、积累实践经历的同学。零基础能不能加入、训练/例会频率、是否需要自备器材，要等社团当年说明。`,
    `入群或报名之前建议先问清楚：本学期主要活动是什么、多久一次、是否有考核或值班、是否收费、是否和课程时间冲突、负责人联系方式是否来自官方渠道。`,
    confidenceText,
    '还不能写死的信息：2026级招新时间、摆摊地点、报名二维码、QQ群/微信群、固定例会时间、收费或装备要求。系统不会把未核验内容伪装成确定通知。'
  ].join('\n')
}

export function freshmanGuideBody(guide: FreshmanGuide): string {
  const sectionText = guide.sections
    .map((section) => {
      const items = section.items.map(item => `- ${item}`).join('\n')
      return [
        `【${section.title}】`,
        section.description,
        items,
        section.notice ? `提醒：${section.notice}` : null
      ].filter((value): value is string => Boolean(value)).join('\n')
    })
    .join('\n\n')

  return [
    guide.leadNotice,
    sectionText,
    `适用对象：${guide.audience.join('、')}。`,
    `资料状态：${guide.statusText}。强时效事项以页面底部列出的官方来源和学校最新通知为准。`
  ].join('\n\n')
}

const departmentUseCases: Record<string, { when: string[], check: string }> = {
  'school-of-economics': {
    when: ['经济学相关专业的新生查看学院迎新、班级、专业介绍和学院通知。', '课程安排、学院活动、辅导员通知和专业相关竞赛，一般先从学院官网或学院通知入口核对。'],
    check: '联系前先准备专业名称、年级、班级或录取专业截图，避免只说“经济学院新生”导致无法定位。'
  },
  'school-of-management': {
    when: ['管理类专业的新生查看学院通知、专业介绍、班级安排和学院活动。', '涉及工商管理、市场营销、人力资源等管理类培养安排时，先核对学院官网和辅导员通知。'],
    check: '咨询学院事务时，优先说明录取专业、培养层次和入学年份。'
  },
  'school-of-accounting': {
    when: ['会计、财务管理等相关专业新生查看学院通知、专业说明和学业安排。', '专业竞赛、证书备考、学院活动等信息，以学院公布口径为准。'],
    check: '涉及缴费问题不要只找学院，缴费和票据仍应核对财务处。'
  },
  'school-of-computer-science-and-engineering': {
    when: ['计算机相关专业新生查看学院迎新、专业课程、实验实践和竞赛通知。', '课程机房、实验课、专业社群等安排，以学院和教务部正式信息为准。'],
    check: '校园网账号、统一认证和网络故障属于信息化管理处，不要和计算机学院专业事务混淆。'
  },
  'school-of-humanities': {
    when: ['人文类专业新生查看学院通知、专业介绍、班级活动和学业要求。', '涉及文学、新闻、文化传播等方向的学院活动，优先看学院入口。'],
    check: '如问题涉及全校教学安排或学籍状态，应同时核对教务部。'
  },
  'school-of-foreign-languages': {
    when: ['外语类专业新生查看学院通知、专业培养、外语活动和考试安排。', '涉及英语学习、专业实践和语言类竞赛时，先看学院发布。'],
    check: '大学英语公共课和外语专业课不完全相同，咨询时要说清课程类型。'
  },
  'school-of-law': {
    when: ['法学相关专业新生查看学院通知、专业介绍、实践活动和竞赛信息。', '模拟法庭、普法活动、专业实践等信息，优先核对学院来源。'],
    check: '个人纠纷或法律求助不等于学院业务，紧急安全问题应先联系保卫处或辅导员。'
  },
  'school-of-arts-and-education': {
    when: ['艺术与教育类专业新生查看学院迎新、专业课、作品/实践安排和学院活动。', '涉及器材、教室、展演和实践课程时，先看学院通知。'],
    check: '需要自备工具、服装或材料的课程，不要凭往届经验购买，等当年任课或学院通知。'
  },
  'school-of-marxism': {
    when: ['查看思想政治理论课、理论学习和学院公开通知。', '多数新生会通过公共课程接触该学院，课程安排仍以教务系统和任课通知为准。'],
    check: '选课、成绩、补缓考等教学管理问题仍应核对教务部。'
  },
  'school-of-continuing-education': {
    when: ['继续教育相关业务、培训项目或成人教育信息查询。', '普通本科和专升本新生一般只在涉及继续教育项目时需要查看。'],
    check: '普通本科、专升本录取和入学问题优先看招生办公室和所在学院。'
  },
  'physical-education-department': {
    when: ['查看体育课、体测、体育活动和运动场地相关教学通知。', '体育课选课、体测时间、免测或缓测要求，要以当年通知为准。'],
    check: '身体原因涉及请假、缓测或免测时，保留医院证明并同步咨询任课教师/辅导员。'
  },
  'military-theory-department': {
    when: ['查看军事理论课、国防教育和党委武装部相关通知。', '军训、军事理论学习或国防教育材料有疑问时，可作为官方入口之一。'],
    check: '军训具体时间、地点、服装和请假要求以当年迎新/军训通知为准。'
  },
  'school-of-ai-and-data-science': {
    when: ['人工智能、数据科学相关专业新生查看学院通知、专业介绍和实践活动。', '算法、数据、AI 项目和相关竞赛信息，优先核对学院入口。'],
    check: '校园网或账号问题不属于学院专业事务，应转信息化管理处。'
  },
  'school-of-electrical-engineering-and-automation': {
    when: ['电气工程、自动化相关专业新生查看学院通知、实验实践和专业活动。', '实验室、安全培训、专业竞赛等事项，优先看学院发布。'],
    check: '涉及实验安全和设备使用时，不要按非官方经验操作，等课程或学院要求。'
  },
  'teaching-affairs-office': {
    when: ['查学籍、课表、选课、考试、成绩、补缓考、转专业等教学管理信息。', '新生如果不确定课程或学籍事项找谁，通常先核对教务部入口。'],
    check: '咨询时准备学号、姓名、学院、专业、课程名或问题截图；涉及个人信息不要在公开群里发送完整证件号。'
  },
  'university-office': {
    when: ['查看校历、校级通知、学校办公室发布的信息。', '确认开学周、节假日、校级安排时，优先看学校办公室发布的校历或通知。'],
    check: '校历是总体安排，学院报到和课程细节仍要看招生办、教务部和学院通知。'
  },
  'admissions-office': {
    when: ['查招生章程、招生计划、录取进度、录取通知书、档案邮寄等入学前事项。', '本科新生和专升本新生在报到前遇到录取相关疑问，优先核对招生办公室。'],
    check: '咨询前准备省份、考生号/准考证号、录取专业和问题截图；缴费、住宿、校园网等入校后事项不一定由招生办处理。'
  },
  'student-affairs': {
    when: ['查学生资助、心理健康、就业指导、一站式社区和学生规章制度。', '奖助贷、困难认定、学生管理、安全教育等事项，一般从学生事务部入口追踪。'],
    check: '涉及个人困难、心理咨询或处分申诉等敏感事项，优先走官方预约或辅导员渠道，不在公开平台泄露隐私。'
  },
  'information-office': {
    when: ['查校园网、统一认证、网络故障、信息化服务和实验室信息。', '新生遇到校园卡网络认证、Wi-Fi、账号登录问题，应优先看该部门指南。'],
    check: '报修或咨询时准备设备类型、账号、错误截图、所在楼栋/房间和发生时间。'
  },
  'financial-aid-center': {
    when: ['查国家助学贷款、困难认定、奖助学金和资助政策。', '家庭经济困难新生入学前后可重点关注资助中心入口。'],
    check: '资助材料通常有时间节点和证明要求，先按当年通知准备，不要只按往年模板提交。'
  },
  'mental-health-center': {
    when: ['了解心理咨询预约、心理健康教育和相关支持服务。', '感到持续焦虑、失眠、人际压力或适应困难时，可以先看预约方式。'],
    check: '心理咨询重视隐私保护；紧急安全风险应同时联系辅导员、校内安全电话或当地急救渠道。'
  },
  'finance-office': {
    when: ['查学费住宿费缴纳、票据、财务政策和缴费咨询。', '新生缴费金额、缴费方式、票据查询等问题，优先核对财务处。'],
    check: '缴费只通过学校确认的官方渠道；遇到催缴、退款、代缴链接，先核对官网和辅导员，避免诈骗。'
  },
  'general-affairs-office': {
    when: ['查宿舍管理、报修、水电家具、校园生活服务和总务通知。', '宿舍维修、空调、水电、家具等生活保障问题，优先看总务处流程。'],
    check: '报修时记录宿舍楼、房间、故障照片、发生时间和是否影响安全。'
  },
  'security-office': {
    when: ['查校园安全、反诈提醒、交通秩序、消防安全和保卫通知。', '丢失物品、可疑人员、诈骗风险、消防隐患等事项应优先关注保卫处。'],
    check: '紧急情况先拨打校内安全电话或 110；普通咨询再通过官网入口核对。'
  },
  'campus-clinic': {
    when: ['了解校内医务室服务、值班信息和基础就医入口。', '新生发热、外伤、常见不适或需要校内医疗咨询时，可先查医务室信息。'],
    check: '严重症状、急症或夜间风险不要只依赖网页信息，应立即联系现场老师、医务或急救。'
  },
  'youth-league': {
    when: ['查学生社团、校园文化活动、志愿服务、团学活动和青年工作通知。', '社团招新、社团名单、活动报名等事项，优先看校团委。'],
    check: '社团群号、收费、报名表等要以校团委或社团官方当年发布为准，不要只信转发二维码。'
  },
  'library': {
    when: ['查图书馆开放时间、借阅规则、馆藏检索、学习空间和读者服务。', '新生想自习、借书、绑定借阅证或了解开放安排时，优先看图书馆。'],
    check: '考试周、节假日和临时闭馆可能变化，进馆前核对图书馆最新通知。'
  }
}

export function officialDepartmentBody(department: OfficialDepartment): string {
  const contactParts = [
    department.phone ? `公开电话：${department.phone}` : null,
    department.email ? `公开邮箱：${department.email}` : null,
    department.address ? `公开地址：${department.address}` : null
  ].filter((value): value is string => Boolean(value))
  const useCase = departmentUseCases[department.slug]
  const whenText = useCase
    ? useCase.when.map(item => `- ${item}`).join('\n')
    : `- ${department.summary}\n- 涉及该部门职责范围内的通知、表格、流程、联系方式变化时，先看官网，再按页面公布的方式联系。`

  return [
    `${department.name}是新生查找相关通知和办事入口时需要优先确认的官方渠道。${department.summary}`,
    `新生什么时候该看这里：\n${whenText}`,
    `联系前先确认：${useCase?.check ?? '准备好学院、专业、年级、学号或问题截图；涉及缴费、学籍、住宿、安全、网络等事项时，优先使用学校官网或部门官网给出的入口。'}`,
    '使用建议：如果你不确定该不该找这个部门，可以先在站内搜索关键词，再核对官网栏目名称、发布时间和落款；不要只靠群聊截图或二手转述。',
    department.verificationNote
      ? `资料核对：${department.verificationNote}`
      : null,
    contactParts.length ? contactParts.join('；') : '当前只整理到官网入口，固定办公地点、办公时间和直拨电话未核验前不写死。',
    `官网入口：${department.website}`
  ].filter((value): value is string => Boolean(value)).join('\n')
}

export const officialClubs: OfficialClub[] = [
  { slug: 'national-flag-team', name: '国旗班', group: '仪仗与爱国教育', direction: '升旗仪式、国旗护卫和爱国主义教育活动', summary: clubSummary('升旗仪式、国旗护卫和爱国主义教育活动', 'active'), source: officialSources.clubShowcase2026 },
  { slug: 'music-association', name: '音乐协会', group: '文化艺术', direction: '声乐、器乐、校园演出和音乐交流', summary: clubSummary('声乐、器乐、校园演出和音乐交流', 'active'), source: officialSources.clubShowcase2026 },
  { slug: 'public-relations-association', name: '公共关系协会', group: '表达与实践', direction: '沟通表达、活动策划、礼仪和公共关系实践', summary: clubSummary('沟通表达、活动策划、礼仪和公共关系实践', 'active'), source: officialSources.clubShowcase2026 },
  { slug: 'young-volunteer-vanguard', name: '青年志愿者先锋队', group: '志愿公益', direction: '志愿服务、校园服务和公益实践', summary: clubSummary('志愿服务、校园服务和公益实践', 'active'), source: officialSources.clubShowcase2026 },
  { slug: 'employment-entrepreneurship-association', name: '就业与创业者协会', group: '就业创业', direction: '就业能力、创业实践、职业规划和项目交流', summary: clubSummary('就业能力、创业实践、职业规划和项目交流', 'active'), source: officialSources.clubShowcase2026 },
  { slug: 'qingyun-hanfu-club', name: '青云汉服社', group: '传统文化', direction: '汉服文化、传统礼仪和传统文化展示', summary: clubSummary('汉服文化、传统礼仪和传统文化展示', 'active'), source: officialSources.clubShowcase2026 },
  { slug: 'dance-association', name: '舞蹈协会', group: '文化艺术', direction: '舞蹈训练、舞台展示和校园文艺活动', summary: clubSummary('舞蹈训练、舞台展示和校园文艺活动', 'active'), source: officialSources.clubShowcase2026 },
  { slug: 'sunzi-art-of-war-research-association', name: '孙子兵法研究会', group: '学术兴趣', direction: '经典研读、战略思维和主题讨论', summary: clubSummary('经典研读、战略思维和主题讨论', 'lead'), source: officialSources.clubCadreAttachment2024 },
  { slug: 'speech-and-eloquence-association', name: '演讲与口才协会', group: '表达与实践', direction: '演讲、主持、辩论表达和口才训练', summary: clubSummary('演讲、主持、辩论表达和口才训练', 'lead'), source: officialSources.clubCadreAttachment2024 },
  { slug: 'calligraphy-and-painting-club', name: '书画社', group: '文化艺术', direction: '书法、绘画、作品交流和校园文化展示', summary: clubSummary('书法、绘画、作品交流和校园文化展示', 'lead'), source: officialSources.clubCadreAttachment2024 },
  { slug: 'sports-volleyball-branch', name: '体育协会排球分会', group: '体育运动', direction: '排球训练、队内交流和体育活动', summary: clubSummary('排球训练、队内交流和体育活动', 'lead'), source: officialSources.clubCadreAttachment2024 },
  { slug: 'sports-table-tennis-branch', name: '体育协会乒乓球分会', group: '体育运动', direction: '乒乓球训练、切磋和体育活动', summary: clubSummary('乒乓球训练、切磋和体育活动', 'lead'), source: officialSources.clubCadreAttachment2024 },
  { slug: 'sports-taekwondo-branch', name: '体育协会跆拳道分会', group: '体育运动', direction: '跆拳道训练、体能提升和体育活动', summary: clubSummary('跆拳道训练、体能提升和体育活动', 'lead'), source: officialSources.clubCadreAttachment2024 },
  { slug: 'sports-football-branch', name: '体育协会足球分会', group: '体育运动', direction: '足球训练、校内比赛和体育活动', summary: clubSummary('足球训练、校内比赛和体育活动', 'lead'), source: officialSources.clubCadreAttachment2024 },
  { slug: 'sports-orienteering-branch', name: '体育协会定向越野分会', group: '体育运动', direction: '定向越野、户外识图和体能活动', summary: clubSummary('定向越野、户外识图和体能活动', 'lead'), source: officialSources.clubCadreAttachment2024 },
  { slug: 'innovation-invention-association', name: '创新发明协会', group: '科技创新', direction: '创新项目、发明实践和竞赛准备', summary: clubSummary('创新项目、发明实践和竞赛准备', 'lead'), source: officialSources.clubCadreAttachment2024 },
  { slug: 'computer-association', name: '计算机协会', group: '科技创新', direction: '编程、计算机技术交流和实践项目', summary: clubSummary('编程、计算机技术交流和实践项目', 'lead'), source: officialSources.clubCadreAttachment2024 },
  { slug: 'electronic-mathematical-modeling-association', name: '电子数模协会', group: '科技创新', direction: '电子技术、数学建模和竞赛实践', summary: '数学系2025年竞赛通知明确该协会是校内数学建模竞赛协办单位，可确认近期有正式活动证据。适合想了解电子技术、数学建模和竞赛实践的新生先收藏；2026级招新时间、报名方式和当前注册状态仍待校团委或协会负责人确认。', source: officialSources.electronicModelingAssociation2025, verification: 'lead' },
  { slug: 'hongcheng-literature-club', name: '红城文学社', group: '文化艺术', direction: '文学写作、阅读交流和作品分享', summary: clubSummary('文学写作、阅读交流和作品分享', 'lead'), source: officialSources.clubCadreAttachment2024 },
  { slug: 'english-learning-club', name: '英语学习社', group: '语言学习', direction: '英语学习、口语交流和语言能力提升', summary: clubSummary('英语学习、口语交流和语言能力提升', 'lead'), source: officialSources.clubCadreAttachment2024 },
  { slug: 'psychology-association', name: '心理协会', group: '成长支持', direction: '心理健康知识、同伴支持和主题活动', summary: clubSummary('心理健康知识、同伴支持和主题活动', 'active'), source: officialSources.psychologyAssociationActivity2026, verification: 'active' },
  { slug: 'xi-jinping-thought-reading-club', name: '习近平新时代中国特色社会主义思想读书社', group: '思想政治学习', direction: '理论学习、读书交流和主题教育活动', summary: clubSummary('理论学习、读书交流和主题教育活动', 'lead'), source: officialSources.clubCadreAttachment2024 },
  { slug: 'red-cross-society', name: '红十字会', group: '志愿公益', direction: '红十字知识、公益服务和应急救护相关活动', summary: clubSummary('红十字知识、公益服务和应急救护相关活动', 'active'), source: officialSources.redCrossRecognition2026, verification: 'active' }
]

export function findOfficialClub(slug: string) {
  return officialClubs.find(club => club.slug === slug)
}

export const officialDepartments: OfficialDepartment[] = [
  {
    slug: 'school-of-economics',
    name: '经济学院',
    summary: '学院开设经济学、金融学、国际经济与贸易、金融科技4个本科专业；新生可在官网查看专业介绍、课程实践、竞赛和学院通知。',
    website: 'https://jjxy.yeu.edu.cn/',
    profileUrl: 'https://jjxy.yeu.edu.cn/973/list.htm',
    contactUrl: 'https://jjxy.yeu.edu.cn/lxwm/list.htm',
    phone: '0595-22099010',
    verifiedAt: '2026-07-15',
    verificationState: 'verified',
    verificationNote: '学院简介、专业清单和学院办公室电话已于2026-07-15按官网页面核对。'
  },
  {
    slug: 'school-of-management',
    name: '管理学院',
    summary: '学院创设于2007年，开设工商管理、市场营销、物流管理、人力资源管理、工业工程5个本科专业；官网可查询专业介绍和学院通知。',
    website: 'https://glxy.yeu.edu.cn/',
    profileUrl: 'https://glxy.yeu.edu.cn/281/list.htm',
    verifiedAt: '2026-07-15',
    verificationState: 'verified',
    verificationNote: '学院简介和5个本科专业已于2026-07-15按官网核对；官网“联系方式”页面未给出可读取的办公电话，因此暂不填写。'
  },
  {
    slug: 'school-of-accounting',
    name: '会计学院',
    summary: '学院肇始于1994年设立的会计学系，2014年独立建院；现设会计学、财务管理两系，两专业均包含普通本科和专升本培养，新生可从官网查询本院通知。',
    website: 'https://kjxy.yeu.edu.cn/',
    profileUrl: 'https://kjxy.yeu.edu.cn/37/list.htm',
    verifiedAt: '2026-07-15',
    verificationState: 'verified',
    verificationNote: '学院沿革、专业设置及普通本科、专升本培养类型已于2026-07-15按官网学院简介核对；未找到学院公开办公电话。'
  },
  {
    slug: 'school-of-computer-science-and-engineering',
    name: '计算机科学与工程学院',
    summary: '学院独立官网已经上线，可查询计算机、网络工程、物联网等相关栏目；网站仍混有原工程技术学院历史内容，2026级专业归属应以录取材料和学院最新通知为准。',
    website: 'https://computer.yeu.edu.cn/',
    verifiedAt: '2026-07-15',
    verificationState: 'partial',
    verificationNote: '独立官网入口已于2026-07-15核对；因官网仍混有原工程技术学院内容，未把旧学院人数和完整专业清单写成新学院现状。'
  },
  {
    slug: 'school-of-humanities',
    name: '人文学院',
    summary: '学院成立于2007年，下设中国语言文学、新闻传播、品牌传播3个系，开设汉语言文学、广告学、网络与新媒体、新闻学4个专业，新生可从官网查看专业介绍。',
    website: 'https://rwxy.yeu.edu.cn/',
    profileUrl: 'https://rwxy.yeu.edu.cn/136/list.htm',
    contactUrl: 'https://rwxy.yeu.edu.cn/138/list.htm',
    phone: '0595-22099012',
    address: '福建省泉州市洛江区马甲镇仰恩大学第三教学区',
    verifiedAt: '2026-07-15',
    verificationState: 'verified',
    verificationNote: '学院沿革、系与专业清单、学院电话和地址已于2026-07-15按官网核对。'
  },
  {
    slug: 'school-of-foreign-languages',
    name: '外国语学院',
    summary: '学院成立于2010年，现有英语系、大学英语教学部、外籍教师教学部3个二级单位，开设英语和商务英语两个专业，新生可从官网查询学院通知。',
    website: 'https://sofl.yeu.edu.cn/',
    profileUrl: 'https://sofl.yeu.edu.cn/143/list.htm',
    verifiedAt: '2026-07-15',
    verificationState: 'verified',
    verificationNote: '学院沿革、3个二级单位和两个专业已于2026-07-15按官网学院概况核对；未找到学院公开办公电话。'
  },
  {
    slug: 'school-of-law',
    name: '法学院',
    summary: '学院现设法学1个本科专业，强调法商融合和法治实践，并建有模拟诉讼实验室、法律诊所实验室等实践平台；新生可从官网查看学院通知。',
    website: 'https://fxy.yeu.edu.cn/',
    profileUrl: 'https://fxy.yeu.edu.cn/296/list.htm',
    verifiedAt: '2026-07-15',
    verificationState: 'verified',
    verificationNote: '专业设置、培养方向和实践平台已于2026-07-15按官网学院概况核对；未找到学院公开办公电话。'
  },
  {
    slug: 'school-of-arts-and-education',
    name: '艺术与教育学院',
    summary: '学院成立于2022年，下设艺术教育系和艺术通识教育中心；艺术教育专业自2022年9月开始招生，通识教育中心承担全校公共美育课程和大学生艺术团工作。',
    website: 'https://art.yeu.edu.cn/',
    profileUrl: 'https://art.yeu.edu.cn/xyjj/list.htm',
    verifiedAt: '2026-07-15',
    verificationState: 'verified',
    verificationNote: '学院沿革、机构设置、艺术教育专业和公共美育职责已于2026-07-15按官网学院简介核对；活动公示中的临时联系电话不作为学院办公电话。'
  },
  {
    slug: 'school-of-marxism',
    name: '马克思主义学院',
    summary: '学院成立于2019年，承担全校思想道德与法治、马克思主义基本原理、中国近现代史纲要、形势与政策等思想政治理论课程教学，学生可从官网查询课程与实践通知。',
    website: 'https://marx.yeu.edu.cn/',
    profileUrl: 'https://marx.yeu.edu.cn/201/list.htm',
    contactUrl: 'https://marx.yeu.edu.cn/2019/0321/c286a5830/page.htm',
    phone: '0595-22098516',
    email: 'mayuanyeu@163.com',
    address: '福建省泉州市洛江区仰恩大学普照楼311室',
    verifiedAt: '2026-07-15',
    verificationState: 'verified',
    verificationNote: '学院沿革、课程职责、办公电话、邮箱和地址已于2026-07-15按官网核对。'
  },
  {
    slug: 'school-of-continuing-education',
    name: '继续教育学院',
    summary: '学院负责成人高等学历教育、高等自学考试和非学历教育培训；普通本科和专升本新生一般无需在这里办理日常学籍事项。',
    website: 'https://jxjy.yeu.edu.cn/',
    profileUrl: 'https://jxjy.yeu.edu.cn/xyjj/list.htm',
    verifiedAt: '2026-07-15',
    verificationState: 'verified',
    verificationNote: '学院职责和办学类型已于2026-07-15按官网学院简介核对；未找到学院公开办公电话。'
  },
  {
    slug: 'physical-education-department',
    name: '体育教研部',
    summary: '体育教研部自1987年成立以来主要承担全校体育教学，坚持体育教学四年不断线；官网可查看体育课、体测和体育活动通知。',
    website: 'https://tiyu.yeu.edu.cn/',
    profileUrl: 'https://tiyu.yeu.edu.cn/4173/list.htm',
    verifiedAt: '2026-07-15',
    verificationState: 'verified',
    verificationNote: '部门沿革、全校体育教学职责和课程方向已于2026-07-15按官网部门概况核对；未找到公开办公电话。'
  },
  {
    slug: 'military-theory-department',
    name: '军事理论教研部（党委武装部）',
    summary: '人民武装部与军事理论教研部于2011年成立并合署办公，分别承担国防教育、征兵工作，以及新生军事技能训练、军事理论和孙子兵法等课程教学。',
    website: 'https://wzb.yeu.edu.cn/',
    profileUrl: 'https://wzb.yeu.edu.cn/bmgk_1074/list.htm',
    verifiedAt: '2026-07-15',
    verificationState: 'verified',
    verificationNote: '成立时间、合署办公关系和军训、课程、征兵职责已于2026-07-15按官网部门概况核对；未找到公开办公电话。'
  },
  {
    slug: 'school-of-ai-and-data-science',
    name: '人工智能与数据科学学院',
    summary: '学院独立官网已经上线，可查询人工智能、数据科学相关教学科研和学院通知；网站仍混有原工程技术学院内容，2026级专业归属以录取材料和学院最新通知为准。',
    website: 'https://ai.yeu.edu.cn/',
    verifiedAt: '2026-07-15',
    verificationState: 'partial',
    verificationNote: '独立官网入口已于2026-07-15核对；因官网仍混有原工程技术学院内容，未把旧学院介绍写成新学院现状。'
  },
  {
    slug: 'school-of-electrical-engineering-and-automation',
    name: '电气工程与自动化学院',
    summary: '学院独立官网已经上线，可查询学院概况、专业介绍、教学科研和通知公告；当前可独立核对的院情资料较少，2026级专业归属以录取材料和学院最新通知为准。',
    website: 'https://dqgc.yeu.edu.cn/',
    verifiedAt: '2026-07-15',
    verificationState: 'partial',
    verificationNote: '独立官网入口和栏目已于2026-07-15核对；官网暂未提供足以独立确认的新学院完整简介和办公电话，因此不补写人数或专业清单。'
  },
  {
    slug: 'teaching-affairs-office',
    name: '教务部',
    summary: '新生查询学籍、课表、选课、考试、成绩、补缓考和教学管理规则的官方入口。',
    website: 'https://jwb.yeu.edu.cn/',
    phone: '0595-22082006',
    email: 'yeujwb@yeu.edu.cn'
  },
  {
    slug: 'university-office',
    name: '学校办公室',
    summary: '新生查看校历、校级通知、节假日安排、学校办公室信息和全校性安排的官方入口。',
    website: 'https://bgs.yeu.edu.cn/'
  },
  {
    slug: 'admissions-office',
    name: '招生办公室',
    summary: '本科和专升本新生查询招生章程、录取进度、通知书和入学前咨询的官方入口。',
    website: 'https://zhaosheng.yeu.edu.cn/',
    phone: '0595-22091988 / 0595-22085622',
    email: 'yeu@yeu.edu.cn'
  },
  {
    slug: 'student-affairs',
    name: '学生事务部',
    summary: '新生查询学生资助、心理健康、就业指导、一站式社区、学生管理规章和相关服务入口。',
    website: 'https://xsb.yeu.edu.cn/',
    phone: '0595-22082008'
  },
  {
    slug: 'information-office',
    name: '实验室与信息化管理处',
    summary: '新生处理校园网、统一认证、VPN、网络故障和信息化服务问题的主管部门入口。',
    website: 'https://metc.yeu.edu.cn/',
    phone: '0595-22098521 / 0595-22087606'
  },
  {
    slug: 'financial-aid-center',
    name: '学生资助中心',
    summary: '新生查询家庭经济困难认定、助学贷款、奖助学金和资助业务咨询的官方入口。',
    website: 'https://xsb.yeu.edu.cn/127/list.htm',
    phone: '0595-22099018'
  },
  {
    slug: 'mental-health-center',
    name: '心理健康教育与咨询中心',
    summary: '新生了解心理咨询预约、适应支持、心理健康教育、隐私提醒和相关活动的官方入口。',
    website: 'https://xsb.yeu.edu.cn/128/list.htm',
    phone: '0595-22099033'
  },
  {
    slug: 'finance-office',
    name: '财务处',
    summary: '新生查询学费住宿费缴纳、票据、退款提醒、缴费风险提示和学校财务政策的官方入口。',
    website: 'https://uf.yeu.edu.cn/',
    phone: '财务咨询：0595-22082010'
  },
  {
    slug: 'general-affairs-office',
    name: '总务处',
    summary: '新生处理宿舍管理、维修报修、水电家具、生活设施和校园生活服务问题的官方入口。',
    website: 'https://zwc.yeu.edu.cn/',
    phone: '宿舍水电/家具报修：0595-22076110'
  },
  {
    slug: 'security-office',
    name: '保卫处',
    summary: '新生处理校园安全、反诈提醒、交通秩序、消防隐患、失物风险和求助事项的官方入口。',
    website: 'https://bwc.yeu.edu.cn/'
  },
  {
    slug: 'campus-clinic',
    name: '医务室',
    summary: '新生了解校内医务室值班、基础就医和健康咨询信息的入口；直拨电话仍需当学期复核。',
    website: 'https://www.yeu.edu.cn/yws/list.htm'
  },
  {
    slug: 'youth-league',
    name: '校团委',
    summary: '新生查看社团招新、校园文化、志愿服务、团学活动和青年工作通知的官方入口。',
    website: 'https://youth.yeu.edu.cn/',
    phone: '0595-22098512'
  },
  {
    slug: 'library',
    name: '图书馆',
    summary: '新生查询图书馆开放时间、借阅规则、馆藏检索、学习空间和读者服务的官方入口。',
    website: 'https://library.yeu.edu.cn/',
    phone: '借阅部：0595-22099025 / 0595-22099026'
  }
]

export function findFreshmanGuide(slug: string) {
  return freshmanGuides.find(guide => guide.slug === slug)
}

export function findOfficialDepartment(slug: string) {
  return officialDepartments.find(department => department.slug === slug)
}
