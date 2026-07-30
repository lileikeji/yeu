import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const cssSource = readFileSync(resolve('app/assets/css/main.css'), 'utf8')
const layoutSource = readFileSync(resolve('app/layouts/admin.vue'), 'utf8')
const dashboardSource = readFileSync(resolve('app/pages/admin/index.vue'), 'utf8')
const catalogSource = readFileSync(resolve('app/components/admin/AdminResourceCatalogPanel.vue'), 'utf8')
const captureSource = readFileSync(resolve('app/components/admin/AdminFieldCoordinateCapture.vue'), 'utf8')
const chatSource = readFileSync(resolve('app/pages/admin/chat/index.vue'), 'utf8')

test('admin navigation and destructive controls keep readable contrast', () => {
  assert.match(cssSource, /--color-red-500: #b4232c/)
  assert.match(layoutSource, /aria-label="后台主导航"/)
  assert.match(layoutSource, /adminRole === 'organization' \? '组织内容管理' : '总管理员模式'/)
  assert.match(layoutSource, /text-zinc-300/)
  assert.doesNotMatch(layoutSource, /text-zinc-500">\s*已登录/)
  assert.equal((catalogSource.match(/!text-red-800 hover:!bg-red-50/g) || []).length, 2)
})

test('admin scroll, statistics, progress and message lists use valid semantics', () => {
  assert.match(dashboardSource, /tabindex="0"\s+aria-label="访问高峰记录"/)
  assert.match(catalogSource, /role="group"\s+aria-label="地点坐标统计"/)
  assert.match(catalogSource, /<dl class="min-w-0">[\s\S]*?<dt[\s\S]*?<dd/)
  assert.match(captureSource, /role="progressbar"[\s\S]*?:aria-valuenow="samples\.length"/)
  assert.match(captureSource, /:aria-valuemax="FIELD_CAPTURE_MAX_SAMPLES"/)
  assert.match(chatSource, /<div class="mt-4 flex flex-wrap items-center gap-2">[\s\S]*?<ul class="mt-2 max-h-\[36rem\]/)
  assert.doesNotMatch(chatSource, /<ul class="mt-4 max-h-\[36rem\][\s\S]*?<div class="mb-2/)
})
