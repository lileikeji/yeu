import type { ApiNoticeAction } from '../types/server'
import { isSafePublicHttpUrl } from './public-http-url'

const NOTICE_ACTION_LABEL_MAX_LENGTH = 60
const NOTICE_ACTION_ICON_MAX_LENGTH = 80

export function isSafeLocalPagePath(value: string): boolean {
  if (!/^\/(?!\/)/.test(value) || value.includes('\\')) return false
  return !Array.from(value).some((character) => {
    const code = character.charCodeAt(0)
    return code <= 31 || code === 127
  })
}

export function safeNoticeActionHref(value: unknown): string | null {
  if (typeof value !== 'string') return null
  const trimmed = value.trim()
  if (!trimmed) return null
  if (isSafeLocalPagePath(trimmed)) return trimmed
  return isSafePublicHttpUrl(trimmed) ? trimmed : null
}

export function isExternalNoticeActionHref(value: string): boolean {
  return isSafePublicHttpUrl(value)
}

export function normalizeNoticeActions(value: unknown): ApiNoticeAction[] {
  if (!Array.isArray(value)) return []

  return value.flatMap((item): ApiNoticeAction[] => {
    if (!item || typeof item !== 'object' || Array.isArray(item)) return []
    const record = item as Record<string, unknown>
    const label = typeof record.label === 'string' ? record.label.trim() : ''
    const href = safeNoticeActionHref(record.href)
    if (!label || label.length > NOTICE_ACTION_LABEL_MAX_LENGTH || !href) return []
    const icon = typeof record.icon === 'string' && record.icon.trim().length <= NOTICE_ACTION_ICON_MAX_LENGTH
      ? record.icon.trim()
      : undefined
    return [{
      label,
      href,
      ...(icon ? { icon } : {})
    }]
  }).slice(0, 12)
}
