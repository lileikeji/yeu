<script setup lang="ts">
useHead({
  htmlAttrs: {
    lang: 'zh-CN'
  },
  meta: [
    { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
    { name: 'theme-color', content: '#0f5132' },
    { name: 'mobile-web-app-capable', content: 'yes' },
    { name: 'apple-mobile-web-app-capable', content: 'yes' },
    { name: 'apple-mobile-web-app-status-bar-style', content: 'default' }
  ],
  link: [
    { rel: 'icon', href: '/favicon.ico' },
    { rel: 'apple-touch-icon', href: '/icons/app-icon-192.png' }
  ]
})

useSeoMeta({
  titleTemplate: title => title ? `${title} | 仰恩新生指南` : '仰恩新生指南',
  description: '面向仰恩大学新生的校园地图、办事流程与校园生活指南。',
  ogTitle: '仰恩新生指南',
  ogDescription: '面向仰恩大学新生的校园地图、办事流程与校园生活指南。',
  ogSiteName: '仰恩新生指南',
  ogType: 'website',
  ogLocale: 'zh_CN',
  ogImage: 'https://yeu.huiliyill.cn/icons/app-icon-512.png',
  ogImageWidth: 512,
  ogImageHeight: 512,
  ogImageAlt: '仰恩新生指南',
  twitterCard: 'summary_large_image',
  twitterImage: 'https://yeu.huiliyill.cn/icons/app-icon-512.png'
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
  </UApp>
</template>
