import assert from 'node:assert/strict'
import test from 'node:test'
import { arrivalRoutes } from '../data/arrival-routes'

function isRange(value: unknown): value is [number, number] {
  return Array.isArray(value)
    && value.length === 2
    && value.every(item => typeof item === 'number' && Number.isFinite(item))
}

test('ships at least four arrival routes with unique ids', () => {
  assert.ok(arrivalRoutes.length >= 4, `expected >= 4 routes, got ${arrivalRoutes.length}`)
  const ids = arrivalRoutes.map(route => route.id)
  assert.equal(new Set(ids).size, ids.length, `duplicate route ids: ${ids.join(', ')}`)
  for (const route of arrivalRoutes) {
    assert.ok(route.id.length > 0, `${route.from} has an empty id`)
    assert.ok(route.from.length > 0, `${route.id} has an empty from`)
    assert.ok(route.fromDetail.length > 0, `${route.id} has an empty fromDetail`)
    assert.ok(route.notes.length > 0, `${route.id} has no notes`)
  }
})

test('every route has three to six steps with valid duration and cost ranges', () => {
  for (const route of arrivalRoutes) {
    assert.ok(route.steps.length >= 3, `${route.id} has ${route.steps.length} steps, expected >= 3`)
    assert.ok(route.steps.length <= 6, `${route.id} has ${route.steps.length} steps, expected <= 6`)
    for (const step of route.steps) {
      assert.ok(step.title.length > 0, `${route.id} has a step without title`)
      assert.ok(step.detail.length > 0, `${route.id}/${step.title} has an empty detail`)
      assert.ok(isRange(step.durationMin), `${route.id}/${step.title} durationMin is not [min, max]`)
      const [min, max] = step.durationMin
      assert.ok(min > 0, `${route.id}/${step.title} durationMin min must be > 0, got ${min}`)
      assert.ok(min <= max, `${route.id}/${step.title} durationMin must satisfy min <= max, got ${min} > ${max}`)
      if (step.costCny !== undefined) {
        assert.ok(isRange(step.costCny), `${route.id}/${step.title} costCny is not [min, max]`)
        const [costMin, costMax] = step.costCny
        assert.ok(costMin >= 0 && costMin <= costMax, `${route.id}/${step.title} costCny must satisfy 0 <= min <= max`)
      }
    }
  }
})

test('totalDurationMin covers the sum of step durations within a 30% band', () => {
  // 逐步时长按「每步都取最坏值」相加会高估（等车、步行、换乘其实会重叠），
  // 按「每步都取最好值」相加又会低估（找站台、放行李、排队不在单步里）。
  // 所以总量允许和逐步之和差 ±30%；超出这个带宽说明单步数据或总时长已经不自洽，应当重算而不是放宽断言。
  for (const route of arrivalRoutes) {
    assert.ok(isRange(route.totalDurationMin), `${route.id} totalDurationMin is not [min, max]`)
    const [totalMin, totalMax] = route.totalDurationMin
    assert.ok(totalMin > 0, `${route.id} totalDurationMin min must be > 0`)
    assert.ok(totalMin <= totalMax, `${route.id} totalDurationMin must satisfy min <= max, got ${totalMin} > ${totalMax}`)

    const stepMin = route.steps.reduce((sum, step) => sum + step.durationMin[0], 0)
    const stepMax = route.steps.reduce((sum, step) => sum + step.durationMin[1], 0)
    const lowerBound = Math.floor(stepMin * 0.7)
    const upperBound = Math.ceil(stepMax * 1.3)
    assert.ok(
      totalMin >= lowerBound,
      `${route.id} totalDurationMin min ${totalMin} is below 70% of step sum min ${stepMin} (allowed >= ${lowerBound})`
    )
    assert.ok(
      totalMax <= upperBound,
      `${route.id} totalDurationMin max ${totalMax} exceeds 130% of step sum max ${stepMax} (allowed <= ${upperBound})`
    )
  }
})

test('totalCostCny is either a valid range or explicitly unknown', () => {
  for (const route of arrivalRoutes) {
    if (route.totalCostCny === null) continue
    assert.ok(isRange(route.totalCostCny), `${route.id} totalCostCny is not [min, max] or null`)
    const [min, max] = route.totalCostCny
    assert.ok(min >= 0 && min <= max, `${route.id} totalCostCny must satisfy 0 <= min <= max`)
  }
})

test('every route cites at least one https source with a YYYY-MM verification month', () => {
  for (const route of arrivalRoutes) {
    assert.ok(route.sources.length >= 1, `${route.id} has no sources`)
    for (const source of route.sources) {
      assert.ok(source.label.length > 0, `${route.id} has a source without label`)
      assert.ok(source.url.startsWith('https://'), `${route.id} source must use https: ${source.url}`)
      assert.match(source.verifiedAt, /^\d{4}-\d{2}$/, `${route.id} source verifiedAt must be YYYY-MM, got ${source.verifiedAt}`)
    }
  }
})
