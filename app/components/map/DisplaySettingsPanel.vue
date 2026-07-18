<script setup lang="ts">
import type { MapBaseStyle, MapDisplayOptions, MapLabelSize } from '~~/map/core/provider'

type DisplayToggleKey = Exclude<keyof MapDisplayOptions, 'labelSize'>

const props = defineProps<{
  baseStyle: MapBaseStyle
  displayOptions: MapDisplayOptions
}>()

const emit = defineEmits<{
  close: []
  setBaseStyle: [style: MapBaseStyle]
  toggleOption: [option: DisplayToggleKey]
  setLabelSize: [size: MapLabelSize]
}>()

const labelSizeOptions: Array<{ value: MapLabelSize, label: string }> = [
  { value: 'large', label: '大' },
  { value: 'medium', label: '中' },
  { value: 'small', label: '小' },
  { value: 'extra-small', label: '极小' }
]

const mapBaseStyleOptions: Array<{ value: MapBaseStyle, label: string, icon: string }> = [
  { value: 'standard', label: '标准地图', icon: 'i-lucide-map' },
  { value: 'satellite', label: '卫星地图', icon: 'i-lucide-satellite' }
]

const displayToggleItems: Array<{ key: DisplayToggleKey, label: string, icon: string }> = [
  { key: 'showPois', label: '地图标记', icon: 'i-lucide-map-pin' },
  { key: 'showAreas', label: '区域范围', icon: 'i-lucide-pentagon' },
  { key: 'showLabels', label: '地点名称', icon: 'i-lucide-type' },
  { key: 'autoCluster', label: '合并附近标记', icon: 'i-lucide-orbit' }
]
</script>

<template>
  <section
    class="absolute right-16 top-3 z-20 w-[min(19rem,calc(100%-5rem))] rounded-lg border border-zinc-200 bg-white p-3 shadow-xl md:right-20 md:top-4"
    aria-label="地图显示设置"
  >
    <div class="flex items-center justify-between gap-3">
      <h2 class="text-sm font-bold text-zinc-950">
        地图显示设置
      </h2>
      <UButton
        icon="i-lucide-x"
        color="neutral"
        variant="ghost"
        size="xs"
        aria-label="关闭地图显示设置"
        @click="emit('close')"
      />
    </div>

    <p class="mt-3 text-xs font-semibold text-zinc-500">
      地图样式
    </p>
    <div class="mt-2 grid grid-cols-2 overflow-hidden rounded-md border border-zinc-200">
      <button
        v-for="style in mapBaseStyleOptions"
        :key="style.value"
        type="button"
        class="flex min-h-11 items-center justify-center gap-2 px-2 text-xs font-medium"
        :class="props.baseStyle === style.value ? 'bg-blue-600 text-white' : 'bg-white text-zinc-700 hover:bg-zinc-50'"
        :aria-pressed="props.baseStyle === style.value"
        @click="emit('setBaseStyle', style.value)"
      >
        <UIcon
          :name="style.icon"
          class="size-4"
        />
        {{ style.label }}
      </button>
    </div>

    <p class="mt-4 text-xs font-semibold text-zinc-500">
      显示内容
    </p>
    <div class="mt-2 grid grid-cols-3 gap-2">
      <button
        v-for="item in displayToggleItems"
        :key="item.key"
        type="button"
        class="flex min-h-16 flex-col items-center justify-center gap-1 rounded-md border px-2 text-xs font-medium transition"
        :class="props.displayOptions[item.key] ? 'border-blue-200 bg-blue-50 text-blue-700' : 'border-zinc-200 bg-white text-zinc-500'"
        :aria-pressed="props.displayOptions[item.key]"
        @click="emit('toggleOption', item.key)"
      >
        <UIcon
          :name="item.icon"
          class="size-5"
        />
        {{ item.label }}
      </button>
      <button
        type="button"
        class="flex min-h-16 cursor-not-allowed flex-col items-center justify-center gap-1 rounded-md border border-zinc-200 bg-zinc-50 px-2 text-xs font-medium text-zinc-400"
        disabled
        title="校园分区暂时没有可确认的范围"
      >
        <UIcon
          name="i-lucide-map-pinned"
          class="size-5"
        />
        校园分区
      </button>
    </div>
    <p class="mt-2 text-[11px] leading-4 text-zinc-500">
      校园分区范围还没有可确认的资料，先用地点和区域范围找路。
    </p>

    <div class="mt-4">
      <p class="text-xs font-semibold text-zinc-500">
        文字大小
      </p>
      <div class="mt-2 grid grid-cols-4 overflow-hidden rounded-md border border-zinc-200">
        <button
          v-for="size in labelSizeOptions"
          :key="size.value"
          type="button"
          class="min-h-10 px-2 text-xs font-medium"
          :class="props.displayOptions.labelSize === size.value ? 'bg-blue-600 text-white' : 'bg-white text-zinc-600 hover:bg-zinc-50'"
          :aria-pressed="props.displayOptions.labelSize === size.value"
          @click="emit('setLabelSize', size.value)"
        >
          {{ size.label }}
        </button>
      </div>
    </div>
  </section>
</template>
