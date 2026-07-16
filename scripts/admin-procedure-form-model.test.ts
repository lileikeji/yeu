import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import type { ApiProcedure } from '../shared/types/server'
import { createAdminProcedureFormController } from '../app/utils/admin-procedure-form-model'
import { toDatetimeLocal } from '../app/utils/admin-procedure-form'

function procedure(): ApiProcedure {
  return {
    id: 'procedure-id',
    slug: 'arrival',
    title: '到校报到',
    summary: '完成身份核验',
    body: '详细说明',
    category: null,
    audience: ['undergraduate'],
    method: 'offline',
    informationState: 'confirmed',
    statusText: '已确认',
    processingTime: null,
    deadlineText: null,
    startsAt: '2026-08-30T00:00:00.000Z',
    endsAt: null,
    validFrom: null,
    validUntil: null,
    department: { id: 'department-id' },
    relatedGuide: { id: 'guide-id' },
    lastVerifiedAt: '2026-07-16T00:00:00.000Z',
    sources: [{ id: 'source-id' }],
    places: [{ id: 'place-id' }],
    steps: [{
      title: '核验身份',
      description: '出示材料',
      audience: ['undergraduate'],
      informationState: 'confirmed',
      timeText: null,
      place: { id: 'step-place' },
      department: { id: 'step-department' },
      actionUrl: null
    }],
    materials: [{
      name: '录取通知书',
      description: '携带原件',
      audience: ['undergraduate', 'transfer'],
      isRequired: true,
      informationState: 'confirmed',
      place: null,
      department: null
    }]
  } as ApiProcedure
}

test('empty forms use stable defaults and monotonically unique item keys', () => {
  const controller = createAdminProcedureFormController(10)
  const form = controller.createEmptyForm()
  assert.equal(form.statusText, '等待学校当年通知')
  assert.equal(form.method, 'offline')
  assert.deepEqual(form.audience, ['undergraduate', 'transfer'])
  assert.equal(form.steps[0]?.key, 11)

  controller.addStep(form)
  controller.addMaterial(form)
  assert.deepEqual([
    ...form.steps.map(item => item.key),
    ...form.materials.map(item => item.key)
  ], [11, 12, 13])

  form.title = '会被清空'
  controller.resetForm(form)
  assert.equal(form.title, '')
  assert.equal(form.steps.length, 1)
  assert.equal(form.steps[0]?.key, 14)
  assert.deepEqual(form.materials, [])
})

test('API details map nullable relations, dates and nested arrays into an isolated form', () => {
  const controller = createAdminProcedureFormController()
  const detail = procedure()
  const form = controller.mapProcedureToForm(detail)

  assert.equal(form.category, '')
  assert.equal(form.processingTime, '')
  assert.equal(form.startsAt, toDatetimeLocal(detail.startsAt))
  assert.equal(form.endsAt, '')
  assert.equal(form.departmentId, 'department-id')
  assert.equal(form.guideId, 'guide-id')
  assert.deepEqual(form.sourceIds, ['source-id'])
  assert.deepEqual(form.placeIds, ['place-id'])
  assert.deepEqual(form.steps[0], {
    key: 1,
    title: '核验身份',
    description: '出示材料',
    audience: ['undergraduate'],
    informationState: 'confirmed',
    timeText: '',
    placeId: 'step-place',
    departmentId: 'step-department',
    actionUrl: ''
  })
  assert.equal(form.materials[0]?.key, 2)
  assert.equal(form.materials[0]?.placeId, '')

  form.audience.push('transfer')
  form.steps[0]!.audience.push('transfer')
  form.materials[0]!.audience.length = 0
  assert.deepEqual(detail.audience, ['undergraduate'])
  assert.deepEqual(detail.steps[0]?.audience, ['undergraduate'])
  assert.deepEqual(detail.materials[0]?.audience, ['undergraduate', 'transfer'])

  const next = controller.createEmptyStep()
  assert.equal(next.key, 3)
})

test('audience toggles are idempotent and remove every duplicate', () => {
  const controller = createAdminProcedureFormController()
  const target = { audience: ['undergraduate'] as Array<'undergraduate' | 'transfer'> }

  controller.toggleAudience(target, 'undergraduate', true)
  controller.toggleAudience(target, 'transfer', true)
  controller.toggleAudience(target, 'transfer', true)
  assert.deepEqual(target.audience, ['undergraduate', 'transfer'])

  target.audience.push('transfer')
  controller.toggleAudience(target, 'transfer', false)
  assert.deepEqual(target.audience, ['undergraduate'])
})

test('move and remove operations reject invalid indexes without changing arrays', () => {
  const controller = createAdminProcedureFormController()
  const form = controller.createEmptyForm()
  controller.addStep(form)
  controller.addStep(form)
  const originalKeys = form.steps.map(item => item.key)

  assert.equal(controller.moveStep(form, 0, -1), false)
  assert.equal(controller.moveStep(form, 2, 1), false)
  assert.equal(controller.removeStep(form, -1), false)
  assert.equal(controller.removeStep(form, 4), false)
  assert.deepEqual(form.steps.map(item => item.key), originalKeys)

  assert.equal(controller.moveStep(form, 2, -1), true)
  assert.deepEqual(form.steps.map(item => item.key), [originalKeys[0], originalKeys[2], originalKeys[1]])
  assert.equal(controller.removeStep(form, 1), true)
  assert.deepEqual(form.steps.map(item => item.key), [originalKeys[0], originalKeys[1]])
})

test('material requirement options map to the intended tri-state value', () => {
  const controller = createAdminProcedureFormController()
  const material = controller.createEmptyMaterial()

  controller.setRequired(material, 'required')
  assert.equal(material.isRequired, true)
  controller.setRequired(material, 'optional')
  assert.equal(material.isRequired, false)
  controller.setRequired(material, 'unknown')
  assert.equal(material.isRequired, null)
  controller.setRequired(material, { unexpected: true })
  assert.equal(material.isRequired, null)
})

test('procedure page delegates form state and item mutations to the model composable', () => {
  const page = readFileSync(resolve('app/pages/admin/procedures.vue'), 'utf8')
  const composable = readFileSync(resolve('app/composables/useAdminProcedureFormModel.ts'), 'utf8')
  const controller = readFileSync(resolve('app/utils/admin-procedure-form-model.ts'), 'utf8')

  assert.match(page, /useAdminProcedureFormModel\(\)/)
  assert.doesNotMatch(page, /function (emptyStep|emptyMaterial|emptyForm|fillForm|moveItem)/)
  assert.match(composable, /createAdminProcedureFormController\(\)/)
  assert.doesNotMatch(controller, /\$fetch|useRoute|useRouter|reactive\(|computed\(/)
})
