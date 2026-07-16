import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const panelSource = readFileSync(
  resolve('app/components/admin/AdminResourceCatalogPanel.vue'),
  'utf8'
)
const deleteSource = readFileSync(
  resolve('app/components/admin/AdminResourceDeleteDialog.vue'),
  'utf8'
)
const managerSource = readFileSync(
  resolve('app/components/admin/AdminResourceManager.vue'),
  'utf8'
)

test('admin resource catalog panel owns stats, filters, table and pagination presentation', () => {
  assert.match(panelSource, /config\.stats/)
  assert.match(panelSource, /defineModel<string>\('searchQuery', \{ required: true \}\)/)
  assert.match(panelSource, /defineModel<Record<string, string>>\('filterValues', \{ required: true \}\)/)
  assert.match(panelSource, /v-for="filter in config\.filters \?\? \[\]"/)
  assert.match(panelSource, /v-if="loadError"/)
  assert.match(panelSource, /aria-label="正在加载"/)
  assert.match(panelSource, /<table/)
  assert.match(panelSource, /md:hidden/)
  assert.match(panelSource, /共 \{\{ total \}\} 条，第 \{\{ page \}\} \/ \{\{ pageCount \}\} 页/)
  assert.match(panelSource, /displayAdminResourceCell\(record, column\)/)
  assert.match(panelSource, /AdminStatusBadge/)
})

test('admin resource catalog panel exposes typed catalog and row action events', () => {
  assert.match(panelSource, /refresh: \[\]/)
  assert.match(panelSource, /changePage: \[page: number\]/)
  assert.match(panelSource, /edit: \[record: AdminRecord\]/)
  assert.match(panelSource, /setPublicationStatus: \[record: AdminRecord, status: 'published' \| 'archived'\]/)
  assert.match(panelSource, /requestDelete: \[record: AdminRecord\]/)
  assert.match(panelSource, /emit\('setPublicationStatus', record, 'published'\)/)
  assert.match(panelSource, /emit\('setPublicationStatus', record, 'archived'\)/)
  assert.match(panelSource, /:disabled="writeBusy"/)
})

test('admin resource catalog panel stays independent of requests, routing and authorization', () => {
  assert.doesNotMatch(panelSource, /\$fetch|useRoute|useRouter|navigateTo/)
  assert.doesNotMatch(panelSource, /useAdminResourceCatalog|useAdminResourceOperations/)
  assert.doesNotMatch(panelSource, /endpoint|authorization|Unauthorized/i)
})

test('admin resource delete dialog owns confirmation presentation only', () => {
  assert.match(deleteSource, /defineModel<boolean>\('open', \{ required: true \}\)/)
  assert.match(deleteSource, /confirm: \[\]/)
  assert.match(deleteSource, /确认删除/)
  assert.match(deleteSource, /:loading="deleting"/)
  assert.doesNotMatch(deleteSource, /\$fetch|useRoute|useRouter|navigateTo/)
  assert.doesNotMatch(deleteSource, /method: 'DELETE'|endpoint/)
})

test('admin resource manager composes catalog, editor and delete dialog without list markup', () => {
  assert.match(managerSource, /<AdminResourceCatalogPanel/)
  assert.match(managerSource, /v-model:search-query="searchQuery"/)
  assert.match(managerSource, /v-model:filter-values="filterValues"/)
  assert.match(managerSource, /@set-publication-status="setPublicationStatus"/)
  assert.match(managerSource, /@request-delete="requestDelete"/)
  assert.match(managerSource, /<AdminResourceEditor/)
  assert.match(managerSource, /<AdminResourceDeleteDialog/)
  assert.match(managerSource, /@confirm="deleteRecord"/)
  assert.doesNotMatch(managerSource, /<table/)
  assert.doesNotMatch(managerSource, /aria-label="正在加载"/)
  assert.doesNotMatch(managerSource, /title="删除记录"/)
})
