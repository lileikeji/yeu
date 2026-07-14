import type { ProcedureAudience } from '~~/shared/constants/server'

export type ProcedureAudienceSelection = 'all' | ProcedureAudience

export function normalizeProcedureAudience(value: unknown): ProcedureAudienceSelection {
  const candidate = Array.isArray(value) ? value[0] : value
  return candidate === 'undergraduate' || candidate === 'transfer' ? candidate : 'all'
}

export function filterProcedureItemsForAudience<T extends { audience: ProcedureAudience[] }>(
  items: T[],
  audience: ProcedureAudienceSelection
): T[] {
  return audience === 'all'
    ? items
    : items.filter(item => item.audience.includes(audience))
}
