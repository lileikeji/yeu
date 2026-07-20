<script setup lang="ts">
const { $pwa } = useNuxtApp()
const updateButton = ref<HTMLButtonElement | null>(null)
const updating = ref(false)

watch(
  () => Boolean($pwa?.needRefresh),
  async (visible) => {
    if (!visible) return
    await nextTick()
    updateButton.value?.focus()
  }
)

async function applyUpdate(): Promise<void> {
  if (!$pwa || updating.value) return
  updating.value = true
  try {
    await $pwa.updateServiceWorker(true)
  } finally {
    updating.value = false
  }
}

async function dismissUpdate(): Promise<void> {
  await $pwa?.cancelPrompt()
}
</script>

<template>
  <aside
    v-if="$pwa?.needRefresh"
    role="alertdialog"
    aria-modal="false"
    aria-labelledby="pwa-update-title"
    aria-describedby="pwa-update-description"
    class="fixed inset-x-4 bottom-[calc(var(--mobile-nav-height)+env(safe-area-inset-bottom)+0.75rem)] z-50 mx-auto max-w-md rounded-lg border border-green-700 bg-white p-4 shadow-2xl md:bottom-6 md:right-6 md:left-auto md:mx-0 md:w-[24rem]"
  >
    <p
      id="pwa-update-title"
      class="text-sm font-bold text-zinc-950"
    >
      新版本已经准备好
    </p>
    <p
      id="pwa-update-description"
      class="mt-1 text-sm leading-6 text-zinc-600"
    >
      立即更新会刷新当前页面。如果正在填写内容，可以稍后再更新。
    </p>
    <div class="mt-4 flex justify-end gap-2">
      <button
        type="button"
        class="min-h-10 rounded-md px-4 text-sm font-semibold text-zinc-700 hover:bg-zinc-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
        @click="dismissUpdate"
      >
        稍后
      </button>
      <button
        ref="updateButton"
        type="button"
        class="min-h-10 rounded-md bg-green-600 px-4 text-sm font-semibold text-white hover:bg-green-700 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700 disabled:cursor-wait disabled:opacity-70"
        :disabled="updating"
        @click="applyUpdate"
      >
        {{ updating ? '正在更新…' : '立即更新' }}
      </button>
    </div>
  </aside>
</template>
