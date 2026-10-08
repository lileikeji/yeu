/**
 * 内容展示层（指南 / 流程 / 公告）：Web 与小程序共用。
 * 只做字段翻译与正文分块，不依赖 Nuxt / DOM。
 */

export const GUIDE_CATEGORY_LABELS: Readonly<Record<string, string>> = {
  arrival: '入学',
  campus: '校园',
  life: '生活',
  community: '社团'
}

export const PROCEDURE_CATEGORY_LABELS: Readonly<Record<string, string>> = {
  arrival: '入学',
  study: '学业',
  'life-service': '生活服务'
}

export const PROCEDURE_METHOD_LABELS: Readonly<Record<string, string>> = {
  online: '线上办理',
  offline: '到校办理',
  mixed: '网上确认 + 到校办理'
}

export const PROCEDURE_STATE_LABELS: Readonly<Record<string, string>> = {
  confirmed: '信息明确',
  partial: '部分内容待确认',
  'awaiting-notice': '等学校通知'
}

export const PROCEDURE_AUDIENCE_LABELS: Readonly<Record<string, string>> = {
  undergraduate: '普通本科新生',
  transfer: '专升本新生'
}

export function resolveGuideCategoryLabel(category: string | null | undefined): string {
  return GUIDE_CATEGORY_LABELS[category ?? ''] ?? '指南'
}

export function resolveProcedureCategoryLabel(category: string | null | undefined): string {
  return PROCEDURE_CATEGORY_LABELS[category ?? ''] ?? '办事流程'
}

export function resolveProcedureMethodLabel(method: string | null | undefined): string {
  return PROCEDURE_METHOD_LABELS[method ?? ''] ?? '办理方式待确认'
}

export function resolveProcedureStateLabel(state: string | null | undefined): string {
  return PROCEDURE_STATE_LABELS[state ?? ''] ?? '信息待确认'
}

export function resolveProcedureAudienceLabel(audience: string | null | undefined): string {
  return PROCEDURE_AUDIENCE_LABELS[audience ?? ''] ?? '适用对象待确认'
}

export function studentFacingProcedureText(value: string): string {
  return value
    .replace(/公开来源能确认/g, '学校官网已经公布')
    .replace(/公开来源是/g, '学校官网已经公布')
    .replace(/2026公开来源尚未列明/g, '学校目前还没有列明')
    .replace(/尚未从2026公开来源确认/g, '目前还没有从学校通知中确认')
    .replace(/公开来源尚未/g, '学校目前还没有')
    .replace(/公开来源确认/g, '学校通知确认')
    .replace(/报到日期已确认/g, '报到日期已经确定')
    .replace(/已发布/g, '已经公布')
    .replace(/官方来源/g, '学校说明')
    .replace(/官方信息入口/g, '官网')
    .replace(/官方入口/g, '官网')
    .replace(/工单状态/g, '处理进度')
    .replace(/待通知/g, '还要等学校通知')
    .replace(/统一认证/g, '账号登录')
    .replace(/认证入口/g, '登录入口')
    .replace(/认证不了/g, '登录不了')
    .replace(/按(.+?)入口咨询/g, '通过$1官网咨询')
    .replace(/账号、认证、网络故障/g, '账号登录、网络故障')
    .replace(/系统不公开或猜测个人账号初始密码/g, '这里不会提供或猜测个人账号初始密码')
    .replace(/设备系统/g, '手机或电脑的系统版本')
    .replace(/点位/g, '报到地点')
    .replace(/核验/g, '确认')
}

/** 按中文字数估算阅读时长，最少 1 分钟。 */
export function estimateReadingMinutes(body: string | null | undefined): number {
  const text = (body ?? '').replace(/\s+/g, '')
  if (!text) return 1
  return Math.max(1, Math.round(text.length / 320))
}

export function readingMinutesLabel(body: string | null | undefined): string {
  return `约 ${estimateReadingMinutes(body)} 分钟读完`
}

const CJK_DATE = /^(\d{4})-(\d{2})-(\d{2})/

/** 2026-07-15T… → 2026年7月15日；compact 时同年省略年份。 */
export function formatDateLabel(value: string | null | undefined, options: { compact?: boolean, now?: Date } = {}): string {
  if (!value) return '时间未标注'
  const match = value.match(CJK_DATE)
  if (!match) return '时间未标注'
  const [, year, month, day] = match
  const nowYear = String((options.now ?? new Date()).getFullYear())
  const head = options.compact && year === nowYear ? '' : `${Number(year)}年`
  return `${head}${Number(month)}月${Number(day)}日`
}

export type ContentBlock =
  | { type: 'heading', text: string }
  | { type: 'paragraph', text: string }
  | { type: 'list', ordered: boolean, items: string[] }
  | { type: 'quote', text: string }

/**
 * 把纯文本正文切成可渲染的块：
 * - `【小节】` → heading
 * - `- ` / `* ` / `• ` → 无序列表
 * - `1. ` → 有序列表
 * - `> ` → quote
 * - 其余非空行 → paragraph（连续行合并）
 *
 * Markdown 加粗 `**x**` 会被去掉标记（小程序正文按纯文本渲染）。
 */
export function parseContentBlocks(body: string | null | undefined): ContentBlock[] {
  const lines = (body ?? '')
    .replace(/\r\n?/g, '\n')
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/__(.+?)__/g, '$1')
    // 后台正文常有落单的 ** / __ 标记，直接去掉，避免出现在学生看到的正文里。
    .replace(/\*\*/g, '')
    .replace(/__/g, '')
    .split('\n')
  const blocks: ContentBlock[] = []
  let paragraph: string[] = []
  let list: { ordered: boolean, items: string[] } | null = null

  const flushParagraph = () => {
    if (!paragraph.length) return
    blocks.push({ type: 'paragraph', text: paragraph.join(' ').trim() })
    paragraph = []
  }
  const flushList = () => {
    if (!list || !list.items.length) {
      list = null
      return
    }
    blocks.push({ type: 'list', ordered: list.ordered, items: list.items })
    list = null
  }

  for (const rawLine of lines) {
    const line = rawLine.trim()
    if (!line) {
      flushParagraph()
      flushList()
      continue
    }

    const heading = line.match(/^【(.+?)】$/)
    if (heading) {
      flushParagraph()
      flushList()
      blocks.push({ type: 'heading', text: heading[1]!.trim() })
      continue
    }

    const bullet = line.match(/^[-*•]\s*(.+)$/)
    if (bullet) {
      flushParagraph()
      if (!list || list.ordered) {
        flushList()
        list = { ordered: false, items: [] }
      }
      list.items.push(bullet[1]!.trim())
      continue
    }

    const ordered = line.match(/^(\d+)[.、)]\s*(.+)$/)
    if (ordered) {
      flushParagraph()
      if (!list || !list.ordered) {
        flushList()
        list = { ordered: true, items: [] }
      }
      list.items.push(ordered[2]!.trim())
      continue
    }

    const quote = line.match(/^>\s*(.+)$/)
    if (quote) {
      flushParagraph()
      flushList()
      blocks.push({ type: 'quote', text: quote[1]!.trim() })
      continue
    }

    flushList()
    paragraph.push(line)
  }

  flushParagraph()
  flushList()
  return blocks
}
