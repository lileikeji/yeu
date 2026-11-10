import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  aboutBoundaries,
  aboutContributionTracks,
  aboutGovernanceLinks,
  aboutHeroActions,
  aboutMaintainers,
  aboutProjectFacts,
  aboutRepositories
} from '../app/utils/about-presentation'

const pageSource = readFileSync(resolve('app/pages/about.vue'), 'utf8')
const utilSource = readFileSync(resolve('app/utils/about-presentation.ts'), 'utf8')

test('about page is a thin shell over about-presentation util', () => {
  assert.match(pageSource, /from ['"]~~\/app\/utils\/about-presentation['"]/)
  assert.match(pageSource, /aboutProjectFacts/)
  assert.match(pageSource, /aboutBoundaries/)
  assert.match(pageSource, /aboutGovernanceLinks/)
  assert.match(pageSource, /aboutHeroActions/)
  assert.doesNotMatch(pageSource, /const projectFacts = \[/)
  assert.doesNotMatch(pageSource, /const boundaries = \[/)
  assert.doesNotMatch(pageSource, /const governanceLinks = \[/)
  assert.match(utilSource, /export const aboutProjectFacts/)
  assert.match(utilSource, /export const aboutBoundaries/)
  assert.match(utilSource, /export const aboutGovernanceLinks/)
  assert.match(utilSource, /export const aboutHeroActions/)
})

test('about page surfaces source and correction actions before the long explanation', () => {
  assert.deepEqual(aboutHeroActions.map(item => item.label), [
    '查看参考页面',
    '发现错误，告诉我们'
  ])
  assert.deepEqual(aboutHeroActions.map(item => item.to), ['/sources', '/feedback'])
  assert.equal(aboutHeroActions.every(item => item.icon.startsWith('i-lucide-')), true)
  assert.match(pageSource, /aria-label="关于本站常用入口"/)
  assert.match(pageSource, /v-for="action in aboutHeroActions"/)
  assert.match(pageSource, /class="inline-flex min-h-11 items-center[^"]*rounded-full/)
})

test('about catalogs stay student-facing', () => {
  assert.equal(aboutProjectFacts.length, 4)
  assert.equal(aboutProjectFacts[0]?.label, '这是什么')
  assert.equal(aboutProjectFacts[0]?.value, '非官方新生指南')
  assert.ok(aboutProjectFacts.some(item => item.label === '适合谁' && item.value === '本科与专升本新生'))
  assert.equal(aboutProjectFacts.find(item => item.label === '谁在整理')?.value, '学生个人维护')
  assert.equal(aboutBoundaries.length, 4)
  assert.equal(aboutBoundaries[0]?.title, '重要事项看学校通知')
  assert.match(aboutBoundaries[0]?.text ?? '', /录取通知书/)
  assert.match(aboutBoundaries.find(item => item.title === '地图不猜位置')?.text ?? '', /不会为了看起来完整而随便标位置/)
  assert.doesNotMatch(utilSource, /近似点/)
  assert.ok(aboutBoundaries.some(item => item.title === '地图不猜位置'))
  assert.ok(aboutBoundaries.some(item => item.title === '没有付费排名'))
  assert.equal(aboutGovernanceLinks.length, 3)
  assert.equal(aboutGovernanceLinks[0]?.to, '/sources')
  assert.equal(aboutGovernanceLinks[1]?.to, '/feedback')
  assert.equal(aboutGovernanceLinks[2]?.to, '/privacy')
  assert.equal(aboutGovernanceLinks[1]?.title, '告诉我们哪里不对')
  assert.doesNotMatch(pageSource, /服务边界|公开边界|管理员核对|项目性质/)
  assert.doesNotMatch(pageSource, /学生团队维护/)
  assert.match(pageSource, /内容由学生个人整理/)
  assert.match(pageSource, /想确认来源，或发现信息不对/)
  assert.match(pageSource, /附上参考链接，并写明我们最近查看的时间/)
  assert.match(pageSource, /校名、校徽和官网内容归学校及相关单位所有/)
  assert.doesNotMatch(pageSource, /相应权利人/)
  assert.doesNotMatch(pageSource, /出处/)
})

test('about page names the current maintainer and points at both repositories', () => {
  assert.equal(aboutMaintainers.length, 1)
  assert.equal(aboutMaintainers[0]?.name, '李磊')
  assert.equal(aboutMaintainers[0]?.role, '维护者')
  assert.match(aboutMaintainers[0]?.handle ?? '', /GitHub/)
  assert.match(aboutMaintainers[0]?.handle ?? '', /Gitee/)
  assert.ok((aboutMaintainers[0]?.focus.length ?? 0) >= 4)

  assert.deepEqual(aboutRepositories.map(item => item.url), [
    'https://github.com/lileikeji/yeu',
    'https://gitee.com/lilei1529/yeu'
  ])
  assert.equal(aboutRepositories.every(item => item.label.startsWith('去 ') && item.meta), true)

  assert.ok(aboutContributionTracks.length >= 4)
  assert.equal(aboutContributionTracks.every(track => track.title && track.detail), true)

  assert.match(pageSource, /v-for="person in aboutMaintainers"/)
  assert.match(pageSource, /v-for="track in aboutContributionTracks"/)
  assert.match(pageSource, /v-for="repo in aboutRepositories"/)
  assert.match(pageSource, /src="\/images\/contact-wechat.png"/)
  assert.match(pageSource, /想一起做/)
  assert.match(pageSource, /star/)
  assert.match(pageSource, /MIT 许可/)
  // 两个仓库都必须新窗口打开并带 noopener，否则旧版浏览器会丢 window.opener。
  assert.equal((pageSource.match(/rel="noopener noreferrer"/g) ?? []).length >= 2, true)
})

test('about presentation export surface stays stable', () => {
  assert.match(utilSource, /export interface AboutProjectFact/)
  assert.match(utilSource, /export interface AboutBoundary/)
  assert.match(utilSource, /export interface AboutGovernanceLink/)
  assert.match(utilSource, /export interface AboutHeroAction/)
  assert.equal(aboutProjectFacts.every(item => item.label && item.value && item.icon && item.tone), true)
  assert.equal(aboutBoundaries.every(item => item.title && item.icon && item.text && item.tone), true)
  assert.equal(aboutGovernanceLinks.every(item => item.title && item.description && item.to && item.icon && item.tone), true)
  assert.match(pageSource, /grid-cols-2/)
  assert.match(pageSource, /aboutToneClasses/)
  assert.match(pageSource, /<ul class="grid grid-cols-2/)
  assert.doesNotMatch(pageSource, /<dl|<dt|<dd/)
})
