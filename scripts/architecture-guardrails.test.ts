import assert from 'node:assert/strict'
import { spawnSync } from 'node:child_process'
import { existsSync, mkdtempSync, readdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { createRequire } from 'node:module'
import { tmpdir } from 'node:os'
import { join, resolve } from 'node:path'
import test from 'node:test'

const ESCAPE_HATCH_PATTERN = new RegExp(`\\b(${['FIX' + 'ME', 'HA' + 'CK', 'WORK' + 'AROUND'].join('|')})\\b`, 'i')

function walkVueFiles(dir: string, out: string[] = []): string[] {
  if (!existsSync(dir)) return out
  for (const entry of readdirSync(dir, { withFileTypes: true })) {
    if (entry.name === 'node_modules' || entry.name === '.nuxt' || entry.name === '.output') continue
    const full = join(dir, entry.name)
    if (entry.isDirectory()) {
      walkVueFiles(full, out)
    } else if (entry.isFile() && entry.name.endsWith('.vue')) {
      out.push(full)
    }
  }
  return out
}

function extractVueComments(source: string): string[] {
  const comments: string[] = []
  for (const match of source.matchAll(/<!--[\s\S]*?-->/g)) {
    comments.push(match[0])
  }
  for (const scriptMatch of source.matchAll(/<script\b[^>]*>([\s\S]*?)<\/script>/gi)) {
    const body = scriptMatch[1] ?? ''
    for (const block of body.matchAll(/\/\*[\s\S]*?\*\//g)) {
      comments.push(block[0])
    }
    for (const line of body.matchAll(/(?:^|[^:])\/\/.*$/gm)) {
      comments.push(line[0])
    }
  }
  return comments
}

function resolveAstGrepBin(): string {
  if (process.platform === 'win32') {
    const winExe = resolve('node_modules/@ast-grep/cli/ast-grep.exe')
    if (existsSync(winExe)) return winExe
  }
  return resolve('node_modules/.bin/ast-grep')
}

test('app/ 下所有 .vue 文件注释不含逃生舱标记', () => {
  const vueFiles = walkVueFiles(resolve('app'))
  assert.ok(vueFiles.length > 0, '预期 app/ 目录下至少存在一个 .vue 文件')

  const hits: string[] = []
  for (const file of vueFiles) {
    const content = readFileSync(file, 'utf8')
    for (const comment of extractVueComments(content)) {
      const matched = comment.match(ESCAPE_HATCH_PATTERN)
      if (matched) {
        hits.push(`${file}: ${matched[0]}`)
      }
    }
  }

  assert.deepEqual(hits, [], `在 .vue 注释中发现逃生舱标记：${hits.join(', ')}`)
})

test('ast-grep 守卫规则能稳定拦截含逃生舱注释的 TypeScript 文件（红灯反证）', () => {
  const tempDir = mkdtempSync(join(tmpdir(), 'yeu-ast-guard-'))
  try {
    const sampleFile = join(tempDir, 'sample.ts')
    writeFileSync(sampleFile, `// ${'FIX' + 'ME'}: temporary ${'ha' + 'ck'}\nexport const x = 1\n`, 'utf8')

    const result = spawnSync(resolveAstGrepBin(), ['scan', '--config', resolve('sgconfig.yml'), tempDir], {
      encoding: 'utf8'
    })
    assert.equal(result.error, undefined, result.error?.message)
    assert.notEqual(result.status, 0, 'ast-grep 应当拒绝含逃生舱注释的代码并返回非零退出码')
    const combinedOutput = `${result.stdout ?? ''}\n${result.stderr ?? ''}`
    assert.match(combinedOutput, /no-apologetic-hack-comments/)
  } finally {
    rmSync(tempDir, { recursive: true, force: true })
  }
})

test('dependency-cruiser 核心禁令均为 error 级别且无基线豁免文件残留', () => {
  const require = createRequire(import.meta.url)
  const config = require('../.dependency-cruiser.cjs') as {
    forbidden?: Array<{
      name?: string
      severity?: string
      to?: { viaOnly?: { dependencyTypesNot?: string[] } }
    }>
  }
  const expectedRules = [
    'client-must-not-import-server',
    'client-and-shared-must-not-import-node-core',
    'public-http-url-only-dynamic-dns',
    'public-http-url-dns-must-be-dynamic',
    'client-and-shared-must-not-import-db-drivers',
    'shared-must-remain-pure',
    'server-core-must-not-import-api-routes',
    'no-circular-dependencies'
  ]

  const rulesByName = new Map((config.forbidden ?? []).map(rule => [rule.name, rule]))
  for (const name of expectedRules) {
    assert.equal(rulesByName.get(name)?.severity, 'error', `规则 ${name} 必须存在且为 error 级别`)
  }

  const circularRule = rulesByName.get('no-circular-dependencies')
  assert.deepEqual(
    circularRule?.to?.viaOnly?.dependencyTypesNot,
    ['type-only'],
    'no-circular-dependencies 应忽略编译期擦除的 type-only 引用环'
  )

  assert.equal(
    existsSync(resolve('.dependency-cruiser-known-violations.json')),
    false,
    '不应保留 .dependency-cruiser-known-violations.json 基线豁免文件'
  )
})

test('verify-secrets.mjs 在 REQUIRE_GITLEAKS=1 且缺少 gitleaks 时硬报错退出（红灯反证）', () => {
  const result = spawnSync(process.execPath, [resolve('scripts/verify-secrets.mjs')], {
    encoding: 'utf8',
    env: {
      ...process.env,
      REQUIRE_GITLEAKS: '1',
      GITLEAKS_BIN: '__missing_gitleaks_binary__'
    }
  })
  assert.equal(result.status, 1)
  assert.match(result.stderr, /REQUIRE_GITLEAKS=1/)
})
