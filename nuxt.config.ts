// https://nuxt.com/docs/api/configuration/nuxt-config
import { randomBytes } from 'node:crypto'
import { clientBundleIcons } from './shared/client-bundle-icons'
import { EDGE_ROUTE_BOOTSTRAP_SCRIPT } from './app/utils/edge-route-bootstrap'
import { THEME_BOOT_SCRIPT } from './app/utils/theme-mode'

const isDevelopment = process.env.NODE_ENV === 'development'
// 公共出口坐标混淆 key：每次构建重新生成，经 vite define（client）与 nitro replace
// （server）注入同一常量 __GEO_CIPHER_KEY__（shared/utils/geo-obfuscation 的消费方）。
// 不走 runtimeConfig：请求上下文与 SSR 渲染两条取值路径会出现 key 不一致。
const geoCipherKey = randomBytes(24).toString('hex')
const serviceWorkerBuildId = String(
  process.env.GIT_COMMIT_SHA
  || process.env.NUXT_PUBLIC_BUILD_ID
  || `build-${Date.now().toString(36)}`
).toLowerCase().replace(/[^a-z0-9-]/g, '').slice(0, 24)
const pwaBootstrapNoCacheHeaders = {
  'Cache-Control': 'no-store, no-cache, must-revalidate, max-age=0',
  'CDN-Cache-Control': 'no-store',
  'Surrogate-Control': 'no-store',
  'Pragma': 'no-cache',
  'Expires': '0'
}

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
        {
          key: 'yeu-theme-boot',
          innerHTML: THEME_BOOT_SCRIPT,
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
    aiEmbeddingBaseUrl: '',
    aiEmbeddingApiKey: '',
    aiEmbeddingModel: 'text-embedding-v3',
    aiEmbeddingTimeoutMs: 15_000,
    aiRerankBaseUrl: '',
    aiRerankApiKey: '',
    aiRerankModel: 'BAAI/bge-reranker-v2-m3',
    aiRerankTimeoutMs: 15_000,
    aiRewriteEnabled: false,
    aiRewriteModel: '',
    aiRewriteMaxVariants: 2,
    aiRewriteTimeoutMs: 12_000,
    aiRerankLocalEnabled: false,
    aiRerankLocalModel: '',
    amapWebServiceKey: '',
    // 云一卡通 YKTPreview open_ticket（校车定位，NUXT_YKT_OPEN_TICKET 覆盖）
    yktOpenTicket: '',
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

  vite: {
    define: {
      __GEO_CIPHER_KEY__: JSON.stringify(geoCipherKey)
    }
  },

  hooks: {
    'nitro:config'(nitroConfig) {
      nitroConfig.replace = { ...nitroConfig.replace, __GEO_CIPHER_KEY__: JSON.stringify(geoCipherKey) }
    }
  },

  // Default .nuxt matches root tsconfig references. Set NUXT_BUILD_DIR=.nuxt-build
  // only when a concurrent nuxt dev would otherwise clobber the same folder.
  buildDir: process.env.NUXT_BUILD_DIR || '.nuxt',

  routeRules: {
    [`/sw-${serviceWorkerBuildId}.js`]: {
      headers: pwaBootstrapNoCacheHeaders
    },
    '/registerSW.js': {
      headers: pwaBootstrapNoCacheHeaders
    },
    '/site.webmanifest': {
      headers: pwaBootstrapNoCacheHeaders
    },
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

  // Allow an isolated output directory for release builds while a local
  // preview server still owns .output. Production defaults remain unchanged.
  nitro: {
    output: {
      dir: process.env.NUXT_OUTPUT_DIR || '.output'
    }
  },

  eslint: {
    config: {
      stylistic: {
        commaDangle: 'never',
        braceStyle: '1tbs'
      }
    }
  },

  // Production builds use the declared system-font fallbacks and must not
  // depend on remote font metadata providers being reachable.
  fonts: {
    providers: {
      adobe: false,
      bunny: false,
      fontshare: false,
      fontsource: false,
      google: false,
      googleicons: false,
      npm: false
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
    // 'prompt' (not 'autoUpdate'): autoUpdate + skipWaiting + clientsClaim forces an
    // automatic location.reload() on every returning user whenever a new release
    // changes sw-<buildId>.js, and the reload can race the new worker's activation
    // (navigation served from /offline.html or a not-yet-ready precache), leaving
    // ordinary users stuck in a reload loop / unable to enter. 'prompt' instead makes
    // the update opt-in via PwaUpdatePrompt.vue (which is written for this mode), so
    // returning users are never force-reloaded and choose when to refresh.
    registerType: 'prompt',
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
      // Large promotional artwork is fetched on demand; keeping it out of
      // the offline precache avoids exceeding Workbox's per-file limit.
      globIgnores: ['**/images/posters/freshman-guide-campus-map.png'],
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
