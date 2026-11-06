// 给前端判断"线上是不是已经换了新版本"。只回构建标识，不含任何环境信息。
import { readFile } from 'node:fs/promises'
import { setPublicCache } from '../../utils/http'
import { resolve } from 'node:path'

interface ReleaseFile {
  commit?: string
  release?: string
  builtAt?: string
}

async function readRelease(): Promise<ReleaseFile> {
  const candidates = [
    resolve(process.cwd(), '.output/release.json'),
    resolve(process.cwd(), 'release.json')
  ]
  for (const path of candidates) {
    try {
      return JSON.parse(await readFile(path, 'utf8')) as ReleaseFile
    } catch {
      continue
    }
  }
  return {}
}

export default defineEventHandler(async (event) => {
  setHeader(event, 'Cache-Control', 'no-store')
  const release = await readRelease()
  // 数据准备成功后才允许短缓存：构建标识变了前端才知道要刷新。
  setPublicCache(event, 30)
  return {
    commit: process.env.NUXT_BUILD_COMMIT ?? release.commit ?? 'dev',
    release: process.env.NUXT_BUILD_RELEASE ?? release.release ?? 'dev',
    builtAt: release.builtAt ?? null
  }
})
