/**
 * YeU 爬网知识库同步：把 .data/yeu-official-data/yeu-knowledge.json 批量写入
 * assistant_knowledge_entries（question 精确匹配则更新，否则新增）。
 * 关键词从 question 自动生成 + 从 answer 提取数字/年份。
 *
 * 用法：pnpm tsx scripts/yeu-knowledge-sync.ts
 */
import { readFileSync } from 'node:fs'
import { randomUUID } from 'node:crypto'
import { eq } from 'drizzle-orm'
import { closeDatabase, getDatabase, type DatabaseClient } from '../server/database/client'
import { runMigrations } from '../server/database/migrate'
import { assistantKnowledgeEntries } from '../server/database/schema'

const NOW = Date.now()

const STOP = new Set([
  '仰恩大学', '仰恩', '的', '了', '吗', '呢', '啊', '吧', '哦',
  '什么', '怎么', '怎样', '多少', '为什么', '哪些', '哪个', '哪',
  '可以', '能不能', '能', '要', '有', '在', '是', '和', '或', '及', '等',
  '给', '从', '到', '一下', '一个', '多久', '什么样', '哪些方面',
])

function autoKeywords(question: string, answer: string): string[] {
  const cleaned = question.replace(/[？?！!。，、；：()（）]/gu, ' ').replace(/仰恩大学/g, ' ')
  const tokens = cleaned.split(/\s+/).filter(t => t.length >= 2 && !STOP.has(t))
  const nums = (answer.match(/\d{3,6}|[0-9]+元|[0-9]+册|[0-9]+天|[0-9]+分/g) ?? [])
    // 过滤裸 4 位年份（防"2025/2026"关键词污染跨主题检索），保留金额/册数/天数/分数
    .filter(n => !(/^20\d{2}$/.test(n) && !/元|册|天|分/.test(n)))
  const merged = [...tokens, ...nums]
  return [...new Set(merged)].slice(0, 14)
}

const CATEGORY_FIX: Record<string, string> = {
  '食堂': '食堂',
  '选课': '学习',
}

const kb = JSON.parse(readFileSync('.data/yeu-official-data/yeu-knowledge.json', 'utf8')) as Array<{
  id: string; category: string; question: string; answer: string
  confidence: number; url: string; kind: string
}>

const dbPath = '.data/yeu-eval-local.sqlite'
const client = getDatabase(dbPath)
runMigrations(client)

let added = 0
let updated = 0
for (const e of kb) {
  if (!e.question || !e.answer) continue
  const existing = client.db.select({ id: assistantKnowledgeEntries.id })
    .from(assistantKnowledgeEntries)
    .where(eq(assistantKnowledgeEntries.question, e.question))
    .get()
  const data = {
    kind: 'official_reference' as const,
    category: CATEGORY_FIX[e.category] ?? e.category,
    title: e.question.replace(/[？?]/g, '').slice(0, 40),
    question: e.question,
    answer: e.answer,
    keywordsJson: JSON.stringify(autoKeywords(e.question, e.answer)),
    confidence: e.confidence,
    sourceNote: `爬网知识库（2026-08-24）：${e.url}`,
    publicUrl: e.url,
    isActive: 1,
    importedAt: NOW,
  }
  if (existing) {
    client.db.update(assistantKnowledgeEntries).set(data).where(eq(assistantKnowledgeEntries.id, existing.id)).run()
    updated++
  } else {
    client.db.insert(assistantKnowledgeEntries).values({ ...data, id: randomUUID() }).run()
    added++
  }
}
closeDatabase(dbPath)
console.log(`知识库同步完成：新增 ${added}，更新 ${updated}，共处理 ${kb.length} 条`)
