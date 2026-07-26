import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import type {
  AdminFieldDefinition,
  AdminFormValue,
  AdminRecord
} from '../app/components/admin/types'
import {
  applyAdminResourceCoordinatePoint,
  buildAdminResourcePayload,
  clearAdminResourceCoordinates,
  getAdminResourceCheckboxValue,
  getAdminResourceCoordinateNumber,
  getAdminResourceCoordinateSystem,
  getAdminResourceInputValue,
  getAdminResourceSelectValue,
  getVisibleAdminResourceFields,
  groupAdminResourceFields,
  initializeAdminResourceForm,
  normalizeAdminResourceFieldValue,
  setAdminResourceFormValue,
  validateAdminResourceForm
} from '../app/utils/admin-resource-form'

type FormState = Record<string, AdminFormValue>

function field(
  key: string,
  type?: AdminFieldDefinition['type'],
  overrides: Partial<AdminFieldDefinition> = {}
): AdminFieldDefinition {
  return { key, label: key, type, ...overrides }
}

test('conditional fields and groups follow the current form state', () => {
  const fields = [
    field('title', 'text', { group: '基本' }),
    field('kind', 'select', { group: '基本' }),
    field('details', 'textarea', {
      group: '详情',
      condition: { key: 'kind', values: ['guide'] }
    })
  ]
  const hidden = getVisibleAdminResourceFields(fields, { kind: 'department' })
  const visible = getVisibleAdminResourceFields(fields, { kind: 'guide' })

  assert.deepEqual(hidden.map(item => item.key), ['title', 'kind'])
  assert.deepEqual(visible.map(item => item.key), ['title', 'kind', 'details'])
  assert.deepEqual(groupAdminResourceFields(visible).map(group => ({
    label: group.label,
    keys: group.fields.map(item => item.key)
  })), [
    { label: '基本', keys: ['title', 'kind'] },
    { label: '详情', keys: ['details'] }
  ])
})

test('input accessors preserve string, select, checkbox and coordinate semantics', () => {
  const state: FormState = {
    name: 42,
    status: 'draft',
    enabled: true,
    longitude: '118.6001',
    latitude: 24.9,
    coordinateSystem: 'WGS84'
  }
  assert.equal(getAdminResourceInputValue(state, 'name'), '42')
  assert.equal(getAdminResourceSelectValue(state, 'status'), 'draft')
  assert.equal(getAdminResourceCheckboxValue(state, 'enabled'), true)
  assert.equal(getAdminResourceCoordinateNumber(state, 'longitude'), 118.6001)
  assert.equal(getAdminResourceCoordinateNumber(state, 'latitude'), 24.9)
  assert.equal(getAdminResourceCoordinateSystem(state), 'WGS84')
})

test('place coordinate changes clear verification while equivalent values do not', () => {
  const state: FormState = {
    longitude: 118.6,
    latitude: 24.9,
    coordinateSystem: 'WGS84',
    coordinateVerification: 'verified',
    coordinateVerifiedAt: '2026-07-16T08:30:00.000Z'
  }

  setAdminResourceFormValue(state, 'places', 'longitude', '118.6000')
  assert.equal(state.coordinateVerification, 'verified')
  assert.equal(state.coordinateVerifiedAt, '2026-07-16T08:30:00.000Z')

  setAdminResourceFormValue(state, 'places', 'longitude', 118.61)
  assert.equal(state.coordinateVerification, 'unverified')
  assert.equal(state.coordinateVerifiedAt, null)

  state.coordinateVerification = 'verified'
  state.coordinateVerifiedAt = 'reviewed'
  setAdminResourceFormValue(state, 'places', 'latitude', '')
  assert.equal(state.coordinateVerification, 'missing')
  assert.equal(state.coordinateVerifiedAt, null)

  const contentState: FormState = { longitude: 1, coordinateVerification: 'verified' }
  setAdminResourceFormValue(contentState, 'content', 'longitude', 2)
  assert.equal(contentState.coordinateVerification, 'verified')
})

test('coordinate picker rounds values and clear resets every coordinate field', () => {
  const state: FormState = { coordinateVerifiedAt: 'old' }
  applyAdminResourceCoordinatePoint(state, {
    lng: 118.603456789,
    lat: 24.912345678,
    crs: 'WGS84'
  })
  assert.deepEqual(state, {
    longitude: 118.6034568,
    latitude: 24.9123457,
    coordinateSystem: 'WGS84',
    coordinateVerification: 'unverified',
    coordinateVerifiedAt: null
  })

  clearAdminResourceCoordinates(state)
  assert.deepEqual(state, {
    longitude: null,
    latitude: null,
    coordinateSystem: null,
    coordinateVerification: 'missing',
    coordinateVerifiedAt: null
  })
})

test('form initialization applies defaults, nested values, sources and JSON text', () => {
  const fields = [
    field('title', 'text'),
    field('enabled', 'checkbox'),
    field('profile.summary', 'text'),
    field('sourceIds', 'textarea'),
    field('metadata', 'json'),
    field('publishedAt', 'date')
  ]
  const state: FormState = { stale: 'remove-me' }
  const record: AdminRecord = {
    title: '记录',
    profile: { summary: '嵌套摘要' },
    sources: [{ id: 'source-a' }, { id: 'source-b' }, { id: 3 }],
    metadata: { audience: 'freshman' },
    publishedAt: '2026-07-16T08:30:00.000Z'
  }

  initializeAdminResourceForm(state, fields, record)
  assert.equal(state.stale, undefined)
  assert.equal(state.title, '记录')
  assert.equal(state.enabled, false)
  assert.equal(state['profile.summary'], '嵌套摘要')
  assert.equal(state.sourceIds, 'source-a\nsource-b')
  assert.match(String(state.metadata), /"audience": "freshman"/)
  assert.equal(state.publishedAt, '2026-07-16')
})

test('multi-value community fields preserve arrays and migrate legacy singular metadata', () => {
  const fields = [
    field('metadata.groupQrUrls', 'image-list'),
    field('metadata.contactQrUrls', 'image-list'),
    field('metadata.contactPhones', 'tel-list')
  ]
  const state: FormState = {}
  initializeAdminResourceForm(state, fields, {
    metadata: {
      groupQrUrl: '/uploads/123e4567-e89b-42d3-a456-426614174000.png',
      contactQrUrl: '/uploads/123e4567-e89b-42d3-a456-426614174002.jpg',
      contactPhone: '13800000000'
    }
  })

  assert.equal(state['metadata.groupQrUrls'], '/uploads/123e4567-e89b-42d3-a456-426614174000.png')
  assert.equal(state['metadata.contactQrUrls'], '/uploads/123e4567-e89b-42d3-a456-426614174002.jpg')
  assert.equal(state['metadata.contactPhones'], '13800000000')

  state['metadata.groupQrUrls'] = '/uploads/123e4567-e89b-42d3-a456-426614174000.png\n/uploads/123e4567-e89b-42d3-a456-426614174001.webp'
  state['metadata.contactQrUrls'] = '/uploads/123e4567-e89b-42d3-a456-426614174002.jpg\n/uploads/123e4567-e89b-42d3-a456-426614174003.png'
  state['metadata.contactPhones'] = '13800000000\n0595-12345678\n13800000000'
  const payload = buildAdminResourcePayload(fields, state)
  assert.deepEqual(payload.metadata, {
    groupQrUrls: [
      '/uploads/123e4567-e89b-42d3-a456-426614174000.png',
      '/uploads/123e4567-e89b-42d3-a456-426614174001.webp'
    ],
    contactQrUrls: [
      '/uploads/123e4567-e89b-42d3-a456-426614174002.jpg',
      '/uploads/123e4567-e89b-42d3-a456-426614174003.png'
    ],
    contactPhones: ['13800000000', '0595-12345678']
  })
})

test('payload normalization handles dedupe, numbers, dates, select and nested JSON', () => {
  const fields = [
    field('sourceIds', 'textarea'),
    field('priority', 'number'),
    field('status', 'select'),
    field('validFrom', 'datetime-local'),
    field('profile.metadata', 'json')
  ]
  const state: FormState = {
    'sourceIds': 'a, b\na',
    'priority': '12.5',
    'status': '',
    'validFrom': '2026-07-16T08:30',
    'profile.metadata': '{"enabled":true}'
  }
  const payload = buildAdminResourcePayload(fields, state)

  assert.deepEqual(payload.sourceIds, ['a', 'b'])
  assert.equal(payload.priority, 12.5)
  assert.equal(payload.status, null)
  assert.match(String(payload.validFrom), /^2026-07-16T/)
  assert.deepEqual(payload.profile, { metadata: { enabled: true } })
})

test('invalid JSON is explicit and required validation keeps field order', () => {
  assert.throws(
    () => normalizeAdminResourceFieldValue(field('metadata', 'json'), '{invalid'),
    /metadata格式不正确，请检查括号、引号和逗号/
  )
  const fields = [
    field('title', 'text', { label: '标题', required: true }),
    field('summary', 'text', { label: '摘要', required: true })
  ]
  assert.equal(validateAdminResourceForm(fields, { title: '', summary: '' }), '请填写标题')
  assert.equal(validateAdminResourceForm(fields, { title: '完成', summary: '' }), '请填写摘要')
  assert.equal(validateAdminResourceForm(fields, { title: '完成', summary: '完成' }), null)
})

test('resource manager delegates the complete form model to the pure utility', () => {
  const manager = readFileSync(resolve('app/components/admin/AdminResourceManager.vue'), 'utf8')
  const utility = readFileSync(resolve('app/utils/admin-resource-form.ts'), 'utf8')

  assert.match(manager, /getVisibleAdminResourceFields\(props\.config\.fields, formState\)/)
  assert.match(manager, /initializeAdminResourceForm\(formState, props\.config\.fields, record\)/)
  assert.match(manager, /buildAdminResourcePayload\(visibleFields\.value, formState\)/)
  assert.match(manager, /setAdminResourceFormValue\(formState, props\.config\.key, key, value\)/)
  assert.doesNotMatch(manager, /function (normalizeFieldValue|writePath|sourceIdsValue|jsonFieldValue)/)
  assert.doesNotMatch(utility, /\$fetch|navigateTo|useRoute|useRouter|ref\(|computed\(/)
})
