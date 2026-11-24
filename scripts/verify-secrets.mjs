import { execFileSync, spawnSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { existsSync, readFileSync, statSync } from 'node:fs'
import { basename, resolve } from 'node:path'

const SCANNED_PREFIXES = ['app/', 'server/', 'shared/', 'map/', 'scripts/']
const FORBIDDEN_TRACKED_NAMES = new Set(['.env', '.env.local', '.env.production', 'id_rsa', 'id_ed25519'])
const PRIVATE_KEY_HEADER_RE = new RegExp('-----BEGIN ' + '(?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----', 'g')
const PRIVATE_KEY_BLOCK_RE = new RegExp(
  '-----BEGIN ' + '(?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----[\\s\\S]*?-----END ' + '(?:RSA |EC |OPENSSH |DSA )?PRIVATE KEY-----',
  'g'
)
const ALLOWED_PUBLIC_KEY_BLOCKS = new Map([
  // 云一卡通前端 app.js 公开协议固定签名常量（非服务端机密）
  ['server/modules/transit/ykt-bus.ts', new Set(['d0757bea1f49094df6330b18e2ba71eee19deb474def8e15f80827dbf6fe01df'])]
])
const MAX_SCAN_FILE_BYTES = 2 * 1024 * 1024

function isForbiddenTrackedPath(filePath) {
  const name = basename(filePath)
  if (FORBIDDEN_TRACKED_NAMES.has(name)) return true
  if (name.startsWith('.env.') && name !== '.env.example') return true
  if (/\.(pem|key)$/i.test(name)) return true
  return false
}

function shouldScanTrackedContent(filePath) {
  if (!SCANNED_PREFIXES.some(prefix => filePath.startsWith(prefix))) return false
  if (filePath === 'scripts/verify-secrets.mjs') return false
  if (/\.test\.[cm]?[jt]sx?$/i.test(filePath)) return false
  return true
}

function listTrackedFiles() {
  const raw = execFileSync('git', ['ls-files', '-z'], {
    encoding: 'utf8',
    maxBuffer: 32 * 1024 * 1024
  })
  return raw.split('\0').filter(Boolean)
}

function hasDisallowedPrivateKey(filePath, content) {
  const normalized = content.replace(/\r\n/g, '\n')
  const headerMatches = normalized.match(PRIVATE_KEY_HEADER_RE)
  if (!headerMatches || headerMatches.length === 0) return false

  const allowedDigests = ALLOWED_PUBLIC_KEY_BLOCKS.get(filePath)
  if (!allowedDigests) return true

  const blockMatches = normalized.match(PRIVATE_KEY_BLOCK_RE) ?? []
  if (blockMatches.length !== headerMatches.length) return true

  return blockMatches.some((block) => {
    const digest = createHash('sha256').update(block).digest('hex')
    return !allowedDigests.has(digest)
  })
}

function checkTrackedFiles() {
  const tracked = listTrackedFiles()
  const forbiddenPaths = []
  const privateKeyHits = []

  for (const filePath of tracked) {
    if (isForbiddenTrackedPath(filePath)) {
      forbiddenPaths.push(filePath)
      continue
    }
    if (!shouldScanTrackedContent(filePath)) continue
    const absPath = resolve(filePath)
    if (!existsSync(absPath)) continue
    const stat = statSync(absPath)
    if (!stat.isFile() || stat.size > MAX_SCAN_FILE_BYTES) continue
    const content = readFileSync(absPath, 'utf8')
    if (content.includes('\0')) continue
    if (hasDisallowedPrivateKey(filePath, content)) {
      privateKeyHits.push(filePath)
    }
  }

  if (forbiddenPaths.length > 0) {
    console.error(`发现禁止入库的敏感文件路径：${forbiddenPaths.join(', ')}`)
    return false
  }
  if (privateKeyHits.length > 0) {
    console.error(`发现包含私钥头的已追踪文件：${privateKeyHits.join(', ')}`)
    return false
  }
  console.log(`已追踪文件敏感路径与私钥头检查通过（共检查 ${tracked.length} 个已入库文件）。`)
  return true
}

function runGitleaksIfPresent() {
  const gitleaksBin = process.env.GITLEAKS_BIN || 'gitleaks'
  const probe = spawnSync(gitleaksBin, ['version'], { encoding: 'utf8' })
  if (probe.error || probe.status !== 0) {
    if (process.env.REQUIRE_GITLEAKS === '1') {
      console.error('REQUIRE_GITLEAKS=1 已启用，但 PATH 中未找到可用的 gitleaks 可执行文件。')
      return false
    }
    console.log('未检测到 gitleaks 可执行文件，已通过 Git 入库文件黑名单与私钥头基线检查。')
    return true
  }

  const checks = [
    {
      label: '最近 50 个增量提交历史',
      args: ['git', '--log-opts=--min-parents=1 -n 50', '--no-banner', '--redact']
    },
    {
      label: 'Git 暂存区',
      args: ['protect', '--staged', '--no-banner', '--redact']
    }
  ]

  for (const check of checks) {
    const res = spawnSync(gitleaksBin, check.args, {
      encoding: 'utf8',
      stdio: 'inherit'
    })
    if (res.error || res.status !== 0) {
      console.error(`gitleaks 扫描失败（${check.label}），退出码：${res.status ?? 1}`)
      return false
    }
  }

  console.log('gitleaks 提交历史与暂存区扫描通过。')
  return true
}

const ok = checkTrackedFiles() && runGitleaksIfPresent()
if (!ok) {
  process.exit(1)
}
