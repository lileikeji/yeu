<script setup lang="ts">
import type { AdminNavigationGroup } from '~~/app/utils/admin-dashboard-presentation'

const props = defineProps<{ groups: AdminNavigationGroup[] }>()

const open = ref(false)
const query = ref('')
const activeIndex = ref(0)
const inputRef = ref<HTMLInputElement | null>(null)
const dialogRef = ref<HTMLDialogElement | null>(null)

const items = computed(() => props.groups.flatMap(group => group.items))

const filtered = computed(() => {
  const keyword = query.value.trim().toLowerCase()
  if (!keyword) return items.value
  return items.value.filter(item => `${item.label} ${item.to}`.toLowerCase().includes(keyword))
})

watch(filtered, () => {
  activeIndex.value = 0
})

onMounted(() => {
  if (import.meta.dev && new URLSearchParams(window.location.search).get('palette') === '1') show()
})

function show() {
  if (open.value) return
  query.value = ''
  activeIndex.value = 0
  open.value = true
  dialogRef.value?.showModal()
  nextTick(() => inputRef.value?.focus())
}

function close() {
  if (!open.value) return
  dialogRef.value?.close()
  open.value = false
}

function move(delta: number) {
  const total = filtered.value.length
  if (total === 0) return
  activeIndex.value = (activeIndex.value + delta + total) % total
  nextTick(() => {
    document.getElementById(`admin-command-item-${activeIndex.value}`)?.scrollIntoView({ block: 'nearest' })
  })
}

async function choose(index: number) {
  const item = filtered.value[index]
  if (!item) return
  close()
  await navigateTo(item.to)
}

function onKeydown(event: KeyboardEvent) {
  if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
    event.preventDefault()
    if (open.value) close()
    else show()
    return
  }
  if (!open.value) return
  if (event.key === 'ArrowDown') {
    event.preventDefault()
    move(1)
  } else if (event.key === 'ArrowUp') {
    event.preventDefault()
    move(-1)
  } else if (event.key === 'Enter') {
    event.preventDefault()
    choose(activeIndex.value)
  } else if (event.key === 'Escape') {
    event.preventDefault()
    close()
  }
}

function onBackdropClick(event: MouseEvent) {
  if (event.target === dialogRef.value) close()
}

onMounted(() => {
  window.addEventListener('keydown', onKeydown)
  window.addEventListener('admin-command-palette', show as EventListener)
})

onUnmounted(() => {
  window.removeEventListener('keydown', onKeydown)
  window.removeEventListener('admin-command-palette', show as EventListener)
})
</script>

<template>
  <dialog
    ref="dialogRef"
    class="admin-command-dialog overflow-hidden rounded-xl border border-zinc-200 bg-[var(--surface)] p-0 shadow-2xl dark:border-zinc-700 dark:bg-zinc-900"
    style="position: fixed; inset: 0; margin: auto; width: min(38rem, calc(100vw - 2rem)); height: fit-content; max-height: min(70vh, 34rem)"
    aria-label="后台命令面板"
    @click="onBackdropClick"
    @close="open = false"
  >
    <div class="flex items-center gap-2 border-b border-zinc-200 px-4 dark:border-zinc-700">
      <svg
        class="size-4 shrink-0 text-zinc-400"
        viewBox="0 0 24 24"
        fill="none"
        stroke="currentColor"
        stroke-width="2"
        aria-hidden="true"
      >
        <circle cx="11" cy="11" r="7" />
        <path d="m20 20-3.5-3.5" />
      </svg>
      <input
        ref="inputRef"
        v-model="query"
        type="text"
        class="h-12 w-full bg-transparent text-sm text-zinc-900 outline-none placeholder:text-zinc-400 dark:text-zinc-100"
        placeholder="输入页面名称跳转…"
        aria-label="搜索后台页面"
        aria-controls="admin-command-list"
        :aria-activedescendant="filtered[activeIndex] ? `admin-command-item-${activeIndex}` : undefined"
        @keydown="onKeydown"
      >
      <kbd class="hidden shrink-0 rounded border border-zinc-200 px-1.5 py-0.5 text-[10px] text-zinc-500 sm:inline dark:border-zinc-700 dark:text-zinc-400">
        Esc
      </kbd>
    </div>
    <ul
      id="admin-command-list"
      class="max-h-80 overflow-y-auto p-2"
      role="listbox"
      aria-label="后台页面"
    >
      <li
        v-for="(item, index) in filtered"
        :id="`admin-command-item-${index}`"
        :key="item.to"
        role="option"
        :aria-selected="index === activeIndex"
        class="flex cursor-pointer items-center gap-2.5 rounded-lg px-3 py-2 text-sm"
        :class="index === activeIndex
          ? 'bg-zinc-100 text-zinc-900 dark:bg-zinc-800 dark:text-zinc-50'
          : 'text-zinc-700 dark:text-zinc-300'"
        @mousemove="activeIndex = index"
        @click="choose(index)"
      >
        <UIcon
          :name="item.icon"
          class="size-4 shrink-0 text-zinc-500 dark:text-zinc-400"
        />
        <span class="truncate">{{ item.label }}</span>
        <span class="ml-auto truncate font-mono text-[11px] text-zinc-400">{{ item.to }}</span>
      </li>
      <li
        v-if="filtered.length === 0"
        class="px-3 py-6 text-center text-sm text-zinc-500 dark:text-zinc-400"
      >
        没有匹配的页面
      </li>
    </ul>
  </dialog>
</template>

<style>
.admin-command-dialog::backdrop {
  background: rgb(24 24 27 / 0.45);
  backdrop-filter: blur(2px);
}
</style>
