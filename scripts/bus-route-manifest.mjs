#!/usr/bin/env node
// 公交线路几何的指纹清单：线路文件被改动而没重新生成 manifest 时，测试会失败。
// 用法：node scripts/bus-route-manifest.mjs write | verify
import { createHash } from 'node:crypto'
import { readFile, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'

const ROOT = resolve(import.meta.dirname, '..')
const SEEDS = resolve(ROOT, 'data/seeds')
const MANIFEST = resolve(SEEDS, 'bus-route-manifest.json')
const FILES = [
  'bus-route-locked.json',
  'bus-route-manual.json',
  'bus-route-gps.json'
]

const sha = text => createHash('sha256').update(text).digest('hex')

function summarize(name, data) {
  if (name === 'bus-route-locked.json') {
    const routes = (data.routes ?? []).map(route => ({
      id: route.id ?? route.routeId ?? '',
      direction: route.direction ?? null,
      points: (route.points ?? route.polyline ?? []).length,
      sha256: sha(JSON.stringify(route.points ?? route.polyline ?? []))
    }))
    return { kind: 'locked', routes }
  }
  if (name === 'bus-route-manual.json') {
    const stretches = (data.stretches ?? []).map(item => ({
      id: item.id,
      points: item.points?.length ?? 0,
      sha256: sha(JSON.stringify(item.points ?? []))
    }))
    return { kind: 'manual', stretches }
  }
  const points = Array.isArray(data) ? data : (data.points ?? data.polyline ?? [])
  return { kind: 'gps', points: points.length, sha256: sha(JSON.stringify(points)) }
}

async function build() {
  const entries = {}
  for (const name of FILES) {
    const raw = await readFile(resolve(SEEDS, name), 'utf8')
    entries[name] = summarize(name, JSON.parse(raw))
  }
  return { format: 1, generatedAt: new Date().toISOString(), files: entries }
}

async function main() {
  const mode = process.argv[2] ?? 'verify'
  const current = await build()
  if (mode === 'write') {
    await writeFile(MANIFEST, JSON.stringify(current, null, 2) + '\n', 'utf8')
    console.log('manifest written')
    return
  }
  const saved = JSON.parse(await readFile(MANIFEST, 'utf8'))
  const problems = []
  for (const name of FILES) {
    const a = JSON.stringify(saved.files?.[name])
    const b = JSON.stringify(current.files[name])
    if (a !== b) problems.push(name)
  }
  if (problems.length) {
    console.error('线路几何与 manifest 不一致：' + problems.join(', ') + '（确认改对了就 node scripts/bus-route-manifest.mjs write）')
    process.exit(1)
  }
  console.log('bus route manifest ok')
}

await main()
