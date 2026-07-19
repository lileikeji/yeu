import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const loginPage = readFileSync(resolve('app/pages/login.vue'), 'utf8')
const profilePage = readFileSync(resolve('app/pages/me/index.vue'), 'utf8')
const chatPage = readFileSync(resolve('app/pages/chat/index.vue'), 'utf8')

test('login page stays compact and uses ordinary account language', () => {
  assert.match(loginPage, /账号服务/)
  assert.match(loginPage, /账号由管理员统一创建，暂不支持自行注册/)
  assert.match(loginPage, /max-w-md/)
  assert.doesNotMatch(loginPage, /ACCOUNT|登录后可做什么|管理员入口不在公开导航中展示/)
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
  assert.doesNotMatch(profilePage, /宿舍楼决定楼群入口|加载宿舍建议/)
})

test('chat page uses group language and truthful composer copy', () => {
  assert.match(chatPage, /所有已登录同学都可以参与/)
  assert.match(chatPage, /这里还没有消息/)
  assert.match(chatPage, /aria-pressed/)
  assert.doesNotMatch(chatPage, />\s*房间\s*</)
  assert.doesNotMatch(chatPage, /消息格式：|回车发送/)
})
