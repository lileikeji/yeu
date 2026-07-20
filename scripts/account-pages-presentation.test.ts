import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const loginPage = readFileSync(resolve('app/pages/login.vue'), 'utf8')
const profilePage = readFileSync(resolve('app/pages/me/index.vue'), 'utf8')
const chatPage = readFileSync(resolve('app/pages/chat/index.vue'), 'utf8')

test('login page stays compact and uses ordinary account language', () => {
  assert.match(loginPage, /新生账号/)
  assert.match(loginPage, /看地图和办事指南不用登录/)
  assert.match(loginPage, /目前只支持已有账号，暂不能自己注册/)
  assert.match(loginPage, /max-w-md/)
  assert.doesNotMatch(loginPage, /ACCOUNT|账号服务|登录后可做什么|管理员入口不在公开导航中展示|账号由管理员统一创建|工作人员提前创建/)
})

test('login guidance only appears after a protected page sends the student here', () => {
  assert.match(loginPage, /function requestedRedirectTarget\(\): string \| null/)
  assert.match(loginPage, /const target = requestedRedirectTarget\(\)\s+if \(!target\) return ''/)
  assert.match(loginPage, /return requestedRedirectTarget\(\) \?\? '\/me'/)
  assert.match(loginPage, /请先登录，登录后会回到群聊/)
  assert.match(loginPage, /请先登录，再进入个人中心/)
  assert.match(loginPage, /请先登录，登录后会回到刚才的页面/)
  assert.doesNotMatch(loginPage, /该功能需要登录|登录成功后将自动返回/)
})

test('login controls keep a comfortable mobile touch height', () => {
  assert.equal((loginPage.match(/class="min-h-11 w-full"/g) || []).length, 2)
  assert.equal((loginPage.match(/base: 'min-h-11'/g) || []).length, 2)
  assert.match(loginPage, /class="min-h-11 min-w-11"\s+@click="togglePasswordVisibility"/)
  assert.match(loginPage, /icon="i-lucide-log-in"\s+class="min-h-11"/)
})

test('profile page explains dorm matching without system wording', () => {
  assert.match(profilePage, /方便进入对应楼群/)
  assert.match(profilePage, /输入楼名，或从下方已有楼栋中选择/)
  assert.match(profilePage, /正在查找宿舍楼/)
  assert.match(profilePage, /正在打开个人中心/)
  assert.match(profilePage, /这次没有保存成功，请稍后再试/)
  assert.match(profilePage, /这次没有退出成功，请再试一次/)
  assert.doesNotMatch(profilePage, /宿舍楼决定楼群入口|加载宿舍建议/)
  assert.doesNotMatch(profilePage, /保存失败|退出失败/)
})

test('profile controls keep a comfortable mobile touch height', () => {
  assert.equal((profilePage.match(/class="min-h-11 w-full"/g) || []).length, 3)
  assert.equal((profilePage.match(/:ui="\{ base: 'min-h-11' \}"/g) || []).length, 3)
  assert.match(profilePage, /class="min-h-11 rounded-full border border-zinc-200/)
  assert.ok((profilePage.match(/class="min-h-11"/g) || []).length >= 3)
})

test('chat page uses group language and truthful composer copy', () => {
  assert.match(chatPage, /所有已登录同学都可以参与/)
  assert.match(chatPage, /这里还没有消息/)
  assert.match(chatPage, /当前群聊已开启全员禁言/)
  assert.match(chatPage, /消息暂时没显示出来，请重新打开群聊/)
  assert.match(chatPage, /这条消息没发出去，请再试一次/)
  assert.match(chatPage, /现在还进不了群聊，请稍后再试/)
  assert.match(chatPage, /aria-pressed/)
  assert.doesNotMatch(chatPage, />\s*房间\s*</)
  assert.doesNotMatch(chatPage, /当前房间/)
  assert.doesNotMatch(chatPage, /消息格式：|回车发送/)
  assert.doesNotMatch(chatPage, /加载消息失败|发送失败|群聊暂时不可用/)
})

test('chat controls keep a comfortable mobile touch height', () => {
  assert.match(chatPage, /class="min-h-11 min-w-\[9rem\] rounded-xl/)
  assert.match(chatPage, /class="min-h-11 w-full"\s+:ui="\{ base: 'min-h-11' \}"/)
  assert.ok((chatPage.match(/class="min-h-11"/g) || []).length >= 2)
})
