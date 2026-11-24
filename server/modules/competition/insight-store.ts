import { existsSync, mkdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import { dirname, join, resolve } from 'node:path'
import type { CompetitionInsight } from './insight'

/**
 * AI 分析的落盘存储。
 *
 * 为什么不进数据库：分析结果是一份「按届保存的最新结论」，没有关联查询需求，
 * 而 competition 相关表的迁移编号此刻正被另一条并行分支占用（0084 决赛视频列），
 * 这里新建表会抢迁移序号。分析结论丢了只影响面板展示，因此放在数据库同目录的
 * 独立 JSON 里，随 shared/data 一起备份，写入用临时文件 + rename 保证原子性。
 */

export interface StoredCompetitionInsight {
  /** 赛事 id：换届后每届各存一份，切回旧届能看到当时的结论。 */
  eventId: string
  eventTitle: string
  insight: CompetitionInsight
  model: string
  /** 生成这份结论时喂给模型的数据指纹；与当前数据算出的指纹不一致即为「数据已更新」。 */
  fingerprint: string
  generatedAt: number
  savedAt: number
  savedByAdminId: string | null
}

function storeDir(databasePath: string): string {
  return join(dirname(resolve(databasePath || './data/yeu.sqlite')), 'competition-insight')
}

function safeSegment(value: string): string {
  const cleaned = value.replace(/[^a-zA-Z0-9_-]/g, '')
  return cleaned.length > 0 ? cleaned : 'default'
}

export function insightStoreFile(databasePath: string, eventId: string): string {
  return join(storeDir(databasePath), `${safeSegment(eventId)}.json`)
}

export function readStoredInsight(databasePath: string, eventId: string): StoredCompetitionInsight | null {
  const file = insightStoreFile(databasePath, eventId)
  if (!existsSync(file)) return null
  try {
    const raw = readFileSync(file, 'utf8')
    const parsed = JSON.parse(raw) as StoredCompetitionInsight
    if (!parsed || typeof parsed !== 'object') return null
    if (!parsed.insight || typeof parsed.insight.headline !== 'string') return null
    return parsed
  } catch {
    return null
  }
}

export function writeStoredInsight(databasePath: string, value: StoredCompetitionInsight): void {
  const file = insightStoreFile(databasePath, value.eventId)
  const dir = dirname(file)
  mkdirSync(dir, { recursive: true })
  const temp = `${file}.${process.pid}.tmp`
  writeFileSync(temp, `${JSON.stringify(value, null, 2)}\n`, 'utf8')
  renameSync(temp, file)
}
