/**
 * 当前生效的金数据表单配置。
 *
 * 表单 token 与选项字段原本只来自 `.env`，换一场比赛就得改环境变量并重启。
 * 后台需要「新建表单 → 切换生效」这种操作，因此把这两项落到数据库同级的
 * `third-party-form.json`：读写都在运行时完成，不动 schema、不重启进程。
 * 环境变量仍是兜底来源，文件不存在时行为与以前完全一致。
 */

import { existsSync, mkdirSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'
import type { H3Event } from 'h3'

export interface ActiveFormConfig {
  formToken: string
  optionField: string
  updatedAt: number
}

const FILE_NAME = 'third-party-form.json'
export const DEFAULT_OPTION_FIELD = 'field_1'

function resolveDatabasePath(event?: H3Event): string {
  const runtimeConfig = useRuntimeConfig(event) as Record<string, unknown>
  const configured = typeof runtimeConfig.databasePath === 'string' ? runtimeConfig.databasePath : ''
  return configured || process.env.NUXT_DATABASE_PATH || './data/yeu.sqlite'
}

export function activeFormConfigPath(event?: H3Event): string {
  return join(dirname(resolveDatabasePath(event)), FILE_NAME)
}

export function readActiveFormConfig(event?: H3Event): ActiveFormConfig | null {
  const path = activeFormConfigPath(event)
  if (!existsSync(path)) return null
  try {
    const parsed = JSON.parse(readFileSync(path, 'utf8')) as Record<string, unknown>
    const formToken = typeof parsed.formToken === 'string' ? parsed.formToken.trim() : ''
    if (!formToken) return null
    const optionField = typeof parsed.optionField === 'string' && parsed.optionField.trim()
      ? parsed.optionField.trim()
      : DEFAULT_OPTION_FIELD
    return {
      formToken,
      optionField,
      updatedAt: typeof parsed.updatedAt === 'number' ? parsed.updatedAt : Date.now()
    }
  } catch {
    return null
  }
}

export function writeActiveFormConfig(
  config: { formToken: string, optionField?: string },
  event?: H3Event
): ActiveFormConfig {
  const path = activeFormConfigPath(event)
  const payload: ActiveFormConfig = {
    formToken: config.formToken.trim(),
    optionField: (config.optionField ?? DEFAULT_OPTION_FIELD).trim() || DEFAULT_OPTION_FIELD,
    updatedAt: Date.now()
  }
  mkdirSync(dirname(path), { recursive: true })
  writeFileSync(path, `${JSON.stringify(payload, null, 2)}\n`)
  return payload
}

export function clearActiveFormConfig(event?: H3Event): void {
  const path = activeFormConfigPath(event)
  if (existsSync(path)) rmSync(path)
}
