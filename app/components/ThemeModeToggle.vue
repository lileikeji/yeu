<script setup lang="ts">
import type { ThemeMode } from '~/utils/theme-mode'

const { mode, isDark, setMode } = useThemeMode()

const themeOptions: Array<{ label: string, value: ThemeMode, icon: string }> = [
  { label: '跟随系统', value: 'system', icon: 'i-lucide-monitor' },
  { label: '浅色', value: 'light', icon: 'i-lucide-sun' },
  { label: '深色', value: 'dark', icon: 'i-lucide-moon' }
]

const items = computed(() => themeOptions.map(option => ({
  label: option.label,
  type: 'checkbox' as const,
  checked: mode.value === option.value,
  onSelect: () => setMode(option.value)
})))

const modeLabel = computed(() => themeOptions.find(option => option.value === mode.value)?.label ?? '跟随系统')
const icon = computed(() => isDark.value ? 'i-lucide-moon' : 'i-lucide-sun')
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'end', sideOffset: 8 }"
  >
    <UButton
      :icon="icon"
      color="neutral"
      variant="ghost"
      :aria-label="`外观主题：${modeLabel}。点击切换浅色/深色/跟随系统`"
      class="min-h-10 min-w-10 md:min-h-11 md:min-w-11"
    />
  </UDropdownMenu>
</template>
