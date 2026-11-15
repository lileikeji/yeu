<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { ThemeMode } from '~/utils/theme-mode'

const { mode, palette, palettes, setMode, setPalette } = useThemeMode()

const themeOptions: Array<{ label: string, value: ThemeMode, icon: string }> = [
  { label: '跟随系统', value: 'system', icon: 'i-lucide-monitor' },
  { label: '浅色', value: 'light', icon: 'i-lucide-sun' },
  { label: '深色', value: 'dark', icon: 'i-lucide-moon' }
]

const items = computed<DropdownMenuItem[][]>(() => {
  const groups: DropdownMenuItem[][] = [[
    { type: 'label', label: '外观' },
    ...themeOptions.map(option => ({
      label: option.label,
      type: 'checkbox' as const,
      checked: mode.value === option.value,
      onSelect: () => setMode(option.value),
      icon: option.icon
    }))
  ]]
  // 只有一套配色时不渲染配色组（2026-11-14：九套旧配色作废，现为 paper/mist/cream/berry 四套）
  if (palettes.length > 1) {
    groups.push([
      { type: 'label', label: '主题配色' },
      ...palettes.map(p => ({
        type: 'checkbox' as const,
        label: p.label,
        checked: palette.value === p.id,
        onSelect: () => setPalette(p.id),
        icon: 'i-lucide-circle',
        ui: { itemLeadingIcon: p.swatchClass }
      }))
    ])
  }
  return groups
})
</script>

<template>
  <UDropdownMenu
    :items="items"
    :content="{ align: 'end', sideOffset: 8 }"
  >
    <UButton
      color="neutral"
      variant="ghost"
      aria-label="外观主题：点击切换浅色/深色/跟随系统与配色"
      class="justify-center min-h-10 min-w-10 md:min-h-11 md:min-w-11"
    >
      <!-- 两枚图标由 CSS 切：SSR 不知道用户存的是暗色，条件 icon 会造成 hydration mismatch -->
      <UIcon
        name="i-lucide-sun"
        class="size-5 dark:hidden"
      />
      <UIcon
        name="i-lucide-moon"
        class="hidden size-5 dark:block"
      />
    </UButton>
  </UDropdownMenu>
</template>
