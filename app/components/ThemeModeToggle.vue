<script setup lang="ts">
import type { DropdownMenuItem } from '@nuxt/ui'
import type { ThemeMode } from '~/utils/theme-mode'

const { mode, isDark, palette, palettes, setMode, setPalette } = useThemeMode()

const themeOptions: Array<{ label: string, value: ThemeMode, icon: string }> = [
  { label: '跟随系统', value: 'system', icon: 'i-lucide-monitor' },
  { label: '浅色', value: 'light', icon: 'i-lucide-sun' },
  { label: '深色', value: 'dark', icon: 'i-lucide-moon' }
]

const items = computed<DropdownMenuItem[][]>(() => [
  [
    { type: 'label', label: '外观' },
    ...themeOptions.map(option => ({
      label: option.label,
      type: 'checkbox' as const,
      checked: mode.value === option.value,
      onSelect: () => setMode(option.value),
      icon: option.icon
    }))
  ],
  [
    { type: 'label', label: '主题配色' },
    ...palettes.map(p => ({
      type: 'checkbox' as const,
      label: p.label,
      checked: palette.value === p.id,
      onSelect: () => setPalette(p.id),
      icon: 'i-lucide-circle',
      ui: { itemLeadingIcon: p.swatchClass }
    }))
  ]
])

const modeLabel = computed(() => themeOptions.find(option => option.value === mode.value)?.label ?? '跟随系统')
const paletteLabel = computed(() => palettes.find(p => p.id === palette.value)?.label ?? '绿（默认）')
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
      :aria-label="`外观主题：${modeLabel}，当前配色：${paletteLabel}。点击切换浅色/深色/跟随系统与配色`"
      class="justify-center min-h-10 min-w-10 md:min-h-11 md:min-w-11"
    />
  </UDropdownMenu>
</template>
