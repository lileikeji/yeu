import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { test } from 'node:test'

const build = readFileSync('scripts/build-linux-artifact.sh', 'utf8')
const remote = readFileSync('scripts/remote-patch-native.sh', 'utf8')

test('制品脚本把远端动作放在独立文件里，不再靠 ssh 参数里的嵌套转义', () => {
  // 2026-11-10 发布事故：远端块里的 $REMOTE_STAGE 在嵌套引号中被展开成空，
  // native.hash 静默没重算，deploy-home-sheet.sh 以「原生模块摘要不匹配」拒绝发布。
  assert.match(build, /scripts\/remote-patch-native\.sh/)
  assert.match(build, /ssh_run "bash \$REMOTE_STAGE\/remote-patch-native\.sh \$REMOTE_STAGE"/)
  assert.doesNotMatch(build, /\\\\\$CUR/, '不允许再出现 \\$CUR 这类嵌套转义')
  assert.doesNotMatch(build, /native\.hash=\\\$\(grep/, '不允许在 ssh 参数里拼 grep 取 hash')
})

test('远端补丁脚本自带失败即停、换 ELF、补 sqlite-vec、重算 native.hash', () => {
  assert.match(remote, /set -euo pipefail/)
  assert.match(remote, /better_sqlite3\.node/)
  assert.match(remote, /sqlite-vec-linux-x64/)
  assert.match(remote, /createHash\("sha256"\)/)
  assert.match(remote, /metadata\.native\.hash/)
  // 参数只有一个：暂存目录。脚本自己算路径，不接受外部拼好的字符串。
  assert.match(remote, /STAGE="\$\{1:\?/)
  assert.doesNotMatch(remote, /\$\{REMOTE_STAGE/, '远端正本不该依赖本机变量')
  // 找不到可复用的二进制必须直接失败，不能静默放过。
  assert.match(remote, /找不到可复用的 better_sqlite3\.node/)
})

test('构建脚本把 Git Bash 的 /c/... 私钥路径归一化，避免远端探测拿到空串', () => {
  assert.match(build, /\$\{SSH_KEY:\?/)
  assert.match(build, /if \[\[ "\$SSH_KEY" == \/\[a-zA-Z\]\/\* \]\]/)
})
