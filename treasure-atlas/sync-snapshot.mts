// 把 `src/map-source/` 里「借自主仓」的文件按主仓当前版本重新拷贝，并刷新 SNAPSHOT.json。
//
// 背景：atlas 是独立打包的手绘图页面，跑不了 Nuxt 的路径别名，所以 `src/map-source/` 里
// 放了一份主仓代码的快照。快照会随主仓改动慢慢过期（2026-11-18 合并时 `shared/types.ts`
// 已落后 115 行、`bus-route-progress.ts` 落后 61 行），所以每个借来的文件都登记 sha256，
// `scripts/treasure-atlas.test.ts` 会比对两侧，主仓改了而没同步就红，并提示跑本脚本。
//
// 用法：node treasure-atlas/sync-snapshot.mts
import { existsSync, readdirSync, readFileSync, writeFileSync } from 'node:fs'
import { join, relative, sep } from 'node:path'
import { rewriteImportsForNode, sha256 } from './snapshot.ts'

const root = import.meta.dirname
const project = join(root, 'src', 'map-source')
const repoRoot = join(root, '..')
const manifestPath = join(project, 'SNAPSHOT.json')

function walk(directory: string): string[] {
  const files: string[] = []
  for (const entry of readdirSync(directory, { withFileTypes: true })) {
    // public/ 是瓦片与图标，主仓没有对应物，不参与快照比对。
    if (entry.isDirectory() && entry.name === 'public') continue
    const path = join(directory, entry.name)
    if (entry.isDirectory()) files.push(...walk(path))
    else files.push(path)
  }
  return files
}

const borrowed: Record<string, string> = {}
let copied = 0
for (const file of walk(project)) {
  const rel = relative(project, file).split(sep).join('/')
  const source = join(repoRoot, rel)
  if (!existsSync(source)) continue
  const expected = rewriteImportsForNode(readFileSync(source, 'utf8'))
  if (readFileSync(file, 'utf8') !== expected) {
    writeFileSync(file, expected)
    copied += 1
    console.log('同步', rel)
  }
  borrowed[rel] = sha256(expected)
}

const sorted = Object.fromEntries(Object.entries(borrowed).toSorted(([a], [b]) => a.localeCompare(b)))
writeFileSync(manifestPath, `${JSON.stringify({ source: 'repository root', files: sorted }, null, 2)}\n`)
console.log(`快照文件 ${Object.keys(sorted).length} 个，本次更新 ${copied} 个`)
