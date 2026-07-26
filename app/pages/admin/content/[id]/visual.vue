<script setup lang="ts">
definePageMeta({ layout: 'admin' })

const route = useRoute()
const contentId = computed(() => String(route.params.id ?? ''))

useSeoMeta({
  title: '可视化编辑',
  robots: 'noindex, nofollow'
})
</script>

<template>
  <AdminOrganizationVisualEditor :content-id="contentId" />
</template>
