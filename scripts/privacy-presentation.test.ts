import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { privacySections } from '../app/utils/privacy-presentation'

const pageSource = readFileSync(resolve('app/pages/privacy.vue'), 'utf8')
const utilSource = readFileSync(resolve('app/utils/privacy-presentation.ts'), 'utf8')

test('privacy page is a thin shell over privacy-presentation util', () => {
  assert.match(pageSource, /from ['"]~~\/app\/utils\/privacy-presentation['"]/)
  assert.match(pageSource, /privacySections/)
  assert.doesNotMatch(pageSource, /const sections = \[/)
  assert.doesNotMatch(pageSource, /const privacySections = \[/)
  assert.match(utilSource, /export const privacySections/)
})

test('privacy sections stay student-facing', () => {
  assert.equal(privacySections.length, 6)
  assert.equal(privacySections[0]?.title, '公开访问')
  assert.equal(privacySections[1]?.title, '访客记录')
  assert.equal(privacySections[2]?.title, '账号与群聊')
  assert.equal(privacySections[3]?.title, '反馈纠错')
  assert.equal(privacySections[4]?.title, '保留与删除')
  assert.equal(privacySections[5]?.title, '第三方服务')
  assert.ok(privacySections[0]?.items.some(item => item.includes('不需要学生账号')))
  assert.ok(privacySections[0]?.items.some(item => item.includes('不会保存到本站')))
  assert.ok(privacySections[1]?.items.some(item => item.includes('本站访客编号')))
  assert.ok(privacySections[3]?.items.some(item => item.includes('无法直接还原的网络标识')))
  assert.ok(privacySections[4]?.items.some(item => item.includes('730 天')))
  assert.ok(privacySections[5]?.items.some(item => item.includes('地图服务')))
})

test('privacy presentation export surface stays stable', () => {
  assert.match(utilSource, /export interface PrivacySection/)
  assert.equal(privacySections.every(section => section.title && section.icon && section.items.length >= 3), true)
  assert.equal(privacySections.every(section => section.items.every(item => item.length > 8)), true)
})
