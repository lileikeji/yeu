export type AdmissionType = 'ordinary-undergraduate' | 'transfer-undergraduate'
export type DormArea = 'new' | 'old' | 'pending'

export interface MajorProfile {
  name: string
  code: string
  collegeName: string
  collegeSlug: string
  collegeWebsite: string
  collegeProfileUrl: string
  admissionTypes: AdmissionType[]
  dormArea: DormArea
  dormLabel: string
  dormNote: string
  verifiedAt: string
}

export const ordinaryPlanSource = {
  title: '仰恩大学2026年普通本科招生计划',
  url: 'https://zhaosheng.yeu.edu.cn/2026/0625/c184a57138/page.htm'
} as const

export const transferPlanSource = {
  title: '仰恩大学2026年福建省普通专升本教育招生计划',
  url: 'https://zhaosheng.yeu.edu.cn/2026/0416/c184a55600/page.htm'
} as const

const transferMajors = new Set([
  '计算机科学与技术', '网络工程', '电子信息工程', '电气工程及其自动化',
  '数据科学与大数据技术', '人工智能', '物联网工程', '国际经济与贸易',
  '会计学', '财务管理', '物流管理', '金融学', '工业工程', '广告学',
  '英语', '汉语言文学', '法学'
])

const colleges = {
  economics: {
    collegeName: '经济学院',
    collegeSlug: 'school-of-economics',
    collegeWebsite: 'https://jjxy.yeu.edu.cn/',
    collegeProfileUrl: 'https://jjxy.yeu.edu.cn/973/list.htm'
  },
  management: {
    collegeName: '管理学院',
    collegeSlug: 'school-of-management',
    collegeWebsite: 'https://glxy.yeu.edu.cn/',
    collegeProfileUrl: 'https://glxy.yeu.edu.cn/281/list.htm'
  },
  accounting: {
    collegeName: '会计学院',
    collegeSlug: 'school-of-accounting',
    collegeWebsite: 'https://kjxy.yeu.edu.cn/',
    collegeProfileUrl: 'https://kjxy.yeu.edu.cn/37/list.htm'
  },
  computer: {
    collegeName: '计算机科学与工程学院',
    collegeSlug: 'school-of-computer-science-and-engineering',
    collegeWebsite: 'https://computer.yeu.edu.cn/',
    collegeProfileUrl: 'https://computer.yeu.edu.cn/600/list.htm'
  },
  humanities: {
    collegeName: '人文学院',
    collegeSlug: 'school-of-humanities',
    collegeWebsite: 'https://rwxy.yeu.edu.cn/',
    collegeProfileUrl: 'https://rwxy.yeu.edu.cn/136/list.htm'
  },
  languages: {
    collegeName: '外国语学院',
    collegeSlug: 'school-of-foreign-languages',
    collegeWebsite: 'https://sofl.yeu.edu.cn/',
    collegeProfileUrl: 'https://sofl.yeu.edu.cn/143/list.htm'
  },
  law: {
    collegeName: '法学院',
    collegeSlug: 'school-of-law',
    collegeWebsite: 'https://fxy.yeu.edu.cn/',
    collegeProfileUrl: 'https://fxy.yeu.edu.cn/296/list.htm'
  },
  arts: {
    collegeName: '艺术与教育学院',
    collegeSlug: 'school-of-arts-and-education',
    collegeWebsite: 'https://art.yeu.edu.cn/',
    collegeProfileUrl: 'https://art.yeu.edu.cn/xyjj/list.htm'
  },
  ai: {
    collegeName: '人工智能与数据科学学院',
    collegeSlug: 'school-of-ai-and-data-science',
    collegeWebsite: 'https://ai.yeu.edu.cn/',
    collegeProfileUrl: 'https://ai.yeu.edu.cn/xyjj/list.htm'
  },
  electrical: {
    collegeName: '电气工程与自动化学院',
    collegeSlug: 'school-of-electrical-engineering-and-automation',
    collegeWebsite: 'https://dqgc.yeu.edu.cn/',
    collegeProfileUrl: 'https://dqgc.yeu.edu.cn/xyjj/list.htm'
  }
} as const

const pendingDorm = {
  dormArea: 'pending' as const,
  dormLabel: '待学校通知',
  dormNote: '截至2026年7月24日，未检索到学校公开的2026级按专业分配新区/旧区宿舍通知。请以录取材料、辅导员或学校迎新通知为准。',
  verifiedAt: '2026-07-24'
}

const screenshotDormNote = '根据用户提供的2026级专业片区整理截图标注，属于行前参考，不是学校公开的最终分配名单；迎新系统个人结果、录取材料和学校当届通知优先。'

const screenshotDormAreas: Record<string, Pick<MajorProfile, 'dormArea' | 'dormLabel' | 'dormNote' | 'verifiedAt'>> = {
  法学: { dormArea: 'new', dormLabel: '新区（用户整理）', dormNote: screenshotDormNote, verifiedAt: '2026-07-31' },
  网络工程: { dormArea: 'new', dormLabel: '新区（用户整理）', dormNote: screenshotDormNote, verifiedAt: '2026-07-31' },
  计算机科学与技术: { dormArea: 'new', dormLabel: '新区（用户更正）', dormNote: '按用户对现有资料的更正，2026级计算机科学与技术先按新区记录；该信息尚未替代学校正式分配名单，最终以迎新系统个人结果和当届通知为准。', verifiedAt: '2026-07-31' },
  人工智能: { dormArea: 'new', dormLabel: '新区（用户整理）', dormNote: screenshotDormNote, verifiedAt: '2026-07-31' },
  物联网工程: { dormArea: 'new', dormLabel: '新区（用户整理）', dormNote: screenshotDormNote, verifiedAt: '2026-07-31' },
  数据科学与大数据技术: { dormArea: 'new', dormLabel: '新区（用户整理）', dormNote: screenshotDormNote, verifiedAt: '2026-07-31' },
  金融学: { dormArea: 'new', dormLabel: '新区（用户整理）', dormNote: screenshotDormNote, verifiedAt: '2026-07-31' },
  国际经济与贸易: { dormArea: 'new', dormLabel: '新区（用户整理）', dormNote: screenshotDormNote, verifiedAt: '2026-07-31' },
  金融科技: { dormArea: 'new', dormLabel: '新区（用户整理）', dormNote: screenshotDormNote, verifiedAt: '2026-07-31' },
  经济学: { dormArea: 'new', dormLabel: '新区（用户整理）', dormNote: screenshotDormNote, verifiedAt: '2026-07-31' },
  英语: { dormArea: 'new', dormLabel: '新区（用户整理）', dormNote: screenshotDormNote, verifiedAt: '2026-07-31' },
  商务英语: { dormArea: 'new', dormLabel: '新区（用户整理）', dormNote: screenshotDormNote, verifiedAt: '2026-07-31' },
  广告学: { dormArea: 'new', dormLabel: '新区（用户整理）', dormNote: screenshotDormNote, verifiedAt: '2026-07-31' },
  新闻学: { dormArea: 'new', dormLabel: '新区（用户整理）', dormNote: screenshotDormNote, verifiedAt: '2026-07-31' },
  网络与新媒体: { dormArea: 'new', dormLabel: '新区（用户整理）', dormNote: screenshotDormNote, verifiedAt: '2026-07-31' },
  电子信息工程: { dormArea: 'old', dormLabel: '旧区（用户整理）', dormNote: screenshotDormNote, verifiedAt: '2026-07-31' },
  电气工程及其自动化: { dormArea: 'old', dormLabel: '旧区（用户整理）', dormNote: screenshotDormNote, verifiedAt: '2026-07-31' },
  汉语言文学: { dormArea: 'old', dormLabel: '旧区（用户整理）', dormNote: screenshotDormNote, verifiedAt: '2026-07-31' },
  工商管理: { dormArea: 'old', dormLabel: '旧区（用户整理）', dormNote: screenshotDormNote, verifiedAt: '2026-07-31' },
  市场营销: { dormArea: 'old', dormLabel: '旧区（用户整理）', dormNote: screenshotDormNote, verifiedAt: '2026-07-31' },
  物流管理: { dormArea: 'old', dormLabel: '旧区（用户整理）', dormNote: screenshotDormNote, verifiedAt: '2026-07-31' },
  人力资源管理: { dormArea: 'old', dormLabel: '旧区（用户整理）', dormNote: screenshotDormNote, verifiedAt: '2026-07-31' },
  工业工程: { dormArea: 'old', dormLabel: '旧区（用户整理）', dormNote: screenshotDormNote, verifiedAt: '2026-07-31' },
  会计学: { dormArea: 'old', dormLabel: '旧区（用户整理）', dormNote: screenshotDormNote, verifiedAt: '2026-07-31' },
  财务管理: { dormArea: 'old', dormLabel: '旧区（用户整理）', dormNote: screenshotDormNote, verifiedAt: '2026-07-31' },
  艺术教育: { dormArea: 'old', dormLabel: '旧区（用户整理）', dormNote: screenshotDormNote, verifiedAt: '2026-07-31' }
}

function major(
  name: string,
  code: string,
  college: (typeof colleges)[keyof typeof colleges]
): MajorProfile {
  return {
    name,
    code,
    ...college,
    admissionTypes: transferMajors.has(name)
      ? ['ordinary-undergraduate', 'transfer-undergraduate']
      : ['ordinary-undergraduate'],
    ...pendingDorm,
    ...(screenshotDormAreas[name] ?? {})
  }
}

export const majorProfiles: MajorProfile[] = [
  major('经济学', '020101', colleges.economics),
  major('金融学', '020301K', colleges.economics),
  major('国际经济与贸易', '020401', colleges.economics),
  major('金融科技', '020310T', colleges.economics),
  major('工商管理', '120201K', colleges.management),
  major('市场营销', '120202', colleges.management),
  major('物流管理', '120601', colleges.management),
  major('人力资源管理', '120206', colleges.management),
  major('工业工程', '120701', colleges.management),
  major('会计学', '120203K', colleges.accounting),
  major('财务管理', '120204', colleges.accounting),
  major('计算机科学与技术', '080901', colleges.computer),
  major('网络工程', '080903', colleges.computer),
  major('物联网工程', '080905', colleges.computer),
  major('人工智能', '080717T', colleges.ai),
  major('数据科学与大数据技术', '080910T', colleges.ai),
  major('电气工程及其自动化', '080601', colleges.electrical),
  major('电子信息工程', '080701', colleges.electrical),
  major('汉语言文学', '050101', colleges.humanities),
  major('新闻学', '050301', colleges.humanities),
  major('广告学', '050303', colleges.humanities),
  major('网络与新媒体', '050306T', colleges.humanities),
  major('英语', '050201', colleges.languages),
  major('商务英语', '050262', colleges.languages),
  major('法学', '030101K', colleges.law),
  major('艺术教育', '040105', colleges.arts)
]

export const majorCollegeCount = new Set(majorProfiles.map(item => item.collegeName)).size

export function findMajorProfile(name: string): MajorProfile | undefined {
  const normalized = name.trim().toLocaleLowerCase('zh-CN')
  return majorProfiles.find(item => item.name.toLocaleLowerCase('zh-CN') === normalized)
}
