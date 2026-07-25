import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'
import {
  SHOWCASE_TOTAL_DURATION_MS,
  clampShowcaseProgress,
  showcaseCheckedCount,
  showcaseSceneIndex,
  showcaseSceneProgress,
  showcaseScenes,
  showcaseTypedText
} from '../app/utils/showcase-presentation'

const pageSource = readFileSync(resolve('app/pages/showcase.vue'), 'utf8')
const introSource = readFileSync(resolve('app/components/IntroOverlay.vue'), 'utf8')

test('showcase timeline stays within a short-form video duration', () => {
  assert.deepEqual(showcaseScenes.map(scene => scene.id), [
    'arrival',
    'map',
    'assistant',
    'checklist',
    'transport'
  ])
  assert.ok(SHOWCASE_TOTAL_DURATION_MS >= 28_000)
  assert.ok(SHOWCASE_TOTAL_DURATION_MS <= 32_000)
  assert.equal(showcaseSceneIndex('assistant'), 2)
  assert.equal(showcaseSceneIndex('missing'), 0)
})

test('showcase progress helpers are bounded and deterministic', () => {
  assert.equal(clampShowcaseProgress(-1), 0)
  assert.equal(clampShowcaseProgress(2), 1)
  assert.equal(showcaseSceneProgress(250, 1_000), 0.25)
  assert.equal(showcaseSceneProgress(10, 0), 1)
  assert.equal(showcaseTypedText('上海楼', 0.7), '上海')
  assert.equal(showcaseCheckedCount(0, 3), 0)
  assert.equal(showcaseCheckedCount(1, 3), 3)
})

test('showcase is isolated from the public layout and uses the real site assets', () => {
  assert.match(pageSource, /definePageMeta\(\{ layout: false \}\)/)
  assert.match(pageSource, /\/images\/yeu-campus-plan-2025\.jpg/)
  assert.match(pageSource, /K6/)
  assert.match(pageSource, /K2/)
  assert.match(pageSource, /K507/)
  assert.doesNotMatch(pageSource, /contact-wechat|showcase-qr|yeu\.huiliyill\.cn/)
  assert.match(pageSource, /<IntroOverlay/)
  assert.match(pageSource, /SHOWCASE_TOTAL_DURATION_MS/)
  assert.match(introSource, /autoCompleteMs/)
})
