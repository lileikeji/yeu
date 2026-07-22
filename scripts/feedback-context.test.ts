import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import test from 'node:test'
import {
  buildDetailFeedbackLink,
  buildGeneralFeedbackLink
} from '../app/utils/feedback-context'

test('detail feedback links retain the complete typed page context', () => {
  assert.deepEqual(buildDetailFeedbackLink({
    targetType: 'procedure',
    targetId: '33333333-3333-4333-8333-333333333331',
    targetName: 'Arrival procedure',
    reasonType: 'procedure_error',
    from: '/procedures/arrival?audience=transfer#step-1'
  }), {
    path: '/feedback',
    query: {
      targetType: 'procedure',
      targetId: '33333333-3333-4333-8333-333333333331',
      targetName: 'Arrival procedure',
      type: 'procedure_error',
      from: '/procedures/arrival?audience=transfer#step-1'
    }
  })

  assert.throws(() => buildGeneralFeedbackLink({
    targetName: 'Unsafe source',
    reasonType: 'other',
    from: 'https://example.com/unsafe'
  }), /application-local path/)
})

test('all public detail pages build feedback context from the current full path', () => {
  for (const path of [
    'app/pages/places/[slug].vue',
    'app/pages/guides/[slug].vue',
    'app/pages/departments/[slug].vue',
    'app/pages/clubs/[slug].vue',
    'app/pages/procedures/[slug].vue'
  ]) {
    const source = readFileSync(path, 'utf8')
    assert.match(source, /from:\s*route\.fullPath/, path)
    assert.match(source, /feedbackLink/, path)
  }
})

test('map detail panel keeps typed place feedback bound to the current map path', () => {
  const page = readFileSync('app/pages/map/index.vue', 'utf8')
  const util = readFileSync('app/utils/map-presentation.ts', 'utf8')
  const targetBuilder = page.match(/function placeFeedbackTarget[\s\S]*?\n}/)?.[0]

  assert.ok(targetBuilder)
  assert.match(targetBuilder, /buildMapPlaceFeedbackTarget/)
  assert.match(targetBuilder, /route\.fullPath/)
  assert.match(util, /export function buildMapPlaceFeedbackTarget/)
  assert.match(util, /buildDetailFeedbackLink/)
  assert.match(util, /targetType:\s*'place'/)
  assert.match(util, /reasonType:\s*'place_error'/)
})

test('feedback form keeps source context structured without showing an internal page path', () => {
  const source = readFileSync('app/pages/feedback.vue', 'utf8')

  assert.match(source, /const pageUrl = computed\(\(\) => safeLocalPath\(route\.query\.from\)\)/)
  assert.match(source, /const message = ref\(''\)/)
  assert.doesNotMatch(source, /message = ref\([^\n]*route\.query\.from/)
  assert.match(source, /pageUrl: pageUrl\.value/)
  assert.match(source, /<template v-if="pageUrl">/)
  assert.match(source, /pageContextCopy\.title/)
  assert.doesNotMatch(source, /\{\{ pageUrl \}\}/)
})
