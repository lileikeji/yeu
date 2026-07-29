import { facultyProfiles } from './faculty-directory'

export type AssistantKnowledgeKind = 'official_reference' | 'campus_template' | 'student_experience'

export interface AssistantKnowledgeSeed {
  id: string
  kind: AssistantKnowledgeKind
  category: string
  title: string
  question: string
  answer: string
  keywords: string[]
  publicUrl?: string
  confidence: number
  sourceNote: string
}

const comprehensiveEvaluationUrl = '/student-rules#rule-comprehensive-evaluation'

export const comprehensiveEvaluationKnowledge: AssistantKnowledgeSeed[] = [
  {
    id: 'comprehensive-overview',
    kind: 'official_reference',
    category: '综合测评',
    title: '综合测评总分怎么计算',
    question: '综测怎么算，由哪些部分组成？',
    answer: '综合测评满分100分：德育25分、智育70分、体育5分。总分等于德育分、智育分和体育分相加，最终保留两位小数。系统当前以官网公开的2025版规则为准，群文件中的仰大学〔2021〕16号用于补充历史条款和表格填写说明。',
    keywords: ['综测', '综合测评', '总分', '德育', '智育', '体育', '怎么算', '计算公式'],
    publicUrl: comprehensiveEvaluationUrl,
    confidence: 100,
    sourceNote: '2025版官网规则优先；仰大学〔2021〕16号及工程技术学院表格用于交叉核对。'
  },
  {
    id: 'comprehensive-peer-review',
    kind: 'official_reference',
    category: '综合测评',
    title: '班内互评分怎么算',
    question: '综测班内互评分怎么计算？',
    answer: '班内互评分 =（个人自我评价得分 + 其他所有参评人员评分总和）÷ 班内所有参评人员人数，最高6分。工程技术学院汇总表要求填写班级、学号、参评学生姓名、每位参评人员评分、评分总和、参评人数和最终互评总分。',
    keywords: ['班内互评', '互评分', '自评分', '参评人数', '评分总和', '公式'],
    publicUrl: comprehensiveEvaluationUrl,
    confidence: 100,
    sourceNote: '仰大学〔2021〕16号与附件2班内互评汇总表。'
  },
  {
    id: 'comprehensive-intellectual',
    kind: 'official_reference',
    category: '综合测评',
    title: '智育分怎么计算',
    question: '综测智育分怎么算？',
    answer: '智育满分70分，其中基础分60分、奖励分最多10分。基础分 = 本人本学年度平均成绩 ÷ 本年级本专业最高平均成绩 × 60；本学年有补考课程的，按该课程学分扣智育分。竞赛、科研、论文、专利、职业资格和水平考试等项目可按认定规则申请奖励分。',
    keywords: ['智育', '智育基础分', '平均成绩', '专业最高成绩', '补考', '竞赛加分', '科研加分'],
    publicUrl: comprehensiveEvaluationUrl,
    confidence: 98,
    sourceNote: '仰大学〔2021〕16号；具体项目以2025版及学院当年通知为准。'
  },
  {
    id: 'comprehensive-moral-reward',
    kind: 'official_reference',
    category: '综合测评',
    title: '德育奖励分包括什么',
    question: '综测德育有哪些加分？',
    answer: '德育奖励分最多13分，常见项目包括荣誉称号、学生干部和社会工作、文化艺术或综合素质竞赛、创业、见义勇为与公益事迹、志愿服务、无偿献血、学校或学院讲座活动、校级文艺演出等。同一项目、同一作品或同类任职通常按最高项计，不重复累计。',
    keywords: ['德育加分', '德育奖励', '荣誉称号', '学生干部', '志愿服务', '无偿献血', '讲座', '创业'],
    publicUrl: comprehensiveEvaluationUrl,
    confidence: 96,
    sourceNote: '仰大学〔2021〕16号；具体可认定项目以学院当年审核口径为准。'
  },
  {
    id: 'comprehensive-volunteer',
    kind: 'official_reference',
    category: '综合测评',
    title: '志愿服务和献血怎么加分',
    question: '志愿时长和无偿献血综测加多少分？',
    answer: '2021版办法写明：志愿服务每2小时加0.15分，累计不超过3分，以校、院青年志愿者先锋队记录为准；无偿献血每次加0.5分，累计不超过1.5分，以献血证记录为准。该数值来自2021版文件，申报前要再核对2025版和学院当年通知。',
    keywords: ['志愿时长', '志愿服务', '献血', '无偿献血', '0.15', '0.5', '德育加分'],
    publicUrl: comprehensiveEvaluationUrl,
    confidence: 90,
    sourceNote: '仰大学〔2021〕16号历史条款，不作为2026年最终审核承诺。'
  },
  {
    id: 'comprehensive-deductions',
    kind: 'official_reference',
    category: '综合测评',
    title: '综测哪些情况会扣分',
    question: '旷课、迟到、处分会扣多少综测分？',
    answer: '2021版办法写明：警告、严重警告、记过、留校察看分别扣3、4、5、6分；学院或以上通报批评一般扣2分/次；旷课扣0.5分/学时，迟到或早退扣0.1分/次，三次按旷课一节计。宿舍管理、活动缺席、失信等也可能扣分。同一事件多次处置时按最高分扣一次。',
    keywords: ['综测扣分', '旷课', '迟到', '早退', '处分', '警告', '通报批评', '宿舍'],
    publicUrl: comprehensiveEvaluationUrl,
    confidence: 92,
    sourceNote: '仰大学〔2021〕16号历史条款；2025版和学院当年通知优先。'
  },
  {
    id: 'comprehensive-sports',
    kind: 'official_reference',
    category: '综合测评',
    title: '体育分怎么计算',
    question: '综测体育分怎么算？',
    answer: '体育满分5分，其中基础分3分、奖励分最多2分。2021版规定体育课和体质健康测试均达到60分及以上，可得基础分3分；任一项不及格，基础分按1分计。参加体育比赛可按级别、名次和个人或团体项目申请奖励，累计不超过2分。',
    keywords: ['体育分', '体育基础分', '体测', '体育课', '体育比赛', '体育奖励'],
    publicUrl: comprehensiveEvaluationUrl,
    confidence: 92,
    sourceNote: '仰大学〔2021〕16号历史条款；2025版和学院当年通知优先。'
  },
  {
    id: 'comprehensive-process',
    kind: 'official_reference',
    category: '综合测评',
    title: '综合测评什么时候评、怎么评',
    question: '综测什么时候开始，评审流程是什么？',
    answer: '原则上每学年开学后评上一学年（上年9月1日至当年8月31日）的表现。流程是个人自评和提交证明、班内互评、班级初评、学院审核、公示、复议、报学生事务部备案。2021版要求学院公示3个工作日，异议应在公示期内提出；毕业班另按学期安排。',
    keywords: ['综测时间', '评审流程', '个人自评', '班内互评', '公示', '复议', '9月'],
    publicUrl: comprehensiveEvaluationUrl,
    confidence: 94,
    sourceNote: '仰大学〔2021〕16号；具体日期以学院当年通知为准。'
  },
  {
    id: 'comprehensive-form-fields',
    kind: 'campus_template',
    category: '综合测评表格',
    title: '综测统计表怎么填',
    question: '综测表格怎么填，需要填哪些项目？',
    answer: '工程技术学院模板的统计表按学生填写班级代码、学号、姓名；德育分为基础分、班内互评分、奖励分、扣分；智育分为基础分、奖励分、扣分；体育分为基础分、奖励分，最后填写学年综合测评得分和综合排名。班主任、辅导员、学院秘书和分管学生工作领导按流程签字。',
    keywords: ['综测表格', '统计表', '怎么填', '字段', '班级代码', '综合排名', '签字'],
    publicUrl: comprehensiveEvaluationUrl,
    confidence: 98,
    sourceNote: '工程技术学院附件5学生综合测评统计表。'
  },
  {
    id: 'comprehensive-application-forms',
    kind: 'campus_template',
    category: '综合测评表格',
    title: '综测加分申请要准备什么',
    question: '申请综测加分需要填什么表、交什么材料？',
    answer: '模板包含个人自评报告、班内互评汇总表、社会工作加分干部考核表、创业加分认定申请表、综合测评统计表、德智体奖励分申请表和班级评议小组名单。申请表通常要写项目时间、申请理由、申请分值、对应条款、颁发部门，并把证明材料附后；不要只填一个总分。',
    keywords: ['加分申请', '证明材料', '自评报告', '干部考核表', '创业加分', '德智体奖励分', '评议小组'],
    publicUrl: comprehensiveEvaluationUrl,
    confidence: 98,
    sourceNote: '工程技术学院综测表格压缩包附件1至附件7。'
  }
]

export const verifiedNewStudentFaqKnowledge: AssistantKnowledgeSeed[] = [
  {
    id: 'faq-2026-military-training',
    kind: 'official_reference',
    category: '军训',
    title: '2026级军训时间和时长',
    question: '什么时候军训？今年是12月军训吗，多长时间？',
    answer: '学校2026—2027学年第一学期校历将2026级新生军训暂定为2026年12月13日至26日，共14天；校历同时注明这是部队初定时间，后续若有调整，以学校和学院最新通知为准。才艺表演、训练科目、服装和请假要求目前没有面向2026级的公开细则。',
    keywords: ['军训', '什么时候军训', '12月军训', '冬训', '军训几天', '军训多长时间', '才艺表演'],
    publicUrl: '/guides/study-library',
    confidence: 98,
    sourceNote: '仰恩大学2026—2027学年第一学期校历；部队安排仍可能调整。'
  },
  {
    id: 'faq-dorm-fees-occupancy',
    kind: 'official_reference',
    category: '宿舍',
    title: '舒适型和普通型宿舍收费与人数',
    question: '舒适型宿舍多少钱、水电怎么收？女生普通型宿舍是几人间？',
    answer: '2026年普通高考招生章程列明：女生舒适型4人间2780元/学年，男生舒适型5人间2580元/学年，普通型4至5人间1300元/学年。住宿费包含每生每月5度电和2吨水的定额，空调用电由学生承担；超额水电单价和结算方式以宿舍当年说明为准。学校没有公开普通型女生宿舍固定为4人还是5人的统一结论。',
    keywords: ['舒适型宿舍', '普通型宿舍', '女生宿舍', '几人间', '住宿费', '水电费', '空调电费', '2780', '2580', '1300'],
    publicUrl: '/guides/fees-aid',
    confidence: 99,
    sourceNote: '仰恩大学2026年普通高考招生章程。'
  },
  {
    id: 'faq-dorm-allocation',
    kind: 'official_reference',
    category: '宿舍',
    title: '新生宿舍和床位如何分配',
    question: '普通型宿舍床位是系统分配还是自己选？宿舍是不是同专业？可以跨新旧区申请舒适型吗？',
    answer: '现有学校资料只能确认新生入学时由学校统一安排入住、未经允许不得私自调换宿舍或床位。2026级是否开放舒适型自选、具体抢宿舍流程、能否跨新区旧区申请，以及室友是否同班同专业，学校尚未公布可核验规则；请勿相信代抢、付费占位或群聊口头承诺。',
    keywords: ['宿舍分配', '床位分配', '自己选床位', '抢宿舍', '舒适型申请', '同专业宿舍', '跨校区宿舍', '新区舒适型', '旧区舒适型'],
    publicUrl: '/guides/find-campus',
    confidence: 96,
    sourceNote: '仰恩大学学生宿舍管理办法与2026年招生资料；未公开事项明确保留。'
  },
  {
    id: 'faq-course-selection',
    kind: 'official_reference',
    category: '选课',
    title: '新生选课和体育课入口',
    question: '抢课怎么抢，要下载什么？体育课什么时候抢？',
    answer: '教务部官网提供教务系统和选课主页入口，应从学校官网进入，不使用搜索广告或群聊中的陌生链接。2026级体育课、公共选修课的选课批次、开放时间、补退选规则及是否需要下载App目前尚未公布，等学院、辅导员或教务部通知后再操作，不要提前把账号密码交给他人代抢。',
    keywords: ['抢课', '选课', '体育课', '什么时候选课', '选课流程', '选课软件', '下载App', '补退选', '教务系统'],
    publicUrl: '/guides/study-library',
    confidence: 97,
    sourceNote: '教务部公开入口与2026级当前公开信息状态。'
  },
  {
    id: 'faq-campus-map-food-express',
    kind: 'official_reference',
    category: '地图与生活',
    title: '校园地图、美食和快递怎么查',
    question: '有学校地图、美食攻略、新旧区学生街和快递站地图吗？',
    answer: '本站校园地图可以搜索宿舍、教学楼、餐厅、校门和快递点，并支持步行路线规划；“校园周边”和“找宿舍、教学楼和食堂”页面整理了餐饮与生活服务入口。2025年学生资料提到新区约6个快递点，但2026年的品牌、位置和营业时间可能调整，应以现场标识为准。',
    keywords: ['学校地图', '校园地图', '美食攻略', '学生街地图', '新区地图', '旧区地图', '快递站', '新区几个快递站', '有什么店'],
    publicUrl: '/map',
    confidence: 92,
    sourceNote: '站内已核验地图与学校餐厅资料；快递点数量属于2025年经验线索。'
  },
  {
    id: 'faq-club-list',
    kind: 'official_reference',
    category: '社团',
    title: '学校有哪些社团',
    question: '学校都有哪些社团，怎么加入？加入学生会后还要加社团吗？',
    answer: '当前资料已整理国旗班、音乐协会、公共关系协会、青年志愿者先锋队、就业与创业者协会、青云汉服社、舞蹈协会、计算机协会、电子数模协会、孙子兵法研究会、英语学习社、心理协会、红十字会及多项体育社团等。社团与学生会不是必须同时加入；2026级具体招新时间、报名方式和学生会纳新流程仍要等校团委、学院或组织正式通知。',
    keywords: ['社团', '有哪些社团', '都有哪些社团', '加入社团', '学生会', '怎么加入学生会', '社团招新', '计算机协会'],
    publicUrl: '/guides/clubs',
    confidence: 94,
    sourceNote: '校团委公开活动、社团干部附件及2026年活动报道。'
  },
  {
    id: 'faq-student-loan',
    kind: 'official_reference',
    category: '资助',
    title: '助学贷款在哪里办',
    question: '助学贷款是在学校办还是当地办？要等录取通知书到了再办吗？',
    answer: '生源地信用助学贷款可在入学前到户籍所在地教育局申请，2026年普通高考招生章程写明每生每年最高20000元；校园地国家助学贷款在入校后按学校要求申请，每生每年最高6000元。两类贷款不能同时获得。具体材料、是否需要录取通知书及当地办理时间，应以户籍地资助中心和录取材料要求为准。',
    keywords: ['助学贷款', '助学贷', '生源地贷款', '校园地贷款', '当地信用社', '当地弄', '学校弄', '教育局', '录取通知书', '贷款怎么办', '绿色通道'],
    publicUrl: '/guides/fees-aid',
    confidence: 99,
    sourceNote: '仰恩大学2026年普通高考招生章程。'
  },
  {
    id: 'faq-financial-aid',
    kind: 'official_reference',
    category: '资助',
    title: '家庭经济困难认定和国家助学金',
    question: '申请贫困补助容易吗？国家助学金怎么申请？',
    answer: '国家助学金面向全日制本科在校生中的家庭经济困难学生，现行办法为每年3000元和5000元两档。是否通过不是按“容易或困难”判断，而是按家庭经济困难认定、材料审核和当年名额执行；现行办法原则上要求每年9月20日前由本人通过福建省精准资助学生信息管理系统申请，2026学年时间以学生事务部通知为准。',
    keywords: ['贫困补助', '困难认定', '家庭经济困难', '国家助学金', '助学金申请', '3000', '5000', '容易申请吗'],
    publicUrl: '/guides/fees-aid',
    confidence: 99,
    sourceNote: '仰恩大学国家助学金评审办法（修订）。'
  },
  {
    id: 'faq-work-study',
    kind: 'official_reference',
    category: '兼职与勤工助学',
    title: '新生怎么找安全的兼职',
    question: '怎么找兼职，学校兼职机会多吗？',
    answer: '学校公开有校内勤工助学管理办法，家庭经济困难学生可关注学生资助中心和学院发布的校内岗位。现有资料无法确认2026级具体岗位数量；校外兼职不要交押金、培训费或证件原件，不做刷单、代收款、出租账号和银行卡等高风险工作，优先选择学校发布且能核验用工主体的岗位。',
    keywords: ['兼职', '找兼职', '兼职机会', '勤工助学', '校内岗位', '资助中心', '兼职押金', '刷单'],
    publicUrl: '/student-rules#rule-work-study',
    confidence: 96,
    sourceNote: '仰恩大学勤工助学管理办法（修订）；校外岗位数量未作推测。'
  },
  {
    id: 'faq-transfer-major-details',
    kind: 'official_reference',
    category: '转专业',
    title: '转专业条件、挂科和宿舍',
    question: '转专业容易吗？数学没及格一定转不了吗？转专业要换宿舍吗？',
    answer: '官网目前可检索的是2017年历史细则索引，不能当作2026年现行承诺。历史规则要求符合申请理由、接收专业有名额并通过原学院、接收学院和教务审批，每名学生在校期间原则上只能办理一次；没有证据能确认“数学没及格一定不能转”。转专业后的宿舍由相关部门办理，是否必须换宿舍取决于当年安排。',
    keywords: ['转专业', '数学没及格', '挂科转专业', '转专业容易吗', '换宿舍', '转专业条件', '转专业名额'],
    publicUrl: '/student-rules',
    confidence: 88,
    sourceNote: '教务部2017年历史实施细则索引；必须等待2026年现行通知。'
  },
  {
    id: 'faq-dorm-appliance-safety',
    kind: 'official_reference',
    category: '宿舍安全',
    title: '宿舍电器和家具改装边界',
    question: '宿舍可以带吹风机、装桌帘机械臂或自己买洗衣机吗？',
    answer: '学校公开规则明确禁止热得快、电炉、电煮锅等违规大功率电器，禁止私拉乱接电线，并要求保护宿舍家具和消防通道。但现有公开资料没有给出吹风机功率上限，也没有明确允许私人洗衣机、桌板机械臂或固定式桌帘。入住后应先向宿管确认；不得打孔、破坏桌板、遮挡烟感喷淋或影响散热和逃生。',
    keywords: ['吹风机', '桌帘', '机械臂', '宿舍洗衣机', '大功率电器', '宿舍电器', '桌板打孔', '消防安全'],
    publicUrl: '/guides/safety-health',
    confidence: 94,
    sourceNote: '宿舍消防安全指南与宿舍管理规则；未公开的设备不作允许承诺。'
  },
  {
    id: 'faq-bedding-preparation',
    kind: 'official_reference',
    category: '宿舍',
    title: '床垫和床上用品怎么准备',
    question: '开学床垫和床上用品都要自己买吗？学校的床是不是只有木板？',
    answer: '当前资料建议新生自行准备基础床上用品，但学校尚未公布覆盖所有楼栋、房型的床具配置和统一床板尺寸。床垫、床帘、蚊帐等尺寸相关物品最好等确定宿舍楼栋后实测或按当届通知购买；不要只根据往届图片一次性购买不可退的大件。',
    keywords: ['床垫', '床上用品', '木板床', '宿舍床', '床板', '蚊帐', '床帘尺寸', '开学要买什么'],
    publicUrl: '/guides/find-campus',
    confidence: 86,
    sourceNote: '新生准备资料与宿舍实拍核验边界；未确认所有楼栋设施。'
  }
]

export const campusExperienceKnowledge: AssistantKnowledgeSeed[] = [
  {
    id: 'experience-campus-wall',
    kind: 'student_experience',
    category: '校园生活',
    title: '学校校园墙在哪里',
    question: '仰恩大学校园墙是QQ还是微信？',
    answer: '学生经验里提到，常用的校园墙入口是小程序，不是QQ或微信账号。遇到自称官方校园墙的陌生QQ、微信，先别交钱或发个人信息。',
    keywords: ['校园墙', 'QQ校园墙', '微信校园墙', '小程序', '表白墙'],
    confidence: 72,
    sourceNote: '2026-07采集的学生经验问答，未保留外部平台来源。'
  },
  {
    id: 'experience-winter-training',
    kind: 'student_experience',
    category: '军训',
    title: '2026级是不是冬训',
    question: '新生军训是冬训吗？',
    answer: '学生经验称本届首次安排冬训，但军训时间属于会变化的正式安排，不能只按往届问答确认。以录取材料、辅导员和学校最新通知为准。',
    keywords: ['军训', '冬训', '新生训练', '什么时候军训'],
    confidence: 55,
    sourceNote: '2026-07采集的学生经验问答，待正式通知确认。'
  },
  {
    id: 'experience-dorm-price',
    kind: 'student_experience',
    category: '宿舍',
    title: '普通宿舍和舒适型宿舍价格',
    question: '仰恩大学宿舍多少钱？',
    answer: '学生经验给出的普通宿舍参考价约为每学年1300元，舒适型宿舍会更高。不同房型和学年收费可能调整，最终以缴费页面和学校收费通知为准。',
    keywords: ['宿舍费', '住宿费', '普通宿舍', '舒适型宿舍', '1300'],
    confidence: 60,
    sourceNote: '2026-07采集的学生经验问答，价格未作官方确认。'
  },
  {
    id: 'experience-admission-documents',
    kind: 'student_experience',
    category: '报到',
    title: '报到要带录取通知书和准考证吗',
    question: '准考证和录取通知书必须带吗？',
    answer: '学生经验称准考证可先准备录取截图，但录取通知书要带原件。报到材料仍应逐项按录取通知书和当年迎新通知准备。',
    keywords: ['准考证', '录取通知书', '录取截图', '报到材料'],
    confidence: 65,
    sourceNote: '2026-07采集的学生经验问答，正式材料清单优先。'
  },
  {
    id: 'experience-comfort-dorm-selection',
    kind: 'student_experience',
    category: '宿舍',
    title: '舒适型宿舍什么时候选',
    question: '舒适型宿舍什么时候抢？',
    answer: '学生经验称一般会在开学前一到两周通知选宿舍。具体是否开放、开放时间和操作入口每年可能不同，不要提前相信代抢或付费占位。',
    keywords: ['舒适型宿舍', '抢宿舍', '选宿舍', '开学前'],
    confidence: 65,
    sourceNote: '2026-07采集的学生经验问答。'
  },
  {
    id: 'experience-transfer-major',
    kind: 'student_experience',
    category: '学业',
    title: '转专业的学生经验',
    question: '转专业要满足什么条件？',
    answer: '学生经验里最常提到的是不能挂科，体育课也不能挂，办理通常集中在大一下学期开学前后。但转专业最终按教务部当年通知、接收名额和学院考核执行。',
    keywords: ['转专业', '换专业', '挂科', '体育课', '大一下'],
    confidence: 58,
    sourceNote: '2026-07采集的学生经验问答；不能替代教务部通知。'
  },
  {
    id: 'experience-packing-list',
    kind: 'student_experience',
    category: '报到',
    title: '开学建议带什么',
    question: '新生开学要带什么东西？',
    answer: '学生经验建议先准备床上用品、常用电子设备和充电器、洗漱和生活用品、大容量充电宝、花露水。大件物品可以到校后按宿舍实际情况再买，避免尺寸不合。',
    keywords: ['开学带什么', '新生物品', '行李', '床上用品', '充电宝', '花露水'],
    confidence: 78,
    sourceNote: '2026-07采集的学生经验问答。'
  },
  {
    id: 'experience-leave',
    kind: 'student_experience',
    category: '校园生活',
    title: '学校请假好请吗',
    question: '仰恩大学请假容易吗？',
    answer: '学生经验普遍认为请假审核不算宽松，尤其是临时离校或连续请假。生病或确有特殊情况时，按请假系统和辅导员要求准备证明，获批后再离校。',
    keywords: ['请假', '好请假吗', '离校', '病假', '事假'],
    confidence: 68,
    sourceNote: '2026-07采集的学生经验问答。'
  },
  {
    id: 'experience-mosquito-net',
    kind: 'student_experience',
    category: '宿舍',
    title: '蚊帐尺寸怎么选',
    question: '宿舍蚊帐买多大？',
    answer: '学生经验称按90×190厘米准备通常够用，但不同楼栋和床位可能有差异。床垫、床帘和一体式蚊帐最好拿到宿舍楼栋后再实测。',
    keywords: ['蚊帐', '90×190', '90x190', '宿舍床', '床垫尺寸', '床帘'],
    confidence: 60,
    sourceNote: '2026-07采集的学生经验尺寸，不是学校统一规格。'
  },
  {
    id: 'experience-campus-sim',
    kind: 'student_experience',
    category: '校园卡',
    title: '校园卡有没有手机流量',
    question: '校园卡是电话卡吗，有流量吗？',
    answer: '学生经验称校园卡套餐会附带手机流量，使用方式接近电话卡，主要面向在校期间。办卡前先看当年运营商套餐、合约期和注销规则，不必现场匆忙决定。',
    keywords: ['校园卡', '电话卡', '手机卡', '流量', '运营商'],
    confidence: 65,
    sourceNote: '2026-07采集的学生经验问答，套餐会变化。'
  },
  {
    id: 'experience-electric-bike',
    kind: 'student_experience',
    category: '校园交通',
    title: '校内能不能骑电动车',
    question: '仰恩大学校内可以骑电动车吗？',
    answer: '学生经验称校内不能骑电动车，日常主要步行或坐叮叮车。车辆管理可能随校区和学期调整，入校后按现场标识执行。',
    keywords: ['电动车', '骑车', '校内交通', '步行', '叮叮车'],
    confidence: 70,
    sourceNote: '2026-07采集的学生经验问答。'
  },
  {
    id: 'experience-public-bathroom',
    kind: 'student_experience',
    category: '宿舍',
    title: '宿舍公共浴室会不会排队',
    question: '宿舍洗澡是公共浴室吗，人多吗？',
    answer: '学生经验称部分宿舍是一层一个公共浴室，高峰期人会多，但不一定每次都要排队。具体浴室位置和开放时间看宿舍楼现场安排。',
    keywords: ['公共浴室', '洗澡', '宿舍浴室', '排队', '一层一个'],
    confidence: 65,
    sourceNote: '2026-07采集的学生经验问答，不代表全部楼栋。'
  },
  {
    id: 'experience-food-price',
    kind: 'student_experience',
    category: '吃饭',
    title: '校内吃饭贵不贵',
    question: '仰恩大学食堂吃饭贵吗？',
    answer: '学生经验认为校内吃饭整体比较实惠，曾举过拼好饭约6.9元的例子。具体价格、商家和优惠会变，点餐时以当天页面和窗口标价为准。',
    keywords: ['食堂价格', '吃饭贵吗', '拼好饭', '6.9', '校内吃饭'],
    confidence: 70,
    sourceNote: '2026-07采集的学生经验问答，示例价格会变化。'
  },
  {
    id: 'experience-badminton',
    kind: 'student_experience',
    category: '运动',
    title: '学校有没有羽毛球场',
    question: '仰恩大学有羽毛球场吗，收费吗？',
    answer: '学生经验称学校有羽毛球场，文体馆有室内场，校内也有露天场地，一般不收费。场馆开放、课程占用和预约方式以现场通知为准。',
    keywords: ['羽毛球场', '文体馆', '室内场', '运动场', '收费'],
    confidence: 72,
    sourceNote: '2026-07采集的学生经验问答。'
  },
  {
    id: 'experience-hair-dye',
    kind: 'student_experience',
    category: '校园生活',
    title: '学校允许染发吗',
    question: '仰恩大学可以染头发吗？',
    answer: '学生经验称学校一般允许染发。军训、正式活动、实习或学院有统一仪容要求时，仍应按当次通知处理。',
    keywords: ['染发', '染头发', '发色', '仪容'],
    confidence: 74,
    sourceNote: '2026-07采集的学生经验问答。'
  },
  {
    id: 'experience-washing-machine',
    kind: 'student_experience',
    category: '宿舍',
    title: '舒适型宿舍有没有洗衣机',
    question: '宿舍洗衣机干净吗，舒适型宿舍有吗？',
    answer: '学生经验称舒适型宿舍通常每间会配洗衣机，实际卫生取决于舍友使用和清洁情况。入住后先清洗内筒，再确认是否需要共用或付费。',
    keywords: ['洗衣机', '宿舍洗衣机', '舒适型宿舍', '干净吗', '清洗内筒'],
    confidence: 65,
    sourceNote: '2026-07采集的学生经验问答，不代表所有房型。'
  },
  {
    id: 'experience-placement-tests',
    kind: 'student_experience',
    category: '学业',
    title: '开学会考什么',
    question: '仰恩大学新生开学考什么？',
    answer: '学生经验称开学后常见的是学生手册测试和英语分班测试；学生手册测试可能采用开卷形式，英语成绩用于分班。具体科目、时间和形式以学院通知为准。',
    keywords: ['开学考试', '学生手册考试', '英语分班', '分班考试', '考什么'],
    confidence: 68,
    sourceNote: '2026-07采集的学生经验问答，考试安排会变化。'
  },
  {
    id: 'experience-campus-allocation',
    kind: 'student_experience',
    category: '校区宿舍',
    title: '新旧校区怎么分',
    question: '新生住新区还是旧区，怎么分配？',
    answer: '学生经验称新旧校区主要按学院、专业和当年宿舍安排分配，旧区并不是完全不能住。没有学校正式名单前，不要仅凭专业传言确定楼栋。',
    keywords: ['新区', '旧区', '校区分配', '宿舍分配', '住哪里'],
    confidence: 62,
    sourceNote: '2026-07采集的学生经验问答，正式分配名单优先。'
  },
  {
    id: 'experience-humidity',
    kind: 'student_experience',
    category: '宿舍',
    title: '宿舍潮湿和蟑螂多不多',
    question: '南方宿舍潮湿吗，蟑螂多吗？',
    answer: '泉州气候偏湿，学生经验建议准备除湿袋；蟑螂多少与楼栋、季节和宿舍卫生关系很大。入住后及时清理食物残渣、封好零食，比提前大量买药更实用。',
    keywords: ['潮湿', '除湿袋', '蟑螂', '宿舍卫生', '南方天气'],
    confidence: 78,
    sourceNote: '2026-07采集的学生经验问答。'
  },
  {
    id: 'experience-training-clothes',
    kind: 'student_experience',
    category: '军训',
    title: '军训服里面穿什么',
    question: '军训服里面要穿短袖吗？',
    answer: '学生经验建议军训服里面穿吸汗短袖，外面再穿统一军训外套。若学校发放的服装和教官要求不同，按现场要求调整。',
    keywords: ['军训服', '短袖', '军训外套', '穿什么'],
    confidence: 75,
    sourceNote: '2026-07采集的学生经验问答。'
  },
  {
    id: 'experience-nonlocal-students',
    kind: 'student_experience',
    category: '校园生活',
    title: '外省学生多不多',
    question: '仰恩大学外省学生多吗，普通话交流方便吗？',
    answer: '学生经验估计外省学生约占四分之一，日常用普通话交流通常没有明显障碍。这个比例不是招生统计，只能作为校园感受参考。',
    keywords: ['外省学生', '普通话', '口音', '交流', '四分之一'],
    confidence: 50,
    sourceNote: '2026-07采集的学生个人估计，不是官方统计。'
  },
  {
    id: 'experience-computer-class',
    kind: 'student_experience',
    category: '学业',
    title: '大一计算机课要不要带电脑',
    question: '大一有计算机课吗，上课要自带电脑吗？',
    answer: '学生经验称大一有计算机相关课程，学校有机房，正常上机课不一定要求自带电脑。个人专业软件和作业是否需要电脑，要看专业和任课教师安排。',
    keywords: ['计算机课', '大一课程', '带电脑', '自带电脑', '机房'],
    confidence: 70,
    sourceNote: '2026-07采集的学生经验问答。'
  },
  {
    id: 'experience-drinking-water',
    kind: 'student_experience',
    category: '宿舍',
    title: '饮水机的水能不能直接喝',
    question: '宿舍饮水机的水能喝吗，要买桶装水吗？',
    answer: '学生经验称楼内饮水机的水可以直接饮用，通常免费；如果对口感或卫生习惯有要求，也可以和舍友商量购买桶装水。入住后先看机器标识和维护状态。',
    keywords: ['饮水机', '水能喝吗', '直饮水', '免费饮水', '桶装水'],
    confidence: 70,
    sourceNote: '2026-07采集的学生经验问答，不代表所有楼栋设备状态。'
  },
  {
    id: 'experience-dingding-car',
    kind: 'student_experience',
    category: '校园交通',
    title: '叮叮车是什么',
    question: '仰恩大学叮叮车是什么车？',
    answer: '叮叮车可以理解为校内接驳车，作用类似校园公交，适合在坡多、距离远的校区之间代步。具体站点、票价和运行时间以现场标识为准。',
    keywords: ['叮叮车', '校内公交', '接驳车', '校园交通', '观光车'],
    confidence: 82,
    sourceNote: '2026-07采集的学生经验问答。'
  },
  {
    id: 'experience-campus-surroundings',
    kind: 'student_experience',
    category: '校园周边',
    title: '学校周边是不是很偏',
    question: '仰恩大学是不是在深山里，附近方便吗？',
    answer: '学校周边更接近镇区环境，不是完全与外界隔绝的深山。日常吃饭、快递和基础购物能解决，去泉州市区则需要预留公交或打车时间。',
    keywords: ['深山', '偏僻', '镇区', '学校附近', '方便吗', '进城'],
    confidence: 76,
    sourceNote: '2026-07采集的学生经验问答。'
  }
]

export const assistantKnowledgeSeeds: AssistantKnowledgeSeed[] = [
  ...facultyProfiles.map((profile): AssistantKnowledgeSeed => {
    const affiliation = [profile.college, profile.unit].filter(Boolean).join('·')
    const position = profile.position ? `，公开职务/职称为${profile.position}` : ''
    return {
      id: profile.id,
      kind: 'official_reference',
      category: '教职工',
      title: `${profile.name}｜${affiliation}教师`,
      question: `${profile.name}是谁？${profile.name}是哪个学院的老师？`,
      answer: `${profile.name}是仰恩大学${affiliation}公开师资页面列出的教师${position}。${profile.profile}`,
      keywords: [
        profile.name,
        profile.college,
        profile.unit,
        profile.position,
        '教师',
        '老师',
        '师资简介'
      ].filter(Boolean),
      publicUrl: profile.sourceUrl,
      confidence: 96,
      sourceNote: `${profile.sourceTitle}，采集于 ${profile.retrievedAt}；仅整理官网公开履职信息。`
    }
  }),
  ...comprehensiveEvaluationKnowledge,
  ...verifiedNewStudentFaqKnowledge,
  ...campusExperienceKnowledge
]
