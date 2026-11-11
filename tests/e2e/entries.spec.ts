import { existsSync, readdirSync, readFileSync } from 'node:fs'
import { join } from 'node:path'
import { expect, test } from '@playwright/test'

/**
 * 入口可达性闸门（纯静态扫描，不启动服务、不需要构建产物）。
 *
 * 每条断言只看「前台源码里有没有指到这个页面的链接」：
 * - 只扫 app/pages、app/components、app/layouts、app/utils；
 * - admin 目录与 Admin* 组件命中的链接不算前台入口（后台能进不等于前台能进）；
 * - 页面自己目录内的链接也不算入口（自己链自己等于没入口）。
 */

const FRONT_DIRECTORIES = ['app/pages', 'app/components', 'app/layouts', 'app/utils']
const SOURCE_EXTENSIONS = ['.vue', '.ts']

/** 13 个页面族：进入任意一个，底栏都必须有一个选中项。 */
const PAGE_FAMILIES = [
  '/checklist',
  '/clubs',
  '/transport',
  '/campus',
  '/dorms',
  '/nearby',
  '/search',
  '/me',
  '/panorama',
  '/student-rules',
  '/sources',
  '/feedback',
  '/guides'
]

/** B 批补入口覆盖的零入口页面族。 */
const ORPHAN_PAGES = ['/singer', '/recruit', '/judge', '/competition', '/major-lookup']

/** 已下线的调研页：2026-11-10 删除，路由与体积预算里都不该再出现。 */
const RETIRED_PAGES = ['/research/xiaohongshu-images']

function toPosixPath(path: string): string {
  return path.replaceAll('\\', '/')
}

function collectSourceFiles(directory: string): string[] {
  return readdirSync(directory, { withFileTypes: true }).flatMap((entry) => {
    const path = join(directory, entry.name)
    if (entry.isDirectory()) {
      return entry.name === 'admin' ? [] : collectSourceFiles(path)
    }
    if (!SOURCE_EXTENSIONS.some(extension => entry.name.endsWith(extension))) return []
    if (entry.name.startsWith('Admin')) return []
    return [toPosixPath(path)]
  })
}

const sourceFiles = FRONT_DIRECTORIES.flatMap(collectSourceFiles)
const fileContents = new Map(sourceFiles.map(file => [file, readFileSync(file, 'utf8')]))

function linkPattern(route: string): RegExp {
  const escaped = route.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
  // to="/x"  to: '/x'  href="/x"  navigateTo('/x')  :to="`/x/${y}`"
  return new RegExp(`(?:to|href|navigateTo)\\s*[:=]?\\s*["'\`]${escaped}(?![\\w-])`)
}

function entryFiles(route: string): string[] {
  const pattern = linkPattern(route)
  return sourceFiles.filter(file => pattern.test(fileContents.get(file) ?? ''))
}

function withoutOwnPages(files: string[], family: string): string[] {
  const ownPage = `app/pages${family}`
  return files.filter(file => file !== `${ownPage}.vue` && !file.startsWith(`${ownPage}/`))
}

test('13 个页面族在前台源码里各有入口', () => {
  const missing = PAGE_FAMILIES.filter(family => withoutOwnPages(entryFiles(family), family).length === 0)
  expect(missing, `这些页面族在前台没有任何入口：${missing.join(', ')}`).toEqual([])
})

test('歌手大赛、社团报名、评委、赛事总览、查专业都有前台入口', () => {
  const missing = ORPHAN_PAGES.filter(route => withoutOwnPages(entryFiles(route), route).length === 0)
  expect(missing, `这些页面族仍只能从后台进入：${missing.join(', ')}`).toEqual([])
})

test('赛事聚合页同时是 singer / recruit / judge 的入口', () => {
  const source = fileContents.get('app/pages/competition/index.vue') ?? ''
  expect(source).toContain('\'/singer\'')
  expect(source).toContain('\'/singer/pre-register\'')
  expect(source).toContain('\'/recruit/music-association\'')
  expect(source).toContain('\'/judge/login\'')
  expect(source).toContain('\'/clubs\'')
})

test('赛事聚合页复用既有服务端接口，不新增 API', () => {
  const source = fileContents.get('app/pages/competition/index.vue') ?? ''
  const apiPaths = [...new Set([...source.matchAll(/['"`](\/api\/[^'"`]+)/g)].map(match => match[1]))]
  expect(apiPaths).toEqual(['/api/public/competition/register'])
})

test('/clubs/[slug] 页尾常驻本社团纳新报名表入口', () => {
  const source = fileContents.get('app/pages/clubs/[slug].vue') ?? ''
  expect(source).toContain('const recruitSignupPath = computed(() => `/recruit/${encodeURIComponent(slug)}`)')
  expect(source).toContain(':to="recruitSignupPath"')
  expect(source).toContain('纳新报名表')
})

test('查专业在发现页目录里有一级入口', () => {
  const source = fileContents.get('app/utils/discover-presentation.ts') ?? ''
  expect(source).toContain('to: \'/major-lookup\'')
  expect(source).toContain('to: \'/transport\'')
  expect(source).toContain('to: \'/competition\'')
})

test('已下线的调研页不再出现在页面目录里', () => {
  for (const route of RETIRED_PAGES) {
    expect(existsSync(join('app/pages', route.slice(1) + '.vue'))).toBe(false)
  }
})

test('两个更新提示不会同时出现，横幅让位安全区与底栏', () => {
  const banner = fileContents.get('app/components/AppUpdateBanner.vue') ?? ''
  const prompt = fileContents.get('app/components/PwaUpdatePrompt.vue') ?? ''
  expect(banner).toContain('!$pwa?.needRefresh')
  expect(prompt).toContain('$pwa?.needRefresh')
  expect(banner).toContain('bottom-[calc(var(--mobile-nav-height)+env(safe-area-inset-bottom)+0.75rem)]')
  expect(banner).not.toContain('bottom-20')
})
