import { readFileSync } from 'node:fs'
import { expect, test } from '@playwright/test'

test('运行版本与当前制品一致，接口只公开版本信息且禁止缓存', async ({ request }) => {
  const manifest = JSON.parse(readFileSync('.output/release.json', 'utf8'))
  const response = await request.get('/version.json')
  expect(response.status()).toBe(200)
  expect(response.headers()['cache-control']).toBe('no-store')
  expect(await response.json()).toEqual({
    commit: manifest.commit,
    release: manifest.release,
    builtAt: manifest.builtAt
  })
})
