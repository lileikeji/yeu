<script setup lang="ts">
import type { AdminResourceConfig } from '~/components/admin/types'
import { getAdminSectionConfig } from '~~/app/utils/admin-section-config'

definePageMeta({ layout: 'admin' })

const route = useRoute()
const section = computed(() => String(route.params.section))

const current = computed<AdminResourceConfig>(() => {
  const config = getAdminSectionConfig(section.value)
  if (!config) {
    throw createError({ statusCode: 404, statusMessage: '管理模块不存在' })
  }
  return config
})

useSeoMeta({
  title: () => current.value.title,
  robots: 'noindex, nofollow'
})
</script>

<template>
  <AdminResourceManager :config="current" />
</template>
