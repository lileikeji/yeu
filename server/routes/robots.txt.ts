export default defineEventHandler((event) => {
  const siteUrl = String(useRuntimeConfig(event).public.siteUrl || 'https://yx.huiliyill.cn').replace(/\/$/, '')
  setHeader(event, 'Content-Type', 'text/plain; charset=utf-8')
  setHeader(event, 'Cache-Control', 'no-store')
  setHeader(event, 'CDN-Cache-Control', 'no-store')
  setHeader(event, 'X-Content-Type-Options', 'nosniff')
  return [
    'User-agent: *',
    'Allow: /',
    'Disallow: /admin/',
    `Sitemap: ${siteUrl}/sitemap.xml`,
    `Sitemap: ${siteUrl}/seo/sitemap.xml`,
    `Sitemap: ${siteUrl}/seo/live/sitemap.xml`,
    ''
  ].join('\n')
})
