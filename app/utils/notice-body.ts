export interface NoticeBodySegment {
  text: string
  bold: boolean
}

const boldPattern = /\*\*([^*]+)\*\*/g

/**
 * 公告正文是纯文本 + 轻量 markdown（`**粗体**`、换行即分段）。
 * 这里只做分段与粗体切分，输出纯数据结构，交给模板用文本插值渲染，避免 v-html。
 */
export function parseNoticeBodyLine(line: string): NoticeBodySegment[] {
  const segments: NoticeBodySegment[] = []
  boldPattern.lastIndex = 0
  let lastIndex = 0
  let match: RegExpExecArray | null = boldPattern.exec(line)

  while (match) {
    if (match.index > lastIndex) {
      segments.push({ text: line.slice(lastIndex, match.index), bold: false })
    }
    segments.push({ text: match[1] ?? '', bold: true })
    lastIndex = match.index + match[0].length
    match = boldPattern.exec(line)
  }

  if (lastIndex < line.length) {
    segments.push({ text: line.slice(lastIndex), bold: false })
  }

  return segments.length ? segments : [{ text: line, bold: false }]
}

export function parseNoticeBodyLines(body?: string | null): NoticeBodySegment[][] {
  if (!body) return []

  return body
    .split(/\r?\n/)
    .map(line => line.trim())
    .filter(line => line.length > 0)
    .map(parseNoticeBodyLine)
}
