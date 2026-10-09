import assert from 'node:assert/strict'
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import test from 'node:test'
import {
  analyzeClientBundle,
  loadClientManifest,
  type BundleBudget,
  type ClientManifest
} from './check-client-bundle-budget'

function fixture() {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-bundle-budget-'))
  const assets = join(directory, 'public', '_nuxt')
  mkdirSync(assets, { recursive: true })
  for (const [name, bytes] of Object.entries({
    'entry.js': 100,
    'entry.css': 40,
    'home.js': 30,
    'search.js': 35,
    'map.js': 45,
    'procedure.js': 25,
    'maplibre.js': 200,
    'maplibre.css': 60
  })) {
    writeFileSync(join(assets, name), Buffer.alloc(bytes))
  }
  const entryKey = 'node_modules/nuxt/entry.js'
  const dependency = (src: string, file: string, dynamicImports?: string[]) => ({
    preload: {
      [src]: { resourceType: 'script', file, src, dynamicImports, isDynamicEntry: true },
      [entryKey]: { resourceType: 'script', file: 'entry.js' },
      'entry.css': { resourceType: 'style', file: 'entry.css' }
    }
  })
  const manifest: ClientManifest = {
    entrypoints: [entryKey],
    dependencies: {
      [entryKey]: {
        preload: {
          [entryKey]: { resourceType: 'script', file: 'entry.js' },
          'entry.css': { resourceType: 'style', file: 'entry.css' }
        }
      },
      'pages/index.vue': dependency('pages/index.vue', 'home.js'),
      'pages/search.vue': dependency('pages/search.vue', 'search.js'),
      'pages/map/index.vue': dependency(
        'pages/map/index.vue',
        'map.js',
        ['../map/providers/maplibre/provider.ts']
      ),
      'pages/procedures/[slug].vue': dependency('pages/procedures/[slug].vue', 'procedure.js'),
      '_maplibre.js': {
        preload: {
          '_maplibre.js': {
            resourceType: 'script',
            file: 'maplibre.js',
            name: 'maplibre-gl',
            isDynamicEntry: true
          }
        }
      },
      'node_modules/maplibre-gl/dist/maplibre-gl.css': {
        preload: {
          'node_modules/maplibre-gl/dist/maplibre-gl.css': {
            resourceType: 'style',
            file: 'maplibre.css',
            src: 'node_modules/maplibre-gl/dist/maplibre-gl.css'
          }
        }
      }
    }
  }
  const budget: BundleBudget = {
    entryJavaScriptBytes: 120,
    entryCssBytes: 50,
    mapLibreBytes: 220,
    mapLibreCssBytes: 70,
    routeJavaScriptBytes: {
      'pages/index.vue': 150,
      'pages/search.vue': 150,
      'pages/map/index.vue': 160,
      'pages/procedures/[slug].vue': 140
    }
  }
  return { directory, manifest, budget }
}

test('budget reads the preserved manifest when Nitro inlines its original module', async () => {
  const directory = mkdtempSync(join(tmpdir(), 'yeu-manifest-'))
  try {
    mkdirSync(join(directory, 'deploy'))
    const manifest: ClientManifest = { entrypoints: ['fresh'], dependencies: {} }
    writeFileSync(join(directory, 'deploy/client.precomputed.mjs'), `export default ${JSON.stringify(manifest)}`)
    assert.deepEqual(await loadClientManifest(directory), manifest)
  } finally {
    rmSync(directory, { recursive: true, force: true })
  }
})

test('bundle budget accepts bounded initial assets and an isolated MapLibre dynamic entry', () => {
  const value = fixture()
  try {
    const report = analyzeClientBundle(value.manifest, value.directory, value.budget)
    assert.deepEqual(report.violations, [])
    assert.equal(report.entryJavaScriptBytes, 100)
    assert.equal(report.routes['pages/map/index.vue']?.javaScriptBytes, 145)
    assert.equal(report.mapLibre.bytes, 200)
    assert.equal(report.mapLibre.isDynamicEntry, true)
    assert.equal(report.mapLibreCss.bytes, 60)
  } finally {
    rmSync(value.directory, { recursive: true, force: true })
  }
})

test('bundle budget rejects global MapLibre styles and non-dynamic route entries', () => {
  const value = fixture()
  try {
    value.manifest.dependencies['node_modules/nuxt/entry.js']!.preload!.maplibreCss = {
      resourceType: 'style',
      file: 'maplibre.css'
    }
    value.manifest.dependencies['pages/map/index.vue']!.preload!['pages/map/index.vue']!.isDynamicEntry = false
    const report = analyzeClientBundle(value.manifest, value.directory, value.budget)
    assert.ok(report.violations.some(value => value.includes('全局入口 CSS')))
    assert.ok(report.violations.some(value => value.includes('不再是动态路由入口')))
  } finally {
    rmSync(value.directory, { recursive: true, force: true })
  }
})

test('bundle budget rejects route regressions and a MapLibre SDK leak into initial assets', () => {
  const value = fixture()
  try {
    value.manifest.dependencies['pages/map/index.vue']!.preload!.maplibre = {
      resourceType: 'script',
      file: 'maplibre.js'
    }
    value.manifest.dependencies['_maplibre.js']!.preload!['_maplibre.js']!.isDynamicEntry = false
    const report = analyzeClientBundle(value.manifest, value.directory, value.budget)
    assert.ok(report.violations.some(value => value.includes('超过预算')))
    assert.ok(report.violations.some(value => value.includes('意外包含 MapLibre SDK')))
    assert.ok(report.violations.some(value => value.includes('不再标记为动态入口')))
  } finally {
    rmSync(value.directory, { recursive: true, force: true })
  }
})
