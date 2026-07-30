import './load-env'
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { basename, resolve } from 'node:path'
import { closeDatabase, getDatabase } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { compileOfficialKnowledgeDocuments } from '../server/modules/knowledge/document-compiler'
import { parseOfficialPdf } from './crawl-official-knowledge'

const DEFAULT_PDF_PATH = './public/media/handbooks/yeu-freshman-handbook-2026.pdf'
const PUBLIC_URL = '/media/handbooks/yeu-freshman-handbook-2026.pdf'
const HANDBOOK_TITLE = '仰恩大学新生手册 2026（阿杰整理）'

const PAGE_TOPICS = new Map<number, {
  category: string
  title: string
  questions: string
  keywords: string[]
  warning: string
  summary: string
}>([
  [2, {
    category: '报到与新生',
    title: '2026 新生手册｜报到时间、地点与专业分组',
    questions: '2026新生什么时候报到 报到地点在哪里 哪些专业去新区和昌教学楼 哪些专业去旧区普照大礼堂',
    keywords: ['2026报到', '和昌教学楼', '普照大礼堂', '新区报到', '旧区报到', '专业分组'],
    warning: '手册中的专业分组和报到地点属于学生整理，且原文已注明可能变动；只能作为行前参考，最终以录取通知书和学校现场通知为准。',
    summary: '手册写的报到日期是2026年9月5日至6日。法学、网络工程、人工智能、物联网工程、数据科学与大数据技术、金融学、国际经济与贸易、金融科技、经济学、英语、商务英语、广告学、新闻学、网络与新媒体等专业暂列在新区和昌教学楼报到；计算机科学与技术、电子信息工程、电气工程及其自动化、汉语言文学、工商管理、市场营销、物流管理、人力资源管理、工业工程、会计学、财务管理、艺术教育等专业暂列在旧区普照大礼堂报到。'
  }],
  [3, {
    category: '报到与新生',
    title: '2026 新生手册｜报到流程与携带材料',
    questions: '报到流程是什么 新生报到带什么 身份证录取通知书证件照档案银行卡怎么准备',
    keywords: ['报到流程', '报到材料', '身份证', '录取通知书', '证件照', '学生档案', '团员档案', '农业银行卡'],
    warning: '缴费扣款、银行卡和现场领取物品会因个人通知与当年安排不同，按录取材料和学校最新通知核对。',
    summary: '手册整理的现场流程是人证核验、采集指纹或图像、缴费或走绿色通道，再领取宿舍钥匙、军训服、学生证等，并完成易班和智慧团建注册。建议准备身份证、录取通知书、1寸和2寸证件照及电子版、团员档案、学生档案；是否需要农业银行卡、现金和其他材料要逐项看录取通知书。'
  }],
  [4, {
    category: '交通出行',
    title: '2026 新生手册｜到校与校区交通',
    questions: '泉州站怎么到学校 K6怎么坐 新区旧区怎么往返 叮叮车K2K6怎么坐',
    keywords: ['泉州站', 'K6', 'K2', '叮叮车', '新区旧区', '校区交通', '到校'],
    warning: '手册原文中的“公交车也是1元一次”与系统当前核验的公交计价资料不一致，不能作为票价依据；票价和班次以实时公交结果及最新公告为准。',
    summary: '手册建议从泉州站乘K6或打车到校；新区、旧区之间可选叮叮车、K2或K6。叮叮车可使用农业银行App校园付款码或卡式学生证扫码，手册记录为每次1元。公交请直接看系统里的实时路线和当前票价。'
  }],
  [5, {
    category: '宿舍与生活',
    title: '2026 新生手册｜入学生活用品清单',
    questions: '新生入学带什么 宿舍生活用品怎么买 床上用品洗护电子药品军训用品要准备什么',
    keywords: ['生活用品', '证件类', '床上用品', '洗护', '电子用品', '药品', '军训用品', '床垫'],
    warning: '用品清单是学生经验；床垫、床帘等尺寸必须等楼栋和床型确认后实测，不能从通用清单推断统一尺寸。',
    summary: '优先带证件、少量常用衣物、手机和充电器、个人洗护及常用药。床垫、床单、被子、枕头和床帘可先列清单，确认床型后再买；脸盆、洗衣液、衣架、收纳筐等到校或网购更省事。台灯可以等实际需要再买，手册建议优先考虑磁吸款。'
  }],
  [6, {
    category: '宿舍与生活',
    title: '2026 新生手册｜快递地址与站点',
    questions: '新区旧区快递地址怎么写 快递去哪里取 圆通申通顺丰韵达极兔京东邮政站点在哪',
    keywords: ['快递地址', '快递站点', '旧区快递', '新区快递', '宝洁洗衣店', '妈妈驿站', '兔喜生活', '车来车往'],
    warning: '快递承运关系和门店位置变化较快，本页只保留为学生经验索引；寄件和取件前以物流通知、现场招牌及地图最新信息为准。',
    summary: '手册写的旧区地址是福建省泉州市洛江区马甲镇仰恩大学第一教学区，新区地址是第三教学区。旧区曾整理到宝洁洗衣店、韵达快递超市、旧区图书馆一楼创业园和学生街车来车往；新区曾整理到二街韵达、二街妈妈驿站、三街极兔、四街兔喜生活和车来车往、五街顺丰。实际取件点以物流短信为准。'
  }],
  [7, {
    category: '报到与新生',
    title: '2026 新生手册｜军训准备与提醒',
    questions: '2026军训什么时候 军训带什么 水壶请假睡眠饮食拉练怎么准备',
    keywords: ['2026军训', '12月13日', '12月26日', '军训水壶', '军训请假', '长途拉练'],
    warning: '军训日期和要求应优先采用学校校历及当届通知；这里的用品和拉练建议属于学生经验。',
    summary: '手册记录的2026级军训暂定时间是12月13日至26日。手册称会发军训水壶，介意味道可先清洗；平时注意睡眠和饮食，身体不适不要硬撑。长途拉练可随身放少量补充体力的食物，具体装备、请假和训练安排等当届通知。'
  }]
])

const IMAGE_ASSETS = [
  { page: 2, url: '/images/freshman-handbook-2026/hechang-lecture-hall.jpg', alt: '新区和昌教学楼' },
  { page: 3, url: '/images/freshman-handbook-2026/puzhao-auditorium.jpg', alt: '旧区普照大礼堂' },
  { page: 4, url: '/images/freshman-handbook-2026/k2-k6-bus-stop.jpg', alt: '校园附近 K2、K6 公交站牌' },
  { page: 4, url: '/images/freshman-handbook-2026/campus-shuttle.jpg', alt: '校园叮叮车' },
  { page: 7, url: '/images/freshman-handbook-2026/military-training-canteens.jpg', alt: '军训水壶' }
]

function stableId(prefix: string, value: string): string {
  return `${prefix}:${createHash('sha256').update(value.normalize('NFKC')).digest('hex').slice(0, 32)}`
}

function splitPdfPages(value: string): Map<number, string> {
  const matches = [...value.matchAll(/(?:^|\n\n)第\s+(\d+)\s+页\n/g)]
  const pages = new Map<number, string>()
  for (let index = 0; index < matches.length; index += 1) {
    const current = matches[index]!
    const next = matches[index + 1]
    const page = Number(current[1])
    const start = (current.index ?? 0) + current[0].length
    const end = next?.index ?? value.length
    pages.set(page, value.slice(start, end).trim())
  }
  return pages
}

async function main(): Promise<void> {
  const pdfPath = resolve(process.argv[2] || DEFAULT_PDF_PATH)
  const databasePath = process.argv[3] || process.env.NUXT_DATABASE_PATH || './data/yeu.sqlite'
  const bytes = new Uint8Array(readFileSync(pdfPath))
  const parsed = await parseOfficialPdf(bytes, PUBLIC_URL, HANDBOOK_TITLE)
  const pages = splitPdfPages(parsed.text)
  const client = getDatabase(databasePath)
  const now = Date.now()
  const sourceId = stableId('source', PUBLIC_URL)
  const documentId = stableId('document', `${PUBLIC_URL}\n${parsed.text}`)
  const contentHash = createHash('sha256').update(parsed.text.normalize('NFKC')).digest('hex')

  try {
    runMigrations(client)
    client.sqlite.transaction(() => {
      client.sqlite.prepare(`
        INSERT INTO sources (
          id, title, url, platform, publisher_name, source_level, is_official,
          published_at, accessed_at, notes, status, created_at, updated_at
        ) VALUES (?, ?, ?, '学生整理资料', '阿杰', 'C', 0, NULL, ?, ?, 'active', ?, ?)
        ON CONFLICT(url) DO UPDATE SET
          title = excluded.title,
          platform = excluded.platform,
          publisher_name = excluded.publisher_name,
          source_level = 'C',
          is_official = 0,
          accessed_at = excluded.accessed_at,
          notes = excluded.notes,
          status = 'active',
          updated_at = excluded.updated_at
      `).run(
        sourceId,
        HANDBOOK_TITLE,
        PUBLIC_URL,
        now,
        '用户提供的2026新生手册，作者署名阿杰；属于学生经验资料，不是学校官方通知。',
        now,
        now
      )
      const actualSource = client.sqlite.prepare('SELECT id FROM sources WHERE url = ?').get(PUBLIC_URL) as { id: string }
      client.sqlite.prepare(`
        UPDATE knowledge_documents SET status = 'archived', updated_at = ?
        WHERE original_url = ? AND status = 'ready' AND id <> ?
      `).run(now, PUBLIC_URL, documentId)
      client.sqlite.prepare(`
        INSERT INTO knowledge_documents (
          id, source_id, kind, title, original_url, storage_path, mime_type,
          content_hash, extracted_text, metadata_json, status, captured_at,
          processed_at, created_by_admin_id, created_at, updated_at
        ) VALUES (?, ?, 'pdf', ?, ?, ?, 'application/pdf', ?, ?, ?, 'ready', ?, ?, NULL, ?, ?)
        ON CONFLICT(id) DO UPDATE SET
          source_id = excluded.source_id,
          title = excluded.title,
          storage_path = excluded.storage_path,
          content_hash = excluded.content_hash,
          extracted_text = excluded.extracted_text,
          metadata_json = excluded.metadata_json,
          status = 'ready',
          processed_at = excluded.processed_at,
          updated_at = excluded.updated_at
      `).run(
        documentId,
        actualSource.id,
        HANDBOOK_TITLE,
        PUBLIC_URL,
        pdfPath,
        contentHash,
        parsed.text,
        JSON.stringify({
          importer: 'freshman-handbook',
          author: '阿杰',
          official: false,
          pageCount: parsed.pageCount,
          extractedCharacters: parsed.text.length,
          images: IMAGE_ASSETS,
          publicCitation: false
        }),
        now,
        now,
        now,
        now
      )

      for (const [page, topic] of PAGE_TOPICS) {
        const pageText = pages.get(page)
        if (!pageText) throw new Error(`PDF page ${page} did not contain selectable text`)
        const id = stableId('handbook2026', `${page}\n${topic.title}`)
        const answer = [
          `${topic.warning}`,
          topic.summary
        ].join('\n')
        client.sqlite.prepare(`
          INSERT INTO assistant_knowledge_entries (
            id, kind, category, title, question, answer, keywords_json,
            public_url, confidence, source_note, is_active, imported_at,
            created_at, updated_at
          ) VALUES (?, 'student_experience', ?, ?, ?, ?, ?, NULL, 62, ?, 1, ?, ?, ?)
          ON CONFLICT(id) DO UPDATE SET
            category = excluded.category,
            title = excluded.title,
            question = excluded.question,
            answer = excluded.answer,
            keywords_json = excluded.keywords_json,
            public_url = excluded.public_url,
            confidence = 62,
            source_note = excluded.source_note,
            is_active = 1,
            imported_at = excluded.imported_at,
            updated_at = excluded.updated_at
        `).run(
          id,
          topic.category,
          topic.title,
          `${topic.questions}\n${pageText}`,
          answer,
          JSON.stringify(topic.keywords),
          `${HANDBOOK_TITLE}第${page}页；学生经验资料，非学校官方通知。`,
          now,
          now,
          now
        )
      }
    })()

    const compileReport = compileOfficialKnowledgeDocuments(client, { documentIds: [documentId] })
    process.stdout.write(`${JSON.stringify({
      databasePath: client.path,
      file: basename(pdfPath),
      documentId,
      pageCount: parsed.pageCount,
      extractedCharacters: parsed.text.length,
      knowledgeEntries: PAGE_TOPICS.size,
      imageAssets: IMAGE_ASSETS.length,
      reviewClaims: compileReport.claimsInserted + compileReport.claimsUpdated
    })}\n`)
  } finally {
    closeDatabase(databasePath)
  }
}

await main()
