import assert from 'node:assert/strict'
import { readdirSync, readFileSync, statSync } from 'node:fs'
import { join, resolve } from 'node:path'
import test from 'node:test'
import { safeExternalHref } from '../shared/utils/public-http-url'

function walkVueFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry)
    const st = statSync(full)
    if (st.isDirectory()) walkVueFiles(full, out)
    else if (entry.endsWith('.vue')) out.push(full)
  }
  return out
}

test('app safe-external-href shim re-exports shared helper via Nuxt alias', () => {
  const source = readFileSync(resolve('app/utils/safe-external-href.ts'), 'utf8')
  assert.match(source, /export \{ safeExternalHref \}/)
  assert.match(source, /shared\/utils\/public-http-url/)
  assert.match(source, /~~\/shared\/utils\/public-http-url/)
})

test('safeExternalHref accepts public http(s) and rejects dangerous schemes', () => {
  assert.equal(safeExternalHref('https://www.yeu.edu.cn/path'), 'https://www.yeu.edu.cn/path')
  assert.equal(safeExternalHref('  http://example.com  '), 'http://example.com')
  assert.equal(safeExternalHref('javascript:alert(1)'), null)
  assert.equal(safeExternalHref('data:text/html,hi'), null)
  assert.equal(safeExternalHref('//evil.example/path'), null)
  assert.equal(safeExternalHref('https://127.0.0.1/admin'), null)
  assert.equal(safeExternalHref('https://169.254.169.254/latest/meta-data'), null)
  assert.equal(safeExternalHref(null), null)
  assert.equal(safeExternalHref(''), null)
})

test('every app target=_blank carries rel=noopener noreferrer nearby', () => {
  const vueFiles = walkVueFiles(resolve('app'))
  const offenders: string[] = []
  for (const file of vueFiles) {
    const lines = readFileSync(file, 'utf8').split(/\r?\n/)
    for (let i = 0; i < lines.length; i++) {
      if (!lines[i].includes('_blank') || !/target/.test(lines[i])) continue
      let hasRel = false
      for (let j = i; j < Math.min(lines.length, i + 12); j++) {
        if (/rel=["']noopener noreferrer["']/.test(lines[j])) {
          hasRel = true
          break
        }
        if (j > i && (/>/.test(lines[j]) || /\/>/.test(lines[j]))) break
      }
      if (!hasRel) offenders.push(`${file}:${i + 1}`)
    }
  }
  assert.deepEqual(offenders, [])
})

test('map provider lifecycle never surfaces raw Error.message to UI', () => {
  const source = readFileSync(resolve('app/composables/useMapProviderLifecycle.ts'), 'utf8')
  assert.match(source, /mapErrorMessage\.value = DEFAULT_MAP_ERROR/)
  assert.doesNotMatch(source, /mapErrorMessage\.value = error\.message/)
  assert.doesNotMatch(source, /mapErrorMessage\.value = error instanceof Error \? error\.message/)
})

test('map geolocation route failures use generic description copy', () => {
  const composable = readFileSync(resolve('app/composables/useMapGeolocation.ts'), 'utf8')
  const util = readFileSync(resolve('app/utils/map-geolocation.ts'), 'utf8')
  assert.match(util, /description: '[^']{8,}/)
  assert.match(composable, /resolveMapLocateFailureNotice|resolveMapWalkingRouteFailureNotice/)
  assert.doesNotMatch(composable, /\? error\.message/)
  assert.doesNotMatch(composable, /description:[\s\S]{0,40}error\.message/)
  assert.doesNotMatch(util, /description:[\s\S]{0,40}error\.message/)
})

test('offline retry path is gated by safeLocalPath', () => {
  const source = readFileSync(resolve('app/pages/offline.vue'), 'utf8')
  assert.match(source, /safeLocalPath\(route\.query\.from\)/)
  assert.match(source, /window\.location\.assign\(retryPath\.value\)/)
})

test('admin login redirect stays on admin paths only', () => {
  const source = readFileSync(resolve('app/utils/admin-login-presentation.ts'), 'utf8')
  assert.match(source, /resolveAdminLoginRedirectTarget/)
  assert.match(source, /startsWith\('\/admin\/'\)/)
})

test('dynamic public source links filter through safeExternalHref', () => {
  const details = readFileSync(resolve('app/components/public/PublicSourceDetails.vue'), 'utf8')
  assert.match(details, /safeExternalHref\(source\.url\)/)
  const places = readFileSync(resolve('app/pages/places/[slug].vue'), 'utf8')
  assert.match(places, /safeExternalHref\(place\.externalMapUrl\)/)
  const procedures = readFileSync(resolve('app/pages/procedures/[slug].vue'), 'utf8')
  assert.match(procedures, /safeExternalHref\(step\.actionUrl\)/)
})

test('navigation and official seed links filter through safeExternalHref at UI sinks', () => {
  const panel = readFileSync(resolve('app/components/map/PlaceDetailsPanel.vue'), 'utf8')
  assert.match(panel, /safeExternalHref\(props\.place\.navigationUrl\)/)
  assert.match(panel, /rel=["']noopener noreferrer["']/)

  const campus = readFileSync(resolve('app/pages/campus.vue'), 'utf8')
  assert.match(campus, /safeExternalHref\(officialSources\.university\.url\)/)
  assert.match(campus, /safeExternalHref\(officialSources\.organizations\.url\)/)
  assert.match(campus, /safeExternalHref\(notice\.sources\[0\]\?\.url\)/)
  assert.match(campus, /safeExternalHref\(department\.website\)/)

  const mapIndex = readFileSync(resolve('app/pages/map/index.vue'), 'utf8')
  assert.match(mapIndex, /safeExternalHref\(officialSources\.campusMap\.url\)/)

  const nearby = readFileSync(resolve('app/pages/nearby.vue'), 'utf8')
  assert.match(nearby, /safeExternalHref\(candidateCatalog\.providerDocumentation\)/)
  assert.match(nearby, /safeExternalHref\(candidateMapUrl\(candidate\)\)/)

  const plan = readFileSync(resolve('app/components/map/OfficialCampusPlan.vue'), 'utf8')
  assert.match(plan, /safeExternalHref\(officialCampusPlanReference\.pageUrl\)/)
})

test('public-catalog http URL gate uses isSafePublicHttpUrl (not bare scheme check)', () => {
  const source = readFileSync(resolve('app/utils/public-catalog.ts'), 'utf8')
  assert.match(source, /isSafePublicHttpUrl/)
  assert.match(source, /function isHttpUrl/)
  assert.match(source, /return Boolean\(value && isSafePublicHttpUrl\(value\)\)/)
  assert.doesNotMatch(source, /https\?:/)
})
