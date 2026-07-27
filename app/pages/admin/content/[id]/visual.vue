<script setup lang="ts">
definePageMeta({ layout: 'admin' })

const route = useRoute()
const contentId = computed(() => String(route.params.id ?? ''))
const allowDetailedEdit = ref(false)

interface AdminSessionPayload {
  authenticated?: boolean
  admin?: {
    role?: string
  }
}

onMounted(async () => {
  try {
    const session = await adminFetch<AdminSessionPayload>('/api/admin/auth/session')
    allowDetailedEdit.value = session.authenticated === true && session.admin?.role === 'super'
  } catch {
    allowDetailedEdit.value = false
  }
})

useSeoMeta({
  title: '可视化编辑',
  robots: 'noindex, nofollow'
})
</script>

<template>
  <AdminOrganizationVisualEditor
    :content-id="contentId"
    :allow-detailed-edit="allowDetailedEdit"
  />
</template>
