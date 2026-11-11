import assert from 'node:assert/strict'
import { existsSync, readFileSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { test } from 'node:test'
import { collectionTasks } from '../data/collection-tasks'

const root = resolve(import.meta.dirname, '..')

/**
 * 这份清单的作用是挡「没数据就先上线」：blocked 的任务对应的页面必须不存在。
 * 采集完成后把 status 改成 verified、页面再加，这条守卫自然就不再拦。
 */
const blockedPages: Record<string, string[]> = {
  F8: ['app/components/PlaceEntranceGuide.vue', 'data/place-entrances.ts'],
  F9: ['app/components/StudyOccupancy.vue', 'data/study-occupancy.ts'],
  F10: ['app/pages/dorm-buildings.vue', 'data/dorm-buildings.ts'],
  F12: ['app/pages/major-compare.vue', 'data/transfer-major-bachelor.ts']
}

test('四项待采数据都在清单里，且状态与阻塞原因一致', () => {
  const ids = collectionTasks.map(task => task.id).sort()
  assert.deepEqual(ids, ['F10', 'F12', 'F8', 'F9'])
  for (const task of collectionTasks) {
    assert.ok(['blocked', 'collecting', 'verified'].includes(task.status), `${task.id} 状态非法`)
    assert.ok(task.owner.trim().length >= 4, `${task.id} 必须写明谁能提供数据`)
    assert.ok(task.ask.trim().length >= 20, `${task.id} 的 ask 要能直接发给对方`)
    assert.ok(task.target.trim().length >= 8, `${task.id} 必须写明落库位置`)
    assert.ok(task.acceptance.length >= 3, `${task.id} 至少三条验收判据`)
    assert.ok(task.unlocks.trim().length >= 10, `${task.id} 要写清采集完成能解锁什么`)
    if (task.status === 'blocked') assert.ok(task.blockedBy && task.blockedBy.trim().length >= 10, `${task.id} 阻塞必须写原因`)
  }
})

test('字段规格自证：必填项都在样例里，且样例值能过自己的校验规则', () => {
  for (const task of collectionTasks) {
    assert.ok(task.fields.length >= 3, `${task.id} 字段太少`)
    const names = task.fields.map(field => field.name)
    assert.equal(new Set(names).size, names.length, `${task.id} 字段名重复`)
    for (const key of Object.keys(task.sampleRow)) {
      assert.ok(names.includes(key), `${task.id} 样例里出现了未声明的字段 ${key}`)
    }
    for (const field of task.fields) {
      const value = task.sampleRow[field.name]
      if (field.required) assert.notEqual(value, undefined, `${task.id} 必填字段 ${field.name} 缺少样例`)
      if (value === undefined) continue
      if (field.type === 'enum') {
        assert.ok(field.values?.length, `${task.id}.${field.name} 是 enum 但没写可选值`)
        assert.ok(field.values.includes(String(value)), `${task.id}.${field.name} 样例值不在可选值里`)
        continue
      }
      assert.ok(field.pattern, `${task.id}.${field.name} 缺少 pattern，校验无从谈起`)
      assert.match(String(value), new RegExp(field.pattern), `${task.id}.${field.name} 样例值过不了自己的规则`)
    }
  }
})

test('blocked 的任务不许先把页面做出来', () => {
  for (const task of collectionTasks) {
    if (task.status !== 'blocked') continue
    for (const page of blockedPages[task.id] ?? []) {
      assert.equal(existsSync(join(root, page)), false, `${task.id} 仍是 blocked，却已经存在 ${page}；先补数据再上线`)
    }
  }
})

test('清单自身的文案里不许出现保险话术与承诺', () => {
  const text = readFileSync(join(root, 'data/collection-tasks.ts'), 'utf8')
  for (const banned of ['保证', '一定准确', '官方授权', '百分百', '包过']) {
    assert.equal(text.includes(banned), false, `清单里出现了承诺性说法：${banned}`)
  }
})
