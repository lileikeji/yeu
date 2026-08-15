#!/usr/bin/env node
/**
 * Install / refresh the yeu-campus skill from the repo into a DSH user skills
 * directory (so the DSH skill hub picks it up).
 *
 * Usage:
 *   node scripts/install-ye-campus-skill.mjs                  # -> ~/.agents/skills/yeu-campus
 *   node scripts/install-ye-campus-skill.mjs <dest-dir>       # custom dest
 *
 * The repo skills/yeu-campus is the source of truth (regenerated from the
 * knowledge base via the distillation flow); this script just copies it.
 */
import { cpSync, existsSync, mkdirSync, rmSync } from 'node:fs'
import { homedir } from 'node:os'
import { join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

const repoRoot = resolve(fileURLToPath(new URL('..', import.meta.url)))
const src = join(repoRoot, 'skills', 'yeu-campus')
if (!existsSync(src)) {
  console.error('source skill missing:', src)
  process.exit(1)
}
const destArg = process.argv[2]
const dest = destArg
  ? resolve(destArg)
  : join(homedir(), '.agents', 'skills', 'yeu-campus')

// Re-create the dest so removed files never linger.
rmSync(dest, { recursive: true, force: true })
mkdirSync(dest, { recursive: true })
cpSync(src, dest, { recursive: true })
console.log('installed yeu-campus skill:')
console.log('  from:', src)
console.log('  to  :', dest)
console.log('refresh the DSH skill catalog (Settings -> Skills) to pick it up.')
