import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import type { ProcedureForm } from '../app/components/admin/procedure-editor-types'
import {
  buildProcedurePayload,
  toDatetimeLocal,
  toIsoOrNull,
  validateProcedureForm
} from '../app/utils/admin-procedure-form'
import { createProcedureSchema } from '../shared/schemas/server'

const departmentId = '11111111-1111-4111-8111-111111111111'
const guideId = '22222222-2222-4222-8222-222222222222'
const placeId = '33333333-3333-4333-8333-333333333333'
const sourceId = '44444444-4444-4444-8444-444444444444'

function validForm(): ProcedureForm {
  return {
    slug: 'arrival-registration',
    title: ' 新生到校报到 ',
    summary: ' 核对身份并完成报到。 ',
    body: ' 详细说明。 ',
    category: ' arrival ',
    audience: ['undergraduate', 'transfer'],
    method: 'offline',
    informationState: 'confirmed',
    statusText: ' 已确认 ',
    processingTime: ' 约 20 分钟 ',
    deadlineText: ' 当天完成 ',
    startsAt: '2026-08-30T08:00',
    endsAt: '2026-08-30T17:00',
    validFrom: '2026-08-01T00:00',
    validUntil: '2026-09-30T23:59',
    departmentId,
    guideId,
    lastVerifiedAt: '2026-07-16T08:00',
    sourceIds: [sourceId],
    placeIds: [placeId],
    steps: [{
      key: 1,
      title: ' 核验身份 ',
      description: ' 出示录取通知书。 ',
      audience: ['undergraduate', 'transfer'],
      informationState: 'confirmed',
      timeText: ' 约 5 分钟 ',
      placeId,
      departmentId,
      actionUrl: ' https://example.edu/arrival '
    }],
    materials: [{
      key: 2,
      name: ' 录取通知书 ',
      description: ' 携带原件。 ',
      audience: ['undergraduate'],
      isRequired: true,
      informationState: 'confirmed',
      placeId,
      departmentId
    }]
  }
}

test('procedure form validation preserves the complete user-facing error order', () => {
  const cases: Array<{ expected: string, mutate: (form: ProcedureForm) => void }> = [
    { expected: '请填写流程标题', mutate: (form) => { form.title = ' ' } },
    { expected: '请填写公开路径标识', mutate: (form) => { form.slug = '' } },
    { expected: '公开路径只能使用小写字母、数字和连字符', mutate: (form) => { form.slug = 'Arrival Registration' } },
    { expected: '请填写流程摘要', mutate: (form) => { form.summary = '' } },
    { expected: '请填写前台状态说明', mutate: (form) => { form.statusText = '' } },
    { expected: '流程至少需要选择一种适用人群', mutate: (form) => { form.audience = [] } },
    { expected: '流程至少需要一个步骤', mutate: (form) => { form.steps = [] } },
    { expected: '办理时间的结束时间不能早于开始时间', mutate: (form) => { form.endsAt = '2026-08-29T17:00' } },
    { expected: '公开有效期的结束时间不能早于开始时间', mutate: (form) => { form.validUntil = '2026-07-01T00:00' } },
    { expected: '请填写第 1 个步骤的标题', mutate: (form) => { form.steps[0]!.title = '' } },
    { expected: '第 1 个步骤至少需要选择一种适用人群', mutate: (form) => { form.steps[0]!.audience = [] } },
    { expected: '第 1 个步骤的办理链接必须是 http 或 https 地址', mutate: (form) => { form.steps[0]!.actionUrl = 'ftp://example.edu/file' } },
    { expected: '请填写第 1 项材料名称', mutate: (form) => { form.materials[0]!.name = '' } },
    { expected: '第 1 项材料至少需要选择一种适用人群', mutate: (form) => { form.materials[0]!.audience = [] } }
  ]

  assert.equal(validateProcedureForm(validForm()), null)
  for (const testCase of cases) {
    const form = validForm()
    testCase.mutate(form)
    assert.equal(validateProcedureForm(form), testCase.expected)
  }
})

test('procedure payload trims text, normalizes dates and satisfies the server create schema', () => {
  const form = validForm()
  const payload = buildProcedurePayload(form)

  assert.equal(payload.title, '新生到校报到')
  assert.equal(payload.summary, '核对身份并完成报到。')
  assert.equal(payload.category, 'arrival')
  assert.equal(payload.processingTime, '约 20 分钟')
  assert.equal(payload.startsAt, new Date(form.startsAt).toISOString())
  assert.deepEqual(payload.steps[0], {
    title: '核验身份',
    description: '出示录取通知书。',
    audience: ['undergraduate', 'transfer'],
    informationState: 'confirmed',
    timeText: '约 5 分钟',
    placeId,
    departmentId,
    actionUrl: 'https://example.edu/arrival'
  })
  assert.equal('key' in payload.steps[0]!, false)
  assert.doesNotThrow(() => createProcedureSchema.parse(payload))

  form.audience.pop()
  form.sourceIds.length = 0
  form.steps[0]!.audience.length = 0
  assert.deepEqual(payload.audience, ['undergraduate', 'transfer'])
  assert.deepEqual(payload.sourceIds, [sourceId])
  assert.deepEqual(payload.steps[0]!.audience, ['undergraduate', 'transfer'])
})

test('blank optional fields become null and invalid date input does not leak into payload', () => {
  const form = validForm()
  form.category = ' '
  form.processingTime = ''
  form.deadlineText = ' '
  form.startsAt = 'invalid'
  form.endsAt = ''
  form.validFrom = ''
  form.validUntil = ''
  form.departmentId = ''
  form.guideId = ''
  form.lastVerifiedAt = ''
  form.steps[0]!.timeText = ' '
  form.steps[0]!.placeId = ''
  form.steps[0]!.departmentId = ''
  form.steps[0]!.actionUrl = ' '
  form.materials[0]!.placeId = ''
  form.materials[0]!.departmentId = ''

  const payload = buildProcedurePayload(form)
  assert.deepEqual({
    category: payload.category,
    processingTime: payload.processingTime,
    deadlineText: payload.deadlineText,
    startsAt: payload.startsAt,
    endsAt: payload.endsAt,
    validFrom: payload.validFrom,
    validUntil: payload.validUntil,
    departmentId: payload.departmentId,
    guideId: payload.guideId,
    lastVerifiedAt: payload.lastVerifiedAt
  }, {
    category: null,
    processingTime: null,
    deadlineText: null,
    startsAt: null,
    endsAt: null,
    validFrom: null,
    validUntil: null,
    departmentId: null,
    guideId: null,
    lastVerifiedAt: null
  })
  assert.equal(payload.steps[0]!.actionUrl, null)
  assert.equal(payload.materials[0]!.placeId, null)
})

test('date helpers handle empty, invalid and timezone-aware values', () => {
  assert.equal(toDatetimeLocal(null), '')
  assert.equal(toDatetimeLocal('invalid'), '')
  assert.equal(toIsoOrNull(''), null)
  assert.equal(toIsoOrNull('invalid'), null)

  const source = '2026-07-16T00:30:00.000Z'
  const date = new Date(source)
  const expectedLocal = new Date(date.getTime() - date.getTimezoneOffset() * 60_000)
    .toISOString()
    .slice(0, 16)
  assert.equal(toDatetimeLocal(source), expectedLocal)
  assert.equal(toIsoOrNull(expectedLocal), new Date(expectedLocal).toISOString())
})

test('procedure page delegates validation and payload building to the pure utility', () => {
  const page = readFileSync(resolve('app/pages/admin/procedures.vue'), 'utf8')
  const utility = readFileSync(resolve('app/utils/admin-procedure-form.ts'), 'utf8')
  const operations = readFileSync(resolve('app/utils/admin-procedure-operations.ts'), 'utf8')
  const catalog = readFileSync(resolve('app/utils/admin-procedure-catalog.ts'), 'utf8')

  assert.match(page, /useAdminProcedureOperations\(\{/)
  assert.match(operations, /validateProcedureForm\(options\.form\)/)
  assert.match(operations, /buildProcedurePayload\(options\.form\)/)
  assert.match(operations, /from '\.\/admin-procedure-form'/)
  assert.doesNotMatch(page, /function validateForm|function buildPayload|function validateDateRange|function isHttpUrl/)
  assert.doesNotMatch(page, /async function (openEdit|saveProcedure|runRowAction|deleteProcedure)/)
  assert.doesNotMatch(page, /async function (fetchAll|loadReferences|loadProcedures)|function buildListQuery/)
  assert.doesNotMatch(utility, /\$fetch|useRoute|useRouter|ref\(|reactive\(/)
  assert.doesNotMatch(catalog, /\$fetch|useRoute|useRouter|ref\(|reactive\(/)
})
