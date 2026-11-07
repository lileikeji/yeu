import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import { test } from 'node:test'

const SCRIPT = resolve(import.meta.dirname, 'seed-manifest.mjs')

function run(mode: string, seedsDir?: string): { status: number, output: string } {
  try {
    const stdout = execFileSync(process.execPath, [SCRIPT, mode], {
      encoding: 'utf8',
      env: seedsDir ? { ...process.env, SEEDS_DIR: seedsDir } : process.env
    })
    return { status: 0, output: stdout }
  } catch (error) {
    // verify 失败走 stderr + 非零退出，execFileSync 把它抛成异常
    const failure = error as { status?: number, stdout?: string, stderr?: string }
    return { status: failure.status ?? 1, output: (failure.stdout ?? '') + (failure.stderr ?? '') }
  }
}

// 与 bus-route-manifest.test.ts 同款：真实种子目录与仓库内 manifest 必须一致。
test('seed manifest matches data/seeds contents', () => {
  const result = run('verify')
  assert.equal(result.status, 0, result.output)
  assert.match(result.output, /seed manifest ok/)
})

test('seed manifest write/verify round-trip detects drift and ignores excluded files', () => {
  const seedsDir = mkdtempSync(join(tmpdir(), 'yeu-seed-manifest-'))
  try {
    writeFileSync(join(seedsDir, 'content.json'), '{"a":1,"b":[1,2]}', 'utf8')
    writeFileSync(join(seedsDir, 'bus-route-locked.json'), '{"routes":[]}', 'utf8')
    writeFileSync(join(seedsDir, 'bus-route-manifest.json'), '{}', 'utf8')
    writeFileSync(join(seedsDir, 'seed-manifest.json'), '{}', 'utf8')
    writeFileSync(join(seedsDir, 'old.bak-121207.json'), '{"stale":true}', 'utf8')
    writeFileSync(join(seedsDir, 'notes.txt'), '不是种子', 'utf8')

    const written = run('write', seedsDir)
    assert.equal(written.status, 0, written.output)
    assert.match(written.output, /1 files/)

    const verified = run('verify', seedsDir)
    assert.equal(verified.status, 0, verified.output)
    assert.match(verified.output, /seed manifest ok/)

    // 篡改内容 → verify 失败并指出文件
    writeFileSync(join(seedsDir, 'content.json'), '{"a":2,"b":[1,2]}', 'utf8')
    const drifted = run('verify', seedsDir)
    assert.equal(drifted.status, 1)
    assert.match(drifted.output, /content\.json/)

    // key 重排不算内容变化：write 一次后 verify 仍绿
    writeFileSync(join(seedsDir, 'content.json'), '{"b":[1,2],"a":1}', 'utf8')
    assert.equal(run('verify', seedsDir).status, 0)
  } finally {
    rmSync(seedsDir, { recursive: true, force: true })
  }
})
