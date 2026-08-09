import { load } from 'cheerio'

export const WELCOME_SYSTEM_ORIGIN = 'https://yedx_yx.leyunykt.com'
export const WELCOME_ATTACHMENT_ORIGIN = 'https://ltc-tfs-yx-yedx.oss-cn-shenzhen.aliyuncs.com'

export const WELCOME_PUBLIC_ENDPOINTS = {
  guides: '/api/v1/WelcomeMe/GetAllGuide',
  files: '/api/v1/WelcomeMe/GetAllFile'
} as const

const FORBIDDEN_PERSONAL_FIELD = /^(?:name|student_?no|examinee_?no|id_?(?:number|card|no)|phone|mobile|telephone|address|bank|card_?no|dorm|room|bed|class|major|admission|payment|photo|face|姓名|学号|考生号|身份证|手机号|电话|住址|地址|银行卡|宿舍|房间|床位|班级|专业分配|录取状态|缴费|照片|人脸)$/iu
const ALLOWED_FILE_KEYS = new Set(['title', 'order', 'url', 'downTimes', 'id'])
const ALLOWED_GUIDE_KEYS = new Set(['title', 'order', 'content', 'updateAt', 'createAt', 'id'])

export interface WelcomePublicFile {
  title: string
  order: number
  url: string
}

export interface WelcomePublicGuide {
  title: string
  order: number
  text: string
  updatedAt: string
}

interface ApiEnvelope {
  data?: unknown
  status?: unknown
  isOK?: unknown
}

const IMAGE_ONLY_GUIDE_TEXT = new Map<string, string>([
  ['新生报到注册流程图', [
    '新生现场报到主要经过身份核验、确认报到、指纹录入、拍照、助学贷款审核或缴费、领取物品和校园卡开通等环节。',
    '办理时按现场引导放置银行卡或学生卡，由工作人员读取学生信息并完成对应手续；申请助学贷款的学生先走贷款审核，其他学生直接完成缴费确认。',
    '物品领取完成后，凭学生卡或身份证办理校园卡开通。实际步骤和所需设备以报到现场安排为准。'
  ].join('\n')],
  ['舒适型宿舍申请指南', [
    '2026 年舒适型宿舍继续面向全体新生开放，床位有限，按先到先得原则申请。',
    '舒适型男生宿舍位于新区辽宁楼、陕西楼，5 人间，共 235 个床位；舒适型女生宿舍位于旧区衡山楼，4 人间，共 83 个床位。',
    '舒适型女生宿舍 2780 元/人·年，舒适型男生宿舍 2580 元/人·年。宿舍配有独立阳台、两个卫生间、淋浴间、两个洗漱池、洗衣槽、洗衣机、热水器、储物柜和空调等。',
    '普通型宿舍 1300 元/人·年，楼层使用公共卫生间和洗漱间，并配有热水器、储物柜和空调等。',
    '住宿费含每生每月 5 度电、2 吨水，超出部分由学生自理。',
    '有意申请的新生可从 2026 年 8 月 24 日上午 9:00 起在官方迎新系统申请。申请成功后须在 1 小时内按系统提示缴纳一学年舒适型住宿费，超时未缴费则名额作废并依次递补。缴费成功后由学校统一安排，到校完成注册当天可以入住。',
    '咨询电话：总务处 0595-22082009，财务处 0595-22082010。'
  ].join('\n')]
])

function objectRecord(value: unknown, context: string): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    throw new Error(`${context} must be an object`)
  }
  return value as Record<string, unknown>
}

function stringValue(value: unknown, context: string): string {
  if (typeof value !== 'string') throw new Error(`${context} must be a string`)
  return value.replaceAll(String.fromCharCode(0), '').trim()
}

function numberValue(value: unknown, context: string): number {
  if (typeof value !== 'number' || !Number.isFinite(value)) throw new Error(`${context} must be a number`)
  return value
}

function assertAllowedKeys(record: Record<string, unknown>, allowed: Set<string>, context: string): void {
  for (const key of Object.keys(record)) {
    if (FORBIDDEN_PERSONAL_FIELD.test(key)) throw new Error(`${context} contains a personal field`)
    if (!allowed.has(key)) throw new Error(`${context} contains an unexpected field`)
  }
}

function envelopeRows(value: unknown, context: string): unknown[] {
  const envelope = objectRecord(value, context) as ApiEnvelope
  if (envelope.isOK !== true || String(envelope.status) !== '200') {
    throw new Error(`${context} did not return a successful public response`)
  }
  if (!Array.isArray(envelope.data)) throw new Error(`${context}.data must be an array`)
  return envelope.data
}

export function assertNoPersonalFields(value: unknown, context = 'payload'): void {
  if (Array.isArray(value)) {
    value.forEach((item, index) => assertNoPersonalFields(item, `${context}[${index}]`))
    return
  }
  if (!value || typeof value !== 'object') return
  for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
    if (FORBIDDEN_PERSONAL_FIELD.test(key)) throw new Error(`${context} contains a personal field`)
    assertNoPersonalFields(child, `${context}.${key}`)
  }
}

export function welcomeHtmlToText(value: string): string {
  const $ = load(value)
  $('script, style, noscript, iframe, object, embed').remove()
  $('br').replaceWith('\n')
  $('p, div, section, article, li, tr, h1, h2, h3, h4, h5, h6').each((_, element) => {
    $(element).append('\n')
  })
  return $.root().text()
    .replace(/\u00a0/g, ' ')
    .replace(/[ \t]+/g, ' ')
    .replace(/ *\n */g, '\n')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export function parseWelcomeGuides(value: unknown): WelcomePublicGuide[] {
  return envelopeRows(value, 'welcome guides').map((row, index) => {
    const record = objectRecord(row, `welcome guides[${index}]`)
    assertAllowedKeys(record, ALLOWED_GUIDE_KEYS, `welcome guides[${index}]`)
    const title = stringValue(record.title, `welcome guides[${index}].title`)
    const extracted = welcomeHtmlToText(stringValue(record.content, `welcome guides[${index}].content`))
    const imageText = IMAGE_ONLY_GUIDE_TEXT.get(title) ?? ''
    const text = [extracted, imageText].filter(Boolean).join('\n\n')
    if (!title || text.length < 24) throw new Error(`welcome guides[${index}] has no usable public text`)
    return {
      title,
      order: numberValue(record.order, `welcome guides[${index}].order`),
      text,
      updatedAt: stringValue(record.updateAt, `welcome guides[${index}].updateAt`)
    }
  })
}

export function publicWelcomeAttachmentUrl(value: string): string {
  const url = new URL(value, WELCOME_ATTACHMENT_ORIGIN)
  if (url.hostname !== new URL(WELCOME_ATTACHMENT_ORIGIN).hostname) {
    throw new Error('welcome attachment host is not allowlisted')
  }
  if (!url.pathname.startsWith('/files/') || !/\.docx?$/i.test(url.pathname)) {
    throw new Error('welcome attachment path or type is not allowlisted')
  }
  url.protocol = 'https:'
  url.username = ''
  url.password = ''
  url.search = ''
  url.hash = ''
  return url.href
}

export function parseWelcomeFiles(value: unknown): WelcomePublicFile[] {
  const rows = envelopeRows(value, 'welcome files')
  const seen = new Set<string>()
  const files: WelcomePublicFile[] = []
  for (let index = 0; index < rows.length; index += 1) {
    const record = objectRecord(rows[index], `welcome files[${index}]`)
    assertAllowedKeys(record, ALLOWED_FILE_KEYS, `welcome files[${index}]`)
    const url = publicWelcomeAttachmentUrl(stringValue(record.url, `welcome files[${index}].url`))
    if (seen.has(url)) continue
    seen.add(url)
    files.push({
      title: stringValue(record.title, `welcome files[${index}].title`),
      order: numberValue(record.order, `welcome files[${index}].order`),
      url
    })
  }
  return files
}
