export type StudentRuleCategory = '学业成绩' | '评奖评优' | '日常管理' | '资助帮扶' | '纪律诚信' | '创新创业'

export interface StudentRuleSource {
  slug: string
  title: string
  category: StudentRuleCategory
  summary: string
  version: string
  url: string
  keywords: string[]
}

export interface ScholarshipRule {
  slug: string
  name: string
  amount: string
  scope: string
  ranking: string
  requirements: string[]
  coexistence: string
  reviewTime: string
  version: string
  documentNumber: string
  sourceUrl: string
}

export const scholarshipGeneralRule = {
  title: '仰恩大学全日制在校生参评奖学金规定（修订）',
  documentNumber: '仰大学〔2025〕7号',
  effectiveDate: '2025-03-01',
  sourceUrl: 'https://xsb.yeu.edu.cn/2025/0429/c640a49110/page.htm',
  summary: '除专项或专门奖励类别外，每人每学年只能参评一项奖学金；申请后不得更改或重复参评其他奖学金。通常在每年9月评审上一学年的一、二、三年级奖学金。'
} as const

export const scholarships: ScholarshipRule[] = [
  {
    slug: 'national',
    name: '国家奖学金',
    amount: '金额按当年上级资助政策与学校通知',
    scope: '二年级以上（含二年级）全日制本科生',
    ranking: '学习成绩与综合考评均前10%（含）',
    requirements: [
      '具有中华人民共和国国籍，遵守法律和学校规章，在校期间未受任何处分',
      '参评当年达到仰恩一等奖学金要求；2025版国家奖学金办法正文写作“获仰恩奖学金一等奖”',
      '学习成绩排名与综合考评成绩排名均位于前10%（含10%）',
      '创新能力、社会实践、综合素质等方面特别突出'
    ],
    coexistence: '可同时申请并获得国家助学金；不能同时获得国家励志奖学金。另受学校“一学年只参评一项奖学金”总规定约束。',
    reviewTime: '每学年一次，名额按上级下达计划分配',
    version: '2025年修订',
    documentNumber: '仰大学〔2025〕4号',
    sourceUrl: 'https://xsb.yeu.edu.cn/2025/0311/c644a47890/page.htm'
  },
  {
    slug: 'national-inspirational',
    name: '国家励志奖学金',
    amount: '金额按当年上级资助政策与学校通知',
    scope: '二年级以上（含二年级）全日制本科家庭经济困难学生',
    ranking: '学习成绩与综合考评均前40%（含）',
    requirements: [
      '具有中华人民共和国国籍，在校期间未受任何处分，诚实守信',
      '已被学校认定为家庭经济困难学生，本人生活俭朴',
      '学习成绩排名与综合考评成绩排名均位于前40%',
      '参评当年没有不及格科目'
    ],
    coexistence: '可同时申请并获得国家助学金；不能同时获得国家奖学金。另受学校“一学年只参评一项奖学金”总规定约束。',
    reviewTime: '每学年一次，名额按上级下达计划分配',
    version: '2025年修订',
    documentNumber: '仰大学〔2025〕5号',
    sourceUrl: 'https://xsb.yeu.edu.cn/2025/0311/c644a47891/page.htm'
  },
  {
    slug: 'wu-qingxing',
    name: '吴庆星奖学金',
    amount: '每人4000元，每学年25人',
    scope: '有正式学籍、在校满一学年的本科生',
    ranking: '年级专业综合测评前3%；突出成果可放宽到前10%',
    requirements: [
      '无旷课、未受任何处分，各门课程合格且无补考',
      '综合测评位于本年级本专业前3%',
      '按年级和专业满足英语四/六级或专业英语等级、计算机等级要求',
      '国家体质健康测试良好及以上',
      '科技创新、社会实践或省级以上文体竞赛表现突出者，综合测评可放宽至前10%'
    ],
    coexistence: '同一学年不得同时申请仰恩、国家、国家励志及其他助学奖学金。',
    reviewTime: '每学年评审一次',
    version: '2024年修订',
    documentNumber: '官方公开章程',
    sourceUrl: 'https://xsb.yeu.edu.cn/2024/0903/c640a45584/page.htm'
  },
  {
    slug: 'yeu',
    name: '仰恩奖学金',
    amount: '一等2000元/50人；二等1500元/100人；三等1000元/150人',
    scope: '有正式学籍、在校满一学年的学生',
    ranking: '年级专业综合测评前20%',
    requirements: [
      '无处分，或处分已全部免除满三个月；学年旷课累计不超过5课时',
      '学年综合测评位于本年级本专业前20%',
      '按年级和专业满足英语四/六级或专业英语等级、计算机等级要求',
      '学年无补考科目，获批缓考者除外',
      '体育总评75分以上，国家体质健康测试良好及以上',
      '每旷课一节，参评综合成绩另扣0.5分'
    ],
    coexistence: '受学校“一学年只参评一项奖学金”总规定约束。',
    reviewTime: '每年9月评审上一学年的一、二、三年级',
    version: '2024年修订',
    documentNumber: '官方公开章程',
    sourceUrl: 'https://xsb.yeu.edu.cn/2024/0903/c640a45583/page.htm'
  },
  {
    slug: 'abc-quanzhou',
    name: '农行泉州分行助学奖学金',
    amount: '一等2000元/10人；二等1600元/20人；三等1000元/48人',
    scope: '在校满一学年、经学校确认的家庭经济困难学生（不含成人教育）',
    ranking: '专业综合测评前40%',
    requirements: [
      '无处分或处分已全部免除满三个月；学年旷课累计不超过5课时',
      '综合测评位于专业前40%，评审时无挂科',
      '英语和计算机等级考试通过者同等条件下优先',
      '体育总评70分以上，国家体质健康测试合格以上',
      '每旷课一节，参评综合成绩扣0.5分'
    ],
    coexistence: '同一学年已获国家、国家励志、吴庆星、仰恩或钰齐和诚奖学金者不得参评。',
    reviewTime: '每年9月中旬评审上一学年的一、二、三年级',
    version: '2024年修订',
    documentNumber: '仰大学〔2024〕11号',
    sourceUrl: 'https://xsb.yeu.edu.cn/2024/0904/c640a45601/page.htm'
  },
  {
    slug: 'yuqi-hecheng',
    name: '钰齐集团和诚奖学金',
    amount: '一等3000元/6人；二等2000元/16人',
    scope: '在校满一学年、经学校确认的家庭经济困难学生（不含成人教育）',
    ranking: '专业综合测评前40%',
    requirements: [
      '无处分或处分已全部免除满三个月；学年旷课累计不超过5课时',
      '综合测评位于专业前40%，评审时无挂科',
      '英语和计算机等级考试通过者同等条件下优先',
      '体育总评70分以上，国家体质健康测试合格以上',
      '名额参照学院人数和困难生情况分配，管理学院分配金额不超过总额30%'
    ],
    coexistence: '同一学年已获国家、国家励志、吴庆星、仰恩或农行助学奖学金者不得参评。',
    reviewTime: '每年9月评审上一学年的一、二、三年级',
    version: '2024年修订',
    documentNumber: '仰大学〔2024〕12号',
    sourceUrl: 'https://xsb.yeu.edu.cn/2024/0904/c640a45602/page.htm'
  },
  {
    slug: 'e-plus',
    name: 'E+奖学金',
    amount: '个人或团队均可申请，每个名额最多1万元',
    scope: '有正式学籍、在校满一学年的学生（不含成人教育）',
    ranking: '以高水平竞赛、创新项目或论文成果为核心条件',
    requirements: [
      '无处分或处分已全部免除满三个月；学年旷课累计不超过5课时',
      '评审时无挂科，获批缓考者除外',
      '满足至少一项：A类竞赛全国银奖/二等奖以上，或B类竞赛省级金奖/一等奖',
      '或国家级/省级创新项目立项并结题，政府部门比赛全国二等奖/福建省一等奖',
      '或以第一作者发表被SCI、EI、ISTP收录或权威/核心期刊论文'
    ],
    coexistence: '属于专项创新奖励，是否与其他奖项兼得以当年评审通知和学校认定为准。',
    reviewTime: '公开章程写明每年12月上旬评审上一学年成果',
    version: '官网当前可检索完整章程来自2023年评审通知',
    documentNumber: '公开章程',
    sourceUrl: 'https://xsb.yeu.edu.cn/2023/1205/c124a41670/page.htm'
  }
]

export const gpaRules = {
  title: '仰恩大学学生课程考核与成绩管理办法（修订）',
  version: '官网当前公开可检索版本：2021年版，2021-09-01起施行',
  sourceUrl: 'https://www.yeu.edu.cn/_upload/article/files/81/0e/86d085734e03852643d19a953c11/cf669760-2d67-4324-be23-9405f72990eb.docx',
  formulas: [
    '课程学分绩点 = 课程学分 × 课程绩点',
    '平均学分绩点（GPA）= Σ（课程学分 × 课程绩点）÷ Σ绩点课程学分',
    '百分制课程绩点 = 百分制成绩 ÷ 10 - 5；不及格课程绩点为0'
  ],
  notes: [
    '五级制：优秀4、良好3、中等2、及格1、不及格0',
    '补考成绩达到60分及以上，课程绩点固定为1；低于60分为0',
    '缓考按实际考试成绩计算；0学分课程不参与平均学分绩点',
    '页面计算结果仅供自查，最终以教务系统和学校最新规定为准'
  ]
} as const

export const comprehensiveEvaluationRules = {
  title: '仰恩大学学生综合测评实施办法（修订）',
  version: '2025年1月起施行',
  sourceUrl: 'https://xsb.yeu.edu.cn/2025/0530/c640a49640/page.htm',
  formulas: [
    '综合测评总分 = 德育分 + 智育分 + 体育分（满分100）',
    '德育25分 + 智育70分 + 体育5分',
    '班内互评分 =（个人自评 + 其他参评人员评分总和）÷ 全部参评人数',
    '智育基础分 =（本人本学年度平均成绩 ÷ 本年级本专业最高平均成绩）× 60'
  ],
  notes: [
    '智育奖励最高10分；本学年补考课程按课程学分扣智育分',
    '旷课每学时扣0.5分；迟到或早退每次扣0.1分，三次按旷课一节处理',
    '德育奖励上限13分，体育奖励上限2分；最终成绩保留两位小数'
  ]
} as const

const xsb = 'https://xsb.yeu.edu.cn'

export const studentRuleCatalog: StudentRuleSource[] = [
  { slug: 'gpa', title: gpaRules.title, category: '学业成绩', summary: '课程考核、成绩记载、百分制和五级制绩点、补考与缓考规则。', version: gpaRules.version, url: gpaRules.sourceUrl, keywords: ['绩点', 'GPA', '成绩', '补考', '缓考', '学分'] },
  { slug: 'academic-status', title: '仰恩大学本科生学籍管理规定（修订）', category: '学业成绩', summary: '注册、学制、选课、休复学、退学、毕业与学位等学籍事项。', version: '官网当前公开可检索版本：2021年版', url: 'https://www.yeu.edu.cn/_upload/article/files/78/01/ca457e7144299ad59ad99da88460/0bfe3bf3-5dfd-4ccb-a132-a556f46a4300.docx', keywords: ['学籍', '休学', '复学', '退学', '毕业', '学位'] },
  { slug: 'comprehensive-evaluation', title: comprehensiveEvaluationRules.title, category: '评奖评优', summary: '德育、智育、体育的100分综合测评构成、加扣分和排名办法。', version: comprehensiveEvaluationRules.version, url: comprehensiveEvaluationRules.sourceUrl, keywords: ['综合测评', '德育', '智育', '体育', '加分', '扣分'] },
  { slug: 'scholarship-general', title: scholarshipGeneralRule.title, category: '评奖评优', summary: scholarshipGeneralRule.summary, version: `${scholarshipGeneralRule.documentNumber}，${scholarshipGeneralRule.effectiveDate}起`, url: scholarshipGeneralRule.sourceUrl, keywords: ['奖学金', '参评', '兼得', '评奖'] },
  { slug: 'advanced-students', title: '仰恩大学校级先进集体、三好学生和优秀学生干部的评选办法（修订）', category: '评奖评优', summary: '校级先进班集体、三好学生和优秀学生干部的申报与评审规则。', version: '2025年官网公开修订版', url: `${xsb}/2025/0429/c640a49111/page.htm`, keywords: ['三好学生', '优秀学生干部', '先进班集体', '评优'] },
  { slug: 'discipline', title: '仰恩大学学生违纪处分办法（修订）', category: '纪律诚信', summary: '学生违纪行为、处分种类、程序、申诉及处分解除相关规则。', version: '2025年官网公开修订版', url: `${xsb}/2025/0429/c640a49115/page.htm`, keywords: ['违纪', '处分', '申诉', '解除处分'] },
  { slug: 'integrity-file', title: '仰恩大学学生诚信档案管理办法（试行）', category: '纪律诚信', summary: '学生诚信信息的记录、使用和管理办法。', version: '2022年官网公开试行版', url: `${xsb}/2022/1205/c640a34699/page.htm`, keywords: ['诚信', '档案', '失信'] },
  { slug: 'leave', title: '仰恩大学学生请销假管理办法（修订）', category: '日常管理', summary: '请假申请、审批权限、销假及逾期未归处理规则。', version: '2025年官网公开修订版', url: `${xsb}/2025/0429/c640a49113/page.htm`, keywords: ['请假', '销假', '病假', '事假'] },
  { slug: 'evening-study', title: '仰恩大学学生晚自习管理办法（修订）', category: '日常管理', summary: '晚自习对象、考勤、请假和纪律要求。', version: '2025年官网公开修订版', url: `${xsb}/2025/0429/c640a49114/page.htm`, keywords: ['晚自习', '考勤', '旷课'] },
  { slug: 'home-school', title: '仰恩大学家校联系制度（试行）', category: '日常管理', summary: '学校、学院与学生家长之间的信息沟通机制。', version: '2022年官网公开试行版', url: `${xsb}/2022/1205/c640a34696/page.htm`, keywords: ['家长', '家校联系', '辅导员'] },
  { slug: 'financial-hardship', title: '仰恩大学家庭经济困难学生认定办法（修订）', category: '资助帮扶', summary: '家庭经济困难学生认定对象、档次、材料和评议程序。', version: '2023年官网公开修订版', url: `${xsb}/2023/0620/c640a39148/page.htm`, keywords: ['困难生', '家庭经济困难', '认定', '资助'] },
  { slug: 'work-study', title: '仰恩大学勤工助学管理办法（修订）', category: '资助帮扶', summary: '校内勤工助学岗位、申请、工时、报酬与管理要求。', version: '2022年官网公开修订版', url: `${xsb}/2022/1206/c640a34726/page.htm`, keywords: ['勤工助学', '兼职', '岗位', '报酬'] },
  { slug: 'outstanding-graduate', title: '仰恩大学优秀毕业生评审办法', category: '评奖评优', summary: '优秀毕业生的评审范围、条件和程序。', version: '2022年官网公开版', url: `${xsb}/2022/1205/c640a34698/page.htm`, keywords: ['优秀毕业生', '毕业', '评优'] },
  { slug: 'innovation-park', title: '仰恩大学大学生创业园管理办法（修订）', category: '创新创业', summary: '大学生创业园的入驻、运营、服务和退出管理。', version: '2025年官网公开修订版', url: `${xsb}/2025/0512/c640a49290/page.htm`, keywords: ['创业园', '创业', '入驻'] },
  { slug: 'innovation-assessment', title: '仰恩大学大学生创业园入驻项目考核及奖惩办法（修订）', category: '创新创业', summary: '创业园入驻项目的考核指标、奖励、整改和退出规则。', version: '2025年官网公开修订版', url: `${xsb}/2025/0512/c640a49289/page.htm`, keywords: ['创业项目', '考核', '奖惩', '退出'] }
]

export const studentRuleCategories: StudentRuleCategory[] = ['学业成绩', '评奖评优', '日常管理', '资助帮扶', '纪律诚信', '创新创业']

export function studentRuleSearchText(): string {
  return [
    ...gpaRules.formulas,
    ...gpaRules.notes,
    ...comprehensiveEvaluationRules.formulas,
    ...comprehensiveEvaluationRules.notes,
    scholarshipGeneralRule.summary,
    ...scholarships.flatMap(item => [item.name, item.amount, item.scope, item.ranking, item.coexistence, ...item.requirements]),
    ...studentRuleCatalog.flatMap(item => [item.title, item.summary, ...item.keywords])
  ].join(' ')
}
