import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  buildDiscoverAccountEntries,
  buildDiscoverTaskPreview,
  discoverDirectoryEntries,
  discoverTaskPreviewLimit,
  discoverTaskEntries,
  discoverTrustEntries
} from '../app/utils/discover-presentation'

const pageSource = readFileSync(resolve('app/pages/discover.vue'), 'utf8')
const utilSource = readFileSync(resolve('app/utils/discover-presentation.ts'), 'utf8')

test('discover page is a thin shell over discover-presentation util', () => {
  assert.match(pageSource, /from ['"]~~\/app\/utils\/discover-presentation['"]/)
  assert.match(pageSource, /buildDiscoverAccountEntries/)
  assert.match(pageSource, /discoverTaskEntries/)
  assert.match(pageSource, /buildDiscoverTaskPreview/)
  assert.match(pageSource, /discoverDirectoryEntries/)
  assert.match(pageSource, /discoverTrustEntries/)
  assert.doesNotMatch(pageSource, /const taskEntries = \[/)
  assert.doesNotMatch(pageSource, /const directoryEntries = \[/)
  assert.doesNotMatch(pageSource, /const trustEntries = \[/)
  assert.match(utilSource, /export const discoverTaskEntries/)
  assert.match(utilSource, /export function buildDiscoverAccountEntries/)
  assert.match(utilSource, /export function buildDiscoverTaskPreview/)
  assert.match(utilSource, /export const discoverDirectoryEntries/)
  assert.match(utilSource, /export const discoverTrustEntries/)
})

test('discover catalogs stay student-facing', () => {
  assert.equal(discoverTaskEntries.length, 14)
  assert.equal(discoverTaskEntries[0]?.title, '新生清单')
  assert.equal(discoverTaskEntries[0]?.to, '/checklist')
  assert.equal(discoverTaskEntries[2]?.title, '学费与资助')
  assert.equal(discoverTaskEntries[2]?.to, '/guides/fees-aid')
  assert.equal(
    discoverTaskEntries.find(item => item.title === '军训安排（暂定）')?.to,
    '/campus#military-training'
  )
  assert.equal(discoverTaskEntries[5]?.title, '食堂在哪里')
  assert.equal(discoverTaskEntries[5]?.to, '/guides/find-campus#dining')
  assert.match(discoverTaskEntries[5]?.description ?? '', /东苑、北苑和西苑餐厅/)
  assert.match(discoverTaskEntries[5]?.description ?? '', /先看.*说明，再去地图找位置/)
  assert.ok(discoverTaskEntries.some(item => (
    item.title === '军训安排（暂定）'
    && item.when === '12 月 13—26 日'
    && item.to === '/campus#military-training'
    && /地点、服装和请假要求/.test(item.description)
  )))
  assert.ok(discoverTaskEntries.some(item => item.title === '周边商铺' && item.to === '/nearby'))
  assert.ok(discoverTaskEntries.some(item => item.title === '全景云游校园' && item.to === '/panorama'))
  assert.ok(discoverTaskEntries.some(item => item.title === '宿舍实拍' && item.to === '/dorms'))
  assert.ok(discoverTaskEntries.some(item => item.to === '/map?category=express'))
  assert.ok(discoverTaskEntries.some(item => item.description === '查看校园网、校外访问和图书馆登录说明'))
  assert.equal(discoverDirectoryEntries.length, 4)
  assert.deepEqual(
    discoverDirectoryEntries.map(item => item.title),
    ['全部指南', '校园概览', '校内部门', '学生社团']
  )
  assert.equal(discoverDirectoryEntries.some(item => item.to === '/checklist' || item.to === '/map' || item.to === '/search'), false)
  assert.match(pageSource, /to="\/search"/)
  assert.match(pageSource, /to="\/map"/)
  assert.ok(discoverTaskEntries.some(item => item.to === '/checklist'))
  assert.match(pageSource, /继续浏览/)
  assert.match(pageSource, /按内容找/)
  assert.equal(discoverTrustEntries.length, 6)
  assert.ok(discoverTrustEntries.some(item => item.title === '参考页面' && item.to === '/sources'))
  assert.ok(discoverTrustEntries.some(item => item.title === '告诉我们哪里不对' && item.to === '/feedback'))
  assert.ok(discoverTrustEntries.some(item => item.title === '联系我们 / 加新生群' && item.to === '/contact'))
  assert.ok(discoverTrustEntries.some(item => item.title === '关于这份指南' && item.to === '/about'))
  assert.ok(discoverTaskEntries.some(item => item.to === '/procedures/arrival' && /2026 级/.test(item.description)))
  assert.ok(discoverTaskEntries.some(item => item.to === '/checklist' && item.title === '新生清单'))
  assert.equal(discoverTaskEntries.some(item => item.to === '/chat'), false)
  assert.equal(discoverDirectoryEntries.some(item => item.to === '/chat' || item.to === '/login'), false)
  assert.doesNotMatch(utilSource, /发布标准|确认情况|资料分级|服务边界|已发布引用|信息出处/)
})

test('discover account entries adapt to the current login state', () => {
  const guest = buildDiscoverAccountEntries(false)
  assert.deepEqual(guest.map(item => item.title), ['登录已有账号', '新生群聊'])
  assert.deepEqual(guest.map(item => item.to), ['/login', '/chat'])
  assert.match(guest[0]?.description ?? '', /暂不开放自行注册/)
  assert.match(guest[0]?.description ?? '', /不登录也能使用/)
  assert.match(guest[1]?.description ?? '', /登录后才能发消息/)

  const signedIn = buildDiscoverAccountEntries(true)
  assert.deepEqual(signedIn.map(item => item.title), ['个人中心', '进入新生群聊'])
  assert.deepEqual(signedIn.map(item => item.to), ['/me', '/chat'])
  assert.doesNotMatch(signedIn.map(item => item.description).join(' '), /登录/)
  assert.match(pageSource, /await refreshSession\(\)/)
  assert.match(pageSource, /isAuthenticated \? '个人资料与新生群聊' : '群聊和个人资料需要登录'/)
  assert.match(pageSource, /不登录也能继续使用地图、清单和指南/)
  assert.ok(pageSource.indexOf('常用入口') < pageSource.indexOf('账号与交流'))
  assert.match(pageSource, /class="group flex min-h-16 items-center gap-2\.5 rounded-md border border-green-200[^"]*sm:min-h-20/)
  assert.doesNotMatch(pageSource, /min-h-24 items-center gap-3 rounded-lg/)
})

test('discover task preview keeps the mobile page manageable', () => {
  assert.equal(discoverTaskPreviewLimit, 6)
  const collapsed = buildDiscoverTaskPreview(discoverTaskEntries, false)
  assert.equal(collapsed.items.length, 6)
  assert.equal(collapsed.hiddenCount, 8)
  const expanded = buildDiscoverTaskPreview(discoverTaskEntries, true)
  assert.equal(expanded.items.length, 14)
  assert.equal(expanded.hiddenCount, 0)
  assert.match(pageSource, /grid grid-cols-2 gap-2\.5 sm:gap-3/)
  assert.match(pageSource, /min-h-20 items-center gap-2\.5[\s\S]*sm:min-h-24 sm:gap-3/)
  assert.match(pageSource, /entry\.when/)
  assert.match(pageSource, /hidden text-xs leading-5 text-zinc-600 sm:block/)
  assert.doesNotMatch(pageSource, />\s*查看\s*<UIcon/)
})

test('discover presentation export surface stays stable', () => {
  assert.match(utilSource, /export interface DiscoverLinkEntry/)
  assert.match(utilSource, /export interface DiscoverTaskEntry/)
  assert.equal(discoverTaskEntries.every(item => item.title && item.description && item.to && item.icon && item.tone && item.when), true)
  assert.equal(discoverDirectoryEntries.every(item => item.title && item.description && item.to && item.icon), true)
  assert.equal(discoverTrustEntries.every(item => item.title && item.description && item.to && item.icon), true)
  const routes = [
    ...discoverTaskEntries.map(item => item.to),
    ...discoverDirectoryEntries.map(item => item.to),
    ...discoverTrustEntries.map(item => item.to)
  ]
  assert.equal(routes.every(to => to.startsWith('/')), true)
})
