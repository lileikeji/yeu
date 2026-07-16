import type { ApiProcedure } from '~~/shared/types/server'
import type { ProcedureAudience } from '~~/shared/constants/server'
import type {
  ProcedureForm,
  ProcedureMaterialForm,
  ProcedureStepForm
} from '../components/admin/procedure-editor-types'
import { toDatetimeLocal } from './admin-procedure-form'

interface AudienceTarget {
  audience: ProcedureAudience[]
}

export function createAdminProcedureFormController(initialKey = 0) {
  let nextItemKey = initialKey

  function nextKey(): number {
    nextItemKey += 1
    return nextItemKey
  }

  function createEmptyStep(): ProcedureStepForm {
    return {
      key: nextKey(),
      title: '',
      description: '',
      audience: ['undergraduate', 'transfer'],
      informationState: 'awaiting-notice',
      timeText: '',
      placeId: '',
      departmentId: '',
      actionUrl: ''
    }
  }

  function createEmptyMaterial(): ProcedureMaterialForm {
    return {
      key: nextKey(),
      name: '',
      description: '',
      audience: ['undergraduate', 'transfer'],
      isRequired: null,
      informationState: 'awaiting-notice',
      placeId: '',
      departmentId: ''
    }
  }

  function createEmptyForm(): ProcedureForm {
    return {
      slug: '',
      title: '',
      summary: '',
      body: '',
      category: '',
      audience: ['undergraduate', 'transfer'],
      method: 'offline',
      informationState: 'awaiting-notice',
      statusText: '等待学校当年通知',
      processingTime: '',
      deadlineText: '',
      startsAt: '',
      endsAt: '',
      validFrom: '',
      validUntil: '',
      departmentId: '',
      guideId: '',
      lastVerifiedAt: '',
      sourceIds: [],
      placeIds: [],
      steps: [createEmptyStep()],
      materials: []
    }
  }

  function mapProcedureToForm(procedure: ApiProcedure): ProcedureForm {
    return {
      slug: procedure.slug,
      title: procedure.title,
      summary: procedure.summary,
      body: procedure.body,
      category: procedure.category ?? '',
      audience: [...procedure.audience],
      method: procedure.method,
      informationState: procedure.informationState,
      statusText: procedure.statusText,
      processingTime: procedure.processingTime ?? '',
      deadlineText: procedure.deadlineText ?? '',
      startsAt: toDatetimeLocal(procedure.startsAt),
      endsAt: toDatetimeLocal(procedure.endsAt),
      validFrom: toDatetimeLocal(procedure.validFrom),
      validUntil: toDatetimeLocal(procedure.validUntil),
      departmentId: procedure.department?.id ?? '',
      guideId: procedure.relatedGuide?.id ?? '',
      lastVerifiedAt: toDatetimeLocal(procedure.lastVerifiedAt),
      sourceIds: procedure.sources.map(item => item.id),
      placeIds: procedure.places.map(item => item.id),
      steps: procedure.steps.map(step => ({
        key: nextKey(),
        title: step.title,
        description: step.description,
        audience: [...step.audience],
        informationState: step.informationState,
        timeText: step.timeText ?? '',
        placeId: step.place?.id ?? '',
        departmentId: step.department?.id ?? '',
        actionUrl: step.actionUrl ?? ''
      })),
      materials: procedure.materials.map(material => ({
        key: nextKey(),
        name: material.name,
        description: material.description,
        audience: [...material.audience],
        isRequired: material.isRequired,
        informationState: material.informationState,
        placeId: material.place?.id ?? '',
        departmentId: material.department?.id ?? ''
      }))
    }
  }

  function resetForm(target: ProcedureForm): void {
    Object.assign(target, createEmptyForm())
  }

  function fillForm(target: ProcedureForm, procedure: ApiProcedure): void {
    Object.assign(target, mapProcedureToForm(procedure))
  }

  function toggleAudience(
    target: AudienceTarget,
    audience: ProcedureAudience,
    checked: boolean
  ): void {
    if (checked && !target.audience.includes(audience)) target.audience.push(audience)
    if (!checked) target.audience = target.audience.filter(item => item !== audience)
  }

  function addStep(form: ProcedureForm): void {
    form.steps.push(createEmptyStep())
  }

  function addMaterial(form: ProcedureForm): void {
    form.materials.push(createEmptyMaterial())
  }

  function removeItem<T>(items: T[], index: number): boolean {
    if (!Number.isInteger(index) || index < 0 || index >= items.length) return false
    items.splice(index, 1)
    return true
  }

  function moveItem<T>(items: T[], index: number, direction: -1 | 1): boolean {
    const targetIndex = index + direction
    if (!Number.isInteger(index) || index < 0 || targetIndex < 0 || targetIndex >= items.length) {
      return false
    }
    const [item] = items.splice(index, 1)
    if (item === undefined) return false
    items.splice(targetIndex, 0, item)
    return true
  }

  function setRequired(material: ProcedureMaterialForm, value: unknown): void {
    material.isRequired = value === 'required' ? true : value === 'optional' ? false : null
  }

  return {
    createEmptyStep,
    createEmptyMaterial,
    createEmptyForm,
    mapProcedureToForm,
    resetForm,
    fillForm,
    toggleAudience,
    addStep,
    addMaterial,
    removeStep: (form: ProcedureForm, index: number) => removeItem(form.steps, index),
    removeMaterial: (form: ProcedureForm, index: number) => removeItem(form.materials, index),
    moveStep: (form: ProcedureForm, index: number, direction: -1 | 1) => (
      moveItem(form.steps, index, direction)
    ),
    moveMaterial: (form: ProcedureForm, index: number, direction: -1 | 1) => (
      moveItem(form.materials, index, direction)
    ),
    setRequired
  }
}
