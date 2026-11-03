/**
 * 给「正文是图片」的老文档补一次 OCR。
 *
 * 用法（生产机 /opt/yeu-signal 下）：
 *   OCR_BASE_URL=... OCR_API_KEY=... OCR_MODEL=... \
 *   npx tsx scripts/ocr-short-documents.ts --database /www/wwwroot/yeu/shared/data/yeu.sqlite --limit 50
 *
 * 只处理 status=ready、正文短于 --min-text、且带 original_url 的网页类文档。
 * 写回方式：在 extracted_text 末尾追加「图片文字」段，并在 metadata_json 打标记，
 * 便于事后核对哪些文档是靠 OCR 补出来的。
 */
import { getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { candidateImageUrls, imageOcrConfigFromEnv, ocrImageUrls } from '../server/modules/knowledge/image-ocr'

interface ShortDocumentRow {
  id: string
  title: string
  original_url: string | null
  extracted_text: string | null
}

const SQL_LIST = `
  SELECT id, title, original_url, extracted_text
  FROM knowledge_documents
  WHERE status = 'ready'
    AND original_url IS NOT NULL
    AND length(coalesce(extracted_text, '')) < ?
    AND (? = 0 OR (original_url LIKE '%page.htm'
      AND (title GLOB '*通知*' OR title GLOB '*公告*' OR title GLOB '*公示*' OR title GLOB '*名单*' OR title GLOB '*安排*')))
  ORDER BY captured_at DESC
  LIMIT ?
`

function readFlag(argv: string[], name: string): string | undefined {
  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index]
    if (value === `--${name}`) return argv[index + 1]
    if (value.startsWith(`--${name}=`)) return value.slice(name.length + 3)
  }
  return undefined
}

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms))
}

async function fetchHtml(url: string): Promise<string> {
  const controller = new AbortController()
  const timer = setTimeout(() => controller.abort(), 20_000)
  try {
    const response = await fetch(url, {
      headers: { 'User-Agent': 'Mozilla/5.0 (compatible; yeu-signal-ocr/1.0)', 'Accept-Language': 'zh-CN,zh;q=0.9' },
      signal: controller.signal
    })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    return await response.text()
  } finally {
    clearTimeout(timer)
  }
}

async function main(): Promise<void> {
  const argv = process.argv.slice(2)
  const config = imageOcrConfigFromEnv()
  if (!config) {
    console.error('缺少 OCR_BASE_URL / OCR_API_KEY / OCR_MODEL 环境变量')
    process.exit(1)
  }
  const databasePath = readFlag(argv, 'database') ?? process.env.NUXT_DATABASE_PATH ?? './data/yeu.sqlite'
  const minText = Number(readFlag(argv, 'min-text') ?? 200)
  const limit = Number(readFlag(argv, 'limit') ?? 40)
  const maxImages = Number(readFlag(argv, 'max-images') ?? 2)
  // 只扫标题像通知的：正文是图片的基本都是这类，普通页面白跑一遍既慢又费额度。
  const onlyNotice = argv.includes('--only-notice') ? 1 : 0
  const dryRun = argv.includes('--dry-run')

  const client = getDatabase(databasePath)
  runMigrations(client)
  const rows = client.sqlite.prepare(SQL_LIST).all(minText, onlyNotice, limit) as ShortDocumentRow[]
  const summary = { scanned: rows.length, pagesFetched: 0, withImages: 0, ocrUpdated: 0, skipped: 0, failed: 0, errors: [] as string[] }

  // 分两段跑：先并发把页面拉一遍挑出真有正文图的，再串行 OCR。
  // 单段串行时，一次 20 秒的抓取超时就会把整批拖到几小时。
  const scanConcurrency = Math.max(1, Number(readFlag(argv, 'scan-concurrency') ?? 6))
  const candidates: Array<{ row: ShortDocumentRow, images: string[] }> = []
  let cursor = 0
  const scanWorker = async (): Promise<void> => {
    while (true) {
      const index = cursor
      cursor += 1
      if (index >= rows.length) return
      const row = rows[index]
      if (!row.original_url) {
        summary.skipped += 1
        continue
      }
      try {
        const html = await fetchHtml(row.original_url)
        summary.pagesFetched += 1
        const images = candidateImageUrls(html, row.original_url, maxImages)
        if (images.length > 0) {
          summary.withImages += 1
          candidates.push({ row, images })
        }
      } catch (error) {
        summary.failed += 1
        if (summary.errors.length < 20) {
          summary.errors.push(`${row.id} fetch ${error instanceof Error ? error.message : String(error)}`)
        }
      }
    }
  }
  await Promise.all(Array.from({ length: scanConcurrency }, () => scanWorker()))

  for (const { row, images } of candidates) {
    const { text, errors } = await ocrImageUrls(images, config, { maxImages })
    if (errors.length) summary.errors.push(...errors.map(item => `${row.id} ${item}`))
    if (!text) {
      summary.skipped += 1
      continue
    }
    if (!dryRun) {
      const merged = `${(row.extracted_text ?? '').trim()}

【图片文字】
${text}`.trim()
      const metadata = JSON.stringify({ ocrAt: new Date().toISOString(), ocrModel: config.model, ocrImages: images.length })
      client.sqlite.prepare(
        `UPDATE knowledge_documents
         SET extracted_text = ?, metadata_json = json_patch(coalesce(metadata_json, '{}'), ?), updated_at = (unixepoch() * 1000)
         WHERE id = ?`
      ).run(merged, metadata, row.id)
    }
    summary.ocrUpdated += 1
    console.log(`[ocr] ${row.title.slice(0, 40)} -> ${text.length} 字 (${images.length} 图)`)
    await sleep(200)
  }

  console.log(JSON.stringify({ ...summary, errors: summary.errors.slice(0, 20) }, null, 2))
}

main().catch((error) => {
  console.error(error)
  process.exit(1)
})
