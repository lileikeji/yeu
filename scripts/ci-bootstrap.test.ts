import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { chmodSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash'
const unix = (path: string) => path.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive: string) => '/' + drive.toLowerCase())

function install(scenario: string) {
  const root = mkdtempSync(join(tmpdir(), 'yeu-ci-bootstrap-'))
  const bootstrap = join(root, 'bootstrap.sh')
  // Only remap the fixture cache; production resolves it from the user's home.
  writeFileSync(bootstrap, readFileSync(resolve('scripts/ci-bootstrap.sh'), 'utf8')
    .replace('CI_CACHE="${HOME}/.cache/yeu-ci"', 'CI_CACHE="$FIXTURE_CACHE"'))
  for (const executable of ['node-v22.23.4/bin/node', 'pnpm-10.28.1/bin/pnpm']) {
    const file = join(root, executable)
    mkdirSync(join(file, '..'), { recursive: true })
    writeFileSync(file, '#!/bin/sh\nexit 99\n')
    chmodSync(file, 0o755)
  }
  const command = [
    'attempts=0; loads=0',
    'node(){ if [[ "$1" == --version ]]; then echo v22.23.4; else loads=$((loads+1)); [[ "$SCENARIO" != native-fail ]]; fi; }',
    'pnpm(){',
    '  case "$1" in',
    '  --version) echo 10.28.1 ;;',
    '  store) echo "$FIXTURE_CACHE/pnpm-store/v10" ;;',
    '  install)',
    '    attempts=$((attempts+1))',
    '    [[ "$2" == --frozen-lockfile && "$3" == --store-dir && "$4" == "$FIXTURE_CACHE/pnpm-store" ]] || return 99',
    '    [[ "$SCENARIO" != always-fail && ( "$SCENARIO" != retry || "$attempts" != 1 ) ]] ;;',
    '  *) return 99 ;;',
    '  esac',
    '}',
    'trap \'printf "attempts=%s loads=%s cache=%s\\n" "$attempts" "$loads" "$npm_config_cache"\' EXIT',
    'source "$BOOTSTRAP"'
  ].join('\n')
  try {
    const r = spawnSync(bash, ['--noprofile', '--norc', '-c', command], {
      encoding: 'utf8', timeout: 10000,
      env: { ...process.env, FIXTURE_CACHE: unix(root), BOOTSTRAP: unix(bootstrap), SCENARIO: scenario }
    })
    assert.equal(r.error, undefined)
    return { status: r.status, output: r.stdout + r.stderr, root: unix(root) }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('安装短暂失败后只重试一次，pnpm 和原生预编译包均使用项目缓存', () => {
  const r = install('retry')
  assert.equal(r.status, 0, r.output)
  assert.ok(r.output.includes('attempts=2 loads=1 cache=' + r.root + '/npm'), r.output)
  assert.ok(r.output.includes('native_prebuild_cache=' + r.root + '/npm/_prebuilds'), r.output)
})

test('两次安装均失败即停止，不执行原生加载或后续发布', () => {
  const r = install('always-fail')
  assert.equal(r.status, 1, r.output)
  assert.ok(r.output.includes('attempts=2 loads=0'), r.output)
})

test('安装成功但原生加载失败仍阻止发布', () => {
  const r = install('native-fail')
  assert.equal(r.status, 1, r.output)
  assert.ok(r.output.includes('attempts=1 loads=1'), r.output)
  assert.equal(r.output.includes('native_prebuild_cache='), false, r.output)
})
