import type { GeoPoint } from '~~/map/core/types'
import type {
  AdminFieldDefinition,
  AdminFormValue,
  AdminRecord
} from '~/components/admin/types'
import {
  isAdminRecord,
  readAdminRecordPath
} from './admin-resource-presentation'

export type AdminResourceFormState = Record<string, AdminFormValue>

export interface AdminResourceFieldGroup {
  label: string
  fields: AdminFieldDefinition[]
}

export function getVisibleAdminResourceFields(
  fields: AdminFieldDefinition[],
  state: AdminResourceFormState
): AdminFieldDefinition[] {
  return fields.filter((field) => {
    if (!field.condition) return true
    return field.condition.values.includes(state[field.condition.key] ?? null)
  })
}

export function groupAdminResourceFields(
  fields: AdminFieldDefinition[]
): AdminResourceFieldGroup[] {
  const groups = new Map<string, AdminFieldDefinition[]>()

  for (const field of fields) {
    const group = field.group || '基本信息'
    const groupedFields = groups.get(group) ?? []
    groupedFields.push(field)
    groups.set(group, groupedFields)
  }

  return [...groups.entries()].map(([label, groupedFields]) => ({
    label,
    fields: groupedFields
  }))
}

export function getAdminResourceInputValue(
  state: AdminResourceFormState,
  key: string
): string {
  const value = state[key]
  return typeof value === 'string' || typeof value === 'number' ? String(value) : ''
}

export function getAdminResourceSelectValue(
  state: AdminResourceFormState,
  key: string
): string | undefined {
  const value = state[key]
  return typeof value === 'string' ? value : undefined
}

export function getAdminResourceCheckboxValue(
  state: AdminResourceFormState,
  key: string
): boolean {
  return state[key] === true
}

export function getAdminResourceCoordinateNumber(
  state: AdminResourceFormState,
  key: 'longitude' | 'latitude'
): number | null {
  const value = state[key]
  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || value.trim() === '') return null

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function getAdminResourceCoordinateSystem(
  state: AdminResourceFormState
): string | null {
  const value = state.coordinateSystem
  return typeof value === 'string' && value ? value : null
}

function normalizeCoordinateFormValue(
  key: 'longitude' | 'latitude' | 'coordinateSystem',
  value: AdminFormValue
): number | string | null {
  if (key === 'coordinateSystem') {
    return typeof value === 'string' && value ? value : null
  }

  if (typeof value === 'number' && Number.isFinite(value)) return value
  if (typeof value !== 'string' || value.trim() === '') return null

  const parsed = Number(value)
  return Number.isFinite(parsed) ? parsed : null
}

export function setAdminResourceFormValue(
  state: AdminResourceFormState,
  resourceKey: string,
  key: string,
  value: unknown
): void {
  const previousValue = state[key] ?? null

  if (typeof value === 'string'
    || typeof value === 'number'
    || typeof value === 'boolean'
    || value === null) {
    state[key] = value
  } else if (value === undefined) {
    state[key] = null
  }

  if (resourceKey !== 'places'
    || (key !== 'longitude' && key !== 'latitude' && key !== 'coordinateSystem')) {
    return
  }

  const nextValue = state[key] ?? null
  if (normalizeCoordinateFormValue(key, previousValue)
    === normalizeCoordinateFormValue(key, nextValue)) {
    return
  }

  const hasCompleteCoordinates = getAdminResourceCoordinateNumber(state, 'longitude') !== null
    && getAdminResourceCoordinateNumber(state, 'latitude') !== null
    && getAdminResourceCoordinateSystem(state) !== null

  state.coordinateVerification = hasCompleteCoordinates ? 'unverified' : 'missing'
  state.coordinateVerifiedAt = null
}

export function applyAdminResourceCoordinatePoint(
  state: AdminResourceFormState,
  point: GeoPoint
): void {
  state.longitude = Number(point.lng.toFixed(7))
  state.latitude = Number(point.lat.toFixed(7))
  state.coordinateSystem = point.crs
  state.coordinateVerification = 'unverified'
  state.coordinateVerifiedAt = null
}

export function clearAdminResourceCoordinates(state: AdminResourceFormState): void {
  state.longitude = null
  state.latitude = null
  state.coordinateSystem = null
  state.coordinateVerification = 'missing'
  state.coordinateVerifiedAt = null
}

export function toAdminResourceInputDate(
  value: unknown,
  includeTime: boolean
): AdminFormValue {
  if (typeof value !== 'string' && typeof value !== 'number') return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return String(value)

  if (!includeTime) return date.toISOString().slice(0, 10)
  const offset = date.getTimezoneOffset() * 60_000
  return new Date(date.getTime() - offset).toISOString().slice(0, 16)
}

export function getAdminResourceSourceIdsValue(record: AdminRecord): string {
  const direct = readAdminRecordPath(record, 'sourceIds')
  if (Array.isArray(direct)) {
    return direct.filter(value => typeof value === 'string').join('\n')
  }

  const sources = Array.isArray(record.sources) ? record.sources : []
  return sources
    .filter(isAdminRecord)
    .map(source => source.id)
    .filter((value): value is string => typeof value === 'string')
    .join('\n')
}

export function serializeAdminResourceJsonField(value: unknown): string {
  if (value === undefined || value === null || value === '') return ''
  if (typeof value === 'string') return value
  return JSON.stringify(value, null, 2)
}

export function initializeAdminResourceForm(
  state: AdminResourceFormState,
  fields: AdminFieldDefinition[],
  record: AdminRecord | null
): void {
  for (const key of Object.keys(state)) Reflect.deleteProperty(state, key)

  for (const field of fields) {
    let value = record ? readAdminRecordPath(record, field.key) : undefined
    if (value === undefined && record && field.key === 'sourceIds') {
      value = getAdminResourceSourceIdsValue(record)
    }
    if (value === undefined && record && field.key === 'metadata.groupQrUrls') {
      const legacyValue = readAdminRecordPath(record, 'metadata.groupQrUrl')
      value = typeof legacyValue === 'string' && legacyValue.trim() ? [legacyValue.trim()] : []
    }
    if (value === undefined && record && field.key === 'metadata.contactPhones') {
      const legacyValue = readAdminRecordPath(record, 'metadata.contactPhone')
      value = typeof legacyValue === 'string' && legacyValue.trim() ? [legacyValue.trim()] : []
    }
    if (value === undefined) {
      value = field.defaultValue ?? (field.type === 'checkbox' ? false : '')
    }

    if (field.type === 'date') value = toAdminResourceInputDate(value, false)
    if (field.type === 'datetime-local') value = toAdminResourceInputDate(value, true)
    if (field.type === 'json') value = serializeAdminResourceJsonField(value)
    if ((field.type === 'image-list' || field.type === 'tel-list') && Array.isArray(value)) {
      value = value.filter(item => typeof item === 'string').join('\n')
    }

    if (typeof value === 'string'
      || typeof value === 'number'
      || typeof value === 'boolean'
      || value === null) {
      state[field.key] = value
    } else {
      state[field.key] = ''
    }
  }
}

export function normalizeAdminResourceFieldValue(
  field: AdminFieldDefinition,
  value: AdminFormValue
): unknown {
  if (field.key === 'sourceIds') {
    if (typeof value !== 'string') return []
    return [...new Set(value.split(/[\s,]+/).map(item => item.trim()).filter(Boolean))]
  }

  if (field.type === 'number') {
    if (value === '' || value === null) return null
    const numberValue = Number(value)
    return Number.isFinite(numberValue) ? numberValue : null
  }

  if ((field.type === 'date' || field.type === 'datetime-local')
    && (value === '' || value === null)) {
    return null
  }

  if ((field.type === 'date' || field.type === 'datetime-local')
    && typeof value === 'string') {
    const date = new Date(value)
    return Number.isNaN(date.getTime()) ? value : date.toISOString()
  }

  if (field.type === 'select' && value === '') return null

  if (field.type === 'json') {
    if (typeof value !== 'string' || value.trim() === '') return null
    try {
      return JSON.parse(value)
    } catch {
      throw new Error(`${field.label}格式不正确，请检查括号、引号和逗号。`)
    }
  }

  if (field.type === 'image-list' || field.type === 'tel-list') {
    if (typeof value !== 'string') return []
    return [...new Set(value
      .split('\n')
      .map(item => item.trim())
      .filter(Boolean))]
  }

  return value
}

export function writeAdminResourcePath(
  record: AdminRecord,
  key: string,
  value: unknown
): void {
  const parts = key.split('.')
  let current = record

  for (const part of parts.slice(0, -1)) {
    const child = current[part]
    if (isAdminRecord(child)) {
      current = child
      continue
    }

    const next: AdminRecord = {}
    current[part] = next
    current = next
  }

  current[parts.at(-1)!] = value
}

export function buildAdminResourcePayload(
  fields: AdminFieldDefinition[],
  state: AdminResourceFormState
): AdminRecord {
  const payload: AdminRecord = {}

  for (const field of fields) {
    const value = normalizeAdminResourceFieldValue(field, state[field.key] ?? null)
    writeAdminResourcePath(payload, field.key, value)
  }

  return payload
}

export function validateAdminResourceForm(
  fields: AdminFieldDefinition[],
  state: AdminResourceFormState
): string | null {
  for (const field of fields) {
    if (!field.required) continue
    const value = state[field.key]
    if (value === '' || value === null || value === undefined) return `请填写${field.label}`
  }
  return null
}
