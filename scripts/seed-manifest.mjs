#!/usr/bin/env node
// 内容种子的指纹清单：data/seeds/*.json 被改动而没重新生成 manifest 时，verify 会失败。
// 用法：node scripts/seed-manifest.mjs write | verify（SEEDS_DIR 环境变量可覆盖目录，供测试用）
//
// 分工：bus-route-*.json 由 bus-route-manifest.mjs 专属守护（含线路级结构化摘要），
// 这里排除避免双份维护；手工备份（*.bak-*）与 manifest 自身不参与校验。
import { createHash } from 'node:crypto'
import { readdir, readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const SEEDS = resolve(process.env.SEEDS_DIR ?? resolve(ROOT, 'data/seeds'))
const MANIFEST_NAME = 'seed-manifest.json'

// key 排序后 stringify：只认内容变化，不认 key 重排或重新格式化。
function stable(value) {
  if (Array.isArray(value)) return `[${value.map(stable).join(',')}]`
  if (value && typeof value === 'object') {
    const keys = Object.keys(value).sort()
    return `{${keys.map(key => `${JSON.stringify(key)}:${stable(value[key])}`).join(',')}}`
  }
  return JSON.stringify(value)
}

const sha = value => createHash('sha256').update(stable(value)).digest('hex')

function included(name) {
  if (!name.endsWith('.json')) return false
  if (name === MANIFEST_NAME || name === 'bus-route-manifest.json') return false
  if (/\.bak-/.test(name)) return false
  if (name.startsWith('bus-route-')) return false
  return true
}

async function build() {
  const entries = {}
  for (const name of (await readdir(SEEDS)).sort()) {
    if (!included(name)) continue
    const raw = await readFile(resolve(SEEDS, name))
    entries[name] = { bytes: raw.length, sha256: sha(JSON.parse(raw.toString('utf8'))) }
  }
  return { format: 1, generatedAt: new Date().toISOString(), files: entries }
}

async function main() {
  const mode = process.argv[2] ?? 'verify'
  const current = await build()
  if (mode === 'write') {
    await writeFile(resolve(SEEDS, MANIFEST_NAME), JSON.stringify(current, null, 2) + '\n', 'utf8')
    console.log('manifest written:', Object.keys(current.files).length, 'files')
    return
  }
  let saved
  try {
    saved = JSON.parse(await readFile(resolve(SEEDS, MANIFEST_NAME), 'utf8'))
  } catch {
    console.error(`种子 manifest 缺失或不可读：${resolve(SEEDS, MANIFEST_NAME)}（先 node scripts/seed-manifest.mjs write 生成）`)
    process.exit(1)
  }
  const problems = []
  const names = new Set([...Object.keys(saved.files ?? {}), ...Object.keys(current.files)])
  for (const name of names) {
    if (JSON.stringify(saved.files?.[name]) !== JSON.stringify(current.files[name])) problems.push(name)
  }
  if (problems.length) {
    console.error('种子与 manifest 不一致：' + problems.join(', ') + '（确认改对了就 node scripts/seed-manifest.mjs write）')
    process.exit(1)
  }
  console.log('seed manifest ok')
}

await main()
