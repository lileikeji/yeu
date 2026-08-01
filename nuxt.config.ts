// https://nuxt.com/docs/api/configuration/nuxt-config
import { clientBundleIcons } from './shared/client-bundle-icons'
import { EDGE_ROUTE_BOOTSTRAP_SCRIPT } from './app/utils/edge-route-bootstrap'

const isDevelopment = process.env.NODE_ENV === 'development'
const serviceWorkerBuildId = String(
  process.env.GIT_COMMIT_SHA
  || process.env.NUXT_PUBLIC_BUILD_ID
  || 'local'
).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 16) || 'local'

const devServiceWorkerCleanupScript = isDevelopment
  ? [{
      key: 'yeu-dev-service-worker-cleanup',
      innerHTML: `(() => {
  if (!('serviceWorker' in navigator)) return;
  navigator.serviceWorker.getRegistrations().then(async (registrations) => {
    if (!registrations.length) return;
    const removed = (await Promise.all(registrations.map(registration => registration.unregister()))).some(Boolean);
    if ('caches' in window) {
      const keys = await caches.keys();
      await Promise.all(keys.map(key => caches.delete(key)));
    }
    if (removed && navigator.serviceWorker.controller) location.reload();
  }).catch(() => {});
})();`,
      tagPosition: 'head' as const
    }]
  : []

export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    ...(!isDevelopment ? ['@vite-pwa/nuxt'] : [])
  ],

  devtools: {
    enabled: false
  },
  app: {
    head: {
      script: [
        {
          key: 'yeu-edge-route-bootstrap',
          innerHTML: EDGE_ROUTE_BOOTSTRAP_SCRIPT,
          tagPosition: 'head'
        },
        ...devServiceWorkerCleanupScript
      ]
    }
  },

  css: [
    '~/assets/css/main.css'
  ],

  runtimeConfig: {
    databasePath: './data/yeu.sqlite',
    baiduMapsServerAk: '',
    adminSessionSecret: '',
    aiGatewayBaseUrl: '',
    aiGatewayApiKey: '',
    aiGatewayModel: 'gpt-5.4',
    aiGatewayTimeoutMs: 60_000,
    aiMcpSearchUrl: '',
    aiMcpSearchBearerToken: '',
    aiMcpAllowedHosts: 'mcp.firecrawl.dev',
    aiMcpToolName: 'firecrawl_search',
    aiMcpTimeoutMs: 25_000,
    amapWebServiceKey: '',
    botSiteUrl: 'https://yx.huiliyill.cn/',
    botMaxReplyChars: 1800,
    qqBotWebhookToken: '',
    qqBotApiUrl: '',
    qqBotApiToken: '',
    qqBotSelfId: '',
    qqBotAllowedGroupIds: '',
    wechatBotWebhookSecret: '',
    wechatBotSendUrl: '',
    wechatBotId: '',
    wechatBotName: '',
    wechatBotAllowedRoomIds: '',
    wechatMpAppId: '',
    wechatMpAppSecret: '',
    wechatMpToken: '',
    wechatMpEncodingAesKey: '',
    wechatShareAllowedHosts: 'yx.huiliyill.cn',
    public: {
      siteUrl: 'http://localhost:3000',
      mapProvider: 'maplibre-dev',
      amapKey: '',
      amapSecurityCode: '',
      baiduMapsBrowserAk: '',
      icpNumber: '',
      // Public map/search overlay of authorized amap owner draft points.
      // Set NUXT_PUBLIC_ENABLE_AMAP_OWNER_DRAFTS=false to disable without code change.
      enableAmapOwnerDrafts: true
    }
  },

  // Default .nuxt matches root tsconfig references. Set NUXT_BUILD_DIR=.nuxt-build
  // only when a concurrent nuxt dev would otherwise clobber the same folder.
  buildDir: process.env.NUXT_BUILD_DIR || '.nuxt',

  routeRules: {
    '/showcase': {
      headers: {
        'Cache-Control': 'private, no-store',
        'CDN-Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow'
      }
    },
    '/map': {
      headers: {
        'X-Robots-Tag': 'noindex, nofollow'
      }
    },
    // Admin UI and APIs must never be cached or indexed.
    '/admin/**': {
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Robots-Tag': 'noindex, nofollow'
      }
    },
    '/api/admin/**': {
      headers: {
        'Cache-Control': 'private, no-store',
        'X-Robots-Tag': 'noindex, nofollow'
      }
    },
    '/api/public/assistant': {
      headers: {
        'Cache-Control': 'private, no-store',
        'CDN-Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow'
      }
    },
    '/api/public/assistant/stream': {
      headers: {
        'Cache-Control': 'private, no-store',
        'CDN-Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow',
        'X-Accel-Buffering': 'no'
      }
    },
    '/api/integrations/bots/**': {
      headers: {
        'Cache-Control': 'private, no-store',
        'CDN-Cache-Control': 'no-store',
        'X-Robots-Tag': 'noindex, nofollow'
      }
    },
    // Icon payloads vary by ?icons=; never let CDN share one partial body.
    '/api/_nuxt_icon/**': {
      headers: {
        'Cache-Control': 'private, no-store'
      }
    }
  },

  experimental: {
    appManifest: !isDevelopment
  },

  compatibilityDate: '2026-06-30',

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  // SSR needs provider=server so serverBundle is built (CSS-mode --svg).
  // clientBundle covers client hydration; fallbackToApi=false avoids CDN
  // poisoning partial /api/_nuxt_icon collection responses.
  icon: {
    provider: 'server',
    fallbackToApi: false,
    clientBundle: {
      scan: true,
      icons: [...clientBundleIcons],
      sizeLimitKb: 512
    },
    serverBundle: {
      collections: ['lucide', 'simple-icons']
    }
  },

  pwa: {
    registerType: 'autoUpdate',
    // Some CDN providers cache /sw.js even when it is marked no-store. A
    // commit-scoped filename lets mobile clients always discover the current
    // worker and replace an older registration for the same scope.
    filename: `sw-${serviceWorkerBuildId}.js`,
    manifestFilename: 'site.webmanifest',
    manifest: {
      id: '/',
      name: '迎新指南',
      short_name: '迎新指南',
      description: '本科与专升本新生的校园地图和入学指南',
      lang: 'zh-CN',
      start_url: '/',
      scope: '/',
      display: 'standalone',
      orientation: 'portrait-primary',
      background_color: '#f7f8f6',
      theme_color: '#104830',
      categories: ['education', 'navigation', 'utilities'],
      icons: [
        {
          src: '/icons/app-icon-192.png',
          sizes: '192x192',
          type: 'image/png',
          purpose: 'any'
        },
        {
          src: '/icons/app-icon-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'any'
        },
        {
          src: '/icons/app-icon-maskable-512.png',
          sizes: '512x512',
          type: 'image/png',
          purpose: 'maskable'
        }
      ],
      shortcuts: [
        {
          name: '校园地图',
          short_name: '地图',
          url: '/map',
          icons: [{ src: '/icons/app-icon-192.png', sizes: '192x192' }]
        },
        {
          name: '新生办事',
          short_name: '办事',
          url: '/procedures',
          icons: [{ src: '/icons/app-icon-192.png', sizes: '192x192' }]
        }
      ]
    },
    workbox: {
      skipWaiting: true,
      clientsClaim: true,
      globPatterns: ['**/*.{css,html,ico,png,svg,webp,woff2}'],
      navigateFallback: null,
      manifestTransforms: [async entries => ({ manifest: entries, warnings: [] })],
      cleanupOutdatedCaches: true,
      runtimeCaching: [
        {
          urlPattern: ({ request, url }) => request.mode === 'navigate'
            && !url.pathname.startsWith('/admin'),
          handler: 'NetworkOnly',
          options: {
            precacheFallback: {
              fallbackURL: '/offline.html'
            }
          }
        },
        {
          urlPattern: /\/api\//,
          handler: 'NetworkOnly'
        },
        {
          urlPattern: /^https:\/\/(?:[a-z0-9-]+\.)?(?:tile\.openstreetmap\.org|basemaps\.cartocdn\.com)\//,
          handler: 'NetworkOnly'
        }
      ]
    },
    devOptions: {
      // Development rebuilds replace .nuxt atomically. Keeping a dev worker
      // registered makes open tabs request sw.js during that short gap and
      // leaves Vite's error overlay stuck even after the rebuild recovers.
      enabled: false,
      type: 'module'
    }
  }
})
