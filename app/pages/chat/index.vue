<script setup lang="ts">
import { getRequestMessage, getRequestStatusCode } from '~~/app/utils/request-error'
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
  placeId?: string | null
  isMutedAll: boolean
  isMuted: boolean
  muteReason: string | null
  isActive: boolean
}

type PlaceChatRoom = {
  placeId: string
  title: string
  roomId: string | null
  memberCount: number
}

type ChatMessage = {
  id: string
  roomId: string
  userId: string
  displayName: string
  body: string
  createdAt: string
}

const route = useRoute()
const { isAuthenticated, refreshSession } = useUserSession()

const loading = ref(true)
const rooms = ref<ChatRoom[]>([])
const placeRooms = ref<PlaceChatRoom[]>([])
const placeFilter = ref('')
const searchOpen = ref(false)
const searchKeyword = ref('')
const searchResults = ref<Array<ChatMessage & { roomId: string }>>([])
const searching = ref(false)
const searchDone = ref(false)
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
const filteredPlaceRooms = computed(() => {
  const keyword = placeFilter.value.trim().toLowerCase()
  if (!keyword) return placeRooms.value
  return placeRooms.value.filter(room => room.title.toLowerCase().includes(keyword))
})
const composerLocked = computed(() => Boolean(activeRoom.value?.isMutedAll || activeRoom.value?.isMuted))
const activeRoomDescription = computed(() => {
  if (!activeRoom.value) return '请选择一个群聊'
  if (activeRoom.value.kind === 'public') return '登录后都能看'
  if (activeRoom.value.kind === 'place') return '本楼同学的交流区'
  return activeRoom.value.dormBuilding
    ? `${activeRoom.value.dormBuilding}楼群`
    : '同宿舍楼同学的交流区'
})

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
  if (!current) return
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
  if (activeRoom.value?.isMutedAll) return '当前群聊已开启全员禁言'
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
    activeRoomId.value = rooms.value[0]?.id || ''
  }
  if (activeRoomId.value && !rooms.value.some(room => room.id === activeRoomId.value)) {
    activeRoomId.value = rooms.value[0]?.id || ''
  }
}

async function runSearch(): Promise<void> {
  const keyword = searchKeyword.value.trim()
  if (!keyword || !activeRoomId.value) return
  searching.value = true
  searchDone.value = false
  try {
    const payload = await userFetch<{ items: ChatMessage[] }>(`/api/chat/rooms/${encodeURIComponent(activeRoomId.value)}/search`, {
      query: { q: keyword }
    })
    searchResults.value = payload.items || []
    searchDone.value = true
  } catch (error) {
    searchResults.value = []
    searchDone.value = true
    sendError.value = getRequestMessage(error, '搜索失败，请稍后再试')
  }
}

function toggleSearch(): void {
  searchOpen.value = !searchOpen.value
  if (!searchOpen.value) {
    searchKeyword.value = ''
    searchResults.value = []
    searchDone.value = false
  }
}

async function loadPlaceRooms(): Promise<void> {
  try {
    const payload = await userFetch<{ items: PlaceChatRoom[] }>('/api/chat/places-rooms')
    placeRooms.value = payload.items || []
  } catch {
    placeRooms.value = []
  }
}

/** 进入楼栋群：懒建房，把房间合成进列表并选中。 */
const enteringPlaceId = ref('')

async function openPlaceRoom(place: PlaceChatRoom): Promise<void> {
  if (enteringPlaceId.value) return
  enteringPlaceId.value = place.placeId
  try {
    if (place.roomId) {
      const existing = rooms.value.find(room => room.id === place.roomId)
      if (!existing) {
        rooms.value = [...rooms.value, {
          id: place.roomId,
          kind: 'place',
          slug: `place-${place.placeId}`,
          title: place.title,
          dormBuilding: null,
          placeId: place.placeId,
          isMutedAll: false,
          isMuted: false,
          muteReason: null,
          isActive: true
        }]
      }
      activeRoomId.value = place.roomId
      stickToBottom = true
      await loadInitialMessages()
    } else {
      await enterPlaceChat(place.placeId)
    }
  } catch (error) {
    sendError.value = getRequestMessage(error, '进不了这个楼栋群，请稍后再试')
  } finally {
    enteringPlaceId.value = ''
  }
}

async function enterPlaceChat(placeId: string): Promise<void> {
  const response = await userFetch<{ roomId: string, title: string }>('/api/chat/rooms/place', {
    method: 'POST',
    body: { placeId }
  })
  const existing = rooms.value.find(room => room.id === response.roomId)
  if (!existing) {
    rooms.value = [...rooms.value, {
      id: response.roomId,
      kind: 'place',
      slug: `place-${placeId}`,
      title: response.title,
      dormBuilding: null,
      placeId,
      isMutedAll: false,
      isMuted: false,
      muteReason: null,
      isActive: true
    }]
    // 同步楼栋列表里的 roomId，再次点击直接切房
    placeRooms.value = placeRooms.value.map(item =>
      item.placeId === placeId ? { ...item, roomId: response.roomId } : item)
  }
  activeRoomId.value = response.roomId
  stickToBottom = true
  await loadInitialMessages()
}

async function loadInitialMessages(): Promise<void> {
  if (!activeRoomId.value) {
    messages.value = []
    return
  }
  const payload = await userFetch<{ items: ChatMessage[], room?: ChatRoomMuteState }>(
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
  const payload = await userFetch<{ items: ChatMessage[], room?: ChatRoomMuteState }>(
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
  searchOpen.value = false
  if (roomId === activeRoomId.value) return
  activeRoomId.value = roomId
  sendError.value = ''
  stickToBottom = true
  try {
    await loadInitialMessages()
  } catch (error) {
    loadError.value = getRequestMessage(error, '消息暂时没显示出来，请重新打开群聊。')
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
    sendError.value = getRequestMessage(error, '这条消息没发出去，请再试一次。')
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
    const queryPlace = Array.isArray(route.query.place) ? route.query.place[0] : route.query.place
    if (typeof queryPlace === 'string' && queryPlace.trim()) {
      await enterPlaceChat(queryPlace.trim())
      await loadPlaceRooms()
    } else {
      await loadPlaceRooms()
      await loadInitialMessages()
    }
    startPolling()
  } catch (error) {
    const status = getRequestStatusCode(error)
    if (status === 401) {
      await navigateTo({ path: '/login', query: { redirect: '/chat' } }, { replace: true })
      return
    }
    loadError.value = getRequestMessage(error, '现在还进不了群聊，请稍后再试。')
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
          <p class="text-xs font-semibold text-green-700 dark:text-green-400">
            群聊
          </p>
          <h1 class="mt-1 text-2xl font-bold text-zinc-950 dark:text-zinc-100">
            群聊
          </h1>
        </div>
        <div class="flex gap-2">
          <UButton
            to="/me"
            color="neutral"
            variant="outline"
            size="sm"
            icon="i-lucide-user-round"
            class="min-h-11"
          >
            个人中心
          </UButton>
        </div>
      </div>

      <div
        v-if="loading"
        class="flex items-center gap-2 rounded-lg border border-[var(--line)] bg-[var(--surface)] dark:bg-zinc-900 p-8 text-sm text-zinc-500 dark:text-zinc-400"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-4 animate-spin"
        />
        正在进入群聊…
      </div>

      <div
        v-else-if="loadError"
        class="rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 p-5 text-sm text-red-800 dark:text-red-300"
      >
        {{ loadError }}
      </div>

      <div
        v-else
        class="grid min-h-[70vh] overflow-hidden rounded-lg border border-[var(--line)] bg-[var(--surface)] dark:bg-zinc-900 shadow-sm lg:h-[calc(100vh-var(--header-height)-5rem)] lg:min-h-0 lg:grid-cols-[15rem_minmax(0,1fr)]"
      >
        <aside class="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 p-3 lg:min-h-0 lg:overflow-y-auto lg:border-b-0 lg:border-r">
          <p class="px-2 pb-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
            群聊
          </p>
          <div class="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
            <button
              v-for="room in rooms"
              :key="room.id"
              type="button"
              class="min-h-11 min-w-[9rem] rounded-xl px-3 py-2 text-left text-sm transition lg:min-w-0"
              :class="room.id === activeRoomId
                ? 'bg-green-700 text-[var(--surface)] shadow-sm'
                : 'bg-[var(--surface)] dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 ring-1 ring-zinc-200 dark:ring-zinc-700 hover:bg-green-50 dark:hover:bg-green-950'"
              :aria-pressed="room.id === activeRoomId"
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
            class="mt-3 px-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400"
          >
            未填写宿舍楼。
          </p>

          <template v-if="placeRooms.length">
            <p class="mt-4 px-2 pb-2 text-xs font-semibold text-zinc-500 dark:text-zinc-400">
              楼栋群
            </p>
            <div class="px-2 pb-2">
              <UInput
                v-model="placeFilter"
                placeholder="搜索楼栋群…"
                size="xs"
                icon="i-lucide-search"
                class="w-full"
              />
            </div>
            <div class="flex gap-2 overflow-x-auto lg:flex-col lg:overflow-visible">
              <button
                v-for="place in filteredPlaceRooms"
                :key="place.placeId"
                type="button"
                class="min-h-11 min-w-[9rem] rounded-xl px-3 py-2 text-left text-sm transition disabled:opacity-60 lg:min-w-0"
                :class="place.roomId && place.roomId === activeRoomId
                  ? 'bg-green-700 text-[var(--surface)] shadow-sm'
                  : 'bg-[var(--surface)] dark:bg-zinc-900 text-zinc-700 dark:text-zinc-200 ring-1 ring-zinc-200 dark:ring-zinc-700 hover:bg-green-50 dark:hover:bg-green-950'"
                :disabled="enteringPlaceId === place.placeId"
                @click="openPlaceRoom(place)"
              >
                <span class="block truncate font-medium">
                  {{ place.title }}
                </span>
                <span class="mt-0.5 block text-[11px] opacity-80">
                  楼栋群 · {{ place.memberCount }} 人
                </span>
              </button>
              <li
                v-if="!filteredPlaceRooms.length"
                class="px-2 py-3 text-xs text-zinc-400 dark:text-zinc-500"
              >
                没有匹配的楼栋群。
              </li>
            </div>
          </template>
        </aside>

        <section class="flex min-h-[28rem] flex-col lg:min-h-0 lg:border-l-0">
          <header class="flex items-center justify-between gap-3 border-b border-zinc-100 dark:border-zinc-800 px-4 py-3">
            <div class="min-w-0">
              <h2 class="truncate font-semibold text-zinc-950 dark:text-zinc-100">
                {{ activeRoom?.title || '请选择群聊' }}
              </h2>
              <p class="text-xs text-zinc-500 dark:text-zinc-400">
                {{ activeRoomDescription }}
              </p>
            </div>
            <UButton
              color="neutral"
              variant="ghost"
              size="sm"
              :icon="searchOpen ? 'i-lucide-x' : 'i-lucide-search'"
              aria-label="搜索聊天记录"
              class="justify-center shrink-0 min-h-9 min-w-9"
              :disabled="!activeRoomId"
              @click="toggleSearch"
            />
          </header>

          <div
            v-if="searchOpen"
            class="border-b border-zinc-100 dark:border-zinc-800 bg-zinc-50/80 dark:bg-zinc-800/60 px-4 py-3"
          >
            <form
              class="flex items-center gap-2"
              @submit.prevent="runSearch"
            >
              <UInput
                v-model="searchKeyword"
                placeholder="搜这个群的聊天记录…"
                size="sm"
                class="flex-1"
                icon="i-lucide-search"
                @keyup.enter="runSearch"
              />
              <UButton
                type="submit"
                size="sm"
                color="primary"
                :loading="searching"
                label="搜索"
              />
            </form>
            <ul
              v-if="searchResults.length"
              class="mt-2 max-h-48 space-y-1.5 overflow-y-auto"
            >
              <li
                v-for="item in searchResults"
                :key="item.id"
                class="rounded-lg bg-[var(--surface)] dark:bg-zinc-900 px-2.5 py-1.5 text-xs"
              >
                <div class="flex items-center justify-between gap-2">
                  <span class="font-medium text-zinc-700 dark:text-zinc-200">{{ item.displayName }}</span>
                  <span class="text-[10px] tabular-nums text-zinc-400">{{ new Date(item.createdAt).toLocaleString('zh-CN', { month: '2-digit', day: '2-digit', hour: '2-digit', minute: '2-digit', hour12: false }) }}</span>
                </div>
                <p class="mt-0.5 whitespace-pre-line text-zinc-600 dark:text-zinc-300">
                  {{ item.body }}
                </p>
              </li>
            </ul>
            <p
              v-else-if="searchDone"
              class="mt-2 text-xs text-zinc-400 dark:text-zinc-500"
            >
              没有找到包含「{{ searchKeyword }}」的消息。
            </p>
          </div>

          <div
            ref="listEl"
            class="flex-1 space-y-4 overflow-y-auto px-4 py-4"
            @scroll="onListScroll"
          >
            <div
              v-if="!messages.length"
              class="grid place-items-center py-10 text-center"
            >
              <UIcon
                name="i-lucide-message-circle"
                class="size-7 text-zinc-300 dark:text-zinc-600"
              />
              <p class="mt-3 text-sm font-medium text-zinc-600 dark:text-zinc-300">
                {{ activeRoom ? '还没有消息' : '暂时没有可用群聊' }}
              </p>
              <p
                v-if="activeRoom"
                class="mt-1 text-xs text-zinc-400 dark:text-zinc-500"
              >
                先和同学打个招呼吧。
              </p>
            </div>
            <article
              v-for="message in messages"
              :key="message.id"
              class="max-w-2xl"
            >
              <p class="text-xs text-zinc-500 dark:text-zinc-400">
                <span class="font-medium text-zinc-800 dark:text-zinc-100">{{ message.displayName }}</span>
                <span class="mx-2 text-zinc-300 dark:text-zinc-600">·</span>
                <time :datetime="message.createdAt">{{ formatTime(message.createdAt) }}</time>
              </p>
              <p class="mt-1 whitespace-pre-wrap break-words rounded-lg bg-zinc-50 dark:bg-zinc-800/60 px-3 py-2 text-sm leading-6 text-zinc-800 dark:text-zinc-100 ring-1 ring-zinc-100 dark:ring-zinc-800">
                {{ message.body }}
              </p>
            </article>
          </div>

          <footer class="border-t border-zinc-100 dark:border-zinc-800 p-3 sm:p-4">
            <div
              v-if="sendError"
              class="mb-2 rounded-lg border border-red-200 dark:border-red-900 bg-red-50 dark:bg-red-950 px-3 py-2 text-xs text-red-700 dark:text-red-300"
            >
              {{ sendError }}
            </div>
            <div
              v-if="composerLocked"
              class="mb-2 rounded-lg border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 px-3 py-2 text-xs text-amber-800 dark:text-amber-300"
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
                class="min-h-11 w-full"
                :ui="{ base: 'min-h-11' }"
                :placeholder="composerLocked ? composerLockReason : '和同学说点什么…'"
                :disabled="sending || !activeRoomId || composerLocked"
              />
              <UButton
                type="submit"
                color="primary"
                icon="i-lucide-send"
                :loading="sending"
                :disabled="!draft.trim() || !activeRoomId || composerLocked"
                class="min-h-11"
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
