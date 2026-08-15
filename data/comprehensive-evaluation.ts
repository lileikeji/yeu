/**
 * 仰恩大学学生综合测评实施办法（修订）— 2025版加分/扣分明细。
 * 数据来源：https://xsb.yeu.edu.cn/2025/0530/c640a49640/page.htm
 * 抓取自内嵌 PDF《仰恩大学学生综合测评实施办法（修订）》，
 * 2025年1月起施行（仰恩大学办公室 2024年12月23日印发），2021版废止。
 * 供 AI 检索、站内综合测评知识库与综测分计算模块共同使用。
 * 提示：同一项目/同一作品/同类任职一般按最高项计，不重复累计；
 * 团体获奖分数减半（最低 0.1）；具体认定以学院当年通知与审核为准。
 */

export const zongceVersion = '2025年1月起施行'
export const zongceSourceUrl = 'https://xsb.yeu.edu.cn/2025/0530/c640a49640/page.htm'

export interface ZongceItemLevel { level: string; points: number; note?: string }
export interface ZongceItem {
  id: string
  name: string
  levels?: ZongceItemLevel[]
  points?: number
  cap?: number
  note?: string
  keywords: string[]
}
export interface ZongceCategory { id: string; label: string; cap?: number; items: ZongceItem[] }

export const zongceBonusCategories: ZongceCategory[] = [
  {
    id: 'moral-honor', label: '德育奖励·荣誉称号', cap: 13,
    items: [
      {
        id: 'honor-title', name: '个人荣誉称号',
        levels: [
          { level: '国家级', points: 8 }, { level: '省部级', points: 4 },
          { level: '市级', points: 3 }, { level: '校级', points: 2 }, { level: '院级', points: 1 }
        ],
        note: '优秀共产党员、优秀共青团干部、优秀共青团员、优秀学生干部、三好学生、校园之星、大学生自强之星等，须为教育主管部门或相关政府部门主办评选。',
        keywords: ['优秀共产党员', '优秀共青团干部', '优秀共青团员', '优秀学生干部', '优秀学生', '三好学生', '校园之星', '自强之星', '荣誉称号', '优团', '优干', '优生']
      },
      {
        id: 'honor-collective', name: '先进集体（所属成员）',
        levels: [
          { level: '国家级', points: 2 }, { level: '省部级', points: 1 },
          { level: '市/校级', points: 0.5 }, { level: '院级', points: 0.25 }
        ],
        note: '先进党支部、五四红旗团支部、先进班集体、文明宿舍，按人计分。',
        keywords: ['先进党支部', '五四红旗团支部', '先进班集体', '文明宿舍', '先进集体']
      },
      {
        id: 'honor-activity-activist', name: '活动积极分子/先进个人',
        levels: [
          { level: '国家级', points: 3 }, { level: '省部级', points: 2 },
          { level: '市/校级', points: 1 }, { level: '院级', points: 0.5 }
        ],
        note: '暑期实践、军训、志愿服务、慈善公益、五四合唱等各类活动中的积极分子或先进个人。',
        keywords: ['暑期实践', '军训', '志愿服务', '慈善公益', '五四合唱', '积极分子', '先进个人']
      },
      {
        id: 'honor-internal', name: '校/院/系党团学组织内部评优',
        levels: [{ level: '校级', points: 0.5 }, { level: '院系级', points: 0.2 }],
        note: '如优秀干事、优秀队员等。',
        keywords: ['优秀干事', '优秀队员', '内部评优']
      }
    ]
  },
  {
    id: 'moral-work', label: '德育奖励·社会工作（学生干部）', cap: 13,
    items: [
      {
        id: 'work-min-union-top', name: '校团委/学生会/社团管理部部长团等正副职',
        levels: [
          { level: '校团委学生第一副书记/校学生会执行主席', points: 3.5 },
          { level: '校团委、学生会主要学生干部副职', points: 3 },
          { level: '其他正职', points: 3 }, { level: '其他副职', points: 2.5 }
        ],
        note: '青年志愿者先锋队、易班、国旗班正副队长、正副班长等同口径。',
        keywords: ['校团委', '校学生会', '社团管理部', '部长团', '青年志愿者先锋队', '易班', '国旗班', '主席团', '学生干部']
      },
      {
        id: 'work-min-union-member', name: '校团委/学生会/社团管理部组长/部长/干事',
        levels: [
          { level: '部长（社团管理部组长）', points: 2 },
          { level: '副部长（副组长）', points: 1.5 }, { level: '干事', points: 0.5 }
        ],
        keywords: ['部长', '副部长', '干事', '组长', '副组长']
      },
      {
        id: 'work-institute-top', name: '院系团委/学生会/志愿队/易班正副职',
        levels: [
          { level: '院系学生第一副书记/院系学生会执行主席', points: 2.5 },
          { level: '副职', points: 2 }, { level: '其他正职', points: 2 }, { level: '其他副职', points: 1.5 }
        ],
        keywords: ['院系团委', '团总支', '院系学生会', '执行主席']
      },
      {
        id: 'work-media', name: '校党委宣传部学生通讯社/电台/电视台',
        levels: [
          { level: '社长（台长）', points: 3.5 }, { level: '副社长（副台长）', points: 3 },
          { level: '部门正职', points: 1.5 }, { level: '部门副职', points: 1 }, { level: '干事', points: 0.5 }
        ],
        keywords: ['学生通讯社', '电台', '电视台', '党委宣传部']
      },
      {
        id: 'work-institute-member', name: '院系团委/学生会/志愿队/易班部长/干事',
        levels: [{ level: '部长', points: 1.2 }, { level: '副部长', points: 0.8 }, { level: '干事', points: 0.3 }],
        keywords: ['院系部长', '院系干事']
      },
      {
        id: 'work-party-branch', name: '学生党支部干部',
        levels: [{ level: '学生党支部书记', points: 2 }, { level: '学生党支部支委', points: 1 }],
        keywords: ['党支部书记', '党支部支委', '支委']
      },
      {
        id: 'work-class', name: '班级班委',
        levels: [{ level: '正职班委（行政班长/学习班长/团支书）', points: 1.5 }, { level: '其他班委', points: 1 }],
        keywords: ['班长', '学习班长', '团支书', '班委']
      },
      { id: 'work-assistant', name: '辅导员助理（班导）', points: 1.5, note: '服务期满一年。', keywords: ['辅导员助理', '班导'] },
      {
        id: 'work-club', name: '学生社团/主管学生团体正副职', points: 1.5,
        note: '楼委会、保卫处、艺术与教育学院、体育教研部、党委组织部、学生事务部等主管团体（雏鹰应急分队、舞团、校篮球队、校辩论队等）正副队长/团长；国旗班护卫队成员（不含班委）。',
        keywords: ['社团', '楼委会', '舞团', '篮球队', '辩论队', '团长', '队长', '国旗班护卫队']
      },
      {
        id: 'work-multi-note', name: '社会工作通用约定', points: 0,
        note: '兼任数项按最高分计，不重复；任职满一年考核合格方可加分；被免职/清退或受警告以上处分不加分。',
        keywords: ['兼任', '不重复计分', '任期满一年']
      }
    ]
  },
  {
    id: 'moral-competition', label: '德育奖励·文化艺术/思想道德/综合素质竞赛', cap: 13,
    items: [
      {
        id: 'comp-culture', name: '文化艺术/思想建设竞赛获奖',
        levels: [
          { level: '国家级一等奖', points: 5 }, { level: '国家级二等奖', points: 4 },
          { level: '国家级三等奖', points: 3 }, { level: '国家级优秀奖', points: 2 },
          { level: '省部级一等奖', points: 4 }, { level: '省部级二等奖', points: 3 },
          { level: '省部级三等奖', points: 2 }, { level: '省部级优秀奖', points: 1 },
          { level: '市/校级一等奖', points: 3 }, { level: '市/校级二等奖', points: 2 },
          { level: '市/校级三等奖', points: 1 }, { level: '市/校级优秀奖', points: 0.5 },
          { level: '校职能部门级一等奖', points: 2 }, { level: '校职能部门级二等奖', points: 1 },
          { level: '校职能部门级三等奖', points: 0.5 }, { level: '校职能部门级优秀奖', points: 0.2 },
          { level: '院级一等奖', points: 1 }, { level: '院级二等奖', points: 0.5 },
          { level: '院级三等奖', points: 0.3 }, { level: '院级优秀奖', points: 0.1 }
        ],
        note: '征文、演讲、摄影、舞蹈、动漫、辩论、书法等，须为教育部、团中央、省教育厅、团省委、学校、学院等主办。按名次设等级时，第1/2名按一等、3-5名按二等、6-8名按三等计。民间/行业组织的带民间性质活动只按校/院级参考，累计不超1.5分。',
        keywords: ['征文', '演讲', '摄影', '舞蹈', '动漫', '辩论', '书法', '文化艺术', '竞赛获奖']
      }
    ]
  },
  {
    id: 'moral-others', label: '德育奖励·创业/公益/志愿/献血/讲座/演出', cap: 13,
    items: [
      {
        id: 'entrepreneurship', name: '创业活动',
        levels: [
          { level: '创办企业并获营业执照（兼职）', points: 2 },
          { level: '长期创业（专职一年）', points: 3 }, { level: '长期创业（专职二年）', points: 4 },
          { level: '长期创业（专职三年）', points: 5 }, { level: '长期创业（专职四年）', points: 6 }
        ],
        note: '适用于营业执照法定代表人；兼有其他合作者（不多于3人）每人1分。需提供材料并由学生事务部认定。',
        keywords: ['创业', '营业执照', '法定代表人', '专职创业']
      },
      {
        id: 'deed', name: '见义勇为/拾金不昧/帮弱助残/抢险救灾等突出事迹',
        levels: [
          { level: '全国表彰', points: 3 }, { level: '省（部）表彰', points: 2 },
          { level: '市级', points: 1 }, { level: '校级', points: 0.8 }, { level: '院级', points: 0.5 }
        ],
        note: '每次计分，同一事迹多次表彰只取最高级别，不累计。',
        keywords: ['见义勇为', '拾金不昧', '帮弱助残', '抢险救灾', '抢救伤残', '表彰']
      },
      {
        id: 'volunteer-hours', name: '志愿服务时长', points: 0.15, cap: 3,
        note: '每2小时志愿服务加0.15分；以校/院青年志愿者先锋队记录为准，红十字会以红博云平台记录为准。',
        keywords: ['志愿时长', '志愿服务', '志愿者', '志愿小时']
      },
      {
        id: 'blood-donation', name: '无偿献血', points: 0.5, cap: 1.5,
        note: '每次0.5分，以献血证记录为准。',
        keywords: ['无偿献血', '献血']
      },
      {
        id: 'lecture', name: '不设奖项的学校/学院活动（讲座）', points: 0.1, cap: 1,
        note: '道德讲堂、名师讲坛、专家讲座、优秀校友讲座等，需组织方活动证明。',
        keywords: ['道德讲堂', '名师讲坛', '专家讲座', '校友讲座', '讲座']
      },
      {
        id: 'show-activist', name: '校级文艺演出积极分子/先进个人', points: 0.5, cap: 1,
        note: '国庆晚会、迎接晚会、元旦晚会、元宵晚会等，每场0.5分。',
        keywords: ['国庆晚会', '迎接晚会', '元旦晚会', '元宵晚会', '文艺演出']
      }
    ]
  },
  {
    id: 'intellectual-research', label: '智育奖励·科研课题/竞赛/论文/专利/证书（上限10分）', cap: 10,
    items: [
      {
        id: 'research-project', name: '科研课题（大学生创新创业训练计划项目等）',
        levels: [
          { level: '国家级', points: 4 }, { level: '省部级', points: 2 },
          { level: '市/校级', points: 1 }, { level: '院级', points: 0.5 }
        ],
        note: '主要成员并有科研成果结项验收；多人合作主要负责人得一半，其余组员平分剩余。同一课题多级立项取最高分。',
        keywords: ['科研课题', '创新创业训练计划', '大创', '结项', '科研成果']
      },
      {
        id: 'academic-competition', name: '学科与技能竞赛获奖',
        levels: [
          { level: '省级以上A类 一等', points: 6 }, { level: 'A类 二等', points: 5 },
          { level: 'A类 三等', points: 4 }, { level: 'A类 优秀奖', points: 2 },
          { level: 'B类 一等', points: 4 }, { level: 'B类 二等', points: 3 },
          { level: 'B类 三等', points: 2 }, { level: 'B类 优秀奖', points: 1 },
          { level: 'C类 一等', points: 3 }, { level: 'C类 二等', points: 2 },
          { level: 'C类 三等', points: 1 }, { level: 'C类 优秀奖', points: 0.5 },
          { level: '市级 一等', points: 2 }, { level: '市级 二等', points: 1 }, { level: '市级 三等', points: 0.5 },
          { level: '校级 一等', points: 1 }, { level: '校级 二等', points: 0.5 }, { level: '校级 三等', points: 0.25 }
        ],
        note: 'A类=教育部国家级竞赛/全国职业院校技能大赛/省厅认定重大赛事；B类=A类省赛选拔、全国性行业协会学会赛事、福建省级赛事；C类=A/B以外的学科技能竞赛。同一活动多级别取最高分不重复。',
        keywords: ['学科竞赛', '技能竞赛', '创新创业大赛', '挑战杯', '互联网+', 'A类', 'B类', 'C类']
      },
      {
        id: 'paper', name: '论文与新闻报道发表',
        levels: [
          { level: 'SCI/SSCI/EI/ISTP收录', points: 10 }, { level: '中文核心期刊', points: 6 },
          { level: '正式出版著作（10万字以上）', points: 6 }, { level: '正式出版著作（10万字以下）', points: 3 },
          { level: '正式刊物发表论文/学术会议交流论文', points: 2 },
          { level: '中央级媒体发表新闻/图片', points: 2 },
          { level: '普通媒体（市级以上）发表新闻/图片', points: 1 },
          { level: '校园网主页/校报发表新闻/图片', points: 0.1 }
        ],
        note: '普通媒体新闻图片累计不超2分；校园网/校报累计不超1分。以仰恩大学名义发表，第一作者得一半，其余平均分剩余。',
        keywords: ['SCI', 'SSCI', 'EI', 'ISTP', '核心期刊', '论文', '著作', '新闻报道', '校报']
      },
      {
        id: 'patent', name: '专利与软著',
        levels: [
          { level: '发明专利 第一专利权人', points: 8 }, { level: '发明专利 一般成员', points: 4 },
          { level: '实用新型 第一专利权人', points: 6 }, { level: '实用新型 一般成员', points: 3 },
          { level: '计算机软件著作权 第一人', points: 6 }, { level: '计算机软件著作权 一般成员', points: 3 },
          { level: '外观设计专利 第一人', points: 2 }, { level: '外观设计专利 一般成员', points: 1 }
        ],
        note: '需提交专利授权证书或著作权登记证书。',
        keywords: ['发明专利', '实用新型', '外观设计', '专利', '软件著作权', '软著']
      }
    ]
  },
  {
    id: 'intellectual-cert', label: '智育奖励·职业资格与水平测试（上限10分）', cap: 10,
    items: [
      {
        id: 'cert-vocational', name: '国家职业资格/职业技能鉴定',
        levels: [
          { level: '高级师级（国家一级）', points: 6 }, { level: '师级（国家二级）', points: 4 },
          { level: '助理师级（国家三级）', points: 3 }, { level: '高级员级（国家四级）', points: 2 },
          { level: '员级（国家五级）', points: 1 }
        ],
        note: '以国家职业资格网为准；同一类别取高值。其他行业从业资格0.5分，执业资格1分。',
        keywords: ['职业资格', '职业技能鉴定', '从业资格', '执业资格', '证书', '资格证']
      },
      {
        id: 'cert-proficiency', name: '外语与计算机水平测试',
        levels: [
          { level: 'TOEFL 80-90', points: 3 }, { level: 'TOEFL 90-105', points: 3.5 }, { level: 'TOEFL 105及以上', points: 4 },
          { level: 'IELTS 6.0-6.5', points: 3 }, { level: 'IELTS 6.5-7.0', points: 3.5 }, { level: 'IELTS 7.0及以上', points: 4 },
          { level: 'GRE 310-330', points: 3 }, { level: 'GRE 330及以上', points: 4 },
          { level: '商务英语初级 优秀', points: 2 }, { level: '商务英语初级 通过', points: 1 },
          { level: '商务英语中级 优秀', points: 3 }, { level: '商务英语中级 通过', points: 2 },
          { level: '商务英语高级 优秀', points: 4 }, { level: '商务英语高级 通过', points: 3 },
          { level: '非英语专业四级 425-567', points: 3 }, { level: '非英语专业四级 567以上', points: 4 },
          { level: '非英语专业六级 425-567', points: 4 }, { level: '非英语专业六级 567以上', points: 5 },
          { level: '英语专业四级 优秀', points: 3 }, { level: '英语专业四级 合格', points: 1 },
          { level: '英语专业八级 优秀', points: 5 }, { level: '英语专业八级 合格', points: 3 }
        ],
        note: '英语专四良好2分、专八良好4分；计算机等级与普通话按等级0.25-4分不等。',
        keywords: ['托福', 'TOEFL', '雅思', 'IELTS', 'GRE', '商务英语', '四级', '六级', '四六级', '专四', '专八', '计算机等级', '普通话', '英语四级', '英语六级']
      }
    ]
  },
  {
    id: 'sports', label: '体育奖励（上限2分）', cap: 2,
    items: [
      {
        id: 'sports-competition', name: '体育比赛',
        levels: [
          { level: '国家/省部/市级 第1-3名', points: 2 }, { level: '国家/省部/市级 第4-8名', points: 1.5 },
          { level: '国家/省部/市级 参赛未获奖', points: 0.5 },
          { level: '校级 第1-3名', points: 1 }, { level: '校级 第4-8名', points: 0.5 },
          { level: '校级 参赛未获奖', points: 0.25 }
        ],
        note: '个人/团体同分；多次参赛或多项目可累计，但总分不高于2分。',
        keywords: ['体育比赛', '运动会', '田径', '篮球', '足球', '羽毛球', '冠军', '第1名']
      }
    ]
  }
]

export const zongceDeductions: Array<{ name: string; points: number; unit: string }> = [
  { name: '警告', points: 3, unit: '次' },
  { name: '严重警告', points: 4, unit: '次' },
  { name: '记过', points: 5, unit: '次' },
  { name: '留校察看', points: 6, unit: '次' },
  { name: '学院或以上通报批评（违纪类）', points: 2, unit: '/次累计' },
  { name: '开学无故未按时报到/注册通报批评', points: 2, unit: '/次不累计' },
  { name: '卫生评比不合格班级/宿舍成员', points: 0.5, unit: '/次·人' },
  { name: '违反宿舍管理等（不够处分）', points: 0.5, unit: '起' },
  { name: '旷课', points: 0.5, unit: '/学时' },
  { name: '迟到/早退', points: 0.1, unit: '/次，三次按一节' },
  { name: '无故缺席学校/学院活动', points: 0.5, unit: '/次' },
  { name: '失社会公德/扰乱公共秩序（不够处分）', points: 0.5, unit: '/次' },
  { name: '不讲诚信/造假谋利', points: 2, unit: '起' },
  { name: '参加直销/传销', points: 4, unit: '起' }
]

export const zongceStructure = {
  total: 100,
  moral: { points: 25, base: 6, peerReview: 6, rewardCap: 13 },
  intellectual: { points: 70, base: 60, rewardCap: 10 },
  // base 60 为满分上限：智育基础分 =（本人本学年度平均成绩 ÷ 本年级本专业最高平均成绩）× 60，随成绩浮动；计算器按该公式折算。
  sports: { points: 5, base: 3, rewardCap: 2 }
}

/** 将一条加分条目转成可读文本（供 AI 证据与对照展示）。 */
export function zongceItemText(item: ZongceItem): string {
  const base = item.levels
    ? item.levels.slice(0, 8).map(v => v.level + ' ' + v.points + '分').join('；')
    : String(item.points ?? 0) + '分'
  const cap = item.cap ? '（最多计' + item.cap + '分）' : ''
  const note = item.note ? '。' + item.note : ''
  return item.name + '：' + base + cap + note
}

/** 回传所有可检索的加分/扣分明细文本（供 buildStructuredEvidence 用）。 */
export function zongceEvidenceText(): string {
  const bonus = zongceBonusCategories.flatMap(c =>
    c.label + '（' + (c.cap ? '上限' + c.cap + '分' : '') + '）：' + c.items.map(zongceItemText).join('；')
  )
  const deduct = '德育扣分：' + zongceDeductions.map(d => d.name + ' ' + d.points + '分/' + d.unit).join('；')
  return bonus.join(' | ') + ' | ' + deduct
}

/** 根据一句自然语言描述，尽可能匹配加分/扣分条目（供对照展示；精确值以 AI 与学院审核为准）。 */
export function matchZongceItem(text: string): Array<{ item: string; hint: string; score: number }> {
  const norm = text.replace(/[。，、？?.！!：:s]/g, '')
  const out: Array<{ item: string; hint: string; score: number }> = []
  const allItems = zongceBonusCategories.flatMap(c => c.items)
  for (const item of allItems) {
    const hits = item.keywords.filter(k => norm.includes(k)).length
    if (hits === 0) continue
    out.push({ item: item.name, hint: zongceItemText(item), score: hits })
  }
  for (const d of zongceDeductions) {
    if (norm.includes(d.name)) out.push({ item: '扣分：' + d.name, hint: d.name + '扣' + d.points + '分/' + d.unit, score: 1 })
  }
  return out.sort((a, b) => b.score - a.score).slice(0, 10)
}
