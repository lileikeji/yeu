import { facultyProfiles } from './faculty-directory'
import { userSubmittedCampusNotes } from './user-submitted-campus-notes'

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

export const userVerifiedNewStudentExperienceKnowledge: AssistantKnowledgeSeed[] = [
  {
    id: 'experience-freshman-class-lookup',
    kind: 'student_experience',
    category: '迎新',
    title: '新生所在班级查询',
    question: '所在班级怎么查询？新生怎么知道自己在哪个班？',
    answer: '新生的编班和所在班级需要在学校迎新系统开放后查询。进入迎新系统并完成个人信息后，查看个人信息、报到信息或编班信息里的班级字段；如果暂时没有显示，通常是当届编班尚未发布，等待班导或学院通知即可。只从录取材料、学校当届通知或本站核验过的入口进入，不要在陌生链接输入账号、验证码。',
    keywords: ['所在班级怎么查询', '查询所在班级', '我在哪个班', '怎么查班级', '查询班级', '班级查询', '分班查询', '编班查询', '新生分班', '迎新系统查班级'],
    publicUrl: '/procedures/arrival',
    confidence: 96,
    sourceNote: '用户于2026-08-05确认当前新生班级在迎新系统查询；系统开放状态和显示时间以当届页面、班导或学院通知为准。'
  },
  {
    id: 'experience-2026-comfort-dorm-booking',
    kind: 'student_experience',
    category: '宿舍',
    title: '2026级舒适型宿舍申请时间与流程',
    question: '舒适型宿舍今年具体什么时候开放？在哪个系统抢？完整流程是什么？',
    answer: '据2026年7月在校经验口径，舒适型宿舍预计在开学前约10天通过迎新系统开放：到开放时间进入迎新系统选择房型，抢到后按页面提示完成付款，名额按付款完成顺序确认。学校官网目前没有公开2026级的准确开放日期、时刻和完整操作公告，因此应以迎新系统页面、班导或学院当届通知为准；不要使用代抢服务，也不要向他人提供迎新系统账号、验证码或付款信息。',
    keywords: ['舒适型宿舍什么时候开放', '什么时候开放', '舒适型宿舍怎么抢', '在哪抢', '抢宿舍流程', '迎新系统抢宿舍', '开学前十天', '付款顺序', '宿舍名额'],
    publicUrl: '/guides/find-campus',
    confidence: 78,
    sourceNote: '用户于2026-07-29提供的在校经验；官网尚未公开2026级准确开放时间，迎新系统当届页面优先。'
  },
  {
    id: 'experience-comfort-dorm-campus-gender',
    kind: 'student_experience',
    category: '宿舍与校区',
    title: '舒适型宿舍的男女校区与跨区申请',
    question: '新区女生还有舒适型宿舍吗？旧区专业能申请新区舒适型宿舍吗？',
    answer: '据2026年7月在校经验口径，女生舒适型宿舍安排在旧区，男生舒适型宿舍安排在新区；旧区专业学生可以申请新区舒适型宿舍，但不太建议只为房型跨区居住。跨区后要额外考虑每天上课的步行、叮叮车等待和新旧区往返时间。具体可申请房型仍以迎新系统实际显示为准；需要估算通勤时，可打开本站地图选定宿舍和教学楼后规划路线。',
    keywords: ['新区女生舒适型', '女生舒适型宿舍', '男生舒适型宿舍', '旧区专业住新区', '跨区申请宿舍', '新旧区通勤', '叮叮车'],
    publicUrl: '/map',
    confidence: 76,
    sourceNote: '用户于2026-07-29提供的在校经验；男女房型位置和跨区可选范围未在官网公开，迎新系统实际可选项优先。'
  },
  {
    id: 'experience-comfort-dorm-specific-building',
    kind: 'student_experience',
    category: '宿舍与校区',
    title: '舒适型宿舍对应楼栋（用户资料）',
    question: '舒适型女生宿舍是哪栋楼？舒适型男生宿舍是哪栋楼？女生舒适型宿舍叫什么？',
    answer: '按用户提供的2026级迎新资料：女生舒适型宿舍在旧区衡山楼；男生舒适型宿舍在新区辽宁楼或陕西楼。这里是行前参考，地图已将这三栋楼标注为舒适型候选楼栋；最终以迎新系统实际可选房型、付款结果和到校分配信息为准。',
    keywords: ['舒适型女生宿舍是哪栋楼', '舒适型男生宿舍是哪栋楼', '女生舒适型宿舍叫什么', '男生舒适型宿舍叫什么', '衡山楼舒适型', '辽宁楼舒适型', '陕西楼舒适型', '舒适型宿舍楼'],
    publicUrl: '/map',
    confidence: 88,
    sourceNote: '用户提供的2026级迎新系统与学生经验截图；楼栋和房型仍需以迎新系统、付款结果和到校分配核验。'
  },
  {
    id: 'official-lin-hui-identity',
    kind: 'official_reference',
    category: '学校人物',
    title: '林惠｜仰恩大学董事会董事长',
    question: '林惠是谁？',
    answer: '林惠女士是仰恩大学董事会董事长。学校官网介绍，她与吴庆星先生共同发起仰恩基金会，基金会是仰恩大学的举办者；学校简介同时记载，仰恩大学由吴庆星先生和夫人林惠女士发起成立的仰恩基金会于1987年创办。',
    keywords: ['林惠', '林惠是谁', '董事长', '仰恩基金会', '学校举办者', '吴庆星夫人'],
    publicUrl: 'https://www.yeu.edu.cn/_t46/1312/list.htm',
    confidence: 98,
    sourceNote: '仰恩大学董事会、学校简介和仰恩基金会简介，核验于2026-07-29。'
  },
  {
    id: 'official-wu-qingxing-identity',
    kind: 'official_reference',
    category: '学校人物',
    title: '吴庆星｜仰恩基金会创始人',
    question: '吴庆星是谁？',
    answer: '吴庆星先生是仰恩基金会的创始人，与夫人林惠女士共同出资，于1987年在福建省泉州市创办了仰恩大学。学校官网简介记载，仰恩大学是由吴庆星先生和夫人林惠女士发起成立的仰恩基金会举办的私立大学。学校还设有以其命名的"吴庆星奖学金"，以表彰品学兼优的学生。',
    keywords: ['吴庆星', '吴庆星是谁', '仰恩基金会创始人', '学校创始人', '仰恩大学创始人', '林惠丈夫', '吴庆星奖学金'],
    publicUrl: 'https://www.yeu.edu.cn/xxgk/xjjj.htm',
    confidence: 97,
    sourceNote: '仰恩大学学校简介、仰恩基金会简介，核验于2026-07-30。'
  },
  {
    id: 'official-student-immediate-hardship-help',
    kind: 'official_reference',
    category: '资助帮扶',
    title: '暂时没钱吃饭时先找谁',
    question: '没钱吃饭怎么办？生活费暂时不够怎么办？',
    answer: '如果已经影响到今天吃饭，不要硬扛，也不要借网贷或把银行卡、账号交给别人。先把“目前吃饭已经困难”直接告诉班导、辅导员或学院学生工作老师，请其协助联系学生资助中心；同时可咨询家庭经济困难认定、国家助学金、绿色通道和校内勤工助学。学校公开有家庭经济困难学生认定办法和勤工助学管理办法，但具体临时帮扶方式与到账时间需由学院或学生事务部确认。',
    keywords: ['没钱吃饭', '吃不起饭', '生活费不够', '生活困难', '经济困难', '临时困难', '资助中心', '勤工助学'],
    publicUrl: '/guides/fees-aid',
    confidence: 94,
    sourceNote: '仰恩大学家庭经济困难学生认定办法、勤工助学管理办法与本站资助入口整理。'
  },
  {
    id: 'campus-classroom-phone-boundary',
    kind: 'campus_template',
    category: '课堂与课程',
    title: '上课使用手机的边界',
    question: '上课可以玩手机吗？课堂能不能玩手机？',
    answer: '当前没有检索到学校面向所有课程统一公开的“手机使用细则”。是否允许用手机查资料、签到或完成课堂任务，应听任课教师当堂要求；与课程无关的游戏、视频、外放和持续聊天会影响课堂秩序，不应把“老师暂时没制止”理解为允许。考试、测验或教师要求收起手机时必须按规则执行。',
    keywords: ['上课玩手机', '课堂玩手机', '上课可以玩手机吗', '上课可以玩手机么', '手机签到', '课堂纪律', '老师没收手机'],
    publicUrl: '/student-rules',
    confidence: 91,
    sourceNote: '现有学生手册与课程资料的证据边界整理；具体课堂要求以任课教师和考试规则为准。'
  },
  {
    id: 'experience-dorm-roommate-allocation',
    kind: 'student_experience',
    category: '宿舍',
    title: '宿舍室友、班级与床位分配方式',
    question: '舒适型宿舍会混班混专业吗？分宿舍前会填作息和空调温度问卷吗？',
    answer: '学校现行宿舍管理办法确认住宿由总务处按学院、男女分楼和相对集中原则统一安排。学生经验补充：普通分配通常先按专业，再按学号安排，不会先填写作息、空调温度等匹配问卷；舒适型宿舍有可能出现混班或混专业，因为房型人数与各班男女生人数不一定整除。最终室友和床位以迎新系统或到校分配结果为准，未经批准不要私自换宿舍或床位。',
    keywords: ['舒适型宿舍会混班混专业吗', '混班', '混专业', '混班宿舍', '混专业宿舍', '同专业宿舍', '室友分配', '作息调查问卷', '分宿舍会填作息调查问卷吗', '空调温度问卷', '按学号分宿舍', '床位分配'],
    publicUrl: '/guides/find-campus',
    confidence: 82,
    sourceNote: '统一安排和学院、性别原则来自学校现行宿舍管理办法；按专业、学号及无匹配问卷来自2026-07-29在校经验。'
  },
  {
    id: 'experience-dorm-water-electric-shower',
    kind: 'student_experience',
    category: '宿舍水电与洗浴',
    title: '宿舍水电单价、热水与水卡',
    question: '舒适型宿舍水电多少钱？普通型和舒适型洗澡要水卡吗？',
    answer: '学校公开规则只确认住宿费包含每生每月5度电和2吨水的定额，超额部分另行结算，没有公开当前超额单价。学生经验口径为：超额水约5元/吨、电约1元/度，一个宿舍每月水电常见合计约200至300元；舒适型宿舍洗澡不用水卡并可全天使用热水，普通型宿舍洗澡使用水卡，一次大约0.5至1元。单价、设备和热水时段可能按楼栋调整，应以实际账单、浴室设备和宿管说明为准。',
    keywords: ['舒适型宿舍超额水电单价', '超额水电单价', '水费单价', '电费单价', '水5电1', '宿舍水电费', '一个月两三百', '洗澡水卡', '全天热水', '洗澡多少钱'],
    publicUrl: '/guides/fees-aid',
    confidence: 73,
    sourceNote: '免费定额与超额结算来自学校公开资料；具体单价、月均费用、水卡及热水时段来自2026-07-29在校经验。'
  },
  {
    id: 'experience-dorm-bedding-photos',
    kind: 'student_experience',
    category: '宿舍',
    title: '普通型和舒适型宿舍实拍与床具',
    question: '普通型与舒适型宿舍内部什么样？床上只有木板吗，学校提供床垫吗？',
    answer: '本站“找宿舍、教学楼和食堂”指南保存了普通型宿舍实拍与答疑的来源入口，可先看房型参考，但旧帖不能代表所有楼栋。学生经验称普通型和舒适型床位交付时都是木板床，学校不统一提供床垫或床上用品，需自行准备；入住后建议先清洁床板。床垫、床帘和蚊帐最好等楼栋确定后核对尺寸再购买。',
    keywords: ['普通宿舍实拍', '舒适型宿舍实拍', '宿舍内部图', '木板床', '学校提供床垫吗', '床上用品', '清洁床板'],
    publicUrl: '/guides/find-campus',
    confidence: 80,
    sourceNote: '站内保存宿舍实拍来源入口；木板床和不统一提供床品来自2026-07-29在校经验，楼栋实物优先。'
  },
  {
    id: 'experience-dorm-curtain-appliances',
    kind: 'student_experience',
    category: '宿舍安全',
    title: '床帘、吹风机、洗衣机与机械臂边界',
    question: '宿舍允许床帘、吹风机、私人洗衣机和桌板机械臂吗？吹风机限多少瓦？',
    answer: '学生经验称床帘和多数不破坏公物的个人用品通常可以使用，但学校公开规则明确禁止违规大功率电器、私拉乱接电线和擅自移动或破坏家具。官网没有公布吹风机功率上限，也没有明确批准私人洗衣机或桌板机械臂。购买或安装前先向所在楼栋宿管确认；不要打孔、夹坏桌板、遮挡烟感喷淋或消防通道，也不要把“多数个人用品可用”理解为所有电器都允许。',
    keywords: ['床帘允许吗', '吹风机多少瓦', '私人洗衣机', '桌板机械臂', '机械臂夹桌板', '宿舍个人用品', '大功率用品'],
    publicUrl: '/guides/safety-health',
    confidence: 84,
    sourceNote: '电器、线路和家具边界来自学校宿舍管理办法；床帘经验来自2026-07-29用户口径，具体设备须由楼栋确认。'
  },
  {
    id: 'experience-public-washer',
    kind: 'student_experience',
    category: '宿舍生活',
    title: '公共洗衣机时长、排队与卫生',
    question: '公共洗衣机一次多久、够不够用、干净吗，要自带洗衣液吗？',
    answer: '据在校经验，公共洗衣机高峰期有时需要排队，程序通常有约10分钟单脱水以及25、35、45分钟等不同档位，具体时长取决于上一位选择的程序；洗衣液需要自带。公共设备卫生状况一般，使用前可检查内筒、门封和残留物，贴身衣物可根据个人卫生习惯单独手洗。不同楼栋机型、价格和程序可能不同，以机器页面为准。',
    keywords: ['公共洗衣机', '洗衣机多久', '洗衣机排队', '10分钟脱水', '25分钟', '35分钟', '45分钟', '自带洗衣液', '洗衣机卫生'],
    publicUrl: '/guides/find-campus',
    confidence: 78,
    sourceNote: '用户于2026-07-29提供的在校经验；设备程序、价格和数量以楼栋现场为准。'
  },
  {
    id: 'experience-living-cost-campus-differences',
    kind: 'student_experience',
    category: '校园生活',
    title: '生活费与新旧区真实差异',
    question: '新生每月生活费多少合适？每月生活费多少？新区和旧区哪个好？',
    answer: '生活费应按家庭条件和个人消费习惯安排。学生经验认为校内基础餐饮较实惠，每月约1500元可作为较基础的参考线，不是学校标准。新区的商店相对多，但教学区和食堂选择相对少；旧区商店相对少，但教学区和食堂相对多。选宿舍时应把上课地点、每天步行或叮叮车通勤、就餐和购物便利一起考虑。',
    keywords: ['生活费多少', '一个月1500', '新区好还是旧区好', '新区优缺点', '旧区优缺点', '新区店多', '旧区食堂多'],
    publicUrl: '/nearby',
    confidence: 76,
    sourceNote: '用户于2026-07-29提供的在校生活经验；消费金额和商铺状态会因个人与学期变化。'
  },
  {
    id: 'experience-campus-delivery-boundary',
    kind: 'student_experience',
    category: '外卖',
    title: '新旧区男女宿舍外卖送达边界',
    question: '新区和旧区外卖能送到宿舍楼下吗？',
    answer: '据在校经验，新区男生宿舍的外卖可送到楼栋附近；新区和旧区女生通常只能到宿舍大门刷脸处取餐；旧区男生有些送到侧门，有些送到宿舍大门刷脸处。配送边界可能随门禁、平台和楼栋调整，下单前看商家说明并与骑手确认，不要要求骑手绕过门禁。',
    keywords: ['外卖送上门', '新区男生外卖', '新区女生外卖', '旧区女生外卖', '旧区男生外卖', '宿舍大门取餐', '刷脸处取餐'],
    publicUrl: '/nearby',
    confidence: 74,
    sourceNote: '用户于2026-07-29提供的在校经验；门禁与配送范围以当学期现场管理为准。'
  },
  {
    id: 'experience-course-tools-electives',
    kind: 'student_experience',
    category: '选课',
    title: '喜鹊儿、教务系统与公共选修课',
    question: '选课用什么系统和App？哪些公共选修课相对轻松？',
    answer: '教务部官网已提供“仰恩大学选课主页”和教务系统入口，校外教务系统地址为 https://jwgl.yeu.edu.cn/yedxjw/cas/login.action 。学生经验还会使用“喜鹊儿”，但当前未检索到学校公开的2026级喜鹊儿安装公告，是否使用以及具体操作按当届通知执行。学生经验认为线上公共选修课时间安排通常更灵活，但课程难度、考核方式和学分要求应先看课程简介，不能把“线上”直接等同于不用学习。',
    keywords: ['喜鹊儿', '教务系统地址', '选课系统', '选课App', '选课用什么系统', '选课用什么App', '公共选修课', '公选课', '线上选修课', '水课', '轻松公选课', '轻松的选修课'],
    publicUrl: 'https://jwb.yeu.edu.cn/2022/1201/c55a34126/page.psp',
    confidence: 88,
    sourceNote: '教务系统入口来自仰恩大学教务部官网；喜鹊儿和线上课程体验来自2026-07-29在校经验。'
  },
  {
    id: 'experience-computer-major-compatibility',
    kind: 'student_experience',
    category: '电脑与课程',
    title: '专业电脑准备和系统兼容',
    question: '电气、物联网工程、艺术教育什么时候必须用电脑？Windows和Mac都兼容吗？',
    answer: '现有官网和系统资料没有给出电气工程、物联网工程、艺术教育统一的购机时间表。学生经验是：安排在机房的课程可先使用学校电脑，课后作业或专业软件较多时个人电脑会更方便；不要仅因“开学就要用”而仓促购买。日常办公和网页课程在Windows、macOS上通常都能完成，但专业实验软件、驱动、考试客户端可能只支持Windows或配置步骤不同，购买Mac前应先向本专业任课教师或高年级同学确认软件清单。',
    keywords: ['电气专业电脑', '物联网工程电脑', '艺术教育电脑', '什么时候买电脑', 'Windows兼容', 'macOS兼容', '苹果电脑方便吗', '专业软件'],
    publicUrl: '/guides/study-library',
    confidence: 77,
    sourceNote: '用户经验与风险边界整理；官网未公布三个专业统一购机或操作系统兼容清单。'
  },
  {
    id: 'experience-english-training-events',
    kind: 'student_experience',
    category: '考试',
    title: '英语分班考试题型和难度',
    question: '英语开学考考什么题型？英语分班考试难度和高考一样吗？',
    answer: '2026级英语分班考试的题型、范围和难度目前没有正式公开通知，应等待学院或任课部门说明，不能按往届题型承诺，也不能确认难度与高考完全一致。',
    keywords: ['英语分班考题型', '英语开学考题型', '英语分班考试难度', '和高考一样吗', '英语开学考考什么'],
    publicUrl: '/guides/study-library',
    confidence: 76,
    sourceNote: '2026级英语分班考试公开信息状态；当届考试通知优先。'
  },
  {
    id: 'experience-military-talent-show',
    kind: 'student_experience',
    category: '军训',
    title: '军训才艺展示与晚会',
    question: '军训有才艺表演吗？军训有晚会吗？',
    answer: '学生经验称军训期间可能安排才艺展示，学生自愿报名上台；晚会通常会有学长学姐参与表演，场地多在文体中心。2026级是否举办、节目报名、彩排和场地仍以当届军训通知为准，不要求没有才艺的新生必须表演。',
    keywords: ['军训有才艺表演吗', '军训才艺展示', '军训晚会', '自愿上台', '文体中心表演', '军训表演报名'],
    publicUrl: '/guides/study-library',
    confidence: 79,
    sourceNote: '用户于2026-07-29提供的在校经验；2026级活动安排以军训通知为准。'
  },
  {
    id: 'experience-freshman-contact-bank-preregistration',
    kind: 'student_experience',
    category: '迎新',
    title: '班导联系、银行卡和预报名纠错',
    question: '班导什么时候联系新生？银行卡信息要提前填吗？迎新预报名填错怎么办？',
    answer: '据在校经验，通常由班导在8月初至8月中旬联系新生或建立班级群；迎新系统里的银行卡信息需要按页面要求提前填写。预报名信息一般可在开放期内修改，若页面已经锁定或确实没有修改入口，应保留截图并联系班导、辅导员或学院，不要重复提交相互矛盾的信息。学校官网能确认学院会组织班导、辅导员协同新生联络，但未公开每个班的统一建群日期。',
    keywords: ['班导什么时候联系', '辅导员建群', '八月初', '八月中旬', '银行卡信息', '银行卡提前填', '预报名填错', '迎新信息不能改'],
    publicUrl: '/guides/arrival',
    confidence: 82,
    sourceNote: '学院组织联络来自官网；具体时间、银行卡和修改流程来自2026-07-29在校经验，迎新系统页面优先。'
  },
  {
    id: 'experience-express-address-points',
    kind: 'student_experience',
    category: '快递',
    title: '新生快递地址与新区快递点',
    question: '新生快递完整收件地址怎么写？新区有哪些快递点？',
    answer: '建议地址写为“福建省泉州市洛江区马甲镇仰恩大学＋第一教学区（旧区）或第三教学区（新区）＋宿舍楼栋＋姓名＋手机号”，不要只写“仰恩大学”。本站地图当前已发布并可定位韵达快递、快递联盟（中通）和新区学生街；创业园资料还标注了邮政取件处，宝洁洗衣店资料标注圆通、顺丰，但后两项仍应以取件短信和现场牌子为准。快递品牌、代收点和营业时间会调整，发件前先确认自己楼栋所在教学区。',
    keywords: ['快递完整地址', '新生收件地址', '第一教学区', '第三教学区', '新区快递点', '韵达快递', '快递联盟', '中通', '圆通', '顺丰', '邮政取件'],
    publicUrl: '/map?category=express',
    confidence: 84,
    sourceNote: '教学区写法来自用户2026-07-29口径；点位来自用户授权高德工作地图和生产数据库，品牌与状态以取件短信为准。'
  },
  {
    id: 'experience-student-union-recruitment',
    kind: 'student_experience',
    category: '学生组织',
    title: '学生会纳新报名方式',
    question: '学生会什么时候纳新，从哪里报名？加入学生会还要加社团吗？',
    answer: '据在校经验，学生会通常会提前建立或发布纳新群，报名时间、部门介绍、面试和后续安排在群内通知。学生会和社团是不同组织，不要求同时加入，可按时间和兴趣选择。不要只凭非官方二维码提交身份证、银行卡等敏感信息；优先从学院、校团委、本站已核验组织页或班群进入当届纳新群。',
    keywords: ['学生会怎么报名', '学生会纳新', '学生会报名', '纳新群', '加入学生会', '学生会和社团', '社团必须加吗'],
    publicUrl: '/guides/clubs',
    confidence: 79,
    sourceNote: '用户于2026-07-29提供的在校经验；具体纳新时间与群入口以组织当届公告为准。'
  },
  {
    id: 'experience-smoking-night-access-appearance',
    kind: 'student_experience',
    category: '校规与安全',
    title: '吸烟、夜间门禁与军训仪容',
    question: '学校哪里能吸烟？夜不归宿怎么认定？穿孔、耳饰和发色有限制吗？',
    answer: '不要把厕所当作“允许吸烟区”。学校公开办学资料明确写有学生不准吸烟，宿舍管理办法也要求不得乱扔烟头；应避免在校内吸烟并以现场禁烟标识为准。宿舍现行规则明确不得迟归、严禁未经请假夜不归宿，但官网没有公开统一的23:00门禁和具体处罚表；学生经验称23:00后进出可能受限。日常穿孔、耳饰和发色没有检索到统一公开细则，军训统一着装及饰品要求由教官和当届通知说明。',
    keywords: ['学校可以抽烟吗', '学校哪里可以抽烟', '学校哪里能吸烟', '哪里允许吸烟', '厕所抽烟', '夜不归宿', '23点门禁', '夜间进出', '穿孔耳饰发色限制', '穿孔', '耳饰', '发色要求', '军训仪容'],
    publicUrl: '/student-rules',
    confidence: 90,
    sourceNote: '禁烟与不得迟归、夜不归宿来自学校公开资料；23:00及仪容执行方式来自经验线索，不能替代当届通知。'
  },
  {
    id: 'experience-night-access',
    kind: 'student_experience',
    category: '宿舍管理',
    title: '迟归和夜不归宿的认定',
    question: '夜不归宿怎么认定，有什么处罚？23点后还能进出宿舍吗？',
    answer: '学校现行宿舍管理办法明确“不得迟归、严禁未经请假夜不归宿”，但官网没有公开统一处罚表和统一的23:00门禁条款。学生经验称23:00后进出可能受限。需要晚归或在外住宿时，应提前按请假流程联系班导、辅导员和宿管，不要等门禁受限后再补报；具体处分按当次事实、学院处理和现行学生手册执行。',
    keywords: ['夜不归宿处罚', '夜不归宿认定', '23点后进出', '23点门禁', '迟归处罚', '晚归请假'],
    publicUrl: '/student-rules',
    confidence: 88,
    sourceNote: '不得迟归和未经请假夜不归宿来自学校现行宿舍办法；23:00来自学生经验。'
  },
  {
    id: 'experience-military-appearance',
    kind: 'student_experience',
    category: '军训',
    title: '穿孔、耳饰和发色要求',
    question: '穿孔、耳饰、发色有限制吗？军训能戴耳饰吗？',
    answer: '目前没有检索到覆盖日常校园生活的统一穿孔、耳饰和发色公开细则。军训期间通常有统一着装和仪容要求，具体不能佩戴什么、发色是否需要调整由教官和当届军训通知说明；收到要求后再处理，不要仅按往届群聊传言作不可逆改变。',
    keywords: ['穿孔耳饰发色限制', '穿孔限制', '耳饰限制', '发色要求', '军训戴耳饰', '军训仪容'],
    publicUrl: '/guides/study-library',
    confidence: 82,
    sourceNote: '官网当前未见统一公开细则；执行方式来自2026-07-29学生经验，当届军训要求优先。'
  },
  {
    id: 'experience-transfer-dorm-sunzi',
    kind: 'student_experience',
    category: '转专业与课程',
    title: '转专业后宿舍与专升本孙子兵法',
    question: '转专业后要换宿舍吗？专升本学生要学孙子兵法吗？',
    answer: '转专业后不一定强制换宿舍，学生经验称可以保留原宿舍，也可以按需要申请调整；是否获批由学院、学生事务部和总务处按当年床位安排处理。学校公开资料确认《孙子兵法》长期作为面向全校专业的公共必修课程，学生经验称专升本学生也统一学习；具体学期、学分和免修条件仍以专升本培养方案与教务系统课表为准。',
    keywords: ['转专业换宿舍', '申请换宿舍', '保留原宿舍', '专升本孙子兵法', '孙子兵法必修', '专升本课程'],
    publicUrl: '/student-rules',
    confidence: 85,
    sourceNote: '宿舍调整依据现行宿舍办法并结合学生经验；孙子兵法全校必修有官网历史资料，专升本具体执行按培养方案。'
  },
  {
    id: 'experience-registration-parking',
    kind: 'student_experience',
    category: '报到交通',
    title: '报到车辆入校与停车',
    question: '学校哪里停车？家长车辆报到需要预约吗？能开到宿舍楼下吗？',
    answer: '据在校经验，报到车辆经预约并向保安报备后可以进入校内，但不能进入宿舍区或直接开到宿舍楼下；校外周边有停车位置，但不能理解为任何路边都可随意停放。2026级车辆预约入口、车牌报备、进校时段和临时停车区尚未见学校公开通知，应等待迎新交通安排，服从保安和现场交通引导，避免堵塞消防通道。',
    keywords: ['学校停车', '家长车辆预约', '报到车辆进校', '车牌报备', '开到宿舍楼下', '宿舍区车辆', '迎新停车'],
    publicUrl: '/guides/arrival',
    confidence: 77,
    sourceNote: '用户于2026-07-29提供的在校经验；2026级车辆预约与停车区域须以迎新通知和现场管理为准。'
  },
  {
    id: 'experience-parttime-student-street',
    kind: 'student_experience',
    category: '周边生活',
    title: '周边兼职和学生街店铺',
    question: '学校周边兼职多吗？新旧区学生街有哪些店？',
    answer: '学生经验称学校周边兼职总体不多，常见线索主要是外卖配送等临时岗位；不要交押金、培训费，不出租账号或银行卡。本站“校园周边”和地图已收录新区学生街以及多项餐饮、便利店、快递和生活服务点位，可按分类查看并规划路线；商铺营业状态变化较快，应以出发当天地图和现场为准。',
    keywords: ['附近兼职', '外卖兼职', '兼职机会多吗', '新区学生街店铺', '旧区学生街店铺', '学生街地图', '周边有哪些店'],
    publicUrl: '/nearby',
    confidence: 79,
    sourceNote: '兼职数量来自2026-07-29学生经验；店铺和点位来自站内高德工作地图数据，营业状态需当日复核。'
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

export const sportsElectiveKnowledge: AssistantKnowledgeSeed[] = [
  {
    id: 'user-image-sports-elective-options-2025',
    kind: 'student_experience',
    category: '体育选修',
    title: '体育选修项目、适用性别与上课地点（表格参考）',
    question: '体育选修有哪些项目？体育2可以选什么？女生和男生分别能选什么体育课？体育课在哪里上？',
    answer: '用户提供的体育选练课安排表显示：表头包含“2024级大学体育4选练课安排表”和“2025级专升本体育2选练课安排表”。图中体育2项目包括女子篮球、男子篮球、足球、五祖拳、花样跳绳、太极拳、健美操、排舞、啦啦操、网球、排球、瑜伽、轮滑、羽毛球、跆拳道、舞龙舞狮、匹克球和柔力球。表格中标注了女子篮球、瑜伽适用女生，男子篮球适用男生；其他项目未标出性别限制，不能据此保证当届选课一定开放。多数班级安排在周四第3-4节，场地分布在旧区生活区篮球场、桥头体育场、仰恩基金会体育场、共102/共103、普贤楼四楼舞蹈室、旧区网球场、旧区桥头排球场、新区湖边篮球场、新区体育场、普207、文体中心及普照楼前。任课教师和每班43人等信息以图中表格为准，2026级实际项目、性别限制、时间、名额和场地仍以教务部当届选课通知为准。',
    keywords: [
      '体育选修有哪些项目',
      '体育课有哪些项目',
      '体育2选什么',
      '体育2项目',
      '大学体育4选修',
      '女生体育选修',
      '男生体育选修',
      '女子篮球',
      '男子篮球',
      '足球',
      '五祖拳',
      '花样跳绳',
      '太极拳',
      '健美操',
      '排舞',
      '啦啦操',
      '网球',
      '排球',
      '瑜伽',
      '轮滑',
      '羽毛球',
      '跆拳道',
      '舞龙舞狮',
      '匹克球',
      '柔力球',
      '体育课上课地点',
      '体育课在哪里上',
      '周四3-4节体育课'
    ],
    publicUrl: '/discover?category=sports',
    confidence: 78,
    sourceNote: '用户提供的体育选练课安排表图片；属于往届/专升本课程安排参考，不替代2026级教务部正式选课通知。'
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
  ...userVerifiedNewStudentExperienceKnowledge,
  ...campusExperienceKnowledge,
  ...sportsElectiveKnowledge,
  ...userSubmittedCampusNotes
]
