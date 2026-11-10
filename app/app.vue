<script setup lang="ts">
import { THEME_PALETTE_THEME_COLORS } from '~/utils/theme-mode'

const { palette } = useThemeMode()
const themeColor = computed(() => THEME_PALETTE_THEME_COLORS[palette.value])

useHead({
  htmlAttrs: {
    lang: 'zh-CN'
  },
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
    { name: 'theme-color', content: themeColor },
    { name: 'mobile-web-app-capable', content: 'yes' },
    { name: 'apple-mobile-web-app-capable', content: 'yes' },
    { name: 'apple-mobile-web-app-status-bar-style', content: 'default' }
  ],
  link: [
    { rel: 'icon', type: 'image/png', href: '/icons/app-icon-192.png' },
    { rel: 'apple-touch-icon', href: '/icons/app-icon-192.png' }
  ]
})

useSeoMeta({
  titleTemplate: title => title ? `${title} | 迎新指南` : '迎新指南',
  description: '新生报到、宿舍、校园地图、办事流程与校园生活信息，一处快速查找。',
  ogTitle: '迎新指南｜报到、地图与校园生活',
  ogDescription: '查报到时间、宿舍、校园地图、办事流程和新生常见问题。',
  ogSiteName: '迎新指南',
  ogType: 'website',
  ogLocale: 'zh_CN',
  ogImage: 'https://yx.huiliyill.cn/icons/app-icon-512.png?v=20260805b',
  ogImageWidth: 512,
  ogImageHeight: 512,
  ogImageAlt: '迎新指南',
  twitterCard: 'summary_large_image',
  twitterImage: 'https://yx.huiliyill.cn/icons/app-icon-512.png?v=20260805b'
})

const pwaManifestComponent = import.meta.dev
  ? null
  : resolveComponent('VitePwaManifest')
</script>

<template>
  <component
    :is="pwaManifestComponent"
    v-if="pwaManifestComponent"
  />
  <UApp>
    <NuxtLayout>
      <NuxtPage />
    </NuxtLayout>
    <AppUpdateBanner />
  </UApp>
</template>
