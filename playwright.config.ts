import { defineConfig, devices } from '@playwright/test'
import { resolve } from 'node:path'

const port = 4173
const host = '127.0.0.1'
const baseURL = `http://${host}:${port}`

export default defineConfig({
  testDir: './tests/e2e',
  outputDir: '.data/playwright-results',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: process.env.CI ? 1 : 0,
  workers: process.env.CI ? 1 : undefined,
  reporter: [
    ['list'],
    ['html', { outputFolder: '.data/playwright-report', open: 'never' }]
  ],
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    reducedMotion: 'reduce',
    locale: 'zh-CN',
    timezoneId: 'Asia/Shanghai'
  },
  webServer: {
    command: 'node .output/server/index.mjs',
    url: baseURL,
    reuseExistingServer: false,
    timeout: 30_000,
    stdout: 'ignore',
    stderr: 'pipe',
    env: {
      ...process.env,
      NODE_ENV: 'production',
      NITRO_HOST: host,
      NITRO_PORT: String(port),
      NUXT_DATABASE_PATH: resolve(process.cwd(), '.data', 'e2e.sqlite'),
      NUXT_PUBLIC_SITE_URL: baseURL,
      NUXT_PUBLIC_MAP_PROVIDER: 'maplibre-dev',
      NUXT_AI_GATEWAY_BASE_URL: '',
      NUXT_AI_GATEWAY_API_KEY: '',
      NUXT_ADMIN_SESSION_SECRET: 'e2e-only-session-secret-not-for-production'
    }
  },
  projects: [
    {
      name: 'desktop-chromium',
      use: { ...devices['Desktop Chrome'] }
    },
    {
      name: 'mobile-chromium',
      use: { ...devices['Pixel 5'] }
    }
  ]
})
