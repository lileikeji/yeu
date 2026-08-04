export interface SystemFeature {
  id: string
  title: string
  summary: string
  to: string
  icon: string
  keywords: string[]
}

export interface SystemFeatureMatch extends Omit<SystemFeature, 'keywords'> {
  score: number
}

export const systemFeatures: SystemFeature[] = [
  {
    id: 'major-college-lookup',
    title: '专业与学院查询',
    summary: '输入录取专业，查看所属学院、学院官网和2026级宿舍片区公开状态。',
    to: '/major-lookup',
    icon: 'i-lucide-graduation-cap',
    keywords: ['专业在哪查', '专业属于哪个学院', '专业是什么学院', '所属学院', '学院查询', '专业查询', '录取专业', '专业归属']
  },
  {
    id: 'campus-map',
    title: '校园地图与路线规划',
    summary: '搜索宿舍、教学楼、食堂和服务点，选中地点后规划步行路线。',
    to: '/map',
    icon: 'i-lucide-map-pinned',
    keywords: [
      '地图', '学校地图', '校园地图', '平面图', '校园平面图', '导览图', '校区图',
      '地点定位', '怎么走', '导航', '规划路线', '路线规划', '去教学楼',
      '教学楼路线', '教学楼位置', '宿舍楼位置', '食堂位置'
    ]
  },
  {
    id: 'gpa-calculator',
    title: 'GPA 绩点计算器',
    summary: '按学校公开规则试算百分制、五级制和补考课程的平均学分绩点。',
    to: '/student-rules#gpa-calculator',
    icon: 'i-lucide-calculator',
    keywords: ['绩点', 'GPA', '平均学分绩点', '绩点怎么算', '成绩换算', '算绩点']
  },
  {
    id: 'scholarships',
    title: '奖学金条件查询',
    summary: '比较7类公开校内外奖学金的金额、排名、申请条件和兼得规则。',
    to: '/student-rules#scholarships',
    icon: 'i-lucide-award',
    keywords: ['奖学金', '国家奖学金', '励志奖学金', '仰恩奖学金', '吴庆星奖学金', '申请条件', '评奖']
  },
  {
    id: 'student-rules',
    title: '学生规则库',
    summary: '查询成绩、学籍、综合测评、请销假、处分、资助和创新创业制度。',
    to: '/student-rules#rule-library',
    icon: 'i-lucide-book-open-check',
    keywords: ['学生手册', '校规', '学校规定', '请假', '处分', '综合测评', '学籍', '困难生认定']
  },
  {
    id: 'academic-results',
    title: '教务系统与成绩查询',
    summary: '从教务部官方页面进入教务系统，查询课表、选课、考试和成绩；不要使用群聊里的陌生登录链接。',
    to: '/departments/teaching-affairs-office',
    icon: 'i-lucide-notebook-tabs',
    keywords: ['成绩哪里查', '怎么查成绩', '查成绩', '成绩查询', '教务系统', '查课表', '考试成绩', '选课入口']
  },
  {
    id: 'procedures',
    title: '办事流程',
    summary: '按事项查办理步骤、材料、负责部门、地点和当前公开状态。',
    to: '/procedures',
    icon: 'i-lucide-list-checks',
    keywords: ['办事', '办理', '流程', '材料', '手续', '怎么申请', '去哪办理']
  },
  {
    id: 'arrival',
    title: '新生报到流程',
    summary: '查看2026级报到日期、到校前准备、现场步骤和待通知事项。',
    to: '/procedures/arrival',
    icon: 'i-lucide-clipboard-check',
    keywords: ['新生报到', '入学报到', '什么时候开学', '报到材料', '到校流程', '注册报到']
  },
  {
    id: 'freshman-class-lookup',
    title: '新生班级查询',
    summary: '新生编班和所在班级在学校迎新系统开放后查询；尚未显示时，以班导或学院当届通知为准。',
    to: '/procedures/arrival',
    icon: 'i-lucide-users-round',
    keywords: [
      '所在班级怎么查询', '查询所在班级', '我在哪个班', '怎么查班级', '查询班级',
      '班级查询', '分班查询', '编班查询', '新生分班', '迎新系统查班级'
    ]
  },
  {
    id: 'campus-network',
    title: '校园网办理与排障',
    summary: '查看校园网覆盖、连接步骤、账号异常和校外访问说明。',
    to: '/procedures/campus-network',
    icon: 'i-lucide-wifi',
    keywords: ['校园网', '连网', '网络登录', '校园网账号', '网络故障', 'VPN', '上网']
  },
  {
    id: 'dorm-repair',
    title: '宿舍维修报修',
    summary: '宿舍门锁、水电、家具和空调故障的报修步骤与紧急联系方式。',
    to: '/procedures/dorm-repair',
    icon: 'i-lucide-wrench',
    keywords: ['宿舍报修', '维修', '水电故障', '家具坏了', '空调坏了', '门锁坏了']
  },
  {
    id: 'checklist',
    title: '新生待办清单',
    summary: '按到校前、报到当天和入学后阶段勾选准备事项。',
    to: '/checklist',
    icon: 'i-lucide-list-todo',
    keywords: ['待办', '清单', '带什么', '准备什么', '入学准备', '报到准备']
  },
  {
    id: 'chat',
    title: '公共群与宿舍楼群',
    summary: '登录后进入公共群；填写宿舍楼后可进入对应楼群。',
    to: '/chat',
    icon: 'i-lucide-messages-square',
    keywords: ['群聊', '新生群', '宿舍群', '公共群', '聊天', '加群']
  },
  {
    id: 'profile',
    title: '个人中心',
    summary: '登录后修改昵称、专业和宿舍楼信息。',
    to: '/me',
    icon: 'i-lucide-user-round',
    keywords: ['个人中心', '改名字', '修改昵称', '修改专业', '填写宿舍', '账号资料']
  },
  {
    id: 'departments',
    title: '学校部门与学院',
    summary: '按需求查找学校部门、学院职责、官网和联系方式。',
    to: '/departments',
    icon: 'i-lucide-landmark',
    keywords: ['部门', '学院', '联系方式', '电话', '办公室', '找谁', '负责部门']
  },
  {
    id: 'clubs',
    title: '社团与学生组织',
    summary: '浏览公开可核验的社团和学生组织资料。',
    to: '/clubs',
    icon: 'i-lucide-users-round',
    keywords: ['社团', '学生组织', '加入社团', '协会', '招新']
  },
  {
    id: 'nearby-guide',
    title: '校园吃喝玩乐',
    summary: '查看学生街与马甲周边，以及泉州古城美食、夜游、场馆、蟳埔和商圈攻略。',
    to: '/nearby',
    icon: 'i-lucide-compass',
    keywords: [
      '吃喝玩乐', '附近有什么好吃的', '附近有什么好玩的', '学校附近吃什么', '周末去哪',
      '学生街', '马甲美食', '仙公山', '海丝动物园', '永安蝶村', '虹山乡', '半日游',
      '泉州市区', '泉州古城', '西街', '开元寺', '蟳埔', '海交馆', '浦西万达'
    ]
  },
  {
    id: 'campus-panorama',
    title: '全景云游校园',
    summary: '查看大门、教学楼、部分宿舍、体育馆、医务所等校内 360 度实景，也能进入学校发布的校史馆全景。',
    to: '/panorama',
    icon: 'i-lucide-orbit',
    keywords: [
      '全景校园', '校园全景', '全景云游', 'VR校园', 'VR全景', '云游校园',
      '校史馆全景', '720全景', '提前看校园', '网上逛校园', '在线看校园',
      '宿舍全景', '教学楼全景', '大门全景', '校园实景', '宿舍长什么样'
    ]
  },
  {
    id: 'dorm-tours',
    title: '宿舍实拍',
    summary: '查看普通型宿舍和舒适型宿舍的竖屏实拍视频，了解床桌柜、洗衣、洗漱和卫生间区域。',
    to: '/dorms',
    icon: 'i-lucide-bed-double',
    keywords: [
      '宿舍实拍', '宿舍视频', '普通宿舍视频', '普通型宿舍', '舒适型宿舍', '宿舍长什么样',
      '普通宿舍内部', '舒适宿舍内部', '宿舍内部图', '宿舍洗衣机', '宿舍卫生间', '宿舍洗漱区'
    ]
  },
  {
    id: 'feedback',
    title: '反馈纠错',
    summary: '提交内容错误、信息缺失、地图问题或功能建议。',
    to: '/feedback',
    icon: 'i-lucide-message-square-warning',
    keywords: ['反馈', '纠错', '报错', '信息不对', '功能建议', '提交问题']
  },
  {
    id: 'contact',
    title: '联系整理者',
    summary: '扫码联系整理者，反馈问题或咨询新生群。',
    to: '/contact',
    icon: 'i-lucide-message-circle',
    keywords: ['联系我们', '联系整理者', '二维码', '微信', '拉群', '人工咨询']
  },
  {
    id: 'welearn-download',
    title: 'WeLearn 学习工具下载',
    summary: '打开独立第三方软件下载页，查看版本说明并获取最新版。',
    to: 'https://dz.lileikeji.top/uploads/releases/download.php',
    icon: 'i-lucide-download',
    keywords: ['WeLearn', '英语脚本', '英语学习工具', '软件下载', '下载软件', '脚本下载', '最新版']
  },
  {
    id: 'campus-transport',
    title: '到校与离校交通',
    summary: '查询泉州站、泉州东站、泉州晋江国际机场和泉州市区往返仰恩大学的公交与换乘方案。',
    to: '/transport',
    icon: 'i-lucide-bus-front',
    keywords: [
      '怎么到学校', '怎么去仰恩', '学校怎么出去', '怎么离校', '公交', '交通',
      'K6', 'K2', '泉州站', '泉州东站', '晋江机场', '文化宫', '去市区', '末班车'
    ]
  }
]

function normalizeFeatureText(value: string): string {
  return value.toLocaleLowerCase('zh-CN').replace(/[\s，。！？、（）()：:？?]/g, '')
}

export function searchSystemFeatures(query: string, limit = 8): SystemFeatureMatch[] {
  const normalizedQuery = normalizeFeatureText(query)
  if (normalizedQuery.length < 2) return []
  const intent = normalizedQuery.replace(/请问|我想|用户|想要|想|可以|能不能|是什么|有什么|在哪里|在哪|哪里|怎么|如何|功能|入口|快速|一下/g, '')

  return systemFeatures
    .map((feature) => {
      const title = normalizeFeatureText(feature.title)
      const values = [feature.title, feature.summary, ...feature.keywords].map(normalizeFeatureText)
      let score = 0
      if (title === normalizedQuery || (intent && title === intent)) score += 100
      if (values.some(value => value.includes(normalizedQuery))) score += 60
      if (intent.length >= 2 && values.some(value => value.includes(intent))) score += 50
      for (const keyword of feature.keywords.map(normalizeFeatureText)) {
        if (normalizedQuery.includes(keyword)) score += Math.min(30, 8 + keyword.length * 2)
      }
      if (score === 0 && intent.length >= 4) {
        const pairs = Array.from({ length: intent.length - 1 }, (_, index) => intent.slice(index, index + 2))
        const overlap = pairs.filter(pair => values.some(value => value.includes(pair))).length
        if (overlap >= Math.ceil(pairs.length * 0.6)) score += overlap * 3
      }
      const { keywords: _keywords, ...result } = feature
      return { ...result, score }
    })
    .filter(feature => feature.score > 0)
    .sort((left, right) => right.score - left.score)
    .slice(0, limit)
}
