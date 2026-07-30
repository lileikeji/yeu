import './load-env'
import { existsSync } from 'node:fs'
import { isAbsolute, resolve } from 'node:path'
import BetterSqlite3 from 'better-sqlite3'

const LABELS = [
  {
    name: '衡山楼',
    summary: '女生舒适型宿舍（旧区）。该片区标注来自用户提供的2026级迎新资料，地图坐标仍需现场核验；最终以迎新系统分配结果为准。'
  },
  {
    name: '辽宁楼',
    summary: '男生舒适型宿舍（新区）候选楼栋。该片区标注来自用户提供的2026级迎新资料，地图坐标仍需现场核验；最终以迎新系统分配结果为准。'
  },
  {
    name: '陕西楼',
    summary: '男生舒适型宿舍（新区）候选楼栋。该片区标注来自用户提供的2026级迎新资料，地图坐标仍需现场核验；最终以迎新系统分配结果为准。'
  }
] as const

function databasePath(): string {
  const databaseFlag = process.argv.indexOf('--database')
  const value = (databaseFlag >= 0 ? process.argv[databaseFlag + 1] : undefined)
    || process.env.NUXT_DATABASE_PATH
    || './data/yeu.sqlite'
  return value === ':memory:' || isAbsolute(value) ? value : resolve(process.cwd(), value)
}

const path = databasePath()
if (path === ':memory:' || !existsSync(path)) throw new Error(`Database does not exist: ${path}`)
const database = new BetterSqlite3(path)
try {
  database.pragma('foreign_keys = ON')
  const update = database.prepare(`
    UPDATE places
    SET summary = @summary,
        body = @summary,
        updated_at = @now
    WHERE name = @name
      AND status IN ('draft', 'published')
  `)
  const now = Date.now()
  database.transaction(() => {
    for (const label of LABELS) update.run({ ...label, now })
  })()
  process.stdout.write(JSON.stringify({ databasePath: path, updated: LABELS.length }) + '\n')
} finally {
  database.close()
}
