import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, realpathSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash'
const unix = (path: string) => path.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive: string) => `/${drive.toLowerCase()}`)

function exercise(scenario: string) {
  const root = mkdtempSync(join(tmpdir(), 'yeu-deploy-injection-'))
  const release = '20261009-injection'
  const base = join(root, 'app')
  const old = join(base, 'releases/20261008-old')
  const next = join(base, 'releases', release)
  const candidate = join(root, 'candidate')
  const mocks = join(root, 'bin')
  const archive = join(root, 'candidate.tar.gz')
  const log = join(root, 'operations.log')
  mkdirSync(join(old, '.output/server'), { recursive: true })
  mkdirSync(join(candidate, '.output/server'), { recursive: true })
  mkdirSync(join(candidate, '.output/deploy'), { recursive: true })
  mkdirSync(join(base, 'shared/data'), { recursive: true })
  mkdirSync(mocks)
  writeFileSync(join(base, 'shared/data/yeu.sqlite'), 'fixture-only')
  writeFileSync(join(base, 'shared/.env'), '')
  writeFileSync(join(old, '.output/server/index.mjs'), '')
  writeFileSync(join(candidate, '.output/server/index.mjs'), '')
  writeFileSync(join(candidate, '.output/deploy/release-tools.mjs'), readFileSync(resolve('scripts/release-tools.mjs')))
  const manifest = { commit: 'a'.repeat(40), release, retrieval: { hash: 'same', version: 'v1' }, migrations: [] }
  writeFileSync(join(candidate, '.output/release.json'), JSON.stringify(manifest))
  writeFileSync(join(old, '.output/release.json'), JSON.stringify({ ...manifest, release: '20261008-old' }))
  const mock = (name: string, body: string) => writeFileSync(join(mocks, name), `#!/usr/bin/env bash\nset -eu\n${body}\n`, { mode: 0o755 })
  mock('chown', ':')
  mock('sleep', ':')
  mock('seq', 'printf \'1\\n2\\n3\\n\'')
  mock('journalctl', ':')
  mock('df', 'echo "Filesystem 1-blocks Used Available Use% Mounted"\nif [[ "$SCENARIO" == space ]]; then echo "fixture 100 90 10 90% /"; else echo "fixture 9999999999 0 9999999999 0% /"; fi')
  mock('sqlite3', 'echo backup >> "$OPS_LOG"\ncp "$1" "$MOCK_BACKUP"')
  mock('systemctl', `if [[ "$1" == restart ]]; then
  target="$(readlink -f "$YEU_BASE/current")"
  echo "restart=$target" >> "$OPS_LOG"
  [[ "$SCENARIO" != restart || ! "$target" -ef "$NEXT_RELEASE" ]]
fi`)
  mock('curl', `for url; do :; done
target="$(readlink -f "$YEU_BASE/current")"
if [[ "$url" == *:3000/api/health && "$SCENARIO" == health && "$target" -ef "$NEXT_RELEASE" ]]; then exit 1; fi
if [[ "$url" == */version.json ]]; then
  if [[ "$url" == *:3101/* ]]; then target="$NEXT_RELEASE"; fi
  if [[ "$url" == *:3000/* && "$SCENARIO" == version && "$target" -ef "$NEXT_RELEASE" ]]; then echo '{"commit":"wrong","release":"wrong"}'; else cat "$target/.output/release.json"; fi
else echo '首页显示模式'; fi`)
  mock('fixture-node', `if [[ "$1" == --env-file=* ]]; then
  while :; do /usr/bin/sleep 1; done
elif [[ "$2" == native ]]; then
  [[ "$SCENARIO" != native ]]
elif [[ "$2" == db-check ]]; then
  [[ "$SCENARIO" != schema ]]
else "$REAL_NODE" "$@"; fi`)
  const env = {
    ...Object.fromEntries(Object.entries(process.env).filter(([key]) => key.toLowerCase() !== 'path')),
    MSYS: 'winsymlinks:nativestrict',
    PATH: `${unix(mocks)}:/usr/bin:/bin`,
    YEU_BASE: unix(base), YEU_NODE: unix(join(mocks, 'fixture-node')),
    REAL_NODE: unix(process.execPath), DEPLOY_SHA: 'a'.repeat(40),
    NEXT_RELEASE: unix(next), OPS_LOG: unix(log), SCENARIO: scenario,
    MOCKS: unix(mocks), CORE: unix(resolve('scripts/deploy-home-sheet.sh')),
    RELEASE_ID: release, TEST_ARCHIVE: unix(archive),
    MOCK_BACKUP: unix(join(base, 'shared/backups', `yeu-before-${release}.sqlite`))
  }
  try {
    execFileSync(bash, ['-c', 'ln -s "$OLD_RELEASE" "$YEU_BASE/current"; tar -czf "$TEST_ARCHIVE" -C "$CANDIDATE" .output'], {
      env: { ...env, OLD_RELEASE: unix(old), TEST_ARCHIVE: unix(archive), CANDIDATE: unix(candidate) }
    })
    const result = spawnSync(bash, ['-c', 'export PATH="$MOCKS:/usr/bin:/bin"; exec bash "$CORE" "$RELEASE_ID" "$TEST_ARCHIVE"'], { env, timeout: 60_000, encoding: 'utf8' })
    assert.equal(result.error, undefined, result.error?.message)
    const operations = existsSync(log) ? readFileSync(log, 'utf8') : ''
    const target = realpathSync(join(base, 'current'))
    const rollback = result.stdout.match(/^rollback=(.+)$/m)?.[1]?.trim()
      ?? result.stderr.match(/rollback=(.+) backup=/)?.[1]?.trim() ?? ''
    const rollbackMatches = spawnSync(bash, ['-c', '[[ "$ROLLBACK" == /* && "$ROLLBACK" -ef "$OLD_RELEASE" ]]'], { env: { ...env, ROLLBACK: rollback, OLD_RELEASE: unix(old) } }).status === 0
    const manualRollback = result.stderr.match(/^人工回滚：(.+)$/m)?.[1]?.trim()
    const manualRollbackOk = manualRollback
      ? spawnSync(bash, ['-c', 'export PATH="$MOCKS:/usr/bin:/bin"; ' + manualRollback], { env }).status === 0 && realpathSync(join(base, 'current')) === old
      : false
    return { status: result.status, output: result.stdout + result.stderr, operations, target, old, next, rollbackMatches, manualRollbackOk, created: existsSync(next) }
  } finally { rmSync(root, { recursive: true, force: true }) }
}

for (const scenario of ['restart', 'health', 'version']) {
  test(`发布 ${scenario} 失败：返回非零，current 恢复旧版本并重新启动`, () => {
    const r = exercise(scenario)
    assert.equal(r.status, 1, r.output)
    assert.equal(r.target, r.old)
    assert.equal(r.operations.split('\n').filter(line => line.startsWith('restart=')).length, 2, r.output)
    assert.ok(r.rollbackMatches, r.output)
    assert.ok(r.output.includes('旧服务健康检查通过'), r.output)
    assert.ok(r.manualRollbackOk, r.output)
  })
}

for (const scenario of ['native', 'schema', 'space']) {
  test(`${scenario} 闸门失败：不备份、不重启、不切换 current`, () => {
    const r = exercise(scenario)
    assert.equal(r.status, 1, r.output)
    assert.equal(r.target, r.old)
    assert.equal(r.operations, '')
    if (scenario === 'space') assert.equal(r.created, false)
  })
}

test('成功发布：新版本生效，输出可用的旧版本绝对路径', () => {
  const r = exercise('success')
  assert.equal(r.status, 0, r.output)
  assert.equal(r.target, r.next)
  assert.ok(r.rollbackMatches, r.output)
})
