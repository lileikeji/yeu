import assert from 'node:assert/strict'
import { readdirSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { rewriteImportsForNode, sha256 } from '../treasure-atlas/snapshot'

const root = resolve(import.meta.dirname, '..')
const atlasRoot = join(root, 'treasure-atlas')
const snapshotRoot = join(atlasRoot, 'src', 'map-source')
const read = (path: string) => readFileSync(path)
const readText = (path: string) => readFileSync(path, 'utf8')

/**
 * 这三份守卫挡的是「生成物与源码脱钩」：atlas.html 是 2.5 MB 的构建产物，
 * map-source 里放的是主仓代码的快照，手绘 webp 与 maplibre 的 IIFE 是外来二进制。
 * 只要有一边悄悄变了而另一边没跟上，线上就是旧图、错点或另一版地图库。
 */
test('atlas.html matches the recorded build', () => {
  const lock = JSON.parse(readText(join(atlasRoot, 'atlas.lock.json'))) as {
    atlas: { sha256: string, bytes: number }
  }
  const built = read(join(root, 'server', 'assets', 'treasure', 'atlas.html'))
  assert.equal(built.byteLength, lock.atlas.bytes, 'atlas.html 字节数已变，请跑 node treasure-atlas/build.mts 并提交产物与 lock')
  assert.equal(sha256(built), lock.atlas.sha256, 'atlas.html 与 atlas.lock.json 不一致，请重跑构建')
})

test('map-source snapshot is in sync with the repository files it copies', () => {
  const manifest = JSON.parse(readText(join(snapshotRoot, 'SNAPSHOT.json'))) as {
    source: string
    files: Record<string, string>
  }
  const entries = Object.entries(manifest.files)
  assert.ok(entries.length >= 10, '快照清单过短，疑似被清空')

  for (const [relative, expected] of entries) {
    const upstream = rewriteImportsForNode(readText(join(root, relative)))
    assert.equal(sha256(upstream), expected, `${relative} 在主仓已改动，请跑 node treasure-atlas/sync-snapshot.mts 后重跑构建`)
    assert.equal(readText(join(snapshotRoot, relative)), upstream, `${relative} 的快照内容与主仓不一致`)
  }
})

test('every copied file under map-source is registered in the snapshot manifest', () => {
  const manifest = JSON.parse(readText(join(snapshotRoot, 'SNAPSHOT.json'))) as {
    files: Record<string, string>
  }
  const registered = new Set(Object.keys(manifest.files))
  const missing: string[] = []

  const walk = (directory: string, prefix = ''): void => {
    for (const entry of readdirSync(directory, { withFileTypes: true })) {
      // public/ 是瓦片与图标，不来自主仓。
      if (entry.isDirectory() && entry.name === 'public') continue
      const next = prefix ? `${prefix}/${entry.name}` : entry.name
      if (entry.isDirectory()) {
        walk(join(directory, entry.name), next)
        continue
      }
      try {
        read(join(root, next))
      } catch {
        continue
      }
      if (!registered.has(next)) missing.push(next)
    }
  }
  walk(snapshotRoot)

  assert.deepEqual(missing, [], '这些文件拷自主仓却没有登记进 SNAPSHOT.json，请重跑 sync-snapshot')
})

test('published artwork is byte-identical to the build inputs', () => {
  const source = readdirSync(join(atlasRoot, 'artwork')).filter(name => name.endsWith('.webp')).sort()
  const published = readdirSync(join(root, 'public', 'treasure-artwork')).filter(name => name.endsWith('.webp')).sort()
  assert.ok(source.length > 0, '主绘图目录里没有 webp')
  assert.deepEqual(published, source, 'public/treasure-artwork 与 treasure-atlas/artwork 文件集合不一致')

  for (const name of source) {
    assert.deepEqual(
      sha256(read(join(root, 'public', 'treasure-artwork', name))),
      sha256(read(join(atlasRoot, 'artwork', name))),
      `public/treasure-artwork/${name} 与 treasure-atlas/artwork/${name} 内容不同，请重跑构建`
    )
  }
})

test('vendored maplibre is pinned and keeps only what npm cannot provide', () => {
  const pin = JSON.parse(readText(join(atlasRoot, 'vendor', 'maplibre-gl', 'VENDOR.json'))) as {
    package: string
    version: string
    file: string
    sha256: string
  }
  const declared = JSON.parse(readText(join(root, 'package.json'))) as {
    dependencies?: Record<string, string>
    devDependencies?: Record<string, string>
  }
  const declaredVersion = declared.dependencies?.[pin.package] ?? declared.devDependencies?.[pin.package]

  assert.ok(declaredVersion, `package.json 里没有 ${pin.package}`)
  assert.ok(
    declaredVersion.includes(pin.version),
    `VENDOR.json 钉的是 ${pin.version}，而 package.json 声明 ${declaredVersion}；升级地图库后要按 VENDOR.json 的 rebuild 命令重打 IIFE 并更新 sha256`
  )
  assert.equal(
    sha256(read(join(atlasRoot, 'vendor', 'maplibre-gl', pin.file))),
    pin.sha256,
    `${pin.file} 与 VENDOR.json 记录的 sha256 不一致`
  )
  assert.deepEqual(
    readdirSync(join(atlasRoot, 'vendor', 'maplibre-gl')).sort(),
    ['VENDOR.json', pin.file].sort(),
    'vendor 目录只该留 npm 拿不到的 IIFE 与它的 pin，worker/css/LICENSE 应从 node_modules 读'
  )
  assert.match(readText(join(atlasRoot, 'build.mts')), /maplibre-gl-worker\.mjs/, 'build.mts 应从 node_modules 读 worker')
  assert.doesNotMatch(readText(join(atlasRoot, 'build.mts')), /vendor\/maplibre-gl\/maplibre-gl-worker/, 'build.mts 不该再读 vendor 里的 worker')
})

test('atlas build side effects stay out of version control', () => {
  assert.match(readText(join(atlasRoot, '.gitignore')), /outputs\//, 'treasure-atlas/.gitignore 必须忽略 outputs/')
})
