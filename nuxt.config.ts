// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  modules: [
    '@nuxt/eslint',
    '@nuxt/ui',
    '@vite-pwa/nuxt'
  ],

  devtools: {
    enabled: false
  },

  css: [
    '~/assets/css/main.css'
  ],

  runtimeConfig: {
    databasePath: './data/yeu.sqlite',
    adminSessionSecret: '',
    public: {
      siteUrl: 'http://localhost:3000',
      mapProvider: 'maplibre-dev',
      amapKey: '',
      amapSecurityCode: '',
      // Public map/search overlay of authorized amap owner draft points.
      // Set NUXT_PUBLIC_ENABLE_AMAP_OWNER_DRAFTS=false to disable without code change.
      enableAmapOwnerDrafts: true
    }
  },

  // Keep production generation away from a concurrently running dev server.
  buildDir: process.env.NODE_ENV === 'production' ? '.nuxt-build' : '.nuxt',

  routeRules: {
    '/map': {
      headers: {
        'X-Robots-Tag': 'noindex, nofollow'
      }
    }
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

  pwa: {
    registerType: 'prompt',
    manifestFilename: 'site.webmanifest',
    manifest: {
      id: '/',
      name: '仰恩新生指南',
      short_name: '仰恩指南',
      description: '仰恩大学本科与专升本新生的校园地图和入学指南',
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
      enabled: true,
      type: 'module'
    }
  }
})
