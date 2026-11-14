import { listContent } from '../modules/content/service'
import { listPlaces } from '../modules/places/service'
import { listProcedures } from '../modules/procedures/service'
import { useAppDatabase } from '../utils/database'

interface SitemapEntry {
  loc: string
  lastmod: string
  changefreq: string
  priority: string
}

function isoDate(value: unknown, fallback: string): string {
  if (typeof value === 'string' && value.length >= 10) return value.slice(0, 10)
  if (typeof value === 'number' && Number.isFinite(value)) {
    return new Date(value).toISOString().slice(0, 10)
  }
  return fallback
}

function escapeXml(value: string): string {
  return value
    .replaceAll('&', '&amp;')
    .replaceAll('<', '&lt;')
    .replaceAll('>', '&gt;')
    .replaceAll('"', '&quot;')
    .replaceAll('\'', '&apos;')
}

function collectPaged<T extends { slug?: string | null, updatedAt?: string | number | null }>(
  fetchPage: (page: number, pageSize: number) => { items: T[], total: number, pageSize?: number }
): T[] {
  const all: T[] = []
  let page = 1
  const pageSize = 100
  while (true) {
    const result = fetchPage(page, pageSize)
    const items = result.items || []
    all.push(...items)
    const total = Number(result.total || 0)
    const size = Number(result.pageSize || pageSize) || pageSize
    if (!items.length || page * size >= total) break
    page += 1
    if (page > 100) break
  }
  return all
}

export default defineEventHandler((event) => {
  const siteUrl = String(useRuntimeConfig(event).public.siteUrl || 'https://yx.huiliyill.cn').replace(/\/$/, '')
  const today = new Date().toISOString().slice(0, 10)
  const client = useAppDatabase(event)

  const staticPaths: Array<[string, string, string]> = [
    ['/', '1.0', 'daily'],
    ['/map', '0.9', 'daily'],
    ['/search', '0.7', 'weekly'],
    ['/guides', '0.8', 'weekly'],
    ['/procedures', '0.9', 'weekly'],
    ['/notices', '0.8', 'weekly'],
    ['/departments', '0.7', 'weekly'],
    ['/clubs', '0.7', 'weekly'],
    ['/panorama', '0.7', 'monthly'],
    ['/dorms', '0.7', 'monthly'],
    ['/contact', '0.5', 'monthly'],
    ['/sources', '0.4', 'monthly'],
    ['/privacy', '0.3', 'monthly'],
    ['/offline', '0.1', 'monthly']
  ]

  const entries: SitemapEntry[] = staticPaths.map(([path, priority, changefreq]) => ({
    loc: `${siteUrl}${path}`,
    lastmod: today,
    changefreq,
    priority
  }))

  const collections: Array<{
    prefix: string
    priority: string
    changefreq: string
    items: Array<{ slug?: string | null, updatedAt?: string | number | null }>
  }> = [
    {
      prefix: '/guides/',
      priority: '0.7',
      changefreq: 'weekly',
      items: collectPaged((page, pageSize) => listContent(client, { page, pageSize }, true, 'guide'))
    },
    {
      prefix: '/procedures/',
      priority: '0.8',
      changefreq: 'weekly',
      items: collectPaged((page, pageSize) => listProcedures(client, { page, pageSize }, true))
    },
    {
      prefix: '/departments/',
      priority: '0.6',
      changefreq: 'weekly',
      items: collectPaged((page, pageSize) => listContent(client, { page, pageSize }, true, 'department'))
    },
    {
      prefix: '/clubs/',
      priority: '0.6',
      changefreq: 'weekly',
      items: collectPaged((page, pageSize) => listContent(client, { page, pageSize }, true, 'club'))
    },
    {
      prefix: '/places/',
      priority: '0.8',
      changefreq: 'weekly',
      items: collectPaged((page, pageSize) => listPlaces(client, { page, pageSize }, true))
    }
  ]

  for (const collection of collections) {
    for (const item of collection.items) {
      if (!item.slug) continue
      entries.push({
        loc: `${siteUrl}${collection.prefix}${item.slug}`,
        lastmod: isoDate(item.updatedAt, today),
        changefreq: collection.changefreq,
        priority: collection.priority
      })
    }
  }

  const seen = new Set<string>()
  const ordered = entries.filter((entry) => {
    if (seen.has(entry.loc)) return false
    seen.add(entry.loc)
    return true
  })

  const xml = [
    '<?xml version="1.0" encoding="UTF-8"?>',
    '<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">',
    ...ordered.flatMap(entry => [
      '  <url>',
      `    <loc>${escapeXml(entry.loc)}</loc>`,
      `    <lastmod>${entry.lastmod}</lastmod>`,
      `    <changefreq>${entry.changefreq}</changefreq>`,
      `    <priority>${entry.priority}</priority>`,
      '  </url>'
    ]),
    '</urlset>',
    ''
  ].join('\n')

  setHeader(event, 'Content-Type', 'application/xml; charset=utf-8')
  setHeader(event, 'Cache-Control', 'no-store')
  setHeader(event, 'CDN-Cache-Control', 'no-store')
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  return xml
})
