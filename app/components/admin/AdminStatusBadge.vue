<script setup lang="ts">
const props = defineProps<{
  value?: unknown
}>()

type BadgeColor = 'neutral' | 'success' | 'warning' | 'error' | 'info' | 'primary'

const statusMap: Record<string, { label: string, color: BadgeColor }> = {
  draft: { label: '草稿', color: 'neutral' },
  published: { label: '已发布', color: 'success' },
  archived: { label: '已下架', color: 'warning' },
  new: { label: '待处理', color: 'warning' },
  reviewing: { label: '处理中', color: 'info' },
  pending: { label: '待处理', color: 'warning' },
  processing: { label: '处理中', color: 'info' },
  resolved: { label: '已解决', color: 'success' },
  closed: { label: '已关闭', color: 'neutral' },
  spam: { label: '垃圾信息', color: 'error' },
  missing: { label: '缺少坐标', color: 'neutral' },
  verified: { label: '已确认', color: 'success' },
  unverified: { label: '待确认', color: 'warning' },
  rejected: { label: '已驳回', color: 'error' },
  failed: { label: '失败', color: 'error' },
  active: { label: '有效', color: 'success' },
  unavailable: { label: '不可用', color: 'warning' },
  disputed: { label: '存在争议', color: 'error' },
  inactive: { label: '停用', color: 'neutral' }
}

const normalized = computed(() => String(props.value ?? '').trim().toLowerCase())
const badge = computed(() => statusMap[normalized.value] ?? {
  label: normalized.value || '未知',
  color: 'neutral' as const
})
</script>

<template>
  <UBadge
    :color="badge.color"
    variant="soft"
    size="sm"
  >
    {{ badge.label }}
  </UBadge>
</template>
