import { createError } from 'h3'
import { strFromU8, strToU8, unzipSync, zipSync } from 'fflate'

/**
 * Minimal OOXML text-table editor for recruitment application templates.
 *
 * The uploaded template keeps its exact layout; the generator only rewrites the
 * text of specific empty table cells. An "anchor" is a cell whose whole text
 * equals a known label (e.g. 姓名); the value goes into the first empty cell
 * to its right within the same row, inserted as a run that copies the anchor
 * cell's run properties (font/size), so the printed result matches the form.
 */

const DOCX_PATH = 'word/document.xml'

export interface DocxTemplateLabel {
  label: string
  fillable: boolean
}

export interface DocxCellFill {
  /** Cell text used to locate the anchor cell. */
  anchor: string
  /** Text written into the first empty cell right of the anchor. */
  text: string
}

export interface DocxFillResult {
  bytes: Uint8Array
  filled: string[]
  skipped: string[]
}

interface CellToken {
  xml: string
  start: number
  end: number
  text: string
}

interface RowToken {
  cells: CellToken[]
}

export function assertDocxBytes(bytes: Uint8Array): void {
  const isZip = bytes.length > 4
    && bytes[0] === 0x50 && bytes[1] === 0x4b
    && (bytes[2] === 0x03 || bytes[2] === 0x05 || bytes[2] === 0x07)
  if (!isZip) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Template must be a .docx file',
      data: { code: 'INVALID_DOCX_TEMPLATE' }
    })
  }
}

function decodeXmlEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-fA-F]+);/g, (_, hex) => String.fromCodePoint(Number.parseInt(hex, 16)))
    .replace(/&#(\d+);/g, (_, dec) => String.fromCodePoint(Number.parseInt(dec, 10)))
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, '\'')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
}

function escapeXmlText(text: string): string {
  return text
    // Drop control characters that Word rejects inside <w:t>.
    // eslint-disable-next-line no-control-regex
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
}

function normalizeLabel(text: string): string {
  return decodeXmlEntities(text).replace(/\s+/g, ' ').trim()
}

export function readTemplateXml(bytes: Uint8Array): string {
  assertDocxBytes(bytes)
  const files = unzipSync(bytes)
  const document = files[DOCX_PATH]
  if (!document) {
    throw createError({
      statusCode: 422,
      statusMessage: 'Template is missing word/document.xml',
      data: { code: 'INVALID_DOCX_TEMPLATE' }
    })
  }
  return strFromU8(document)
}

function tokenizeRows(xml: string): RowToken[] {
  const rows: RowToken[] = []
  const rowPattern = /<w:tr(?:\s[^>]*)?>[\s\S]*?<\/w:tr>/g
  for (const rowMatch of xml.matchAll(rowPattern)) {
    const cells: CellToken[] = []
    const cellPattern = /<w:tc(?:\s[^>]*)?>[\s\S]*?<\/w:tc>/g
    for (const cellMatch of rowMatch[0].matchAll(cellPattern)) {
      const text = [...cellMatch[0].matchAll(/<w:t(?:\s[^>]*)?>([\s\S]*?)<\/w:t>/g)]
        .map(match => match[1])
        .join('')
      cells.push({
        xml: cellMatch[0],
        start: rowMatch.index! + cellMatch.index!,
        end: rowMatch.index! + cellMatch.index! + cellMatch[0].length,
        text: normalizeLabel(text)
      })
    }
    rows.push({ cells })
  }
  return rows
}

/** Cell texts in reading order; `fillable` marks anchors whose immediate right neighbour is empty. */
export function listTemplateLabels(xml: string): DocxTemplateLabel[] {
  const rows = tokenizeRows(xml)
  const seen = new Set<string>()
  const labels: DocxTemplateLabel[] = []
  for (const row of rows) {
    row.cells.forEach((cell, index) => {
      if (!cell.text || seen.has(cell.text)) return
      seen.add(cell.text)
      const next = row.cells[index + 1]
      labels.push({ label: cell.text, fillable: !!next && next.text === '' })
    })
  }
  return labels
}

function runPropertiesFrom(cellXml: string): string {
  const run = cellXml.match(/<w:r(?:\s[^>]*)?>[\s\S]*?<\/w:r>/)?.[0]
  return run?.match(/<w:rPr>[\s\S]*?<\/w:rPr>/)?.[0] ?? ''
}

function fillCellXml(cellXml: string, text: string, runProperties: string): string {
  const runXml = `<w:r>${runProperties}<w:t xml:space="preserve">${escapeXmlText(text)}</w:t></w:r>`

  const paragraph = cellXml.match(/<w:p(?:\s[^>]*)?\/>|<w:p(?:\s[^>]*)?>[\s\S]*?<\/w:p>/)
  if (!paragraph) return cellXml

  const paragraphXml = paragraph[0]
  let updatedParagraph: string

  const textRun = paragraphXml.match(/<w:t(?:\s[^>]*)?\/>|<w:t(?:\s[^>]*)?>[\s\S]*?<\/w:t>/)
  if (textRun) {
    const openTag = textRun[0].match(/^<w:t(?:\s[^>]*)?>/)?.[0] ?? '<w:t>'
    const preserveOpen = openTag.includes('xml:space')
      ? openTag
      : `${openTag.slice(0, -1)} xml:space="preserve">`
    updatedParagraph = paragraphXml.replace(
      textRun[0],
      `${preserveOpen}${escapeXmlText(text)}</w:t>`
    )
  } else {
    if (paragraphXml.endsWith('/>')) {
      // Self-closing empty paragraph: <w:p .../>
      updatedParagraph = `${paragraphXml.slice(0, -2)}>${runXml}</w:p>`
    } else {
      updatedParagraph = paragraphXml.replace(/<\/w:p>$/, `${runXml}</w:p>`)
    }
  }

  return cellXml.replace(paragraph[0], updatedParagraph)
}

/**
 * Fill template cells. Each fill writes `text` into the first empty cell to the
 * right of the cell whose text equals `anchor`. Unknown anchors are reported
 * in `skipped` and never abort the whole document.
 */
export function fillDocxTemplate(bytes: Uint8Array, fills: DocxCellFill[]): DocxFillResult {
  const xml = readTemplateXml(bytes)
  const rows = tokenizeRows(xml)

  const edits: Array<{ start: number, end: number, replacement: string }> = []
  const filled: string[] = []
  const skipped: string[] = []

  for (const fill of fills) {
    let applied = false
    for (const row of rows) {
      const anchorIndex = row.cells.findIndex(cell => cell.text === fill.anchor)
      if (anchorIndex === -1) continue
      // Only the immediate right neighbour: with merged-grid templates a looser
      // search could write into an unrelated field's cell.
      const anchorCell = row.cells[anchorIndex]
      const target = row.cells[anchorIndex + 1]
      if (!anchorCell || !target || target.text !== '') continue

      const runProperties = runPropertiesFrom(anchorCell.xml)
      edits.push({
        start: target.start,
        end: target.end,
        replacement: fillCellXml(target.xml, fill.text, runProperties)
      })
      filled.push(fill.anchor)
      applied = true
      break
    }
    if (!applied) skipped.push(fill.anchor)
  }

  let output = xml
  for (const edit of [...edits].sort((a, b) => b.start - a.start)) {
    output = output.slice(0, edit.start) + edit.replacement + output.slice(edit.end)
  }

  const files = unzipSync(bytes)
  files[DOCX_PATH] = strToU8(output)
  return { bytes: zipSync(files), filled, skipped }
}
