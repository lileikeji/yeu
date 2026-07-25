import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import test from 'node:test'

const layoutSource = readFileSync(resolve('app/layouts/default.vue'), 'utf8')
const configSource = readFileSync(resolve('nuxt.config.ts'), 'utf8')
const envExampleSource = readFileSync(resolve('.env.example'), 'utf8')

test('every public page footer can show the ICP record on desktop and mobile', () => {
  assert.match(layoutSource, /icpNumber/)
  assert.match(layoutSource, /https:\/\/beian\.miit\.gov\.cn\//)
  assert.doesNotMatch(layoutSource, /<footer class="hidden/)
  assert.match(layoutSource, /mobile-nav-height/)
  assert.match(configSource, /icpNumber: ''/)
  assert.match(envExampleSource, /NUXT_PUBLIC_ICP_NUMBER=/)
})
