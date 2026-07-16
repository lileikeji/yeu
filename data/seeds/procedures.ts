import { officialSources } from './public-content'

export interface ProcedureSeedSource {
  url: string
  claimScope: string
  isPrimary?: boolean
}

export interface ProcedureSeedStep {
  id: string
  title: string
  description: string
  audience: Array<'undergraduate' | 'transfer'>
  informationState: 'confirmed' | 'partial' | 'awaiting-notice'
  timeText: string | null
  actionUrl: string | null
  departmentSlug: string | null
  placeSlug: string | null
}

export interface ProcedureSeedMaterial {
  id: string
  name: string
  description: string
  audience: Array<'undergraduate' | 'transfer'>
  isRequired: boolean | null
  informationState: 'confirmed' | 'partial' | 'awaiting-notice'
  departmentSlug: string | null
  placeSlug: string | null
}

export interface ProcedureSeed {
  id: string
  slug: string
  title: string
  summary: string
  body: string
  category: string
  audience: Array<'undergraduate' | 'transfer'>
  method: 'online' | 'offline' | 'mixed'
  informationState: 'confirmed' | 'partial' | 'awaiting-notice'
  statusText: string
  processingTime: string | null
  deadlineText: string | null
  startsAt: string | null
  endsAt: string | null
  validFrom: string | null
  validUntil: string | null
  lastVerifiedAt: string
  departmentSlug: string | null
  guideSlug: string | null
  sources: ProcedureSeedSource[]
  steps: ProcedureSeedStep[]
  materials: ProcedureSeedMaterial[]
}

const allFreshmen = ['undergraduate', 'transfer'] as const

export const procedureSeeds: ProcedureSeed[] = [
  {
    id: '3c27af39-73e5-4f69-a9d1-4e02c03c6d19',
    slug: 'arrival',
    title: '2026级新生报到',
    summary: '学校已确认9月5日至6日注册报到、9月7日至9日入学教育、9月10日上课；个人时段、材料、具体报到点和接站安排待学校通知。',
    body: '这条流程给新生按顺序核对报到事项。当前官方来源已经能确认2026级新生注册报到日期是9月5日至6日，9月7日至9日参加入学教育，9月10日开始上课；但个人报到时段、具体窗口、材料清单、接站安排和宿舍衔接还没有公开到可逐项写死的程度。这里先把已确认事项和待通知事项分开，避免把往年经验或群聊截图当成今年通知。',
    category: 'arrival',
    audience: [...allFreshmen],
    method: 'mixed',
    informationState: 'partial',
    statusText: '报到日期已确认，个人时段、材料、点位和接站待通知',
    processingTime: null,
    deadlineText: '2026年9月5日至6日；个人日期和时段以录取通知书及学校后续通知为准。',
    startsAt: '2026-09-05T00:00:00+08:00',
    endsAt: '2026-09-06T23:59:59+08:00',
    validFrom: null,
    validUntil: '2026-09-06T23:59:59+08:00',
    lastVerifiedAt: '2026-07-13T00:00:00+08:00',
    departmentSlug: 'admissions-office',
    guideSlug: 'arrival',
    sources: [
      {
        url: officialSources.academicCalendar2026Fall.url,
        claimScope: '2026级新生9月5日至6日注册报到、9月7日至9日入学教育、9月10日上课',
        isPrimary: true
      },
      {
        url: officialSources.admissions.url,
        claimScope: '招生办公室官方信息入口'
      },
      {
        url: officialSources.undergraduateRules2026.url,
        claimScope: '普通本科招生信息、学校地址与招生咨询边界'
      },
      {
        url: officialSources.transferRules2026.url,
        claimScope: '专升本招生信息、学校地址与招生咨询边界'
      }
    ],
    steps: [
      {
        id: '0352ce0d-8bb6-46d7-aa3d-9639d2f1cdf1',
        title: '核对录取类型和官方通知',
        description: '确认自己是普通本科还是专升本，只从对应招生页面、录取通知书及学校官方通知核对个人安排。',
        audience: [...allFreshmen],
        informationState: 'confirmed',
        timeText: '到校前',
        actionUrl: officialSources.admissions.url,
        departmentSlug: 'admissions-office',
        placeSlug: null
      },
      {
        id: '2b918106-274e-441e-a54f-524c52eccdf0',
        title: '记录学校公布的报到日期',
        description: '学校2026-2027学年第一学期校历明确，2026级新生于9月5日至6日注册报到。校历未区分普通本科与专升本。',
        audience: [...allFreshmen],
        informationState: 'confirmed',
        timeText: '2026年9月5日至6日',
        actionUrl: officialSources.academicCalendar2026Fall.url,
        departmentSlug: null,
        placeSlug: null
      },
      {
        id: 'df72174a-719b-4780-bfba-d359a7c9ce2e',
        title: '核对个人时段与材料清单',
        description: '2026公开来源尚未列明个人报到时段、原件或复印件、照片及线上预办理清单；收到录取通知书或当年报到通知后再逐项核对。',
        audience: [...allFreshmen],
        informationState: 'awaiting-notice',
        timeText: '待个人通知',
        actionUrl: null,
        departmentSlug: 'admissions-office',
        placeSlug: null
      },
      {
        id: '78c98a4f-61b6-4890-8944-76917f66dfd1',
        title: '确认入校与接站安排',
        description: '学校公开校址为福建省泉州市洛江区马甲镇仰恩大学，邮编362014；具体报到点、入校路线和接站安排待通知，在明确点位前不提供报到点导航。',
        audience: [...allFreshmen],
        informationState: 'awaiting-notice',
        timeText: '待学校通知',
        actionUrl: null,
        departmentSlug: 'admissions-office',
        placeSlug: null
      },
      {
        id: '43dd567b-6257-4054-8969-a5143e6c0dcc',
        title: '按个人通知完成现场报到',
        description: '当前仅确认注册报到日期；现场办理顺序、具体窗口及宿舍衔接尚未从2026公开来源确认。',
        audience: [...allFreshmen],
        informationState: 'awaiting-notice',
        timeText: '2026年9月5日至6日内的个人时段待通知',
        actionUrl: null,
        departmentSlug: null,
        placeSlug: null
      },
      {
        id: '8ba6737f-e544-4772-a2a5-3242d5c0a1f0',
        title: '参加新生入学教育',
        description: '学校2026-2027学年第一学期校历明确，新生9月7日至9日参加入学教育。具体集合地点、学院分组和每日安排以学院或辅导员通知为准。',
        audience: [...allFreshmen],
        informationState: 'confirmed',
        timeText: '2026年9月7日至9日',
        actionUrl: officialSources.academicCalendar2026Fall.url,
        departmentSlug: 'teaching-affairs-office',
        placeSlug: null
      },
      {
        id: '78c707cb-9b52-4bc1-8509-f5f0ca93320d',
        title: '按课表开始上课',
        description: '校历明确9月10日开始上课。个人课表、教材领取、选课或补退选事项，要以教务部、学院和辅导员当年通知为准。',
        audience: [...allFreshmen],
        informationState: 'confirmed',
        timeText: '2026年9月10日',
        actionUrl: officialSources.academicCalendar2026Fall.url,
        departmentSlug: 'teaching-affairs-office',
        placeSlug: null
      }
    ],
    materials: []
  },
  {
    id: '227f6122-507e-4425-80ba-bf59493650e2',
    slug: 'campus-network',
    title: '校园网与统一认证排查',
    summary: '先按信息化管理处校园网指南核对覆盖范围、账号入口和常见问题；宿舍区网络、账号异常和设备报错要带截图咨询。',
    body: '这条流程给新生处理“连不上校园网、认证不了、账号不知道怎么用”的情况。公开来源能确认校园网指南和信息化管理处入口，但个人账号、初始密码、宿舍区网络细节和报修渠道可能随当年安排变化，不能在这里猜默认密码。',
    category: 'life-service',
    audience: [...allFreshmen],
    method: 'mixed',
    informationState: 'partial',
    statusText: '校园网指南已整理，个人账号和宿舍网络细节以当年通知为准',
    processingTime: null,
    deadlineText: null,
    startsAt: null,
    endsAt: null,
    validFrom: null,
    validUntil: null,
    lastVerifiedAt: '2026-07-14T00:00:00+08:00',
    departmentSlug: 'information-office',
    guideSlug: 'campus-card-network',
    sources: [
      {
        url: officialSources.campusNetwork.url,
        claimScope: '校园网使用指南、覆盖范围和使用提醒',
        isPrimary: true
      },
      {
        url: officialSources.informationOffice.url,
        claimScope: '实验室与信息化管理处官方入口'
      }
    ],
    steps: [
      {
        id: 'f83d325e-3bb9-4b67-8d52-1bcd9da07f85',
        title: '先看校园网指南，不猜默认密码',
        description: '先打开信息化管理处发布的校园网使用指南，核对覆盖范围、认证入口和注意事项；系统不公开或猜测个人账号初始密码。',
        audience: [...allFreshmen],
        informationState: 'confirmed',
        timeText: '入校前后都可先看',
        actionUrl: officialSources.campusNetwork.url,
        departmentSlug: 'information-office',
        placeSlug: null
      },
      {
        id: '483c9d8d-172f-4254-a790-27b61b81b056',
        title: '确认问题发生在哪里',
        description: '记录是在教学区、图书馆、宿舍区还是手机流量环境下出问题。公开指南提到的覆盖范围不等于所有宿舍网络细节，宿舍网络以当年通知和现场说明为准。',
        audience: [...allFreshmen],
        informationState: 'partial',
        timeText: '出现问题时',
        actionUrl: null,
        departmentSlug: 'information-office',
        placeSlug: null
      },
      {
        id: '93135b3e-847d-4e73-8952-6c283280bdd5',
        title: '保存错误截图和设备信息',
        description: '咨询前准备设备类型、系统、账号、错误页面截图、所在楼栋或教室、发生时间。不要在公开群里发送完整身份证号、密码或验证码。',
        audience: [...allFreshmen],
        informationState: 'confirmed',
        timeText: '联系处理前',
        actionUrl: null,
        departmentSlug: 'information-office',
        placeSlug: null
      },
      {
        id: '6731e42a-e1fb-43fc-8a47-b420de5f291c',
        title: '按信息化管理处入口咨询',
        description: '账号、认证、网络故障等问题优先按信息化管理处官方入口处理；如果是宿舍内设备或线路问题，现场可能还需要总务或运营方配合。',
        audience: [...allFreshmen],
        informationState: 'partial',
        timeText: '无法自行解决时',
        actionUrl: officialSources.informationOffice.url,
        departmentSlug: 'information-office',
        placeSlug: null
      }
    ],
    materials: [
      {
        id: '46a92b98-113c-4088-b5ec-c9408317e851',
        name: '错误截图和设备信息',
        description: '包括错误提示、设备系统、所在位置和发生时间；不要公开发送密码、验证码和完整证件号。',
        audience: [...allFreshmen],
        isRequired: null,
        informationState: 'confirmed',
        departmentSlug: 'information-office',
        placeSlug: null
      }
    ]
  },
  {
    id: 'ee9c7e8d-ba56-4653-ba9b-0471b7e8cecf',
    slug: 'dorm-repair',
    title: '宿舍维修报修',
    summary: '宿舍设施损坏先按总务处报修流程处理；紧急安全问题不要只等线上反馈，应马上联系宿管、辅导员或现场管理人员。',
    body: '这条流程用于宿舍门锁、水电、家具、空调等生活设施问题。总务处公开了报修流程、宿舍维修管理规定和宿舍管理办法；具体入口、受理时段和维修单状态以总务处当年页面或现场说明为准。',
    category: 'life-service',
    audience: [...allFreshmen],
    method: 'mixed',
    informationState: 'partial',
    statusText: '报修制度和流程有官方来源，具体入口与工单状态以总务处通知为准',
    processingTime: '一般故障按维修管理规定处理；紧急安全问题应立即联系现场管理人员。',
    deadlineText: null,
    startsAt: null,
    endsAt: null,
    validFrom: null,
    validUntil: null,
    lastVerifiedAt: '2026-07-14T00:00:00+08:00',
    departmentSlug: 'general-affairs-office',
    guideSlug: 'find-campus',
    sources: [
      {
        url: officialSources.repairProcess2025.url,
        claimScope: '总务处报修流程',
        isPrimary: true
      },
      {
        url: officialSources.dormMaintenance2025.url,
        claimScope: '学生宿舍维修管理规定'
      },
      {
        url: officialSources.dormRules2025.url,
        claimScope: '学生宿舍管理办法'
      }
    ],
    steps: [
      {
        id: '4b44822b-4128-4d0e-becb-60f4cb96a8ed',
        title: '判断是否紧急',
        description: '漏电、冒烟、严重漏水、门锁无法保障安全等情况不要只提交网页报修，应立即联系宿管、辅导员或现场管理人员。',
        audience: [...allFreshmen],
        informationState: 'confirmed',
        timeText: '发现故障时',
        actionUrl: null,
        departmentSlug: 'general-affairs-office',
        placeSlug: null
      },
      {
        id: '77d6349c-2b6f-4d54-8637-d934f6035888',
        title: '按总务处报修流程提交',
        description: '普通维修按总务处报修流程处理，提交前写清宿舍楼、房间、故障位置和现象，并上传清楚照片。',
        audience: [...allFreshmen],
        informationState: 'confirmed',
        timeText: '普通故障发现后',
        actionUrl: officialSources.repairProcess2025.url,
        departmentSlug: 'general-affairs-office',
        placeSlug: null
      },
      {
        id: 'a2750d00-2e11-4863-9732-10524df3b8f3',
        title: '保留报修记录',
        description: '保存提交时间、故障照片和报修记录，方便后续查询或向宿管、辅导员说明情况。',
        audience: [...allFreshmen],
        informationState: 'partial',
        timeText: '提交后',
        actionUrl: null,
        departmentSlug: 'general-affairs-office',
        placeSlug: null
      },
      {
        id: 'd5cf615f-a5d2-49c2-ab1d-cb08c8f7fa62',
        title: '维修后确认是否解决',
        description: '维修完成后现场确认是否恢复；如果仍有问题，带原报修记录继续反馈，不要重复提交含糊描述。',
        audience: [...allFreshmen],
        informationState: 'partial',
        timeText: '维修完成后',
        actionUrl: null,
        departmentSlug: 'general-affairs-office',
        placeSlug: null
      }
    ],
    materials: [
      {
        id: '27ea790f-5d35-48d7-bab7-b5ef698e7ff3',
        name: '宿舍楼栋、房间号和故障照片',
        description: '用于让维修人员定位问题；照片应拍清楚故障位置，不要包含他人隐私物品。',
        audience: [...allFreshmen],
        isRequired: true,
        informationState: 'confirmed',
        departmentSlug: 'general-affairs-office',
        placeSlug: null
      }
    ]
  },
  {
    id: '33390be2-b547-4a99-a595-67563f0328e3',
    slug: 'library-card-wechat',
    title: '图书馆借阅证与微信绑定',
    summary: '新生想借书、查馆藏或用图书馆微信服务，先看图书馆借阅规定、开放时间和微信平台绑定借阅证流程。',
    body: '这条流程用于“怎么进图书馆、怎么借书、怎么绑定借阅证”。公开来源能确认图书馆开放时间、借阅规定和微信平台绑定流程；如果新生账号、入馆权限或具体开放安排发生临时变化，以图书馆最新通知为准。',
    category: 'study',
    audience: [...allFreshmen],
    method: 'online',
    informationState: 'confirmed',
    statusText: '图书馆开放时间、借阅规定和微信绑定流程有官方来源',
    processingTime: null,
    deadlineText: null,
    startsAt: null,
    endsAt: null,
    validFrom: null,
    validUntil: null,
    lastVerifiedAt: '2026-07-14T00:00:00+08:00',
    departmentSlug: 'library',
    guideSlug: 'study-library',
    sources: [
      {
        url: officialSources.libraryWechatBinding2025.url,
        claimScope: '微信平台绑定借阅证流程',
        isPrimary: true
      },
      {
        url: officialSources.libraryBorrowingRules.url,
        claimScope: '图书馆借阅规定'
      },
      {
        url: officialSources.libraryHours.url,
        claimScope: '图书馆开馆时间入口'
      }
    ],
    steps: [
      {
        id: 'c63d6ad3-8f4f-4cdc-a48b-b5b93a49ef6d',
        title: '先看开馆时间和借阅规定',
        description: '去图书馆前先确认当前开放时间、借阅权限和借还规则；考试周、节假日或临时调整以图书馆最新通知为准。',
        audience: [...allFreshmen],
        informationState: 'confirmed',
        timeText: '第一次去图书馆前',
        actionUrl: officialSources.libraryHours.url,
        departmentSlug: 'library',
        placeSlug: null
      },
      {
        id: 'b2f81f3e-571b-4f6f-bcaa-dbe27516f359',
        title: '按图书馆流程绑定借阅证',
        description: '需要使用微信平台服务时，按图书馆发布的“微信平台绑定借阅证流程”操作；账号或证件号规则以页面说明为准。',
        audience: [...allFreshmen],
        informationState: 'confirmed',
        timeText: '需要微信服务时',
        actionUrl: officialSources.libraryWechatBinding2025.url,
        departmentSlug: 'library',
        placeSlug: null
      },
      {
        id: '62f1b0b1-2674-4ebe-baa6-26ac7c863ce0',
        title: '借书前核对借阅规则',
        description: '借阅册数、期限、续借、逾期等规则以图书馆借阅规定为准；不要只按学长学姐经验判断。',
        audience: [...allFreshmen],
        informationState: 'confirmed',
        timeText: '借书前',
        actionUrl: officialSources.libraryBorrowingRules.url,
        departmentSlug: 'library',
        placeSlug: null
      },
      {
        id: '7ab11e94-b2bd-4913-a061-8cbe4594dc0f',
        title: '绑定失败时联系图书馆',
        description: '如果提示账号不存在、证件不匹配或无法绑定，保留错误截图，通过图书馆官方入口咨询。',
        audience: [...allFreshmen],
        informationState: 'partial',
        timeText: '绑定失败时',
        actionUrl: officialSources.libraryContact.url,
        departmentSlug: 'library',
        placeSlug: null
      }
    ],
    materials: [
      {
        id: 'b959dad6-6e20-4384-bc5d-a4f19bf57107',
        name: '学号或借阅证相关信息',
        description: '按图书馆页面要求填写；不要把完整证件号、验证码或个人隐私截图发到公开群。',
        audience: [...allFreshmen],
        isRequired: null,
        informationState: 'partial',
        departmentSlug: 'library',
        placeSlug: null
      }
    ]
  },
  {
    id: 'e1caed33-5458-4248-a44b-f5cddfc48f9d',
    slug: 'transfer-archive-mailing',
    title: '专升本学生档案邮寄',
    summary: '专升本新生档案邮寄以招生办公室2026年档案邮寄说明为准；普通本科新生不要套用专升本档案流程。',
    body: '这条流程只面向专升本新生，用于处理学生档案邮寄。公开来源是招生办公室2026年专升本学生档案邮寄说明和专升本招生章程；邮寄地址、收件信息、材料要求和时间要求必须逐字核对官方页面，不要按截图转述操作。',
    category: 'arrival',
    audience: ['transfer'],
    method: 'offline',
    informationState: 'confirmed',
    statusText: '专升本档案邮寄说明已发布，按招生办公室页面执行',
    processingTime: null,
    deadlineText: '以招生办公室2026年专升本档案邮寄说明为准。',
    startsAt: null,
    endsAt: null,
    validFrom: null,
    validUntil: null,
    lastVerifiedAt: '2026-07-15T00:00:00+08:00',
    departmentSlug: 'admissions-office',
    guideSlug: 'arrival',
    sources: [
      {
        url: officialSources.transferArchive2026.url,
        claimScope: '2026年专升本学生档案邮寄说明',
        isPrimary: true
      },
      {
        url: officialSources.transferRules2026.url,
        claimScope: '2026年专升本招生章程和招生咨询边界'
      },
      {
        url: officialSources.admissions.url,
        claimScope: '招生办公室官方入口'
      }
    ],
    steps: [
      {
        id: '7756755b-80ea-4e2d-acc8-e6ddadd1bc12',
        title: '确认自己属于专升本新生',
        description: '本流程只适用于2026年专升本学生档案邮寄；普通本科新生档案事项如有安排，应看普通本科对应通知或录取材料。',
        audience: ['transfer'],
        informationState: 'confirmed',
        timeText: '邮寄前',
        actionUrl: officialSources.transferRules2026.url,
        departmentSlug: 'admissions-office',
        placeSlug: null
      },
      {
        id: 'f6138cc0-4254-44a9-8baf-63a38429ef82',
        title: '逐字核对档案邮寄说明',
        description: '打开招生办公室发布的2026年专升本学生档案邮寄说明，核对收件单位、地址、联系人、电话、邮编和备注要求。',
        audience: ['transfer'],
        informationState: 'confirmed',
        timeText: '邮寄前',
        actionUrl: officialSources.transferArchive2026.url,
        departmentSlug: 'admissions-office',
        placeSlug: null
      },
      {
        id: '9fde8e88-6a05-4f06-bdf6-5e37b6f3457d',
        title: '按原学校或档案管理单位要求办理寄出',
        description: '档案通常由原学校或档案管理单位按规定寄送；个人是否能自带、是否需要密封件，以官方说明和原单位要求为准。',
        audience: ['transfer'],
        informationState: 'partial',
        timeText: '原单位办理时',
        actionUrl: null,
        departmentSlug: 'admissions-office',
        placeSlug: null
      },
      {
        id: 'ee6a49d5-0dea-4cc5-8549-2ac4d1601e98',
        title: '保存寄件凭证',
        description: '保留快递单号、寄出时间和官方说明截图，后续查询或咨询招生办公室时使用。',
        audience: ['transfer'],
        informationState: 'confirmed',
        timeText: '寄出后',
        actionUrl: null,
        departmentSlug: 'admissions-office',
        placeSlug: null
      }
    ],
    materials: [
      {
        id: '2fbb0006-ef03-4f9d-96ab-3170f7c8406d',
        name: '档案邮寄信息和寄件凭证',
        description: '以招生办公室档案邮寄说明为准保存收件信息、快递单号和寄出时间；不要在公开平台展示完整个人档案信息。',
        audience: ['transfer'],
        isRequired: true,
        informationState: 'confirmed',
        departmentSlug: 'admissions-office',
        placeSlug: null
      }
    ]
  }
]
