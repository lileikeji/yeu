<script setup lang="ts">
definePageMeta({ layout: 'admin' })

const route = useRoute()
const createKind = computed<'club' | 'department'>(() => (
  route.query.kind === 'department' ? 'department' : 'club'
))
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
  title: '可视化新增组织',
  robots: 'noindex, nofollow'
})
</script>

<template>
  <AdminOrganizationVisualEditor
    :create-kind="createKind"
    :allow-detailed-edit="allowDetailedEdit"
  />
</template>
