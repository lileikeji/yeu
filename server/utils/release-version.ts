import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'

export function readReleaseVersion(cwd = process.cwd()) {
  const path = resolve(cwd, process.env.NUXT_OUTPUT_DIR || '.output', 'release.json')
  const value = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
  if (typeof value.commit !== 'string' || !/^[0-9a-f]{40}$/.test(value.commit)
    || typeof value.release !== 'string' || !/^\d{8}-[a-z0-9-]+$/.test(value.release)
    || typeof value.builtAt !== 'string' || !Number.isFinite(Date.parse(value.builtAt))) throw new Error('发布元数据无效')
  return { commit: value.commit, release: value.release, builtAt: value.builtAt }
}
