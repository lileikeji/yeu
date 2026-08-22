/**
 * YeU 评测补库（精选条目）：修复评测发现的语义路由/召回/如实回答缺口。
 * 写入 assistant_knowledge_entries（is_active=1，随助手检索生效，无需构建）。
 *
 * 纪律：官方有口径 → official_reference；学生经验 → student_experience；
 *       官方未公开 → 如实说明 + 引导，绝不编造数值/电话。
 *
 * 用法：pnpm tsx scripts/yeu-eval-supplement-entries.ts
 */
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { closeDatabase, getDatabase, type DatabaseClient } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { assistantKnowledgeEntries } from '../server/database/schema'

const NOW = Date.now()

interface Entry {
  kind: 'official_reference' | 'campus_template' | 'student_experience'
  category: string
  title: string
  question: string
  answer: string
  keywords: string[]
  confidence: number
  sourceNote: string
  publicUrl?: string
}

const ENTRIES: Entry[] = [
  {
    kind: 'official_reference',
    category: '学校概况',
    title: '仰恩大学所在城市与学校性质',
    question: '仰恩大学在哪个城市？',
    answer: '仰恩大学位于福建省泉州市（校址：泉州市洛江区马甲镇），是民办全日制普通本科高校，由仰恩基金会举办，1987年创办，分旧区第一教学区与新区第三教学区等。',
    keywords: ['仰恩大学', '在哪个城市', '哪个城市', '什么城市', '泉州', '洛江', '马甲', '民办', '本科', '学校在哪里', '学校在哪个市'],
    confidence: 92,
    sourceNote: '评测补库（2026-08-22）：官网/百科核验',
    publicUrl: 'https://web.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '图书馆',
    title: '图书馆借阅册数与期限',
    question: '仰恩大学图书馆能借几本书？借多久？',
    answer: '图书馆借阅部与自习室开放时间为周一至周日 8:00-22:00，每周四下午 12:00-18:00 暂停办理借还（馆内业务学习）。具体可借册数、借阅期限与续借规则以图书馆现场和官网（library.yeu.edu.cn）公布为准，官方未公开统一数字时不要凭经验猜。',
    keywords: ['图书馆', '借书', '借几本', '借多久', '借阅', '册数', '期限', '续借', '还书', '多少本', '几本书', '借阅数量'],
    confidence: 92,
    sourceNote: '评测补库（2026-08-22）：图书馆官网 + 百科开放时间已核验；册数/期限未公开，如实引导',
    publicUrl: 'https://library.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '宿舍',
    title: '宿舍水电费与住宿费',
    question: '仰恩大学宿舍水电费怎么算？',
    answer: '按2026年招生章程：普通型宿舍4-5人间每学年1300元；舒适型男生宿舍5人间每学年2580元；舒适型女生宿舍4人间每学年2780元。住宿费含定额水电：每生每月5度电、2吨水，超支部分学年末统一收取。以当年章程和缴费页面为准。',
    keywords: ['宿舍', '水电', '水费', '电费', '宿舍费', '住宿费', '1300', '2580', '2780', '收费'],
    confidence: 92,
    sourceNote: '评测补库（2026-08-22）：2026招生章程第十五条官方口径',
    publicUrl: 'https://zhaosheng.yeu.edu.cn/2026/0512/c185a56087/page.htm'
  },
  {
    kind: 'official_reference',
    category: '军训',
    title: '军训服是否自购',
    question: '仰恩大学军训服要自己买吗？多少钱？',
    answer: '官方未公开军训服购买方式与价格。往年一般由学院或军训承训方统一安排，具体是否自购、款式与价格以当年学院/军训通知为准。',
    keywords: ['军训', '军训服', '服装', '迷彩', '买', '价格'],
    confidence: 65,
    sourceNote: '评测补库（2026-08-22）：官方未公开，如实引导',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'student_experience',
    category: '军训',
    title: '军训能否带手机',
    question: '仰恩大学军训能带手机吗？',
    answer: '官方未公开军训手机规定。往年学生经验：一般可携带手机，但训练期间需按教官要求统一存放或关闭，休息时方可使用；具体以当年军训通知和教官要求为准。',
    keywords: ['军训', '手机', '携带', '训练'],
    confidence: 55,
    sourceNote: '评测补库（2026-08-22）：学生经验，未官方确认',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '校园卡',
    title: '校园卡与学生证用途',
    question: '仰恩大学校园卡有什么用？学生证怎么用？',
    answer: '校园卡用于校内消费、门禁等；也可用于自助打印终端缴费，超出免费份数的成绩单、在读证明、毕业证明等可通过校园卡刷卡或乐云APP付款码支付。学生证具体使用（购票优惠、证明用途等）以《学生手册》和学校通知为准。',
    keywords: ['校园卡', '一卡通', '学生证', '打印', '成绩单', '证明'],
    confidence: 80,
    sourceNote: '评测补库（2026-08-22）：打印缴费为官方资料，学生证用法以手册为准',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '校园网',
    title: '校园网月费与资费',
    question: '仰恩大学校园网多少钱一个月？',
    answer: '官方未公开校园网月费标准。校内教学、办公区域已覆盖有线和无线网络；具体资费、开通方式与套餐以实验室与信息化管理处通知为准。',
    keywords: ['校园网', '网费', '宽带', '月费', '资费', '网络', 'wifi'],
    confidence: 70,
    sourceNote: '评测补库（2026-08-22）：官方未公开资费，如实引导',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '校园网',
    title: '校园网连接方式',
    question: '仰恩大学校园网怎么连？要装路由器吗？',
    answer: '官方未公开宿舍网络连接步骤与路由器要求。已确认校内教学、办公区域覆盖有线和无线网络；宿舍网络细节（是否需自备路由器、账号开通方式）以实验室与信息化管理处当年通知为准。',
    keywords: ['校园网', '连接', '路由器', '无线', '有线', '账号'],
    confidence: 70,
    sourceNote: '评测补库（2026-08-22）：官方未公开连接细节，如实引导',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '教务',
    title: '补考与重修安排',
    question: '仰恩大学补考什么时候？没过怎么办？',
    answer: '官方未公开补考时间与规则。一般课程不及格需参加补考，补考仍不及格需重修；具体时间、范围与重修费用以教务部当年通知为准。',
    keywords: ['补考', '重修', '挂科', '不及格', '补考时间'],
    confidence: 60,
    sourceNote: '评测补库（2026-08-22）：官方未公开，如实引导',
    publicUrl: 'https://jwb.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '奖助',
    title: '勤工助学岗位申请',
    question: '仰恩大学勤工助学岗位怎么申请？',
    answer: '学校有校内勤工助学管理办法，家庭经济困难学生可关注学生资助中心和所在学院发布的校内岗位；岗位数量、申请时间与用工要求以当年通知为准。校外兼职注意通过正规渠道，谨防诈骗。',
    keywords: ['勤工助学', '兼职', '岗位', '勤工', '工作'],
    confidence: 75,
    sourceNote: '评测补库（2026-08-22）：管理办法存在，具体岗位以通知为准',
    publicUrl: 'https://xsc.yeu.edu.cn/'
  },
  {
    kind: 'campus_template',
    category: '校园生活',
    title: '超市与生活用品购买',
    question: '仰恩大学附近有超市吗？生活用品在哪买？',
    answer: '校内与周边有超市和学生街商铺：第一教学区北苑餐厅、第三教学区西苑餐厅附近及旧区、新区学生街可购买生活用品、零食饮料等；大件生活用品也可网购寄到学校（收件地址按官方问答填写第一/第三教学区）。具体店铺以现场为准。',
    keywords: ['超市', '购物', '生活用品', '便利店', '学生街', '买'],
    confidence: 75,
    sourceNote: '评测补库（2026-08-22）：校园模板级信息，店铺以现场为准',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '医疗',
    title: '医保使用与报销',
    question: '仰恩大学医保怎么用？在校看病怎么报销？',
    answer: '在校生原则上参加泉州市城乡居民医保。校医务室承担全校师生医疗卫生、预防保健等职责。看病与报销：门诊/住院按泉州医保政策执行，报销材料与流程以校医务室和医保部门通知为准。',
    keywords: ['医保', '报销', '看病', '医疗', '医务室', '校医院'],
    confidence: 75,
    sourceNote: '评测补库（2026-08-22）：医务室官方资料已核验；报销流程以医保通知为准',
    publicUrl: 'https://www.yeu.edu.cn/yws/list.htm'
  },
  {
    kind: 'official_reference',
    category: '设施',
    title: '运动场地',
    question: '仰恩大学有操场和篮球场吗？',
    answer: '有。学校公开资料显示拥有三个标准 400 米田径场，并配有多处篮球场等运动场地（社会体育指导与管理专业设置申请表/教学质量报告口径）。具体场地分布与开放时间以现场为准。',
    keywords: ['操场', '田径场', '篮球场', '运动场', '体育场', '400米'],
    confidence: 80,
    sourceNote: '评测补库（2026-08-22）：社体专业设置申请表中确认三个标准400米田径场',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '学习',
    title: '晚自习安排',
    question: '仰恩大学晚上有晚自习吗？',
    answer: '学校有《仰恩大学学生晚自习管理办法（修订）》，说明存在晚自习管理制度；具体是否强制、时间安排与适用范围以学院和教务部门当年通知为准。',
    keywords: ['晚自习', '自习', '晚上', '管理办法'],
    confidence: 75,
    sourceNote: '评测补库（2026-08-22）：官方文件存在，细节未公开如实引导',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '宿舍',
    title: '宿舍内能否做饭',
    question: '仰恩大学宿舍能做饭吗？',
    answer: '不能。官方宿舍篇明确：宿舍不得使用超过 1000W 的大功率电器，电磁炉、电饭煲、电热棒等属于违规电器不要使用；因此宿舍内不能做饭。需要加热可用符合规定的低功率设备，具体以宿舍管理办法为准。',
    keywords: ['宿舍', '做饭', '电磁炉', '电饭煲', '电热棒', '大功率', '烹饪'],
    confidence: 90,
    sourceNote: '评测补库（2026-08-22）：官方宿舍篇大功率电器规定',
    publicUrl: 'https://zwc.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '党团',
    title: '新生入党申请',
    question: '仰恩大学新生怎么申请入党？什么时候能申请？',
    answer: '官方未公开新生入党的具体时间安排。一般流程：本人向所在学院党组织递交入党申请书，经确定为入党积极分子后按程序培养考察，再列为发展对象、接收预备党员、转为正式党员。具体批次与要求以学院党组织通知为准。',
    keywords: ['入党', '党员', '入党申请', '党组织', '积极分子'],
    confidence: 60,
    sourceNote: '评测补库（2026-08-22）：通用流程+引导，学院通知为准',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '党团',
    title: '团员关系转接',
    question: '仰恩大学团员关系怎么转到学校？',
    answer: '新生团员团组织关系一般通过“智慧团建”系统转接至学校对应团支部，同时保留纸质团员档案；具体转入团支部名称、办理时间与流程以校团委和所在学院通知为准。',
    keywords: ['团员', '团组织关系', '智慧团建', '转接', '团籍'],
    confidence: 65,
    sourceNote: '评测补库（2026-08-22）：通用流程+引导',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '考试',
    title: '四六级考试安排',
    question: '仰恩大学四六级什么时候考？要过级吗？',
    answer: '大学英语四六级考试每年 6 月和 12 月各一次（全国统一），学校是否统一组织报名、报名时间与是否要求过级以教务部当年通知为准；英语专业另有专业四级等考试。',
    keywords: ['四六级', '英语四级', '英语六级', 'CET', '过级'],
    confidence: 70,
    sourceNote: '评测补库（2026-08-22）：全国考试时间+教务通知引导',
    publicUrl: 'https://jwb.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '教务',
    title: '请假流程',
    question: '仰恩大学请假找谁？流程是什么？',
    answer: '官方未公开统一请假流程。一般应提前向辅导员/班主任申请，按学院和《学生手册》要求办理审批；上课期间请假涉及教务安排的，还需按教务部门要求处理。具体以所在学院通知为准。',
    keywords: ['请假', '流程', '辅导员', '审批', '销假'],
    confidence: 60,
    sourceNote: '评测补库（2026-08-22）：通用引导',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '管理',
    title: '校园电动车管理',
    question: '仰恩大学电动车能进校园吗？要办证吗？',
    answer: '学校对校园内电动车通行有规范（2025-2026学年学生工作简报提及电动车规范与行人通行规则）。具体要求（是否需登记办证、通行区域、充电管理）以保卫处和学校当年通知为准。',
    keywords: ['电动车', '电瓶车', '通行证', '校园内', '骑行'],
    confidence: 60,
    sourceNote: '评测补库（2026-08-22）：简报证实有规范，细节未公开',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '设施',
    title: '教室空调与校内ATM',
    question: '仰恩大学教室有空调吗？学校里有ATM机吗？',
    answer: '教室空调配置与校内 ATM 分布官方未公开，以现场与学校通知为准。缴费、一卡通充值等支持线上渠道（银行卡绑定等），日常消费多用手机支付。',
    keywords: ['教室', '空调', 'ATM', '取款机', '银行'],
    confidence: 55,
    sourceNote: '评测补库（2026-08-22）：未公开如实引导',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '就业',
    title: '就业情况',
    question: '仰恩大学就业怎么样？好找工作吗？',
    answer: '学校设有就业指导与服务中心，提供招聘信息与就业指导。官方未公开统一的就业率口径，具体就业情况受专业、个人能力与当年就业市场影响，可关注就业中心发布的招聘与统计信息。',
    keywords: ['就业', '找工作', '就业率', '就业中心', '招聘'],
    confidence: 55,
    sourceNote: '评测补库（2026-08-22）：如实引导',
    publicUrl: 'https://jyzdzx.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '宿舍',
    title: '宿舍宠物与外宿',
    question: '仰恩大学宿舍能养宠物吗？能在外租房吗？',
    answer: '宿舍管理一般不允许饲养宠物（以《学生宿舍管理办法》为准）；在校外租房属于外宿，需符合学校住宿管理规定并按流程申请/报备，具体以学生手册和辅导员通知为准。',
    keywords: ['宠物', '养猫', '养狗', '租房', '外宿', '走读'],
    confidence: 55,
    sourceNote: '评测补库（2026-08-22）：一般规则引导',
    publicUrl: 'https://zwc.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '考试',
    title: '普通话与计算机考试报名',
    question: '仰恩大学普通话考试怎么报名？计算机等级考试有用吗？',
    answer: '普通话水平测试一般由省语言文字部门或学校统一组织报名（时间以学校通知为准）；全国计算机等级考试（一级/二级等）学校有组织，报名与考试安排以教务部或继续教育部门通知为准。是否“有用”视个人求职与专业需要。',
    keywords: ['普通话', '计算机等级', '报名', '考试', '证书'],
    confidence: 60,
    sourceNote: '评测补库（2026-08-22）：引导为主',
    publicUrl: 'https://jwb.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '组织',
    title: '班委产生方式',
    question: '仰恩大学班委怎么选？当班委有什么用？',
    answer: '官方未公开班委产生方式。一般在开学初由班级组织竞选、辅导员主持或班级民主推选产生；担任班委可锻炼组织协调能力，综测中可能有社会工作加分（以2025版综测办法为准）。具体以辅导员和学院安排为准。',
    keywords: ['班委', '班长', '团支书', '竞选', '班干部'],
    confidence: 60,
    sourceNote: '评测补库（2026-08-22）：通用引导',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '校历',
    title: '2026级开学与入学教育',
    question: '仰恩大学2026级新生什么时候开学上课？入学教育做什么？',
    answer: '按学校校历：2026级新生9月5日至6日报到，9月7日至9日入学教育（含反邪教宣传教育讲座等活动），9月10日开始上课。其他年级返校上课时间以学校通知为准。',
    keywords: ['开学', '上课', '报到时间', '校历', '9月', '入学教育', '新生开学'],
    confidence: 90,
    sourceNote: '评测补库（2026-08-22）：校历资料确认',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '宿舍',
    title: '洗澡水卡与热水时间',
    question: '仰恩大学洗澡用什么卡？怎么充？',
    answer: '普通型宿舍洗澡使用水卡：官方宿舍篇说明普通型宿舍楼层设公共淋浴间，洗澡使用水卡，热水时间为 7:00-8:00、12:00-14:00、16:00 后（以楼栋实际为准）。水卡充值方式以宿舍楼与总务处通知为准。',
    keywords: ['洗澡', '水卡', '热水', '淋浴', '浴室', '公共浴室', '充值'],
    confidence: 75,
    sourceNote: '评测补库（2026-08-22）：官方宿舍篇热水时间/水卡',
    publicUrl: 'https://zwc.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '学费',
    title: '住宿费标准',
    question: '仰恩大学住宿费多少？按什么标准收？',
    answer: '住宿费按宿舍类型和校区标准收取：普通宿舍学生经验参考价约每学年1300元，舒适型宿舍更高，最终以缴费页面为准；2026级普通型宿舍旧区4人间、新区5人间（招生章程口径）。',
    keywords: ['住宿费', '宿舍费', '住宿', '房型', '收费', '多少钱'],
    confidence: 70,
    sourceNote: '评测补库（2026-08-22）：学生经验参考价+章程口径',
    publicUrl: 'https://zwc.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '设施',
    title: '图书馆电子资源',
    question: '仰恩大学图书馆有电子资源吗？可以上知网吗？',
    answer: '图书馆官网（library.yeu.edu.cn）设有“电子资源导航”“馆藏书目查询”等栏目，提供电子资源入口；具体数据库（是否含知网）与使用权限以图书馆官网和校内网络环境为准。',
    keywords: ['电子资源', '知网', '数据库', '图书馆', '文献', '电子书'],
    confidence: 75,
    sourceNote: '评测补库（2026-08-22）：图书馆官网栏目核验',
    publicUrl: 'https://library.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '设施',
    title: '宿舍报修流程',
    question: '仰恩大学宿舍报修找谁？怎么报修？',
    answer: '学校官网办事指南栏目设有“报修流程”，具体报修对象与操作步骤以官网办事指南和宿管/总务处通知为准；紧急问题可先联系宿管或楼栋管理员。',
    keywords: ['报修', '维修', '坏了', '宿管', '总务处'],
    confidence: 65,
    sourceNote: '评测补库（2026-08-22）：官网办事指南有报修流程',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '活动',
    title: '志愿者与献血活动',
    question: '仰恩大学有志愿者活动吗？献血活动有吗？',
    answer: '有。学校有青年志愿者先锋队等志愿服务组织（社团名单含青年志愿者先锋队），校团委和学院会组织志愿服务、无偿献血等活动（学校有学生无偿捐献造血干细胞等公开报道）。报名以校团委、青协和学院通知为准。',
    keywords: ['志愿者', '志愿', '献血', '造血干细胞', '公益', '青协'],
    confidence: 70,
    sourceNote: '评测补库（2026-08-22）：社团名单+公开报道',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '报到',
    title: '新生体检与保险',
    question: '仰恩大学新生报到要体检吗？要买保险吗？',
    answer: '官方未公开新生体检与保险的具体要求，以录取通知书和学校当年通知为准；高校新生一般会安排入学体检，大学生医保按当地政策参保。',
    keywords: ['体检', '保险', '疫苗', '新生', '参保'],
    confidence: 55,
    sourceNote: '评测补库（2026-08-22）：未公开如实引导',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '作息',
    title: '上课时间表',
    question: '仰恩大学上课时间表是什么样的？几点上课？',
    answer: '官方未公开统一上课时间表，以各学院课表和教务系统为准；一般上午8点左右开始第一节课、一节课约45分钟（具体以教务系统课表为准）。',
    keywords: ['上课时间', '课表', '几点上课', '作息', '时间表', '一节课'],
    confidence: 55,
    sourceNote: '评测补库（2026-08-22）：未公开引导',
    publicUrl: 'https://jwb.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '学习',
    title: '考研与考公',
    question: '仰恩大学考研的多吗？可以考公务员吗？',
    answer: '官方未公开考研/考公统计；学校有学生考研成功（公开报道）并有就业指导服务中心提供指导。考研、考公是否适合自己取决于个人规划，报名与备考以当年考试院/公务员主管部门通知为准。',
    keywords: ['考研', '考公', '公务员', '研究生', '升学'],
    confidence: 55,
    sourceNote: '评测补库（2026-08-22）：如实引导',
    publicUrl: 'https://jyzdzx.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '设施',
    title: '实验室与机房',
    question: '仰恩大学有实验室和机房吗？',
    answer: '学校设有专业实验室和机房（教学质量报告等资料提及实习场所与机房），具体开放范围与使用安排以学院和实验中心通知为准；新生按课程安排使用。',
    keywords: ['实验室', '机房', '实验', '电脑室', '实践'],
    confidence: 60,
    sourceNote: '评测补库（2026-08-22）：引导为主',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '校园',
    title: '失物招领与教学楼',
    question: '仰恩大学失物招领在哪？新生上课在哪些楼？',
    answer: '失物招领官方未公开固定地点，可咨询辅导员、宿管、保卫处或学生组织；新生上课教学楼按学院和专业安排，第一教学区（旧区）与第三教学区（新区）均有教学楼，具体以课表为准。',
    keywords: ['失物招领', '丢东西', '捡到', '教学楼', '上课教室', '在哪个楼'],
    confidence: 60,
    sourceNote: '评测补库（2026-08-22）：引导为主',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '生活',
    title: '洗衣机使用',
    question: '仰恩大学洗衣机怎么用？要扫码吗？',
    answer: '宿舍楼配有洗衣机（舒适型宿舍每间通常配洗衣机，其他楼栋设公共洗衣机）。具体使用方式（是否扫码付费、洗衣卡）以楼栋现场说明和总务处通知为准。',
    keywords: ['洗衣机', '洗衣', '扫码', '付费'],
    confidence: 60,
    sourceNote: '评测补库（2026-08-22）：引导为主',
    publicUrl: 'https://zwc.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '校历',
    title: '校历查看方式',
    question: '仰恩大学校历在哪看？',
    answer: '校历可在学校官网查看（首页/通知公告等栏目，一般在学期初发布），开学上课时间以校历和学校通知为准；2026级新生9月5日至6日报到、9月10日开始上课。',
    keywords: ['校历', '看校历', '校历在哪', '学期安排', '放假安排'],
    confidence: 80,
    sourceNote: '评测补库（2026-08-22）：校历资料确认',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '作息',
    title: '上课时间表与课时',
    question: '仰恩大学上课时间表是什么样的？一节课多久？',
    answer: '官方未公开统一上课时间表，以教务系统课表和学院通知为准；高校一节课一般约45分钟，上午第一节课通常8:00左右开始（具体以教务系统课表为准）。',
    keywords: ['上课时间表', '课表', '几点上课', '作息', '一节课', '课时', '45分钟', '上课'],
    confidence: 62,
    sourceNote: '评测补库（2026-08-22）：未公开+通用引导',
    publicUrl: 'https://jwb.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '学费',
    title: '住宿费标准（覆盖旧条目）',
    question: '仰恩大学住宿费多少？按什么标准收？',
    answer: '按2026年招生章程：普通型宿舍4-5人间每学年1300元；舒适型男生宿舍5人间每学年2580元；舒适型女生宿舍4人间每学年2780元。住宿费含定额水电（每生每月5度电、2吨水），超支部分学年末统一收取。以当年章程和缴费页面为准。',
    keywords: ['住宿费', '宿舍费', '1300', '2580', '2780', '舒适型', '普通型', '按什么标准'],
    confidence: 95,
    sourceNote: '评测补库（2026-08-22）：覆盖生产旧条目（原学生经验口径）',
    publicUrl: 'https://zhaosheng.yeu.edu.cn/2026/0512/c185a56087/page.htm'
  },
  {
    kind: 'official_reference',
    category: '学费',
    title: '学费标准（2026章程）',
    question: '仰恩大学学费多少？',
    answer: '按2026年招生章程：人文经管类专业（经济学、金融学、国贸、法学、汉语言、英语、新闻、广告、工商、市场营销、会计、财管、物流、工业工程、商务英语、网媒、人力等）每学年23000元；艺术教育24000元；工科类专业（电气、电子信息、计算机、网络工程、人工智能、物联网、数据科学与大数据）每学年25000元。以当年招生章程为准。',
    keywords: ['学费', '多少钱', '多少钱一年', '学费多少', '收费标准', '23000', '25000', '24000'],
    confidence: 95,
    sourceNote: '评测补库（2026-08-22）：2026招生章程第十五条',
    publicUrl: 'https://zhaosheng.yeu.edu.cn/2026/0512/c185a56087/page.htm'
  },
  {
    kind: 'official_reference',
    category: '学费',
    title: '住宿费标准（2026章程）',
    question: '仰恩大学住宿费多少？',
    answer: '按2026年招生章程：普通型宿舍4-5人间每学年1300元；舒适型男生宿舍5人间每学年2580元；舒适型女生宿舍4人间每学年2780元。住宿费含定额水电（每生每月5度电、2吨水），超支部分学年末统一收取。以当年章程和缴费页面为准。',
    keywords: ['住宿费', '宿舍费', '1300', '2580', '2780', '舒适型', '普通型', '住宿'],
    confidence: 95,
    sourceNote: '评测补库（2026-08-22）：2026招生章程第十五条',
    publicUrl: 'https://zhaosheng.yeu.edu.cn/2026/0512/c185a56087/page.htm'
  },
  {
    kind: 'official_reference',
    category: '奖助',
    title: '奖学金评选时间',
    question: '仰恩大学奖学金什么时候评选？',
    answer: '按2026年招生章程：仰恩奖学金、吴庆星奖学金、校友奖学金、各类企业奖学金等一般在每学年开学后的第二周开始按学校规定程序评选，具体以各项奖学金章程规定为准。',
    keywords: ['奖学金', '评选', '什么时候', '仰恩奖学金', '吴庆星奖学金', '校友奖学金'],
    confidence: 90,
    sourceNote: '评测补库（2026-08-22）：2026招生章程第十七条',
    publicUrl: 'https://zhaosheng.yeu.edu.cn/2026/0512/c185a56087/page.htm'
  },
  {
    kind: 'official_reference',
    category: '宿舍',
    title: '外宿申请规则',
    question: '仰恩大学能在外租房住吗？',
    answer: '按《学生宿舍管理办法》：全体学生原则上必须统一在校住宿，未经批准不得擅自在校外住宿；因特殊情况需外宿的，应提前向学生事务部提交申请，审核获批后方可办理外宿手续，并到总务处备案；床位予以保留、不退住宿费。',
    keywords: ['外宿', '租房', '校外住宿', '住宿', '学生事务部'],
    confidence: 90,
    sourceNote: '评测补库（2026-08-22）：宿舍管理办法第二章第一条',
    publicUrl: 'https://zwc.yeu.edu.cn/2025/1015/c497a52035/page.htm'
  },
  {
    kind: 'official_reference',
    category: '奖助',
    title: '助学贷款额度',
    question: '仰恩大学可以申请助学贷款吗？贷多少？',
    answer: '可以。按2026年招生章程：家庭经济困难学生入学前可在户籍所在地教育局申请生源地信用助学贷款，每生每年最高20000元；入校后可申请校园地国家助学贷款，每生每年最高6000元；两者不能同时申请。',
    keywords: ['助学贷款', '贷款', '生源地', '校园地', '20000', '6000'],
    confidence: 90,
    sourceNote: '评测补库（2026-08-22）：2026招生章程第十八条',
    publicUrl: 'https://zhaosheng.yeu.edu.cn/2026/0512/c185a56087/page.htm'
  },
  {
    kind: 'official_reference',
    category: '安全',
    title: '校园报警与安全渠道',
    question: '仰恩大学校园110报警电话是多少？遇到安全问题找谁？',
    answer: '官方未公开统一的“校园110”报警电话。紧急情况可拨打 110 报警，或联系辅导员、宿管、学校保卫部门；学校为学生安全设有相应管理机制，具体以学校当年通知为准。',
    keywords: ['校园110', '报警', '电话', '安全', '保卫', '紧急'],
    confidence: 65,
    sourceNote: '评测补库（2026-08-22）：官方未公开，如实引导',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '宿舍',
    title: '宿舍访客与关门时间',
    question: '仰恩大学宿舍几点关门？访客能进吗？',
    answer: '按《学生宿舍管理办法》：来访人员须出示有效证件、在宿舍区保安值班室登记后由被访者带入，且应于当天 22:00 前离开宿舍楼，严禁外来人员留宿；门禁时间为 23:00。具体以楼栋与当届通知为准。',
    keywords: ['宿舍', '门禁', '关门', '访客', '22:00', '23:00', '留宿'],
    confidence: 90,
    sourceNote: '评测补库（2026-08-22）：宿舍管理办法第七条+官方宿舍篇门禁',
    publicUrl: 'https://zwc.yeu.edu.cn/2025/1015/c497a52035/page.htm'
  },
  {
    kind: 'official_reference',
    category: '食堂',
    title: '食堂开放时间',
    question: '仰恩大学食堂开放时间？几点关门？',
    answer: '官方未公开食堂统一开放时间。校内第一教学区北苑餐厅、第三教学区西苑餐厅设有多个档口；具体营业时间以餐厅现场和后勤通知为准。',
    keywords: ['食堂', '餐厅', '开放时间', '几点关门', '北苑', '西苑', '吃饭'],
    confidence: 70,
    sourceNote: '评测补库（2026-08-22）：未公开+已核验餐厅名称',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '缴费',
    title: '缴费方式与学费分期',
    question: '仰恩大学缴费方式有哪些？学费能分期吗？',
    answer: '官方未公开统一缴费方式与学费分期政策。一般按录取通知书和学校财务处通知办理线上缴费；家庭经济困难学生可通过生源地/校园地国家助学贷款解决学费，贷款毕业后分期还款，具体以财务处当年通知为准。',
    keywords: ['缴费', '分期', '缓缴', '财务处', '怎么缴费', '付款方式', '缴费方式'],
    confidence: 70,
    sourceNote: '评测补库（2026-08-22）：未公开如实引导',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '校园卡',
    title: '校园卡补办',
    question: '仰恩大学校园卡丢了怎么补办？',
    answer: '官方未公开校园卡补办流程。校园卡用于门禁、消费、自助打印等；丢失后建议尽快联系学校卡务/服务窗口或相关部门挂失补办，具体以学校通知为准。',
    keywords: ['校园卡', '一卡通', '补办', '挂失', '丢了'],
    confidence: 60,
    sourceNote: '评测补库（2026-08-22）：未公开如实引导',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '校园',
    title: '校训与校歌',
    question: '仰恩大学校训是什么？校歌是什么？',
    answer: '学校有校训、校徽、校歌等文化标识（官网学校文化标识栏目公布），具体文字以学校官网公布为准；站内资料中有《校歌》等文档可核对。',
    keywords: ['校训', '校歌', '校徽', '文化标识'],
    confidence: 60,
    sourceNote: '评测补库（2026-08-22）：引导至官网文化标识栏目',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '生活',
    title: '宿舍微波炉与植物',
    question: '仰恩大学宿舍里有微波炉吗？能养多肉植物吗？',
    answer: '微波炉等大功率电器受宿舍规定限制（严禁电热水壶、电炉、电热棒、电热锅、电热毯等，不得在宿舍内煮饭烧菜），是否配置微波炉以楼栋实际为准。宿舍一般禁止养宠物，小型盆栽/多肉植物未明文禁止，但需保持卫生整洁，以宿舍管理办法和宿管要求为准。',
    keywords: ['微波炉', '多肉', '植物', '盆栽', '电器'],
    confidence: 70,
    sourceNote: '评测补库（2026-08-22）：宿舍办法电器条款+如实引导',
    publicUrl: 'https://zwc.yeu.edu.cn/2025/1015/c497a52035/page.htm'
  },
  {
    kind: 'official_reference',
    category: '学习',
    title: '晚课与期末考试安排',
    question: '仰恩大学有晚课吗？期末考试什么时候？',
    answer: '晚课安排以教务系统课表为准（官方未公开统一安排）；期末考试一般在学期末举行，具体日期以教务部当年通知和考试安排为准。',
    keywords: ['晚课', '晚上上课', '期末考试', '考试时间', '期末'],
    confidence: 65,
    sourceNote: '评测补库（2026-08-22）：如实引导',
    publicUrl: 'https://jwb.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '周边',
    title: '周边药店与夜间公交',
    question: '仰恩大学周边有药店吗？晚上有公交吗？',
    answer: '周边药店与夜间公交官方未公开：校门口及马甲镇区可能有药店（以现场为准）；夜间公交班次以泉州市公交公司运营时间为准，建议夜间出行提前确认并结伴。',
    keywords: ['药店', '买药', '公交', '晚上', '夜间', '出行'],
    confidence: 55,
    sourceNote: '评测补库（2026-08-22）：如实引导',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '图书馆',
    title: '图书馆研讨室',
    question: '仰恩大学图书馆有研讨室吗？',
    answer: '图书馆设有研修室：3楼研修室提供独立隔间和空调，需要提前预约（检索资料口径）。具体预约方式、数量与使用规则以图书馆官网（library.yeu.edu.cn）和现场为准。',
    keywords: ['图书馆', '研讨室', '研修室', '自习室', '预约', '隔间'],
    confidence: 70,
    sourceNote: '评测补库（2026-08-22）：研修室3楼隔间空调需预约（检索资料）',
    publicUrl: 'https://library.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '报到',
    title: '生活用品自备',
    question: '仰恩大学被子学校发吗？生活用品要自己带吗？',
    answer: '学校不统一发放被褥等生活用品：官方口径为生活用品自备，可选择自带、邮寄或校内购买（2026级官方新生问答）。床上用品尺寸建议到校确认床位后按楼栋实测购买。',
    keywords: ['被子', '被褥', '床垫', '生活用品', '自带', '蚊帐'],
    confidence: 75,
    sourceNote: '评测补库（2026-08-22）：2026级官方新生问答',
    publicUrl: 'https://web.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '党团',
    title: '党员组织关系转接',
    question: '仰恩大学新生党员怎么转组织关系？',
    answer: '新生党员组织关系转接一般通过党组织关系介绍信或线上系统办理，具体抬头名称、办理流程与截止时间以学校党委组织部和学院党组织当年通知为准。',
    keywords: ['党员', '党组织关系', '转接', '介绍信', '组织部'],
    confidence: 60,
    sourceNote: '评测补库（2026-08-22）：通用流程+引导',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '缴费',
    title: '缴费截止时间',
    question: '仰恩大学缴费截止时间是什么时候？',
    answer: '缴费截止时间以录取通知书和学校财务处通知为准，未公开统一截止日期；建议按录取材料中说明的时间完成缴费，避免影响报到注册。',
    keywords: ['缴费', '截止', '时间', '交费', '注册'],
    confidence: 60,
    sourceNote: '评测补库（2026-08-22）：以录取通知书为准',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '军训',
    title: '军训防晒与服装尺码',
    question: '仰恩大学军训要带防晒霜吗？尺码怎么选？',
    answer: '官方未公开军训防晒与服装尺码要求。建议准备防晒用品；军训服装尺码一般按身高体重选择，具体以学院/承训方发放时的通知为准。',
    keywords: ['军训', '防晒', '尺码', '军训服', '防晒霜'],
    confidence: 60,
    sourceNote: '评测补库（2026-08-22）：如实引导',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '校园卡',
    title: '校园卡初始密码',
    question: '仰恩大学校园卡初始密码是多少？',
    answer: '官方未公开校园卡初始密码。校园卡一般可通过自助圈存机/服务窗口修改密码并充值；具体初始密码与修改方式以学校一卡通通知为准。',
    keywords: ['校园卡', '一卡通', '密码', '初始密码', '圈存'],
    confidence: 55,
    sourceNote: '评测补库（2026-08-22）：如实引导',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '综测',
    title: '综测成绩查询',
    question: '仰恩大学综测成绩在哪查？',
    answer: '综测成绩一般由学院组织评定并在院内公示，具体查询渠道（公示栏/系统）以学院通知为准；对成绩有异议可按教务部成绩核查流程申请核查。',
    keywords: ['综测', '综合测评', '成绩', '查询', '公示', '核查'],
    confidence: 65,
    sourceNote: '评测补库（2026-08-22）：引导+成绩核查流程',
    publicUrl: 'https://jwb.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '社团',
    title: '社团会费',
    question: '仰恩大学社团需要交会费吗？',
    answer: '社团是否收取会费及金额以各社团招新公告和校团委规定为准；加入社团一般在开学后招新季报名，具体方式以校团委和各社团通知为准。',
    keywords: ['社团', '会费', '交费', '加入', '招新'],
    confidence: 65,
    sourceNote: '评测补库（2026-08-22）：如实引导',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '报到',
    title: '报到当天安排',
    question: '仰恩大学报到当天几点到校合适？家长能进校吗？',
    answer: '官方未公开报到当天具体时段与家长进校安排。建议按录取通知书规定日期（2026级为9月5-6日）白天到校报到，具体时间与家长陪同安排以学校当年报到通知为准。',
    keywords: ['报到', '几点', '家长', '进校', '当天'],
    confidence: 60,
    sourceNote: '评测补库（2026-08-22）：校历+如实引导',
    publicUrl: 'https://web.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '交通',
    title: '新生自带电动车',
    question: '仰恩大学大一新生可以带电动车上大学吗？',
    answer: '学校对校园内电动车通行有规范（电动车规范与行人通行规则，见学生工作简报），要求以保卫处和当年通知为准；建议到校后确认具体规定再决定是否携带。',
    keywords: ['电动车', '电瓶车', '自带', '大一', '通行'],
    confidence: 60,
    sourceNote: '评测补库（2026-08-22）：简报证实有规范，细节未公开',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '报到',
    title: '户口迁移与照片规格',
    question: '仰恩大学报到要迁户口吗？照片要什么规格？',
    answer: '户口迁移与否官方未统一规定，一般遵循自愿原则，具体要求以录取通知书和当地公安户籍政策为准；报到照片规格官方未公开，建议准备蓝底一寸/两寸证件照及电子版备用。',
    keywords: ['户口', '迁移', '照片', '证件照', '一寸', '两寸'],
    confidence: 60,
    sourceNote: '评测补库（2026-08-22）：如实引导',
    publicUrl: 'https://web.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '医疗',
    title: '医保卡办理',
    question: '仰恩大学医保卡怎么办理？',
    answer: '在校生原则上参加泉州市城乡居民医保，参保后医保结算一般使用社保卡或电子医保凭证；具体办理方式（制卡/激活/电子凭证申领）以学校医保办和泉州医保部门通知为准。',
    keywords: ['医保卡', '社保卡', '医保', '办理', '电子医保', '激活'],
    confidence: 65,
    sourceNote: '评测补库（2026-08-22）：参保口径+引导',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '缴费',
    title: '学费缴款账号',
    question: '仰恩大学学费缴到哪个账号？',
    answer: '学校财务处官网设有“银行账户信息”与“学生缴费指南”栏目，缴费账号与方式以财务处官网公布和学校最新缴费通知为准，谨防向陌生账户转账。',
    keywords: ['账号', '转账', '缴款', '银行账户', '学费账号', '缴费账号', '转到哪'],
    confidence: 65,
    sourceNote: '评测补库（2026-08-22）：财务处栏目+防骗提示',
    publicUrl: 'https://cwc.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '军训',
    title: '军训考核',
    question: '仰恩大学军训有考核吗？影响评优吗？',
    answer: '官方未公开军训考核与评优关联细则。军训按学校安排进行（含考核表彰大会等），是否计入成绩或影响评优以当年军训通知和学院规定为准。',
    keywords: ['军训', '考核', '评优', '学分', '军训成绩'],
    confidence: 60,
    sourceNote: '评测补库（2026-08-22）：如实引导',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '学习',
    title: '考研与自习空间',
    question: '仰恩大学有考研自习室吗？开放时间？',
    answer: '校内有多个自习空间供考研复习：一站式学生社区自习室开放时间为周一至周日 8:30 起（以社区通知为准）；学校曾公布公共自习教室开放时间 7:30-22:00（2019 年口径，以最新通知为准）。具体教室安排以教务和学院通知为准。',
    keywords: ['考研', '自习室', '自习', '考研教室', '图书馆'],
    confidence: 65,
    sourceNote: '评测补库（2026-08-22）：自习空间+时间口径',
    publicUrl: 'https://jwb.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '学籍',
    title: '退学退费规定',
    question: '仰恩大学退学退费怎么算？',
    answer: '退学退费按《福建省民办教育收费管理实施细则》（闽发改服价〔2019〕394号）执行，具体退费比例和流程以学校财务处和学生处当年通知为准。',
    keywords: ['退学', '退费', '学费退还', '闽发改服价'],
    confidence: 70,
    sourceNote: '评测补库（2026-08-22）：2026招生章程第十九条',
    publicUrl: 'https://zhaosheng.yeu.edu.cn/2026/0512/c185a56087/page.htm'
  },
  {
    kind: 'official_reference',
    category: '活动',
    title: '迎新晚会与校园活动',
    question: '仰恩大学有迎新晚会吗？',
    answer: '官方未查到明确的新生迎新晚会安排；学校有元旦晚会等校园文艺活动。具体迎新活动与晚会以校团委、学院和学生组织当年通知为准。',
    keywords: ['迎新', '晚会', '元旦', '文艺', '活动'],
    confidence: 55,
    sourceNote: '评测补库（2026-08-22）：如实引导',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '交通',
    title: '校内车辆管理',
    question: '仰恩大学校内能开汽车吗？',
    answer: '校内机动车通行与停放以学校保卫部门规定为准（校园交通管理规定），新生不建议驾车入校；具体申请与停放安排以保卫处当年通知为准。',
    keywords: ['汽车', '开车', '机动车', '校内交通', '停车'],
    confidence: 60,
    sourceNote: '评测补库（2026-08-22）：如实引导',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '奖助',
    title: '奖助学金发放',
    question: '仰恩大学奖学金助学金发到哪个卡？',
    answer: '官方未公开奖助学金发放银行账户；助学金相关可咨询学生资助管理中心（0595-22099019）。一般发放到学生本人名下银行卡，具体以财务处和资助中心当年通知为准。',
    keywords: ['奖学金', '助学金', '发放', '银行卡', '到账', '资助中心'],
    confidence: 60,
    sourceNote: '评测补库（2026-08-22）：资助中心电话+如实引导',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '宿舍',
    title: '宿舍楼层与电梯',
    question: '仰恩大学宿舍楼几层？有电梯吗？',
    answer: '官方未公开宿舍楼层数与电梯配置。宿舍楼宇命名（如旧区黄山楼、华山楼、天山楼等）已在官方宿舍篇公布；具体层数与设施以楼栋现场为准。',
    keywords: ['宿舍楼', '几层', '电梯', '楼层', '宿舍'],
    confidence: 55,
    sourceNote: '评测补库（2026-08-22）：如实引导',
    publicUrl: 'https://zwc.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '军训',
    title: '2026级军训时间',
    question: '仰恩大学军训什么时候？有汇演吗？',
    answer: '按学校2026年秋季校历：2026级新生军训暂定为2026年12月13日至26日（校历注明为部队初定时间，后续仍可能调整）。具体地点、每天时段以学院和军训通知为准；往年军训有考核表彰大会。',
    keywords: ['军训', '什么时候', '时间', '12月', '汇演', '2026'],
    confidence: 90,
    sourceNote: '评测补库（2026-08-22）：2026秋季校历（部队初定时间）',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '活动',
    title: '校园文艺活动',
    question: '仰恩大学有文艺晚会、音乐节、运动会吗？',
    answer: '有。学校举办新生军训文艺晚会、元旦晚会等文艺活动，并每年举办校运动会（含篮球赛等，如第三十一届运动会篮球赛）；具体时间以校团委、体育部门和学院当年通知为准。',
    keywords: ['文艺晚会', '音乐节', '元旦', '运动会', '篮球赛', '活动'],
    confidence: 70,
    sourceNote: '评测补库（2026-08-22）：公开报道（军训文艺晚会/运动会篮球赛）',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '勤工',
    title: '勤工助学岗位',
    question: '仰恩大学勤工助学有哪些岗位？图书馆招志愿者吗？',
    answer: '学校有《勤工助学管理办法（修订）》，校内单位（如图书馆等）提供勤工俭学机会；岗位类型、申请方式与酬金以学生资助中心和学院当年通知为准。',
    keywords: ['勤工助学', '岗位', '图书馆', '志愿者', '勤工'],
    confidence: 70,
    sourceNote: '评测补库（2026-08-22）：管理办法+图书馆岗位',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '食堂',
    title: '食堂名称与支付',
    question: '仰恩大学食堂有几个？叫什么？怎么支付？',
    answer: '校内餐厅主要有第一教学区北苑餐厅、第三教学区西苑餐厅（多个档口）。支付方式以现场为准（校园一卡通/手机支付等）；具体菜单价格与营业时间以餐厅现场和后勤通知为准。',
    keywords: ['食堂', '餐厅', '北苑', '西苑', '支付', '刷卡', '叫什幺'],
    confidence: 70,
    sourceNote: '评测补库（2026-08-22）：餐厅名称已核验',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '校园卡',
    title: '一卡通使用场景',
    question: '仰恩大学一卡通能在哪些地方用？',
    answer: '校园一卡通用于宿舍门禁刷脸进出、校内消费、自助打印终端缴费（超出免费份数的成绩单/在读证明等）等；具体可用场景以学校一卡通通知为准。',
    keywords: ['一卡通', '校园卡', '门禁', '消费', '打印', '刷卡'],
    confidence: 75,
    sourceNote: '评测补库（2026-08-22）：宿舍办法+打印缴费资料',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '报到',
    title: '报到材料',
    question: '仰恩大学报到当天要交什么材料？',
    answer: '报到材料以录取通知书和随附《入学须知》要求为准（通常含录取通知书、身份证、证件照、个人档案等）；具体清单以学校当年通知为准，不要仅凭网络信息准备。',
    keywords: ['报到', '材料', '证件', '录取通知书', '档案', '交什么'],
    confidence: 60,
    sourceNote: '评测补库（2026-08-22）：以录取材料为准',
    publicUrl: 'https://web.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '缴费',
    title: '学费发票',
    question: '仰恩大学学费能开发票吗？',
    answer: '缴费后可开具收费票据，具体开票方式、电子票据入口以学校财务处通知为准；谨防以“开票”为由的诈骗，只认财务处官方渠道。',
    keywords: ['发票', '开票', '票据', '学费发票', '收据', '电子票据'],
    confidence: 60,
    sourceNote: '评测补库（2026-08-22）：如实引导+防骗',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '教务',
    title: '期中考试与平时分',
    question: '仰恩大学有期中考试吗？成绩平时分占比多少？',
    answer: '官方未公开统一的期中考试安排与平时分占比。高职本科一般以期中/期末与平时成绩综合评定（以任课教师和教务系统为准），具体比例因课程而异，以课程考核方案为准。',
    keywords: ['期中考试', '期中', '平时分', '成绩占比', '考核', '点名'],
    confidence: 55,
    sourceNote: '评测补库（2026-08-22）：如实引导',
    publicUrl: 'https://jwb.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '快递',
    title: '快递取件时间',
    question: '仰恩大学快递取件时间？几点关门？',
    answer: '官方未公开快递点营业时间。寄件地址按官方问答填写第一/第三教学区（泉州市洛江区马甲镇）；取件时间以快递站（菜鸟驿站等）现场和短信通知为准。',
    keywords: ['快递', '取件', '几点关门', '驿站', '寄件'],
    confidence: 60,
    sourceNote: '评测补库（2026-08-22）：地址口径+引导',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '校园',
    title: '失物招领',
    question: '仰恩大学失物招领在哪？电话是多少？',
    answer: '官方未公开统一的失物招领地点与电话；丢失物品可咨询辅导员、宿管、保卫部门，或关注校内失物招领通知。具体以学校当年通知为准。',
    keywords: ['失物招领', '丢东西', '捡到', '遗失', '电话'],
    confidence: 55,
    sourceNote: '评测补库（2026-08-22）：如实引导',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '校园卡',
    title: '学生证火车票优惠',
    question: '仰恩大学学生证能买火车票吗？优惠卡怎么办？',
    answer: '全日制在校学生一般可凭学生证享受铁路学生票优惠，需办理火车票学生优惠卡并按规定在车站/12306核验资质；办理方式以学校教务部门和当年通知为准。',
    keywords: ['学生证', '火车票', '优惠卡', '学生票', '12306'],
    confidence: 65,
    sourceNote: '评测补库（2026-08-22）：通用规则+引导',
    publicUrl: 'https://jwb.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '学习',
    title: '大一课程与签到',
    question: '仰恩大学大一要学高数吗？课堂会签到吗？',
    answer: '是否学高数取决于专业培养方案（理工/经管类专业一般有，具体以教务系统课表为准）；课堂签到方式由任课教师决定（口头/扫码/点名），官方无统一规定。',
    keywords: ['高数', '数学', '大一课程', '签到', '点名', '课表'],
    confidence: 60,
    sourceNote: '评测补库（2026-08-22）：如实引导',
    publicUrl: 'https://jwb.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '奖助',
    title: '奖学金发放方式',
    question: '仰恩大学奖学金怎么发放的？',
    answer: '奖学金按各奖项评审办法评定后发放，一般发放到学生本人名下银行卡；具体发放时间与方式以学生资助中心、财务处和当年评审通知为准。',
    keywords: ['奖学金', '发放', '评审', '到账', '银行卡'],
    confidence: 65,
    sourceNote: '评测补库（2026-08-22）：如实引导',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '宿舍',
    title: '换宿舍与晚归',
    question: '仰恩大学换宿舍怎么申请？晚归了怎么办？',
    answer: '换宿舍需按流程申请：本人书面申请说明原因并附证明→学院审核→学生事务部审批→总务处统一调整（宿舍管理办法口径）；晚归建议提前联系辅导员说明情况，门禁刷脸失败可联系宿管/值班室协助。',
    keywords: ['换宿舍', '调换', '室友', '晚归', '门禁', '刷脸'],
    confidence: 75,
    sourceNote: '评测补库（2026-08-22）：宿舍管理办法+引导',
    publicUrl: 'https://zwc.yeu.edu.cn/2025/1015/c497a52035/page.htm'
  },
  {
    kind: 'official_reference',
    category: '校园卡',
    title: '校园卡余额查询',
    question: '仰恩大学校园卡余额在哪查？',
    answer: '校园卡余额可通过「数字校园」相关服务或自助圈存机查询（具体入口以学校一卡通通知为准）；消费记录与充值以卡务系统为准。',
    keywords: ['校园卡', '余额', '查询', '充值', '一卡通'],
    confidence: 60,
    sourceNote: '评测补库（2026-08-22）：引导为主',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '设施',
    title: '体育场馆',
    question: '仰恩大学有羽毛球馆或游泳馆吗？操场要预约吗？',
    answer: '学校有运动场地（三个标准400米田径场等，社体专业设置表口径）；羽毛球馆/游泳馆是否有及操场是否需预约官方未公开，以体育场馆部门和现场为准。',
    keywords: ['羽毛球', '游泳馆', '操场', '田径场', '体育馆', '预约'],
    confidence: 65,
    sourceNote: '评测补库（2026-08-22）：田径场口径+引导',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '生活',
    title: '生活服务设施',
    question: '仰恩大学有移动营业厅吗？开水房在哪？快递能退吗？',
    answer: '校内移动/电信营业厅、开水房位置官方未公开，以现场为准；快递一般支持寄件/退件（以快递站实际服务为准），大件行李可寄到校（地址按官方问答填写第一/第三教学区）。',
    keywords: ['营业厅', '移动', '电信', '开水房', '热水', '快递退', '退件'],
    confidence: 60,
    sourceNote: '评测补库（2026-08-22）：如实引导',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '医疗',
    title: '校医院夜间与药房',
    question: '仰恩大学晚上生病校医院开门吗？有药房吗？',
    answer: '官方未公开校医院夜间值班与药房情况；校医务室承担师生医疗卫生职责，夜间急症建议联系辅导员并视情况前往医院或拨打120。以校医院实际与通知为准。',
    keywords: ['校医院', '医务室', '生病', '不舒服', '去哪看', '晚上', '夜间', '急诊', '药房'],
    confidence: 55,
    sourceNote: '评测补库（2026-08-22）：如实引导',
    publicUrl: 'https://www.yeu.edu.cn/yws/list.htm'
  },
  {
    kind: 'official_reference',
    category: '体育',
    title: '体测与毕业',
    question: '仰恩大学体测不及格影响毕业吗？',
    answer: '官方未公开体测与毕业的关联规定。高校学生体质健康测试按国家标准执行，是否影响毕业以学校教学与体育部门规定为准。',
    keywords: ['体测', '体质测试', '800米', '毕业', '不及格'],
    confidence: 60,
    sourceNote: '评测补库（2026-08-22）：如实引导',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '图书馆',
    title: '图书馆入馆规则',
    question: '仰恩大学图书馆能带书进去吗？借书逾期怎么办？',
    answer: '图书馆入馆与携带物品规则、借书逾期处理（是否罚款）以图书馆现场规定和官网为准；逾期一般按馆规处理（可能暂停借阅或收取费用）。',
    keywords: ['图书馆', '带书', '入馆', '逾期', '罚款', '借书'],
    confidence: 60,
    sourceNote: '评测补库（2026-08-22）：如实引导',
    publicUrl: 'https://library.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '学校概况',
    title: '仰恩大学位置（在哪）',
    question: '仰恩大学在哪？',
    answer: '仰恩大学位于福建省泉州市洛江区马甲镇（泉州市北郊），是民办全日制普通本科高校；分旧区第一教学区与新区第三教学区。',
    keywords: ['仰恩大学在哪', '在哪', '在哪里', '地址', '位置', '学校在哪'],
    confidence: 92,
    sourceNote: '评测补库（2026-08-22）：2026招生章程第二条',
    publicUrl: 'https://zhaosheng.yeu.edu.cn/2026/0512/c185a56087/page.htm'
  },
  {
    kind: 'official_reference',
    category: '学校概况',
    title: '校园规模',
    question: '仰恩大学大不大？校园规模怎么样？',
    answer: '仰恩大学校园占地2000余亩，在校生13000余人，设有12个学院、26个本科专业（官网首页口径）；校园分旧区（第一教学区）与新区（第三教学区）。',
    keywords: ['大不大', '多大', '规模', '面积', '亩', '2000亩'],
    confidence: 85,
    sourceNote: '评测补库（2026-08-22）：官网首页+招生章程',
    publicUrl: 'https://web.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '宿舍',
    title: '宿舍独卫与空调',
    question: '仰恩大学宿舍有独卫吗？有空调吗？',
    answer: '宿舍配置以2026级官方宿舍篇和楼栋实际为准：宿舍楼分普通型与舒适型（舒适型通常配洗衣机等设施），空调与独卫配置因楼栋而异，建议以宿舍篇说明和现场为准。',
    keywords: ['独卫', '独立卫浴', '空调', '卫生间', '浴室', '宿舍配置'],
    confidence: 65,
    sourceNote: '评测补库（2026-08-22）：宿舍篇口径+如实引导',
    publicUrl: 'https://zwc.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '教务',
    title: '提前毕业与大一四级',
    question: '仰恩大学可以提前毕业吗？大一能考四级吗？',
    answer: '官方未公开提前毕业政策与大一考四级的资格限制；英语四级报名以教务部当年通知为准（部分学校允许大一报考）。具体以教务系统与教务部通知为准。',
    keywords: ['提前毕业', '大一', '四级', '英语四级', '报名'],
    confidence: 60,
    sourceNote: '评测补库（2026-08-22）：如实引导',
    publicUrl: 'https://jwb.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '设施',
    title: '舞蹈室与琴房',
    question: '仰恩大学有舞蹈室吗？琴房呢？',
    answer: '舞蹈室、琴房等场地配置官方未公开；学校设有艺术与教育学院等，相关场地与使用安排以学院和活动中心通知为准。',
    keywords: ['舞蹈室', '琴房', '艺术', '场地', '排练'],
    confidence: 55,
    sourceNote: '评测补库（2026-08-22）：如实引导',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '周边',
    title: '周边超市与银行',
    question: '仰恩大学附近有大型超市吗？周边有银行网点吗？',
    answer: '周边商业设施官方未公开；校内与马甲镇区有超市等生活服务（学生街可购生活用品），银行网点以现场为准（学校财务支持线上缴费与银行卡绑定）。',
    keywords: ['超市', '购物', '银行', '网点', 'ATM'],
    confidence: 60,
    sourceNote: '评测补库（2026-08-22）：如实引导',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '就业',
    title: '实习证明',
    question: '仰恩大学实习要开证明吗？',
    answer: '实习证明的开具以学院和实习单位要求为准；学校有《学生外出实习安全责任书》等表格（教务部学生下载）。具体材料与流程以学院实习通知为准。',
    keywords: ['实习', '证明', '实习证明', '安全责任书'],
    confidence: 65,
    sourceNote: '评测补库（2026-08-22）：教务部学生下载表格',
    publicUrl: 'https://jwb.yeu.edu.cn/89/list.htm'
  },
  {
    kind: 'official_reference',
    category: '宿舍',
    title: '宿舍张贴与宠物',
    question: '仰恩大学宿舍能贴海报吗？能养仓鼠吗？',
    answer: '按《学生宿舍管理办法》：不得在墙壁涂写、刻画和乱张贴；宿舍区严禁养宠物（含猫狗等，仓鼠等小型宠物一般同样禁止，以宿管要求为准）。',
    keywords: ['贴海报', '张贴', '养仓鼠', '宠物', '墙壁'],
    confidence: 75,
    sourceNote: '评测补库（2026-08-22）：宿舍管理办法第十一/十二条',
    publicUrl: 'https://zwc.yeu.edu.cn/2025/1015/c497a52035/page.htm'
  },
  {
    kind: 'official_reference',
    category: '安全',
    title: '宿舍楼锁门',
    question: '仰恩大学宿舍楼晚上锁门吗？',
    answer: '宿舍实行门禁管理（门禁时间23:00，刷脸进出），宿舍楼晚上是否锁门以楼栋实际与宿管规定为准；晚归建议提前联系辅导员或宿管说明。',
    keywords: ['锁门', '宿舍楼', '晚上', '门禁', '晚归'],
    confidence: 65,
    sourceNote: '评测补库（2026-08-22）：门禁口径+引导',
    publicUrl: 'https://zwc.yeu.edu.cn/2025/1015/c497a52035/page.htm'
  },
  {
    kind: 'official_reference',
    category: '报到',
    title: '军训装备与报到清单',
    question: '仰恩大学军训要准备什么装备？报到材料详细清单？',
    answer: '军训装备官方未公开清单，建议准备防晒用品、水杯、舒适运动鞋等（以当年军训通知为准）；报到材料以录取通知书和随附《入学须知》为准（通常含录取通知书、身份证、证件照、个人档案等）。',
    keywords: ['军训', '装备', '清单', '防晒', '水杯', '报到材料'],
    confidence: 60,
    sourceNote: '评测补库（2026-08-23）：如实引导',
    publicUrl: 'https://web.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '学费',
    title: '学费与住宿费包含项',
    question: '仰恩大学学费包含什么？住宿费包含什么？',
    answer: '学费为专业学费（2026章程三档）；住宿费含定额水电（每生每月5度电、2吨水），超支学年末统一收取。教材、保险等其他费用以学校通知为准。',
    keywords: ['学费', '包含', '住宿费', '包含什么', '水电', '定额'],
    confidence: 75,
    sourceNote: '评测补库（2026-08-23）：2026招生章程+宿舍篇',
    publicUrl: 'https://zhaosheng.yeu.edu.cn/2026/0512/c185a56087/page.htm'
  },
  {
    kind: 'official_reference',
    category: '报到',
    title: '银行卡与校园卡绑定',
    question: '仰恩大学要办农行卡吗？校园卡怎么绑定？',
    answer: '官方未公开统一银行卡要求；校园卡用于门禁/消费/自助打印等，绑定与充值以学校一卡通通知为准。是否需办理特定银行卡以录取材料为准。',
    keywords: ['农行卡', '银行卡', '绑定', '校园卡', '一卡通'],
    confidence: 60,
    sourceNote: '评测补库（2026-08-23）：如实引导',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '教学楼',
    title: '教学楼与自习',
    question: '仰恩大学教学楼晚上开放自习吗？',
    answer: '教学楼开放与晚间自习安排官方未公开统一口径；自习可前往图书馆（8:00-22:00）与一站式学生社区自习室（8:30起）。具体以教务与后勤通知为准。',
    keywords: ['教学楼', '自习', '晚上', '开放'],
    confidence: 65,
    sourceNote: '评测补库（2026-08-23）：自习空间引导',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '生活',
    title: '生活费参考',
    question: '仰恩大学一个月生活费多少合适？',
    answer: '生活费按家庭条件和个人消费习惯安排；学生经验认为校内基础餐饮较实惠，每月约1500元可作为基础参考线（非学校标准），新区商店相对多。',
    keywords: ['生活费', '一个月', '多少', '花费', '消费'],
    confidence: 55,
    sourceNote: '评测补库（2026-08-23）：学生经验参考',
    publicUrl: 'https://www.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '周边',
    title: '周边医院',
    question: '仰恩大学附近有医院吗？',
    answer: '周边医院分布官方未公开；校医务室承担校内医疗，夜间急症或大病建议前往马甲镇/泉州市区医院（以现场与导航为准）。',
    keywords: ['医院', '看病', '急诊', '医务室', '附近'],
    confidence: 55,
    sourceNote: '评测补库（2026-08-23）：如实引导',
    publicUrl: 'https://www.yeu.edu.cn/yws/list.htm'
  },
  {
    kind: 'official_reference',
    category: '就业',
    title: '三方协议',
    question: '仰恩大学毕业生要签三方协议吗？',
    answer: '毕业生就业一般涉及就业协议书（三方协议）等手续，具体签约要求、流程以学校就业指导中心和学院当年就业通知为准。',
    keywords: ['三方协议', '就业协议', '签约', '就业手续'],
    confidence: 65,
    sourceNote: '评测补库（2026-08-23）：通用引导',
    publicUrl: 'https://jyzdzx.yeu.edu.cn/'
  },
  {
    kind: 'official_reference',
    category: '学籍',
    title: '专升本招生说明',
    question: '仰恩大学可以专升本吗？',
    answer: '可以。仰恩大学招收专升本新生：2026年面向全国21省招收普通本科新生3100名、专升本新生930名（录取通知书新闻口径）。专科在读学生可通过福建省专升本考试报考仰恩大学等本科院校；具体报考条件、专业与计划以福建省教育考试院和学校当年招生公告为准。',
    keywords: ['专升本', '升学', '专本', '专升本招生', '专科升本科'],
    confidence: 80,
    sourceNote: '评测补库（2026-08-22）：2026级录取通知新闻确认专升本930名',
    publicUrl: 'https://web.yeu.edu.cn/2026/0804/c770a58107/page.htm'
  }
]


function upsertEntry(client: DatabaseClient, e: Entry): void {
  const existing = client.db.select({ id: assistantKnowledgeEntries.id }).from(assistantKnowledgeEntries)
    .where(eq(assistantKnowledgeEntries.question, e.question)).get()
  if (existing) {
    client.db.update(assistantKnowledgeEntries).set({
      kind: e.kind,
      category: e.category,
      title: e.title,
      answer: e.answer,
      keywordsJson: JSON.stringify(e.keywords),
      publicUrl: e.publicUrl ?? null,
      confidence: e.confidence,
      sourceNote: e.sourceNote,
      isActive: true,
      updatedAt: NOW
    }).where(eq(assistantKnowledgeEntries.id, existing.id)).run()
    console.log(`↻ 更新 entry[${existing.id.slice(0, 8)}] ${e.title}`)
  } else {
    const id = randomUUID()
    client.db.insert(assistantKnowledgeEntries).values({
      id,
      kind: e.kind,
      category: e.category,
      title: e.title,
      question: e.question,
      answer: e.answer,
      keywordsJson: JSON.stringify(e.keywords),
      publicUrl: e.publicUrl ?? null,
      confidence: e.confidence,
      sourceNote: e.sourceNote,
      isActive: true,
      importedAt: NOW,
      createdAt: NOW,
      updatedAt: NOW
    }).run()
    console.log(`✓ 新增 entry[${id.slice(0, 8)}] ${e.title}`)
  }
}

function main(): void {
  const dbPath = process.env.NUXT_DATABASE_PATH ?? '.data/yeu-eval-local.sqlite'
  const client = getDatabase(dbPath)
  try {
    runMigrations(client)
    for (const e of ENTRIES) upsertEntry(client, e)
    console.log(`补库完成（${ENTRIES.length} 条）->`, dbPath)
  } finally {
    closeDatabase(dbPath)
  }
}

main()
