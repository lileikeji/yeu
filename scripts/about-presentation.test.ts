import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  aboutBoundaries,
  aboutGovernanceLinks,
  aboutProjectFacts
} from '../app/utils/about-presentation'

const pageSource = readFileSync(resolve('app/pages/about.vue'), 'utf8')
const utilSource = readFileSync(resolve('app/utils/about-presentation.ts'), 'utf8')

test('about page is a thin shell over about-presentation util', () => {
  assert.match(pageSource, /from ['"]~~\/app\/utils\/about-presentation['"]/)
  assert.match(pageSource, /aboutProjectFacts/)
  assert.match(pageSource, /aboutBoundaries/)
  assert.match(pageSource, /aboutGovernanceLinks/)
  assert.doesNotMatch(pageSource, /const projectFacts = \[/)
  assert.doesNotMatch(pageSource, /const boundaries = \[/)
  assert.doesNotMatch(pageSource, /const governanceLinks = \[/)
  assert.match(utilSource, /export const aboutProjectFacts/)
  assert.match(utilSource, /export const aboutBoundaries/)
  assert.match(utilSource, /export const aboutGovernanceLinks/)
})

test('about catalogs stay student-facing', () => {
  assert.equal(aboutProjectFacts.length, 4)
  assert.equal(aboutProjectFacts[0]?.label, '项目性质')
  assert.equal(aboutProjectFacts[0]?.value, '非官方学生指南')
  assert.ok(aboutProjectFacts.some(item => item.label === '服务对象' && item.value === '本科与专升本新生'))
  assert.equal(aboutBoundaries.length, 4)
  assert.equal(aboutBoundaries[0]?.title, '信息不替代官方通知')
  assert.match(aboutBoundaries[0]?.text ?? '', /录取通知书/)
  assert.ok(aboutBoundaries.some(item => item.title === '地图只公开已确认的信息'))
  assert.ok(aboutBoundaries.some(item => item.title === '首版不提供商业排名'))
  assert.equal(aboutGovernanceLinks.length, 3)
  assert.equal(aboutGovernanceLinks[0]?.to, '/sources')
  assert.equal(aboutGovernanceLinks[1]?.to, '/feedback')
  assert.equal(aboutGovernanceLinks[2]?.to, '/privacy')
  assert.equal(aboutGovernanceLinks[1]?.title, '反馈错误或补充资料')
})

test('about presentation export surface stays stable', () => {
  assert.match(utilSource, /export interface AboutProjectFact/)
  assert.match(utilSource, /export interface AboutBoundary/)
  assert.match(utilSource, /export interface AboutGovernanceLink/)
  assert.equal(aboutProjectFacts.every(item => item.label && item.value), true)
  assert.equal(aboutBoundaries.every(item => item.title && item.icon && item.text), true)
  assert.equal(aboutGovernanceLinks.every(item => item.title && item.description && item.to && item.icon), true)
})
