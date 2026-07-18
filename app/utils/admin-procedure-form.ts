import type { ProcedureForm } from '~/components/admin/procedure-editor-types'

export function toDatetimeLocal(value: string | null): string {
  if (!value) return ''
  const date = new Date(value)
  if (Number.isNaN(date.getTime())) return ''
  const localTime = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
  return localTime.toISOString().slice(0, 16)
}

export function toIsoOrNull(value: string): string | null {
  if (!value) return null
  const date = new Date(value)
  return Number.isNaN(date.getTime()) ? null : date.toISOString()
}

function validateDateRange(start: string, end: string, label: string): string | null {
  if (!start || !end) return null
  if (new Date(end).getTime() >= new Date(start).getTime()) return null
  return `${label}的结束时间不能早于开始时间`
}

function isHttpUrl(value: string): boolean {
  if (!value) return true
  try {
    const url = new URL(value)
    return url.protocol === 'http:' || url.protocol === 'https:'
  } catch {
    return false
  }
}

export function validateProcedureForm(form: ProcedureForm): string | null {
  if (!form.title.trim()) return '请填写流程标题'
  if (!form.slug.trim()) return '请填写网页地址名称'
  if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(form.slug.trim())) return '公开路径只能使用小写字母、数字和连字符'
  if (!form.summary.trim()) return '请填写流程摘要'
  if (!form.statusText.trim()) return '请填写前台状态说明'
  if (form.audience.length === 0) return '流程至少需要选择一种适用人群'
  if (form.steps.length === 0) return '流程至少需要一个步骤'

  const scheduleError = validateDateRange(form.startsAt, form.endsAt, '办理时间')
  if (scheduleError) return scheduleError
  const validityError = validateDateRange(form.validFrom, form.validUntil, '公开有效期')
  if (validityError) return validityError

  for (const [index, step] of form.steps.entries()) {
    if (!step.title.trim()) return `请填写第 ${index + 1} 个步骤的标题`
    if (step.audience.length === 0) return `第 ${index + 1} 个步骤至少需要选择一种适用人群`
    if (!isHttpUrl(step.actionUrl.trim())) return `第 ${index + 1} 个步骤的办理链接必须是 http 或 https 地址`
  }

  for (const [index, material] of form.materials.entries()) {
    if (!material.name.trim()) return `请填写第 ${index + 1} 项材料名称`
    if (material.audience.length === 0) return `第 ${index + 1} 项材料至少需要选择一种适用人群`
  }

  return null
}

export function buildProcedurePayload(form: ProcedureForm) {
  return {
    slug: form.slug.trim(),
    title: form.title.trim(),
    summary: form.summary.trim(),
    body: form.body.trim(),
    category: form.category.trim() || null,
    audience: [...form.audience],
    method: form.method,
    informationState: form.informationState,
    statusText: form.statusText.trim(),
    processingTime: form.processingTime.trim() || null,
    deadlineText: form.deadlineText.trim() || null,
    startsAt: toIsoOrNull(form.startsAt),
    endsAt: toIsoOrNull(form.endsAt),
    validFrom: toIsoOrNull(form.validFrom),
    validUntil: toIsoOrNull(form.validUntil),
    departmentId: form.departmentId || null,
    guideId: form.guideId || null,
    lastVerifiedAt: toIsoOrNull(form.lastVerifiedAt),
    sourceIds: [...form.sourceIds],
    placeIds: [...form.placeIds],
    steps: form.steps.map(step => ({
      title: step.title.trim(),
      description: step.description.trim(),
      audience: [...step.audience],
      informationState: step.informationState,
      timeText: step.timeText.trim() || null,
      placeId: step.placeId || null,
      departmentId: step.departmentId || null,
      actionUrl: step.actionUrl.trim() || null
    })),
    materials: form.materials.map(material => ({
      name: material.name.trim(),
      description: material.description.trim(),
      audience: [...material.audience],
      isRequired: material.isRequired,
      informationState: material.informationState,
      placeId: material.placeId || null,
      departmentId: material.departmentId || null
    }))
  }
}
