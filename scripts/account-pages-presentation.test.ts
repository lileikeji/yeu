import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const loginPage = readFileSync(resolve('app/pages/login.vue'), 'utf8')
const profilePage = readFileSync(resolve('app/pages/me/index.vue'), 'utf8')
const chatPage = readFileSync(resolve('app/pages/chat/index.vue'), 'utf8')

test('login page stays compact and uses ordinary account language', () => {
  assert.match(loginPage, /新生账号/)
  // 2026-11-08 开放注册：登录页改为「登录/注册」双 tab
  assert.match(loginPage, /mode === 'login' \? '账号登录' : '注册账号'/)
  assert.match(loginPage, /邮箱验证后完成注册/)
  assert.match(loginPage, /没有账号也不影响使用校园指南/)
  assert.match(loginPage, /不登录也能用/)
  assert.match(loginPage, /查地图、看办事指南、勾选新生清单/)
  assert.match(loginPage, /登录后可以/)
  assert.doesNotMatch(loginPage, /即可注册|都可以|帮你|为你/)
  assert.match(loginPage, /修改个人资料，进入公共群和宿舍楼群/)
  assert.match(loginPage, /max-w-md/)
  assert.doesNotMatch(loginPage, /ACCOUNT|账号服务|登录后可做什么|管理员入口不在公开导航中展示|账号由管理员统一创建|工作人员提前创建/)
})

test('login guidance only appears after a protected page sends the student here', () => {
  assert.match(loginPage, /function requestedRedirectTarget\(\): string \| null/)
  assert.match(loginPage, /const target = requestedRedirectTarget\(\)\s+if \(!target\) return ''/)
  assert.match(loginPage, /return requestedRedirectTarget\(\) \?\? '\/me'/)
  assert.match(loginPage, /群聊需要登录。公共群对所有已登录同学开放；填写宿舍楼后，还会显示对应楼群/)
  assert.match(loginPage, /请先登录，再进入个人中心/)
  assert.match(loginPage, /请先登录，登录后会回到刚才的页面/)
  assert.doesNotMatch(loginPage, /该功能需要登录|登录成功后将自动返回/)
})

test('chat login offers useful places to continue without an account', () => {
  assert.match(loginPage, /const isChatRedirect = computed/)
  assert.match(loginPage, /v-if="isChatRedirect"/)
  assert.match(loginPage, /to="\/map"/)
  assert.match(loginPage, /先看地图/)
  assert.match(loginPage, /to="\/procedures"/)
  assert.match(loginPage, /先看办事指南/)
  assert.match(loginPage, /v-else\s+to="\/"/)
})

test('login button names the protected page it will open', () => {
  assert.match(loginPage, /const loginButtonLabel = computed/)
  assert.match(loginPage, /return '登录并进入群聊'/)
  assert.match(loginPage, /return '登录并进入个人中心'/)
  assert.match(loginPage, /\{\{ loginButtonLabel \}\}/)
})

test('login controls keep a comfortable mobile touch height', () => {
  // 登录 2 处 + 注册表单 4 处（用户名/邮箱/密码/验证码）
  assert.equal((loginPage.match(/class="min-h-11 w-full"/g) || []).length, 6)
  assert.equal((loginPage.match(/base: 'min-h-11'/g) || []).length, 2)
  assert.match(loginPage, /class="min-h-11 min-w-11"\s+@click="togglePasswordVisibility"/)
  assert.match(loginPage, /icon="i-lucide-log-in"\s+class="min-h-11"/)
})

test('login page gives students a safe account-help path', () => {
  assert.match(loginPage, /const accountHelpLink = '\/feedback\?type=other&from=%2Flogin'/)
  assert.match(loginPage, /请不要向任何人提供密码/)
  assert.match(loginPage, /登录有问题？告诉我们/)
  assert.match(loginPage, /:to="accountHelpLink"/)
  assert.match(loginPage, /class="-mr-1 inline-flex min-h-10 items-center/)
  assert.doesNotMatch(loginPage, /联系管理员|提交密码|找管理员重置/)
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
  assert.match(chatPage, /登录后都能看/)
  assert.match(chatPage, /'还没有消息' : '暂时没有可用群聊'/)
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
