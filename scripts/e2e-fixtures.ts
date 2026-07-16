import { resolve } from 'node:path'

export const E2E_DATABASE_PATH = resolve(process.cwd(), '.data', 'e2e.sqlite')
export const E2E_PLACE_SLUG = 'e2e-verified-service-point'
export const E2E_ADMIN_USERNAME = 'e2e-admin'
export const E2E_ADMIN_PASSWORD = 'e2e-only-admin-password-2026'
export const E2E_DRAFT_CONTENT = [
  {
    project: 'desktop-chromium',
    slug: 'e2e-desktop-publication-flow',
    title: 'E2E 桌面内容发布闭环'
  },
  {
    project: 'mobile-chromium',
    slug: 'e2e-mobile-publication-flow',
    title: 'E2E 移动内容发布闭环'
  }
] as const
