import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import type { AdminColumnDefinition, AdminFieldDefinition } from '../app/components/admin/types'
import {
  displayAdminResourceCell,
  formatAdminResourceDate,
  getAdminResourceFieldInputType,
  getAdminResourceFieldSpan,
  getAdminResourceRecordId,
  getAdminResourceRecordStatus,
  getAdminResourceRowTitle,
  humanizeAdminResourceValue,
  normalizeAdminResourceList,
  readAdminColumnValue,
  readAdminRecordPath
} from '../app/utils/admin-resource-presentation'

test('resource list normalization accepts arrays and filters non-record values', () => {
  const normalized = normalizeAdminResourceList([
    { id: 'one' },
    null,
    ['nested-array'],
    { id: 'two' }
  ])
  assert.deepEqual(normalized.items.map(item => item.id), ['one', 'two'])
  assert.equal(normalized.total, 2)
  assert.deepEqual(normalized.stats, {})
})

test('nested resource responses normalize totals and numeric stats', () => {
  const normalized = normalizeAdminResourceList({
    data: {
      items: [{ id: 'nested' }],
      total: '4',
      metrics: { active: '2', pending: 1, invalid: 'unknown' }
    }
  }, 'metrics')

  assert.deepEqual(normalized.items.map(item => item.id), ['nested'])
  assert.equal(normalized.total, 4)
  assert.deepEqual(normalized.stats, { active: 2, pending: 1 })
  assert.deepEqual(normalizeAdminResourceList('invalid'), { items: [], total: 0, stats: {} })
})

test('record path and column fallback preserve nested values', () => {
  const record = { profile: { title: '嵌套标题' }, fallback: '备用内容' }
  assert.equal(readAdminRecordPath(record, 'profile.title'), '嵌套标题')
  assert.equal(readAdminRecordPath(record, 'profile.missing'), undefined)
  assert.equal(readAdminColumnValue(record, {
    key: 'missing',
    label: '标题',
    fallbackKeys: ['profile.missing', 'fallback']
  }), '备用内容')
})

test('cell presentation handles labels, booleans and human-readable objects', () => {
  const statusColumn: AdminColumnDefinition = {
    key: 'status',
    label: '状态',
    valueLabels: { published: '已发布' }
  }
  assert.equal(displayAdminResourceCell({ status: 'published' }, statusColumn), '已发布')
  assert.equal(displayAdminResourceCell({ enabled: false }, {
    key: 'enabled',
    label: '启用',
    kind: 'boolean'
  }), '否')
  assert.equal(humanizeAdminResourceValue({ name: '地点名称' }), '地点名称')
  assert.equal(humanizeAdminResourceValue([1, 2]), '2 项')
  assert.equal(humanizeAdminResourceValue(null), '—')
})

test('date presentation distinguishes missing, invalid and valid values', () => {
  assert.equal(formatAdminResourceDate(null), '—')
  assert.equal(formatAdminResourceDate('not-a-date'), 'not-a-date')
  assert.match(formatAdminResourceDate('2026-07-16T08:30:00.000Z'), /2026/)
})

test('record identity, title, status and field layout stay config-driven', () => {
  assert.equal(getAdminResourceRecordId({ id: 42 }), '42')
  assert.equal(getAdminResourceRecordId({ _id: 'fallback-id' }), 'fallback-id')
  assert.equal(getAdminResourceRowTitle({ profile: { name: '记录标题' } }, 'profile.name'), '记录标题')
  assert.equal(getAdminResourceRowTitle(null, 'name'), '此记录')
  assert.equal(getAdminResourceRecordStatus({ publication: 'draft' }, 'publication'), 'draft')

  assert.equal(getAdminResourceFieldSpan({ key: 'body', label: '正文', type: 'textarea' }), 'sm:col-span-2')
  assert.equal(getAdminResourceFieldSpan({ key: 'name', label: '名称' }), '')
  assert.equal(getAdminResourceFieldInputType({
    key: 'email',
    label: '邮箱',
    type: 'email'
  } satisfies AdminFieldDefinition), 'email')
  assert.equal(getAdminResourceFieldInputType({ key: 'kind', label: '类型', type: 'select' }), 'text')
})

test('resource manager delegates response and presentation rules to pure utilities', () => {
  const manager = readFileSync(resolve('app/components/admin/AdminResourceManager.vue'), 'utf8')
  const catalogPanel = readFileSync(resolve('app/components/admin/AdminResourceCatalogPanel.vue'), 'utf8')
  const catalog = readFileSync(resolve('app/utils/admin-resource-catalog.ts'), 'utf8')
  const operations = readFileSync(resolve('app/utils/admin-resource-operations.ts'), 'utf8')
  const utility = readFileSync(resolve('app/utils/admin-resource-presentation.ts'), 'utf8')

  assert.match(catalog, /normalizeAdminResourceList\(response, config\.stats\?\.responseKey\)/)
  assert.match(catalogPanel, /displayAdminResourceCell\(record, column\)/)
  assert.match(manager, /import \{ isAuthorizationError \} from '~\/utils\/request-error'/)
  assert.match(operations, /getRequestMessage\(error, '保存失败，请检查字段后重试。'\)/)
  assert.doesNotMatch(manager, /function (normalizeListResponse|humanizeValue|displayCell|formatDate)/)
  assert.doesNotMatch(utility, /\$fetch|navigateTo|useRoute|useRouter|ref\(|computed\(/)
})
