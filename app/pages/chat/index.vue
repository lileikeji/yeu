<script setup lang="ts">
import { getRequestMessage, getRequestStatusCode, isAuthorizationError } from '~~/app/utils/request-error'
import { userFetch } from '~~/app/utils/user-request'

definePageMeta({
  middleware: 'auth'
})

useSeoMeta({
  title: '群聊',
  description: '公共群与宿舍楼群，登录后可用。',
  robots: 'noindex, nofollow'
})

type ChatRoom = {
  id: string
  kind: string
  slug: string
  title: string
  dormBuilding: string | null
  isMutedAll: boolean
  isMuted: boolean
  muteReason: string | null
  isActive: boolean
}

type ChatMessage = {
  id: string
  roomId: string
  userId: string
  displayName: string
  body: string
  createdAt: string
}

const { user, isAuthenticated, refreshSession } = useUserSession()

const loading = ref(true)
const rooms = ref<ChatRoom[]>([])
const activeRoomId = ref('')
const messages = ref<ChatMessage[]>([])
const draft = ref('')
const sending = ref(false)
const loadError = ref('')
const sendError = ref('')
const listEl = ref<HTMLElement | null>(null)
let pollTimer: ReturnType<typeof setInterval> | null = null
let stickToBottom = true

const activeRoom = computed(() => rooms.value.find(room => room.id === activeRoomId.value) || null)
const composerLocked = computed(() => Boolean(activeRoom.value?.isMutedAll || activeRoom.value?.isMuted))

type ChatRoomMuteState = {
  id: string
  isMutedAll: boolean
  isMuted: boolean
  muteReason: string | null
}

function applyRoomMuteState(state: ChatRoomMuteState | null | undefined): void {
  if (!state?.id) return
  const index = rooms.value.findIndex(room => room.id === state.id)
  if (index < 0) return
  const current = rooms.value[index]
  if (
    current.isMutedAll === state.isMutedAll
    && current.isMuted === state.isMuted
    && current.muteReason === state.muteReason
  ) {
    return
  }
  rooms.value[index] = {
    ...current,
    isMutedAll: state.isMutedAll,
    isMuted: state.isMuted,
    muteReason: state.muteReason
  }
}

const composerLockReason = computed(() => {
  if (activeRoom.value?.isMutedAll) return '当前房间已全员禁言'
  if (activeRoom.value?.isMuted) {
    return activeRoom.value.muteReason
      ? `你已被禁言：${activeRoom.value.muteReason}`
      : '你已被禁言，暂时无法发言'
  }
  return ''
})

function formatTime(iso: string): string {
  try {
    const date = new Date(iso)
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    }).format(date)
  } catch {
    return iso
  }
}

async function ensureAuth(): Promise<boolean> {
  await refreshSession(true)
  if (!isAuthenticated.value) {
    await navigateTo({ path: '/login', query: { redirect: '/chat' } }, { replace: true })
    return false
  }
  return true
}

async function loadRooms(): Promise<void> {
  const payload = await userFetch<{ items: ChatRoom[] }>('/api/chat/rooms')
  rooms.value = payload.items || []
  if (!activeRoomId.value && rooms.value.length) {
    activeRoomId.value = rooms.value[0].id
  }
  if (activeRoomId.value && !rooms.value.some(room => room.id === activeRoomId.value)) {
    activeRoomId.value = rooms.value[0]?.id || ''
  }
}

async function loadInitialMessages(): Promise<void> {
  if (!activeRoomId.value) {
    messages.value = []
    return
  }
  const payload = await userFetch<{ items: ChatMessage[]; room?: ChatRoomMuteState }>(
    `/api/chat/rooms/${encodeURIComponent(activeRoomId.value)}/messages`,
    { query: { limit: 50 } }
  )
  applyRoomMuteState(payload.room)
  messages.value = payload.items || []
  await nextTick()
  scrollToBottom(true)
}

async function pollMessages(): Promise<void> {
  if (!activeRoomId.value) return
  const after = messages.value[messages.value.length - 1]?.id
  const payload = await userFetch<{ items: ChatMessage[]; room?: ChatRoomMuteState }>(
    `/api/chat/rooms/${encodeURIComponent(activeRoomId.value)}/messages`,
    { query: after ? { after, limit: 50 } : { limit: 50 } }
  )
  // Always refresh mute/all-mute flags so admin actions lock the composer without reload.
  applyRoomMuteState(payload.room)
  const incoming = payload.items || []
  if (!incoming.length) return
  const known = new Set(messages.value.map(item => item.id))
  const fresh = incoming.filter(item => !known.has(item.id))
  if (!fresh.length) return
  messages.value = [...messages.value, ...fresh]
  if (stickToBottom) {
    await nextTick()
    scrollToBottom(false)
  }
}

function scrollToBottom(force: boolean): void {
  const el = listEl.value
  if (!el) return
  if (force || stickToBottom) {
    el.scrollTop = el.scrollHeight
  }
}

function onListScroll(): void {
  const el = listEl.value
  if (!el) return
  stickToBottom = el.scrollHeight - el.scrollTop - el.clientHeight < 48
}

async function switchRoom(roomId: string): Promise<void> {
  if (roomId === activeRoomId.value) return
  activeRoomId.value = roomId
  sendError.value = ''
  stickToBottom = true
  try {
    await loadInitialMessages()
  } catch (error) {
    loadError.value = getRequestMessage(error, '加载消息失败')
  }
}

async function sendMessage(): Promise<void> {
  const body = draft.value.trim()
  if (!body || !activeRoomId.value || sending.value || composerLocked.value) return
  sending.value = true
  sendError.value = ''
  try {
    const payload = await userFetch<{ message: ChatMessage }>(
      `/api/chat/rooms/${encodeURIComponent(activeRoomId.value)}/messages`,
      {
        method: 'POST',
        body: { body }
      }
    )
    draft.value = ''
    if (payload.message && !messages.value.some(item => item.id === payload.message.id)) {
      messages.value = [...messages.value, payload.message]
    }
    stickToBottom = true
    await nextTick()
    scrollToBottom(true)
  } catch (error) {
    const status = getRequestStatusCode(error)
    if (status === 401) {
      await navigateTo({ path: '/login', query: { redirect: '/chat' } }, { replace: true })
      return
    }
    // Mute and other 403s should lock the composer, not bounce the user to login.
    if (status === 403) {
      try {
        await loadRooms()
      } catch {
        // ignore secondary refresh failures
      }
    }
    sendError.value = getRequestMessage(error, '发送失败')
  } finally {
    sending.value = false
  }
}

function startPolling(): void {
  stopPolling()
  pollTimer = setInterval(() => {
    void pollMessages().catch((error) => {
      const status = getRequestStatusCode(error)
      if (status === 401) {
        stopPolling()
        void navigateTo({ path: '/login', query: { redirect: '/chat' } }, { replace: true })
      }
    })
  }, 3000)
}

function stopPolling(): void {
  if (pollTimer) {
    clearInterval(pollTimer)
    pollTimer = null
  }
}

onMounted(async () => {
  loading.value = true
  loadError.value = ''
  const ok = await ensureAuth()
  if (!ok) return
  try {
    await loadRooms()
    await loadInitialMessages()
    startPolling()
  } catch (error) {
    const status = getRequestStatusCode(error)
    if (status === 401) {
      await navigateTo({ path: '/login', query: { redirect: '/chat' } }, { replace: true })
      return
    }
    loadError.value = getRequestMessage(error, '群聊暂时不可用')
  } finally {
    loading.value = false
  }
})

onBeforeUnmount(() => {
  stopPolling()
})

watch(activeRoomId, () => {
  stickToBottom = true
})
</script>

<template>
  <div class="page-shell py-4 sm:py-8">
    <div class="mx-auto flex max-w-5xl flex-col gap-4">
      <div class="flex flex-wrap items-end justify-between gap-3">
        <div>
          <p class="text-xs font-semibold text-green-700">
            群聊
          </p>
          <h1 class="mt-1 text-2xl font-bold text-zinc-950">
            公共群与宿舍楼群
          </h1>
          <p class="mt-1 text-sm text-zinc-500">
            当前身份：{{ user?.displayName || '…' }} · 不登录不能聊天
          </p>
        </div>
        <div class="flex gap-2">
          <UButton
            to="/me"
            color="neutral"
            variant="outline"
            size="sm"
            icon="i-lucide-user-round"
          >
            个人中心
          </UButton>
        </div>
      </div>

      <div
        v-if="loading"
        class="rounded-2xl border border-[var(--line)] bg-white p-8 text-sm text-zinc-500"
      >
        正在进入群聊…
      </div>

      <div
        v-else-if="loadError"
        class="rounded-2xl border border-red-200 bg-red-50 p-5 text-sm text-red-800"
      >
        {{ loadError }}
      </div>

      <div
        v-else
        class="grid min-h-[70vh] overflow-hidden rounded-2xl border border-[var(--line)] bg-white shadow-sm lg:grid-cols-[15rem_minmax(0,1fr)]"
      >
        <aside class="border-b border-zinc-100 bg-zinc-50/80 p-3 lg:border-b-0 lg:border-r">
          <p class="px-2 pb-2 text-xs font-semibold text-zinc-500">
            房间
          </p>
          <div class="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
            <button
              v-for="room in rooms"
              :key="room.id"
              type="button"
              class="min-w-[9rem] rounded-xl px-3 py-2 text-left text-sm transition lg:min-w-0"
              :class="room.id === activeRoomId
                ? 'bg-green-700 text-white shadow-sm'
                : 'bg-white text-zinc-700 ring-1 ring-zinc-200 hover:bg-green-50'"
              @click="switchRoom(room.id)"
            >
              <span class="block font-medium">
                {{ room.title }}
              </span>
              <span
                class="mt-0.5 block text-[11px] opacity-80"
              >
                {{ room.kind === 'public' ? '公共' : '宿舍楼' }}
                <template v-if="room.isMutedAll"> · 全员禁言</template>
                <template v-else-if="room.isMuted"> · 你已被禁言</template>
              </span>
            </button>
          </div>
          <p
            v-if="!rooms.some(room => room.kind === 'dorm')"
            class="mt-3 px-2 text-xs leading-5 text-zinc-500"
          >
            在个人中心填写宿舍楼后，可自动出现楼群入口。
          </p>
        </aside>

        <section class="flex min-h-[28rem] flex-col">
          <header class="flex items-center justify-between gap-3 border-b border-zinc-100 px-4 py-3">
            <div class="min-w-0">
              <h2 class="truncate font-semibold text-zinc-950">
                {{ activeRoom?.title || '未选择房间' }}
              </h2>
              <p class="text-xs text-zinc-500">
                消息格式：用户名 + 时间，下一行内容
              </p>
            </div>
          </header>

          <div
            ref="listEl"
            class="flex-1 space-y-4 overflow-y-auto px-4 py-4"
            @scroll="onListScroll"
          >
            <p
              v-if="!messages.length"
              class="py-10 text-center text-sm text-zinc-400"
            >
              还没有消息，来打个招呼吧。
            </p>
            <article
              v-for="message in messages"
              :key="message.id"
              class="max-w-2xl"
            >
              <p class="text-xs text-zinc-500">
                <span class="font-medium text-zinc-800">{{ message.displayName }}</span>
                <span class="mx-2 text-zinc-300">·</span>
                <time :datetime="message.createdAt">{{ formatTime(message.createdAt) }}</time>
              </p>
              <p class="mt-1 whitespace-pre-wrap break-words rounded-2xl bg-zinc-50 px-3 py-2 text-sm leading-6 text-zinc-800 ring-1 ring-zinc-100">
                {{ message.body }}
              </p>
            </article>
          </div>

          <footer class="border-t border-zinc-100 p-3 sm:p-4">
            <div
              v-if="sendError"
              class="mb-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-700"
            >
              {{ sendError }}
            </div>
            <div
              v-if="composerLocked"
              class="mb-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-xs text-amber-800"
            >
              {{ composerLockReason }}
            </div>
            <form
              class="flex items-end gap-2"
              @submit.prevent="sendMessage"
            >
              <UTextarea
                v-model="draft"
                :rows="2"
                autoresize
                maxlength="1000"
                class="w-full"
                :placeholder="composerLocked ? composerLockReason : '输入消息，回车发送前请确认内容合适'"
                :disabled="sending || !activeRoomId || composerLocked"
              />
              <UButton
                type="submit"
                color="primary"
                icon="i-lucide-send"
                :loading="sending"
                :disabled="!draft.trim() || !activeRoomId || composerLocked"
              >
                发送
              </UButton>
            </form>
          </footer>
        </section>
      </div>
    </div>
  </div>
</template>
