import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { closeSync, existsSync, mkdtempSync, mkdirSync, openSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const bash = process.platform === 'win32' ? 'C:/Program Files/Git/bin/bash.exe' : '/bin/bash'
const unix = (path: string) => path.replaceAll('\\', '/').replace(/^([A-Za-z]):/, (_, drive: string) => '/' + drive.toLowerCase())

function exercise(scenario: string) {
  const root = mkdtempSync(join(tmpdir(), 'yeu-ci-parallel-'))
  const operations = join(root, 'operations.log')
  const typeStarted = join(root, 'type-started')
  const testStarted = join(root, 'test-started')
  const late = join(root, 'late-operation')
  const groups = join(root, 'groups')
  const typeDirectory = join(root, 'type-directory')
  mkdirSync(join(root, 'scripts'))
  mkdirSync(join(root, 'node_modules'))
  writeFileSync(join(root, 'scripts/ci-build.sh'), readFileSync(resolve('scripts/ci-build.sh')))
  writeFileSync(join(root, 'scripts/release-tools.mjs'), 'process.exit(process.argv[2] === "docs-only" ? 1 : 0)\n')
  writeFileSync(join(root, 'scripts/server-side-deploy.sh'), '')
  writeFileSync(join(root, 'scripts/deploy-home-sheet.sh'), '')
  writeFileSync(join(root, 'scripts/ci-bootstrap.sh'), [
    'pnpm() {',
    '  printf "%s\\n" "$1" >> "$OPS_LOG"',
    '  case "$1" in',
    '  typecheck)',
    '    printf "%s\\n" "$BASHPID" >> "$GROUPS_FILE"',
    '    printf "%s\\n" "$PWD" > "$TYPE_DIR_FILE"',
    '    touch "$TYPE_STARTED"',
    '    while [[ ! -f "$TEST_STARTED" ]]; do sleep 0.01; done',
    '    case "$SCENARIO" in',
    '      type-fail) return 41 ;;',
    '      test-fail) sleep 20; touch "$LATE_FILE" ;;',
    '      late-type-fail) sleep 1; return 43 ;;',
    '      success) sleep 0.2 ;;',
    '    esac ;;',
    '  exec)',
    '    printf "%s\\n" "$BASHPID" >> "$GROUPS_FILE"',
    '    touch "$TEST_STARTED"',
    '    while [[ ! -f "$TYPE_STARTED" ]]; do sleep 0.01; done',
    '    case "$SCENARIO" in',
    '      test-fail) return 42 ;;',
    '      type-fail) sleep 20; touch "$LATE_FILE" ;;',
    '      *) sleep 0.1 ;;',
    '    esac ;;',
    '  build)',
    '    mkdir -p .output/server',
    '    touch .output/server/index.mjs ;;',
    '  pwa:build:test) : ;;',
    '  *) return 99 ;;',
    '  esac',
    '}',
    ''
  ].join('\n'))
  const env = {
    ...process.env, SCENARIO: scenario, GITEE_COMMIT: 'a'.repeat(40),
    GITEE_PIPELINE_BUILD_NUMBER: '123', CI_SCRIPT: unix(join(root, 'scripts/ci-build.sh')),
    OPS_LOG: unix(operations), TYPE_STARTED: unix(typeStarted), TEST_STARTED: unix(testStarted),
    LATE_FILE: unix(late), GROUPS_FILE: unix(groups), TYPE_DIR_FILE: unix(typeDirectory)
  }
  try {
    const command = 'git(){ if [[ "$1" == rev-parse ]]; then printf "%s\\n" "$GITEE_COMMIT"; elif [[ "$1" == archive ]]; then tar -cf - --files-from /dev/null; else return 99; fi; }; curl(){ printf "{}"; }; export -f git curl; exec bash "$CI_SCRIPT"'
    const started = Date.now()
    const outputFile = join(root, 'output.log')
    const outputHandle = openSync(outputFile, 'w')
    let result
    try {
      result = spawnSync(bash, ['--noprofile', '--norc', '-c', command], {
        env, stdio: ['ignore', outputHandle, outputHandle], timeout: 10000
      })
    } finally {
      closeSync(outputHandle)
    }
    const elapsed = Date.now() - started
    const output = readFileSync(outputFile, 'utf8')
    assert.equal(result.error, undefined, result.error?.message + '\n' + output)
    const directory = readFileSync(typeDirectory, 'utf8').trim()
    const directoryCleaned = spawnSync(bash, ['-c', 'test ! -e "$CHECK_DIR"'], {
      env: { ...env, CHECK_DIR: directory }
    }).status === 0
    const groupIds = readFileSync(groups, 'utf8').trim().split('\n')
    assert.ok(groupIds.every(pid => /^[1-9]\d*$/.test(pid)))
    // Container PID 1 may retain dead grandchildren as zombies; reject every live member.
    const stopped = process.platform === 'win32'
      ? '! kill -0 -- "-$OWNED_GROUP" 2>/dev/null'
      : 'ps -eo pgid=,stat= | awk -v group="$OWNED_GROUP" \'$1 == group && $2 !~ /^Z/ { live = 1 } END { exit live ? 1 : 0 }\''
    const groupsStopped = groupIds.every(pid => spawnSync(bash, ['-c', 'for attempt in {1..40}; do ' + stopped + ' && exit 0; sleep 0.05; done; exit 1'], {
      env: { ...env, OWNED_GROUP: pid }, timeout: 5000
    }).status === 0)
    return {
      status: result.status, output,
      elapsed, operations: readFileSync(operations, 'utf8').split('\n'),
      bothStarted: existsSync(typeStarted) && existsSync(testStarted),
      directoryCleaned, groupsStopped, late: existsSync(late),
      archive: existsSync(join(root, 'yeu-release.tar.gz'))
    }
  } finally {
    if (existsSync(groups)) {
      for (const pid of readFileSync(groups, 'utf8').trim().split('\n').filter(pid => /^[1-9]\d*$/.test(pid))) {
        spawnSync(bash, ['-c', 'kill -TERM -- "-$OWNED_GROUP" 2>/dev/null || true'], {
          env: { ...env, OWNED_GROUP: pid }
        })
      }
    }
    rmSync(root, { recursive: true, force: true })
  }
}

for (const [scenario, code] of [['type-fail', 41], ['test-fail', 42], ['late-type-fail', 43]] as const) {
  test('并行 ' + scenario + '：停止另一支及其子进程，不生成发布包', () => {
    const r = exercise(scenario)
    assert.equal(r.status, code, r.output)
    assert.ok(r.bothStarted, r.output)
    assert.ok(r.elapsed < 5000, r.output)
    assert.ok(r.directoryCleaned, r.output)
    assert.ok(r.groupsStopped, r.output)
    assert.equal(r.late, false, r.output)
    assert.equal(r.archive, false, r.output)
  })
}

test('并行两支均成功后才打包，类型检查临时目录清理完成', () => {
  const r = exercise('success')
  assert.equal(r.status, 0, r.output)
  assert.ok(r.bothStarted, r.output)
  assert.ok(r.directoryCleaned, r.output)
  assert.ok(r.groupsStopped, r.output)
  assert.ok(r.operations.includes('build'), r.output)
  assert.ok(r.operations.includes('pwa:build:test'), r.output)
  assert.equal(r.archive, true, r.output)
})
