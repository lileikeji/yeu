<script setup lang="ts">
definePageMeta({ layout: 'admin' })

const route = useRoute()
const createKind = computed<'club' | 'department'>(() => (
  route.query.kind === 'department' ? 'department' : 'club'
))

useSeoMeta({
  title: '可视化新增组织',
  robots: 'noindex, nofollow'
})
</script>

<template>
  <AdminOrganizationVisualEditor :create-kind="createKind" />
</template>
