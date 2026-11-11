import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

/**
 * 一级导航与页面族的映射闸门（纯静态解析，不启动服务、不需要构建产物）。
 *
 * 断言三件事：
 * 1. 13 个页面族 → 一级项的映射与约定一致；
 * 2. 桌面 6 项 / 窄屏 5 项，窄屏缺「校园」时靠 sectionFallbacks 回落，底栏不会全灭；
 * 3. 页头窄屏两行布局，分段器不再绝对定位居中（360px 重叠 34px 的根因）。
 */

const LAYOUT_PATH = 'app/layouts/default.vue'
const layoutSource = readFileSync(LAYOUT_PATH, 'utf8')

function arrayBody(name: string): string {
  const match = layoutSource.match(new RegExp(`const ${name}[^=]*=\\s*\\[([\\s\\S]*?)\\n\\]`))
  if (!match) throw new Error(`${LAYOUT_PATH} 里找不到 ${name} 数组`)
  return match[1]
}

interface NavItem {
  key: string
  label: string
  to: string
}

function parseNavigation(name: string): NavItem[] {
  return [...arrayBody(name).matchAll(/\{ key: '([^']+)', label: '([^']+)', to: '([^']+)'/g)]
    .map(match => ({ key: match[1]!, label: match[2]!, to: match[3]! }))
}

function parseSections(): Array<{ prefix: string, key: string }> {
  return [...arrayBody('navigationSections').matchAll(/\{ prefix: '([^']+)', key: '([^']+)' \}/g)]
    .map(match => ({ prefix: match[1]!, key: match[2]! }))
}

function parseFallbacks(): Record<string, string> {
  const match = layoutSource.match(/const sectionFallbacks[^=]*=\s*\{([\s\S]*?)\n\}/)
  if (!match) throw new Error(`${LAYOUT_PATH} 里找不到 sectionFallbacks`)
  return Object.fromEntries([...match[1]!.matchAll(/(\w+): '(\w+)'/g)].map(item => [item[1]!, item[2]!]))
}

const desktop = parseNavigation('desktopNavigation')
const mobile = parseNavigation('mobileNavigation')
const sections = parseSections()
const fallbacks = parseFallbacks()

/** 13 个页面族 → 期望的一级项。 */
const EXPECTED_SECTION_KEYS: Record<string, string> = {
  '/checklist': 'procedures',
  '/clubs': 'life',
  '/transport': 'life',
  '/campus': 'campus',
  '/dorms': 'life',
  '/nearby': 'map',
  '/search': 'map',
  '/me': 'me',
  '/panorama': 'map',
  '/student-rules': 'campus',
  '/sources': 'me',
  '/feedback': 'me',
  '/guides': 'life'
}

/** 与 default.vue 的 matchesSectionPath / resolveActiveKey 同构的镜像实现。 */
function matchesSectionPath(path: string, prefix: string): boolean {
  return path === prefix || path.startsWith(`${prefix}/`)
}

function resolveActiveKey(navKeys: string[], pathname: string): string | null {
  const path = pathname.length > 1 ? pathname.replace(/\/+$/, '') : pathname
  const section = sections.find(entry => matchesSectionPath(path, entry.prefix))
  if (!section) return null
  if (navKeys.includes(section.key)) return section.key
  return fallbacks[section.key] ?? null
}

test('13 个页面族 → 一级项的映射与约定一致', () => {
  const actual = Object.fromEntries(
    Object.keys(EXPECTED_SECTION_KEYS).map(family => [family, sections.find(entry => entry.prefix === family)?.key ?? null])
  )
  expect(actual).toEqual(EXPECTED_SECTION_KEYS)
})

test('选中判断实现与断言镜像一致', () => {
  expect(layoutSource).toContain('path === prefix || path.startsWith(`${prefix}/`)')
  expect(layoutSource).toContain('/\\/+$/')
})

test('一级项固定：桌面 6 项、窄屏 5 项，/hot 与 /transport 不在一级项里', () => {
  expect(desktop.map(item => item.to)).toEqual(['/', '/map', '/procedures', '/guides', '/campus', '/me'])
  expect(mobile.map(item => item.to)).toEqual(['/', '/map', '/procedures', '/guides', '/me'])
  const desktopRoutes = desktop.map(item => item.to)
  const mobileRoutes = mobile.map(item => item.to)
  for (const route of ['/hot', '/transport', '/discover']) {
    expect(desktopRoutes, `${route} 不应是一级项`).not.toContain(route)
    expect(mobileRoutes, `${route} 不应是一级项`).not.toContain(route)
  }
})

test('窄屏页面族全部有选中项（校园回落生活）', () => {
  const mobileKeys = mobile.map(item => item.key)
  const unresolved = Object.keys(EXPECTED_SECTION_KEYS)
    .map(family => ({ family, key: resolveActiveKey(mobileKeys, family) }))
    .filter(entry => entry.key === null || !mobileKeys.includes(entry.key))
  expect(unresolved, `窄屏没有选中项：${JSON.stringify(unresolved)}`).toEqual([])
  expect(resolveActiveKey(mobileKeys, '/campus')).toBe('life')
  expect(resolveActiveKey(mobileKeys, '/student-rules')).toBe('life')
})

test('桌面页面族全部有选中项', () => {
  const desktopKeys = desktop.map(item => item.key)
  const unresolved = Object.keys(EXPECTED_SECTION_KEYS)
    .map(family => ({ family, key: resolveActiveKey(desktopKeys, family) }))
    .filter(entry => entry.key === null || !desktopKeys.includes(entry.key))
  expect(unresolved, `桌面没有选中项：${JSON.stringify(unresolved)}`).toEqual([])
  expect(resolveActiveKey(desktopKeys, '/campus')).toBe('campus')
})

test('二级路径、尾斜杠与相近路径都落在正确一级项', () => {
  const desktopKeys = desktop.map(item => item.key)
  expect(resolveActiveKey(desktopKeys, '/')).toBe('home')
  expect(resolveActiveKey(desktopKeys, '/guides/clubs')).toBe('life')
  expect(resolveActiveKey(desktopKeys, '/clubs/music-association')).toBe('life')
  expect(resolveActiveKey(desktopKeys, '/search')).toBe('map')
  expect(resolveActiveKey(desktopKeys, '/map/poi/3')).toBe('map')
  expect(resolveActiveKey(desktopKeys, '/me')).toBe('me')
  expect(resolveActiveKey(desktopKeys, '/feedback')).toBe('me')
  expect(resolveActiveKey(desktopKeys, '/mex')).toBeNull()
  expect(resolveActiveKey(desktopKeys, '/sources-legacy')).toBeNull()
})

test('导航 key 都在 NavigationKey 联合类型内', () => {
  const union = layoutSource.match(/type NavigationKey = ([^\n]+)/)?.[1] ?? ''
  const keys = [...union.matchAll(/'(\w+)'/g)].map(match => match[1]!)
  expect(keys.sort()).toEqual(['campus', 'home', 'life', 'map', 'me', 'procedures'])
  for (const item of [...desktop, ...mobile]) expect(keys).toContain(item.key)
  for (const section of sections) expect(keys).toContain(section.key)
  for (const key of Object.keys(fallbacks)) expect(keys).toContain(key)
})

test('窄屏底栏 5 列，两处选中态都用 aria-current', () => {
  expect(layoutSource.match(/grid-cols-5/g)?.length).toBe(1)
  expect(layoutSource.match(/:aria-current="/g)?.length).toBe(2)
  expect(layoutSource).toContain('v-for="item in desktopNavigation"')
  expect(layoutSource).toContain('v-for="item in mobileNavigation"')
  expect(layoutSource).toContain('aria-label="移动端主导航"')
})

test('360px 页头两行布局，分段器不再绝对定位居中', () => {
  expect(layoutSource).not.toContain('absolute left-1/2')
  expect(layoutSource).not.toContain('-translate-x-1/2')
  expect(layoutSource).toContain('order-3 grid w-full grid-cols-2')
  expect(layoutSource).toContain('md:order-none')
  expect(layoutSource).toContain('md:flex-nowrap')
  expect(layoutSource).toContain('min-h-16 flex-wrap items-center justify-between gap-2 py-2')
})
