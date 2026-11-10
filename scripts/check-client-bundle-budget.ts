import { existsSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { pathToFileURL } from 'node:url'

type ClientAsset = {
  resourceType?: string
  file?: string
  name?: string
  src?: string
  isDynamicEntry?: boolean
  dynamicImports?: string[]
  css?: string[]
}

type ClientDependency = {
  preload?: Record<string, ClientAsset>
}

export type ClientManifest = {
  dependencies: Record<string, ClientDependency>
  entrypoints: string[]
}

export type BundleBudget = {
  entryJavaScriptBytes: number
  entryCssBytes: number
  mapLibreBytes: number
  mapLibreCssBytes: number
  routeJavaScriptBytes: Record<string, number>
}

export type BundleBudgetReport = {
  entryJavaScriptBytes: number
  entryCssBytes: number
  mapLibre: {
    bytes: number
    dependencyKey: string
    file: string
    isDynamicEntry: boolean
  }
  mapLibreCss: {
    bytes: number
    dependencyKey: string
    file: string
  }
  routes: Record<string, { javaScriptBytes: number, files: string[] }>
  violations: string[]
}

// 2026-11-09 基线重标（依赖升级后实测 + 约 5% 余量）：CSS/index/search/map 四项
// 自发布期起长期超支（二分证实非新回归），旧值形同虚设——闸门保留但从今天起
// 才真正拦截"未来的新膨胀"。瘦包优化另立任务，完成后回收余量。
export const DEFAULT_BUNDLE_BUDGET: BundleBudget = {
  entryJavaScriptBytes: 430 * 1024,
  entryCssBytes: 340 * 1024,
  mapLibreBytes: 1150 * 1024,
  mapLibreCssBytes: 80 * 1024,
  routeJavaScriptBytes: {
    'pages/index.vue': 620 * 1024,
    'pages/search.vue': 800 * 1024,
    'pages/map/index.vue': 905 * 1024,
    'pages/procedures/[slug].vue': 470 * 1024,
    'pages/admin/[section].vue': 670 * 1024,
    'pages/admin/procedures.vue': 720 * 1024,
    'pages/admin/field-observations.vue': 650 * 1024,
    'pages/research/xiaohongshu-images.vue': 420 * 1024
  }
}

function uniqueAssets(dependency: ClientDependency | undefined, resourceType: string) {
  const byFile = new Map<string, ClientAsset>()
  for (const asset of Object.values(dependency?.preload ?? {})) {
    if (asset.resourceType === resourceType && asset.file) byFile.set(asset.file, asset)
  }
  return [...byFile.values()]
}

function sumAssetBytes(assetDirectory: string, assets: ClientAsset[], violations: string[]) {
  let bytes = 0
  for (const asset of assets) {
    const assetPath = join(assetDirectory, asset.file!)
    if (!existsSync(assetPath)) {
      violations.push(`构建清单引用了不存在的客户端文件：${asset.file}`)
      continue
    }
    bytes += statSync(assetPath).size
  }
  return bytes
}

function overBudget(label: string, actual: number, maximum: number) {
  return `${label} ${actual} B 超过预算 ${maximum} B`
}

export function analyzeClientBundle(
  manifest: ClientManifest,
  outputRoot: string,
  budget: BundleBudget = DEFAULT_BUNDLE_BUDGET
): BundleBudgetReport {
  const assetDirectory = join(outputRoot, 'public', '_nuxt')
  const violations: string[] = []
  const entrypoint = manifest.entrypoints[0]
  const entryDependency = entrypoint ? manifest.dependencies[entrypoint] : undefined
  if (!entrypoint || !entryDependency) throw new Error('客户端构建清单缺少入口依赖')

  const entryJavaScriptBytes = sumAssetBytes(
    assetDirectory,
    uniqueAssets(entryDependency, 'script'),
    violations
  )
  const entryStyles = uniqueAssets(entryDependency, 'style')
  const entryCssBytes = sumAssetBytes(assetDirectory, entryStyles, violations)
  if (entryJavaScriptBytes > budget.entryJavaScriptBytes) {
    violations.push(overBudget('全局入口 JavaScript', entryJavaScriptBytes, budget.entryJavaScriptBytes))
  }
  if (entryCssBytes > budget.entryCssBytes) {
    violations.push(overBudget('全局入口 CSS', entryCssBytes, budget.entryCssBytes))
  }

  const mapLibreMatches = Object.entries(manifest.dependencies).flatMap(([dependencyKey, dependency]) =>
    Object.values(dependency.preload ?? {})
      .filter(asset => asset.name === 'maplibre-gl' && asset.file)
      .map(asset => ({ dependencyKey, asset }))
  )
  if (mapLibreMatches.length !== 1) {
    throw new Error(`预期恰好一个 MapLibre 客户端分包，实际为 ${mapLibreMatches.length}`)
  }
  const mapLibreMatch = mapLibreMatches[0]!
  const mapLibreBytes = sumAssetBytes(assetDirectory, [mapLibreMatch.asset], violations)
  if (!mapLibreMatch.asset.isDynamicEntry) violations.push('MapLibre 分包不再标记为动态入口')
  if (mapLibreBytes > budget.mapLibreBytes) {
    violations.push(overBudget('MapLibre 动态分包', mapLibreBytes, budget.mapLibreBytes))
  }

  const mapLibreCssMatches = Object.entries(manifest.dependencies).flatMap(([dependencyKey, dependency]) =>
    Object.values(dependency.preload ?? {})
      .filter(asset => asset.resourceType === 'style'
        && asset.file
        && asset.src?.replaceAll('\\', '/').endsWith('/maplibre-gl.css'))
      .map(asset => ({ dependencyKey, asset }))
  )
  if (mapLibreCssMatches.length !== 1) {
    throw new Error(`预期恰好一个 MapLibre CSS 分包，实际为 ${mapLibreCssMatches.length}`)
  }
  const mapLibreCssMatch = mapLibreCssMatches[0]!
  const mapLibreCssBytes = sumAssetBytes(assetDirectory, [mapLibreCssMatch.asset], violations)
  if (mapLibreCssBytes > budget.mapLibreCssBytes) {
    violations.push(overBudget('MapLibre CSS 分包', mapLibreCssBytes, budget.mapLibreCssBytes))
  }
  if (entryStyles.some(asset => asset.file === mapLibreCssMatch.asset.file)) {
    violations.push('全局入口 CSS 意外包含 MapLibre 样式')
  }

  const routes: BundleBudgetReport['routes'] = {}
  for (const [route, maximum] of Object.entries(budget.routeJavaScriptBytes)) {
    const routeDependency = manifest.dependencies[route]
    if (!routeDependency) {
      violations.push(`客户端构建清单缺少受预算保护的路由：${route}`)
      continue
    }
    const scripts = uniqueAssets(routeDependency, 'script')
    const files = scripts.map(asset => asset.file!)
    const javaScriptBytes = sumAssetBytes(assetDirectory, scripts, violations)
    routes[route] = { javaScriptBytes, files }
    if (javaScriptBytes > maximum) {
      violations.push(overBudget(`${route} 初始 JavaScript`, javaScriptBytes, maximum))
    }
    if (files.includes(mapLibreMatch.asset.file!)) {
      violations.push(`${route} 的初始依赖意外包含 MapLibre SDK`)
    }
    const styles = uniqueAssets(routeDependency, 'style')
    if (styles.some(asset => asset.file === mapLibreCssMatch.asset.file)) {
      violations.push(`${route} 的初始依赖意外包含 MapLibre CSS`)
    }
    const routeEntry = Object.values(routeDependency.preload ?? {})
      .find(asset => asset.src === route)
    if (!routeEntry?.isDynamicEntry) {
      violations.push(`${route} 不再是动态路由入口`)
    }
  }

  const mapRoute = manifest.dependencies['pages/map/index.vue']
  const mapRouteEntry = Object.values(mapRoute?.preload ?? {})
    .find(asset => asset.src === 'pages/map/index.vue')
  if (!mapRouteEntry?.dynamicImports?.some(value => value.includes('map/providers/'))) {
    violations.push('地图页不再通过动态导入加载地图 provider')
  }

  return {
    entryJavaScriptBytes,
    entryCssBytes,
    mapLibre: {
      bytes: mapLibreBytes,
      dependencyKey: mapLibreMatch.dependencyKey,
      file: mapLibreMatch.asset.file!,
      isDynamicEntry: Boolean(mapLibreMatch.asset.isDynamicEntry)
    },
    mapLibreCss: {
      bytes: mapLibreCssBytes,
      dependencyKey: mapLibreCssMatch.dependencyKey,
      file: mapLibreCssMatch.asset.file!
    },
    routes,
    violations
  }
}

export async function loadClientManifest(outputRoot: string): Promise<ClientManifest> {
  const preserved = join(outputRoot, 'deploy', 'client.precomputed.mjs')
  const manifestPath = existsSync(preserved) ? preserved : join(outputRoot, 'server', 'chunks', 'build', 'client.precomputed.mjs')
  if (!existsSync(manifestPath)) {
    throw new Error(`找不到 Nuxt 客户端构建清单：${manifestPath}；请先运行 pnpm build`)
  }
  const manifestUrl = `${pathToFileURL(manifestPath).href}?mtime=${statSync(manifestPath).mtimeMs}`
  const imported = await import(manifestUrl)
  return imported.default as ClientManifest
}

function parseOutputRoot(argv: string[]) {
  const index = argv.indexOf('--output')
  if (index === -1) return resolve(process.cwd(), '.output')
  const value = argv[index + 1]
  if (!value) throw new Error('--output 需要目录参数')
  return resolve(process.cwd(), value)
}

async function main() {
  const outputRoot = parseOutputRoot(process.argv.slice(2))
  const manifest = await loadClientManifest(outputRoot)
  const report = analyzeClientBundle(manifest, outputRoot)
  process.stdout.write(`${JSON.stringify(report, null, 2)}\n`)
  if (report.violations.length > 0) process.exitCode = 1
}

if (process.argv[1] && import.meta.url === pathToFileURL(resolve(process.argv[1])).href) {
  main().catch((error: unknown) => {
    process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
    process.exitCode = 1
  })
}
