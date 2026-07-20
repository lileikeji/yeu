import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { privacyHighlights, privacySections } from '../app/utils/privacy-presentation'

const pageSource = readFileSync(resolve('app/pages/privacy.vue'), 'utf8')
const utilSource = readFileSync(resolve('app/utils/privacy-presentation.ts'), 'utf8')

test('privacy page is a thin shell over privacy-presentation util', () => {
  assert.match(pageSource, /from ['"]~~\/app\/utils\/privacy-presentation['"]/)
  assert.match(pageSource, /privacySections/)
  assert.match(pageSource, /privacyHighlights/)
  assert.doesNotMatch(pageSource, /const sections = \[/)
  assert.doesNotMatch(pageSource, /const privacySections = \[/)
  assert.match(utilSource, /export const privacySections/)
  assert.match(utilSource, /export const privacyHighlights/)
})

test('privacy actions keep a comfortable mobile touch height', () => {
  assert.equal((pageSource.match(/class="min-h-11"/g) || []).length, 2)
  assert.match(pageSource, /to="\/feedback\?type=privacy_request&from=%2Fprivacy"/)
})

test('privacy sections stay student-facing', () => {
  assert.equal(privacyHighlights.length, 3)
  assert.equal(privacyHighlights[0]?.value, '不需要登录')
  assert.equal(privacySections.length, 6)
  assert.equal(privacySections[0]?.title, '浏览和定位')
  assert.equal(privacySections[1]?.title, '网站安全与访问记录')
  assert.equal(privacySections[2]?.title, '账号和聊天')
  assert.equal(privacySections[3]?.title, '你提交的反馈')
  assert.equal(privacySections[4]?.title, '保存多久')
  assert.equal(privacySections[5]?.title, '外部地图和网站')
  assert.ok(privacySections[0]?.items.some(item => item.includes('不需要学生账号')))
  assert.ok(privacySections[0]?.items.some(item => item.includes('不会保存你的准确位置')))
  assert.ok(privacySections[1]?.items.some(item => item.includes('随机访客标识')))
  assert.ok(privacySections[3]?.items.some(item => item.includes('转换成无法还原的标识')))
  assert.ok(privacySections[4]?.items.some(item => item.includes('730 天')))
  assert.ok(privacySections[5]?.items.some(item => item.includes('地图服务')))
  assert.doesNotMatch(utilSource, /访问路径|操作类型|网络标识|内容加速|运营排查/)
  assert.doesNotMatch(utilSource, /站点维护人员|维护人员/)
})

test('privacy presentation export surface stays stable', () => {
  assert.match(utilSource, /export interface PrivacySection/)
  assert.match(utilSource, /export interface PrivacyHighlight/)
  assert.equal(privacyHighlights.every(item => item.label && item.value && item.icon), true)
  assert.equal(privacySections.every(section => section.title && section.icon && section.items.length >= 3), true)
  assert.equal(privacySections.every(section => section.items.every(item => item.length > 8)), true)
})
