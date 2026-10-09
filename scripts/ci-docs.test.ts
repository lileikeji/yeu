import assert from 'node:assert/strict'
import { execFileSync, spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { pathToFileURL } from 'node:url'

const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash'
const unix = (path: string) => path.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive: string) => '/' + drive.toLowerCase())

function shallowRun(scenario: string) {
  const root = mkdtempSync(join(tmpdir(), 'yeu-ci-docs-'))
  const origin = join(root, 'origin')
  const runner = join(root, 'runner')
  const flag = join(root, 'bootstrap-called')
  mkdirSync(join(origin, 'scripts'), { recursive: true })
  mkdirSync(join(origin, 'docs'))
  const git = (...args: string[]) => execFileSync('git', ['-C', origin, ...args], { encoding: 'utf8' }).trim()
  const commit = () => git('-c', 'user.name=Pipeline Fixture', '-c', 'user.email=pipeline@example.invalid', 'commit', '--quiet', '-am', 'fixture')
  try {
    git('init', '--quiet', '--initial-branch=master')
    writeFileSync(join(origin, '.gitattributes'), '*.sh text eol=lf\n')
    writeFileSync(join(origin, 'README.md'), 'Initial documentation\n')
    writeFileSync(join(origin, 'runtime.ts'), 'export const runtime = 1\n')
    writeFileSync(join(origin, 'scripts/ci-build.sh'), readFileSync(resolve('scripts/ci-build.sh')))
    writeFileSync(join(origin, 'scripts/release-tools.mjs'), readFileSync(resolve('scripts/release-tools.mjs')))
    writeFileSync(join(origin, 'scripts/ci-bootstrap.sh'), 'printf blocked > "$BOOTSTRAP_FLAG"\nexit 55\n')
    git('add', '.')
    commit()
    const base = git('rev-parse', 'HEAD')
    writeFileSync(join(origin, 'README.md'), 'Updated documentation\n')
    if (scenario === 'runtime-rename') git('mv', 'runtime.ts', 'docs/archived-runtime.ts')
    commit()
    const head = git('rev-parse', 'HEAD')
    execFileSync('git', ['clone', '--quiet', '--depth=1', pathToFileURL(origin).href, runner])
    assert.notEqual(spawnSync('git', ['-C', runner, 'cat-file', '-e', base + '^{commit}']).status, 0)
    const deployed = scenario === 'missing-base' ? 'b'.repeat(40) : base
    const command = 'curl(){ printf "%s" "$BASE_VERSION"; }; export -f curl; exec bash "$CI_SCRIPT"'
    const result = spawnSync(bash, ['--noprofile', '--norc', '-c', command], {
      encoding: 'utf8', timeout: 15000,
      env: {
        ...process.env, GITEE_COMMIT: head, GITEE_PIPELINE_BUILD_NUMBER: '777',
        BASE_VERSION: JSON.stringify({ commit: deployed }), BOOTSTRAP_FLAG: unix(flag),
        CI_SCRIPT: unix(join(runner, 'scripts/ci-build.sh'))
      }
    })
    assert.equal(result.error, undefined)
    return {
      status: result.status, output: result.stdout + result.stderr,
      fetched: spawnSync('git', ['-C', runner, 'cat-file', '-e', base + '^{commit}']).status === 0,
      bootstrapCalled: existsSync(flag), archive: existsSync(join(runner, 'yeu-release.tar.gz')),
      mode: readFileSync(join(runner, 'release-mode.txt'), 'utf8').trim()
    }
  } finally {
    rmSync(root, { recursive: true, force: true })
  }
}

test('浅克隆按生产 SHA 补取基线，纯文档跳过安装和应用构建', () => {
  const r = shallowRun('docs')
  assert.equal(r.status, 0, r.output)
  assert.equal(r.fetched, true, r.output)
  assert.equal(r.bootstrapCalled, false, r.output)
  assert.equal(r.archive, true, r.output)
  assert.equal(r.mode, 'docs-only', r.output)
})

test('生产 SHA 无法获取时退回完整门禁，不误判为纯文档', () => {
  const r = shallowRun('missing-base')
  assert.equal(r.status, 55, r.output)
  assert.equal(r.bootstrapCalled, true, r.output)
  assert.equal(r.archive, false, r.output)
  assert.equal(r.mode, 'deploy', r.output)
})

test('运行文件改名移入 docs 仍需要完整检查', () => {
  const r = shallowRun('runtime-rename')
  assert.equal(r.status, 55, r.output)
  assert.equal(r.fetched, true, r.output)
  assert.equal(r.bootstrapCalled, true, r.output)
  assert.equal(r.archive, false, r.output)
})
