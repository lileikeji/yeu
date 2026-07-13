import assert from 'node:assert/strict'
import test from 'node:test'
import { freshmanGuides } from '../data/seeds/public-content'
import {
  canUseStaticContentKindFallback,
  mergePublicGuides
} from '../app/utils/public-catalog'

test('managed guide catalogs do not restore an unpublished static guide', () => {
  const expressGuide = freshmanGuides.find(guide => guide.slug === 'express-delivery')
  assert.ok(expressGuide)

  assert.deepEqual(mergePublicGuides([expressGuide], [], false), [])
  assert.equal(mergePublicGuides([expressGuide], [], true)[0]?.slug, 'express-delivery')
})

test('static fallback is fail-closed and scoped to each content kind', () => {
  assert.equal(canUseStaticContentKindFallback(null, 'guide'), false)
  assert.equal(canUseStaticContentKindFallback({ managedKinds: ['notice'] }, 'guide'), true)
  assert.equal(canUseStaticContentKindFallback({ managedKinds: ['notice'] }, 'department'), true)
  assert.equal(canUseStaticContentKindFallback({ managedKinds: ['guide'] }, 'guide'), false)
  assert.equal(canUseStaticContentKindFallback({ hasManagedRecords: false }, 'guide'), false)
})
