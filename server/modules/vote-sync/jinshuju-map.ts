/**
 * 把金数据的表单条目归一化成统一的投票行。
 *
 * 金数据的字段形态有两种：`"值"` 与 `{ label, value }`（带 include_labels 时）。
 * 时间字段是 UTC ISO 字符串，IP / 平台 / 填写时长由金数据自己采集。
 */

import type { ThirdPartyVoteRow } from './risk'

export interface JinshujuMapOptions {
  /** 存放投票选项的字段 api_code，例如 field_3 */
  optionField: string
}

function asRecord(value: unknown): Record<string, unknown> | null {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return null
  return value as Record<string, unknown>
}

function readScalar(value: unknown): string | null {
  if (typeof value === 'string') {
    const trimmed = value.trim()
    return trimmed.length > 0 ? trimmed : null
  }
  if (typeof value === 'number' && Number.isFinite(value)) return String(value)
  const record = asRecord(value)
  if (record) {
    const inner = record.value ?? record.label
    if (inner !== undefined) return readScalar(inner)
  }
  return null
}

function readTimestamp(entry: Record<string, unknown>): number | null {
  for (const key of ['created_at', 'updated_at'] as const) {
    const raw = readScalar(entry[key])
    if (!raw) continue
    const parsed = Date.parse(raw)
    if (Number.isFinite(parsed)) return parsed
  }
  return null
}

function readFillSeconds(entry: Record<string, unknown>): number | null {
  const raw = entry.info_filling_duration
  if (typeof raw === 'number' && Number.isFinite(raw)) return raw
  const scalar = readScalar(raw)
  if (scalar === null) return null
  const parsed = Number(scalar)
  return Number.isFinite(parsed) ? parsed : null
}

function buildUaSummary(entry: Record<string, unknown>): string | null {
  const platform = readScalar(entry.info_platform)
  const os = readScalar(entry.info_os)
  if (platform && os) return `${platform}/${os}`
  return platform ?? os ?? readScalar(entry.info_browser)
}

export function normalizeJinshujuEntry(
  entry: unknown,
  options: JinshujuMapOptions
): ThirdPartyVoteRow | null {
  const record = asRecord(entry)
  if (!record) return null

  const optionId = readScalar(record[options.optionField])
  if (!optionId) return null

  const votedAt = readTimestamp(record)
  if (votedAt === null) return null

  const token = readScalar(record.token)
  const serial = readScalar(record.serial_number)
  const recordId = token ?? (serial ? `sn_${serial}` : null)
  if (!recordId) return null

  return {
    recordId,
    optionId,
    voterRef: readScalar(record.creator_name),
    ip: readScalar(record.info_remote_ip),
    uaSummary: buildUaSummary(record),
    votedAt,
    uaFingerprint: null,
    fillSeconds: readFillSeconds(record)
  }
}
