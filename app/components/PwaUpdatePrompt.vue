<script setup lang="ts">
import { recoverClientPage } from '~~/app/utils/client-recovery'

const { $pwa } = useNuxtApp()
const updating = ref(false)
const dismissed = ref(false)

async function applyUpdate(): Promise<void> {
  if (!$pwa || updating.value) return
  updating.value = true

  try {
    await Promise.race([
      $pwa.updateServiceWorker(true),
      new Promise(resolve => window.setTimeout(resolve, 2500))
    ])
  } finally {
    await recoverClientPage()
  }
}

async function dismissUpdate(): Promise<void> {
  // Hide immediately even if the service-worker prompt state is slow to settle.
  dismissed.value = true
  try {
    await $pwa?.cancelPrompt()
  } catch {
    // Dismissing the visual prompt should not depend on plugin state updates.
  }
}
</script>

<template>
  <aside
    v-if="$pwa?.needRefresh && !dismissed"
    role="status"
    aria-live="polite"
    aria-atomic="true"
    aria-labelledby="pwa-update-title"
    aria-describedby="pwa-update-description"
    class="pointer-events-auto fixed inset-x-3 bottom-[calc(var(--mobile-nav-height)+env(safe-area-inset-bottom)+0.75rem)] z-[100] mx-auto max-w-md rounded-lg border border-green-200 dark:border-green-800 bg-white/95 dark:bg-zinc-900/95 p-3 shadow-xl backdrop-blur md:bottom-6 md:right-6 md:left-auto md:mx-0 md:w-[23rem]"
  >
    <div class="flex items-start gap-3">
      <span class="grid size-9 shrink-0 place-items-center rounded-full bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400">
        <UIcon
          name="i-lucide-sparkles"
          class="size-4.5"
        />
      </span>
      <div class="min-w-0 flex-1">
        <p
          id="pwa-update-title"
          class="text-sm font-bold text-zinc-950 dark:text-zinc-100"
        >
          有新的校园内容
        </p>
        <p
          id="pwa-update-description"
          class="mt-0.5 text-xs leading-5 text-zinc-600 dark:text-zinc-300"
        >
          刷新后生效。正在输入反馈或聊天时，可以先点稍后。
        </p>
        <div class="mt-2 flex items-center justify-end gap-2">
          <button
            type="button"
            class="min-h-11 rounded-md px-3 text-sm font-semibold text-zinc-600 dark:text-zinc-300 hover:bg-zinc-100 dark:hover:bg-zinc-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
            @click="dismissUpdate"
          >
            稍后
          </button>
          <button
            type="button"
            class="min-h-11 rounded-md bg-green-700 px-4 text-sm font-semibold text-white hover:bg-green-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 disabled:cursor-wait disabled:opacity-70"
            :disabled="updating"
            @click="applyUpdate"
          >
            {{ updating ? '正在刷新…' : '刷新看看' }}
          </button>
        </div>
      </div>
    </div>
  </aside>
</template>
