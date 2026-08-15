import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import { privacyHighlights, privacySections } from '../app/utils/privacy-presentation'

const pageSource = readFileSync(resolve('app/pages/privacy.vue'), 'utf8')
const utilSource = readFileSync(resolve('app/utils/privacy-presentation.ts'), 'utf8')
const updatePromptSource = readFileSync(resolve('app/components/PwaUpdatePrompt.vue'), 'utf8')

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

test('public update and offline copy avoid admin-facing language', () => {
  assert.match(updatePromptSource, /正在输入反馈或聊天时，可以先点稍后/)
  assert.match(updatePromptSource, /有新的校园内容/)
  assert.match(updatePromptSource, /window\.setTimeout/)
  // Refreshing is delegated to updateServiceWorker + the shared recovery/navigation
  // helper rather than a bare location.reload, so assert that wiring.
  assert.match(updatePromptSource, /updateServiceWorker(\(true\))?/)
  assert.match(updatePromptSource, /recoverClientPage/)
  assert.match(updatePromptSource, /dismissed\.value = true/)
  assert.match(updatePromptSource, /\$pwa\?\.needRefresh && !dismissed/)
  assert.match(updatePromptSource, /z-\[100\]/)
  assert.match(updatePromptSource, /刷新看看/)
  assert.match(updatePromptSource, /role="status"/)
  assert.match(updatePromptSource, /aria-live="polite"/)
  assert.doesNotMatch(updatePromptSource, /role="alertdialog"/)
  assert.doesNotMatch(updatePromptSource, /\.focus\(\)/)
  assert.doesNotMatch(updatePromptSource, /updateButton/)
  assert.equal((updatePromptSource.match(/class="min-h-11 rounded-md/g) || []).length, 2)
  assert.doesNotMatch(updatePromptSource, /class="min-h-10 rounded-md/)
  assert.doesNotMatch(updatePromptSource, /管理页面/)
  assert.match(utilSource, /不会保存账号资料、聊天内容或完整地图资料/)
  assert.doesNotMatch(utilSource, /管理页面内容/)
})

test('privacy sections stay student-facing', () => {
  assert.equal(privacyHighlights.length, 3)
  assert.equal(privacyHighlights[0]?.value, '不需要登录')
  assert.equal(privacyHighlights[0]?.tone, 'blue')
  assert.equal(privacyHighlights[1]?.tone, 'green')
  assert.equal(privacyHighlights[2]?.tone, 'amber')
  assert.equal(privacySections.length, 6)
  assert.equal(privacySections[0]?.title, '浏览和定位')
  assert.equal(privacySections[1]?.title, '网站安全与访问记录')
  assert.equal(privacySections[2]?.title, '账号和聊天')
  assert.equal(privacySections[3]?.title, '你提交的反馈')
  assert.equal(privacySections[4]?.title, '保存多久')
  assert.equal(privacySections[5]?.title, '外部地图和网站')
  assert.ok(privacySections[0]?.items.some(item => item.includes('不需要学生账号')))
  assert.ok(privacySections[0]?.items.some(item => item.includes('不会保存你的准确位置')))
  assert.ok(privacySections[1]?.items.some(item => item.includes('一串随机编号')))
  assert.ok(privacySections[3]?.items.some(item => item.includes('不能倒推出原地址的编号')))
  assert.ok(privacySections[4]?.items.some(item => item.includes('730 天')))
  assert.ok(privacySections[4]?.items.some(item => item.includes('保障网站运行、处理问题')))
  assert.ok(privacySections[5]?.items.some(item => item.includes('地图服务')))
  assert.ok(privacySections[5]?.items.some(item => item.includes('学校官网、参考链接或导航链接')))
  assert.doesNotMatch(utilSource, /访问路径|操作类型|网络标识|内容加速|运营排查/)
  assert.doesNotMatch(utilSource, /站点维护人员|维护人员/)
  assert.doesNotMatch(utilSource, /维护网站/)
  assert.doesNotMatch(utilSource, /资料出处/)
})

test('privacy summary presents the important choices before the detailed rules', () => {
  assert.match(pageSource, /先记住这三点/)
  assert.match(pageSource, /常用功能怎么保护你的信息/)
  assert.match(pageSource, /不会向你索要学号、校园一卡通密码或校园网密码/)
  assert.match(pageSource, /class="mt-4 grid gap-3 sm:grid-cols-3"/)
  assert.match(pageSource, /highlight\.tone === 'blue'/)
  assert.match(pageSource, /highlight\.tone === 'amber'/)
  assert.doesNotMatch(pageSource, /以下内容适用于当前版本/)
})

test('privacy presentation export surface stays stable', () => {
  assert.match(utilSource, /export interface PrivacySection/)
  assert.match(utilSource, /export interface PrivacyHighlight/)
  assert.equal(privacyHighlights.every(item => item.label && item.value && item.icon && item.tone), true)
  assert.equal(privacySections.every(section => section.title && section.icon && section.items.length >= 3), true)
  assert.equal(privacySections.every(section => section.items.every(item => item.length > 8)), true)
})
