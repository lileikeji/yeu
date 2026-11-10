import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

/**
 * 文案规矩的守卫（2026-11-10 立）。
 *
 * 立这套规矩的原因：站里曾经到处是「一级标题 + 一段灰色小字解释」，
 * 也曾经把「AI 搜索」「知识图谱」「检索次数」这类内部说法直接摆到学生面前。
 * 这两件事都会让页面看起来像文档，而不像工具。规则写在
 * docs/verification/final-review-2026-11-10/COPY-RULES.md，这里是它的机器检查。
 */

const APP_DIRS = ['app', 'miniapp/pages', 'miniapp/services', 'miniapp/components']

/** 界面上不该再出现的说法：内部术语、模型与厂商名。
 *  「AI 搜索」与「AI 审核中」是产品自己保留的两个说法（站长 2026-11-11 明确要求保留），
 *  不在此列；其余实现词（向量、召回、重排、知识图谱、检索次数…）仍然禁止上屏。
 */
const BANNED_TERMS = [
  /AI\s*问答/,
  /AI\s*整理/,
  /知识图谱/,
  /检索次数/,
  /可检索/,
  /已入索引/,
  /智能体/,
  /DeepSeek/,
  /ZCode/,
  /\bCodex\b/,
  /\bClaude\b/,
  /\bOpenAI\b/,
  /Firecrawl/,
  /大模型/
]

function walk(dir: string, out: string[] = []): string[] {
  let entries: string[]
  try {
    entries = readdirSync(resolve(dir))
  } catch {
    return out
  }
  for (const entry of entries) {
    if (entry === 'node_modules' || entry === '.nuxt' || entry === '.output') continue
    const full = `${dir}/${entry}`
    const stat = statSync(resolve(full))
    if (stat.isDirectory()) {
      walk(full, out)
      continue
    }
    if (/\.(vue|ts)$/.test(entry)) out.push(full)
  }
  return out
}

function readAll(files: string[]): Array<{ file: string, text: string }> {
  return files.map(file => ({ file, text: readFileSync(resolve(file), 'utf8') }))
}

const files = APP_DIRS.flatMap(dir => walk(dir))

test('用户可见代码里不再出现内部术语与厂商名', () => {
  const offenders: string[] = []
  for (const { file, text } of readAll(files)) {
    for (const pattern of BANNED_TERMS) {
      const hit = text.match(pattern)
      if (hit) offenders.push(`${file}: ${hit[0]}`)
    }
  }
  assert.deepEqual(offenders, [], '这些位置还有内部术语，请按 COPY-RULES.md 的术语表换掉')
})

test('页头不再支持第二行说明，调用方也不再传', () => {
  const header = readFileSync(resolve('app/components/admin/AdminPageHeader.vue'), 'utf8')
  assert.doesNotMatch(header, /description/, 'AdminPageHeader 不该再有 description 插槽或 prop')

  const callers = files.filter(file => file.endsWith('.vue') && file.startsWith('app/'))
  for (const file of callers) {
    const text = readFileSync(resolve(file), 'utf8')
    if (!/<AdminPageHeader/.test(text)) continue
    const block = text.slice(text.indexOf('<AdminPageHeader'))
    const tag = block.slice(0, block.indexOf('>') + 1)
    assert.doesNotMatch(tag, /description/, `${file} 仍在给 AdminPageHeader 传 description`)
  }
})

test('后台字段说明压到一句话，最长的那条是它自己的例外', () => {
  const source = readFileSync(resolve('app/utils/admin-section-config.ts'), 'utf8')
  const values = [...source.matchAll(/description:\s*'([^']*)'/g)].map(match => match[1] ?? '')
  assert.ok(values.length > 0, 'admin-section-config 里应该有字段说明')

  const coordinateRule = values.filter(value => value.includes('坐标用途只能通过现场定位记录'))
  assert.equal(coordinateRule.length, 1, '坐标审核那条说明必须保留原文（admin-ui-config 有断言）')

  const tooLong = values
    .filter(value => !value.includes('坐标用途只能通过现场定位记录'))
    .filter(value => value.length > 22)
  assert.deepEqual(tooLong, [], '字段说明超过 22 字就变成解释了，压短或改成结构化信息')
})

test('来源块只有来源与核验时间，没有额外的空态说明入口', () => {
  const block = readFileSync(resolve('app/components/SourceCitationBlock.vue'), 'utf8')
  assert.doesNotMatch(block, /emptyHint/, 'SourceCitationBlock 不再接受空态说明文案')
})

test('小程序的页面容器不再挂 subtitle', () => {
  const pages = files.filter(file => file.startsWith('miniapp/pages/') && file.endsWith('.vue'))
  const offenders = pages.filter((file) => {
    const text = readFileSync(resolve(file), 'utf8')
    const index = text.indexOf('<AppPage')
    if (index === -1) return false
    const tag = text.slice(index, text.indexOf('>', index) + 1)
    return /subtitle/.test(tag)
  })
  assert.deepEqual(offenders, [])
})

test('前台页面不再提商家合作与付费位置', () => {
  // 站长 2026-11-11：站里不再有商家合作/推广这回事，前台也不要再出现这类话题。
  const PAGES_TERMS = [/\u5546\u5bb6\u5408\u4f5c/, /\u5546\u5bb6\u63a8\u5e7f/, /\u63a8\u5e7f\u4f4d/, /\u4ed8\u8d39\u6392\u540d/, /\u8d5e\u52a9/]
  const offenders: string[] = []
  for (const { file, text } of readAll(files)) {
    if (!file.startsWith('app/pages/') || file.includes('/admin/')) continue
    for (const pattern of PAGES_TERMS) {
      const hit = text.match(pattern)
      if (hit) offenders.push(`${file}: ${hit[0]}`)
    }
  }
  assert.deepEqual(offenders, [], '前台页面还在提商家合作或付费位置')
})
