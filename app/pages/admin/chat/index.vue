<script setup lang="ts">
import { getRequestMessage, isAuthorizationError } from '~~/app/utils/request-error'
import { adminFetch } from '~~/app/utils/admin-request'

definePageMeta({ layout: 'admin' })
useSeoMeta({ title: '群聊管理', robots: 'noindex, nofollow' })

type ChatRoom = {
  id: string
  kind: string
  slug: string
  title: string
  dormBuilding: string | null
  isMutedAll: boolean
  isActive: boolean
  createdAt: string
}

type ChatMessage = {
  id: string
  roomId: string
  userId: string
  displayName: string
  body: string
  deletedAt: string | null
  createdAt: string
}

type MuteRow = {
  id: string
  userId: string
  roomId: string | null
  reason: string
  isActive: boolean
  expiresAt: string | null
  createdAt: string
  displayName?: string | null
  username?: string | null
  roomTitle?: string | null
}

const toast = useToast()
const rooms = ref<ChatRoom[]>([])
const messages = ref<ChatMessage[]>([])
const mutes = ref<MuteRow[]>([])
const loading = ref(false)
const messageLoading = ref(false)
const muteLoading = ref(false)
const errorMessage = ref('')
const roomFilter = ref('')
const q = ref('')
const page = ref(1)
const pageSize = 30
const total = ref(0)

const muteUserId = ref('')
const muteRoomId = ref('')
const muteReason = ref('')

function formatTime(iso: string | null | undefined): string {
  if (!iso) return '—'
  try {
    return new Intl.DateTimeFormat('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      second: '2-digit',
      hour12: false
    }).format(new Date(iso))
  } catch {
    return iso
  }
}

function roomTitle(id: string): string {
  return rooms.value.find(room => room.id === id)?.title || id.slice(0, 8)
}

async function handleAuth(error: unknown): Promise<boolean> {
  if (!isAuthorizationError(error)) return false
  await navigateTo('/admin/login', { replace: true })
  return true
}

async function loadRooms(): Promise<void> {
  const payload = await adminFetch<{ items: ChatRoom[] }>('/api/admin/chat/rooms')
  rooms.value = payload.items || []
}

async function loadMessages(): Promise<void> {
  messageLoading.value = true
  try {
    const payload = await adminFetch<{ items: ChatMessage[]; total: number }>('/api/admin/chat/messages', {
      query: {
        page: page.value,
        pageSize,
        roomId: roomFilter.value || undefined,
        q: q.value.trim() || undefined
      }
    })
    messages.value = payload.items || []
    total.value = payload.total || 0
  } catch (error) {
    if (await handleAuth(error)) return
    toast.add({ title: getRequestMessage(error, '消息加载失败'), color: 'error' })
  } finally {
    messageLoading.value = false
  }
}

async function loadMutes(): Promise<void> {
  muteLoading.value = true
  try {
    const payload = await adminFetch<{ items: MuteRow[] }>('/api/admin/chat/mutes', {
      query: { page: 1, pageSize: 50 }
    })
    mutes.value = payload.items || []
  } catch (error) {
    if (await handleAuth(error)) return
    // optional endpoint may be missing until deploy; soft-fail
    mutes.value = []
  } finally {
    muteLoading.value = false
  }
}

async function refreshAll(): Promise<void> {
  loading.value = true
  errorMessage.value = ''
  try {
    await loadRooms()
    await Promise.all([loadMessages(), loadMutes()])
  } catch (error) {
    if (await handleAuth(error)) return
    errorMessage.value = getRequestMessage(error, '群聊管理数据加载失败')
  } finally {
    loading.value = false
  }
}

async function toggleMuteAll(room: ChatRoom): Promise<void> {
  const nextMuted = !room.isMutedAll
  if (nextMuted && !muteReason.value.trim()) {
    toast.add({ title: '开启全员禁言前请先填写禁言原因', color: 'warning' })
    return
  }
  try {
    await adminFetch(`/api/admin/chat/rooms/${encodeURIComponent(room.id)}/mute-all`, {
      method: 'POST',
      body: {
        muted: nextMuted,
        reason: muteReason.value.trim() || undefined
      }
    })
    toast.add({
      title: room.isMutedAll ? '已取消全员禁言' : '已开启全员禁言',
      color: 'success'
    })
    if (nextMuted) muteReason.value = ''
    await loadRooms()
  } catch (error) {
    if (await handleAuth(error)) return
    toast.add({ title: getRequestMessage(error, '操作失败'), color: 'error' })
  }
}

function prepMute(message: ChatMessage): void {
  muteUserId.value = message.userId
  muteRoomId.value = message.roomId
  muteReason.value = ''
}

async function muteUser(): Promise<void> {
  if (!muteUserId.value.trim()) {
    toast.add({ title: '请填写用户 ID', color: 'warning' })
    return
  }
  if (!muteReason.value.trim()) {
    toast.add({ title: '请填写禁言原因（必填）', color: 'warning' })
    return
  }
  try {
    await adminFetch('/api/admin/chat/mutes', {
      method: 'POST',
      body: {
        userId: muteUserId.value.trim(),
        roomId: muteRoomId.value || null,
        reason: muteReason.value.trim()
      }
    })
    toast.add({ title: '已禁言用户', color: 'success' })
    muteReason.value = ''
    await loadMutes()
  } catch (error) {
    if (await handleAuth(error)) return
    toast.add({ title: getRequestMessage(error, '禁言失败'), color: 'error' })
  }
}

async function unmute(id: string): Promise<void> {
  try {
    await adminFetch(`/api/admin/chat/mutes/${encodeURIComponent(id)}`, {
      method: 'DELETE'
    })
    toast.add({ title: '已解除禁言', color: 'success' })
    await loadMutes()
  } catch (error) {
    if (await handleAuth(error)) return
    toast.add({ title: getRequestMessage(error, '解除失败'), color: 'error' })
  }
}


async function softDeleteMessage(message: ChatMessage): Promise<void> {
  if (message.deletedAt) {
    toast.add({ title: '该消息已删除', color: 'neutral' })
    return
  }
  try {
    await adminFetch(`/api/admin/chat/messages/${encodeURIComponent(message.id)}`, {
      method: 'DELETE'
    })
    toast.add({ title: '已删除消息', color: 'success' })
    await loadMessages()
  } catch (error) {
    if (await handleAuth(error)) return
    toast.add({ title: getRequestMessage(error, '删除失败'), color: 'error' })
  }
}

function applyMessageFilter(): void {
  page.value = 1
  void loadMessages()
}

onMounted(() => {
  void refreshAll()
})
</script>

<template>
  <div class="mx-auto max-w-7xl space-y-6">
    <AdminPageHeader
      title="群聊管理"
      description="聊天记录、软删除、个人/全员禁言分区治理；禁言原因必填，便于审计复核。"
      icon="i-lucide-messages-square"
      eyebrow="社区"
    >
      <template #actions>
        <UButton
          icon="i-lucide-refresh-cw"
          label="刷新"
          color="neutral"
          variant="outline"
          :loading="loading"
          @click="refreshAll"
        />
      </template>
    </AdminPageHeader>

    <div
      v-if="errorMessage"
      class="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
    >
      {{ errorMessage }}
    </div>

    <section class="rounded-2xl border border-zinc-200 bg-white p-4">
      <h2 class="font-semibold text-zinc-950">
        房间
      </h2>
      <div class="mt-3 grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
        <div
          v-for="room in rooms"
          :key="room.id"
          class="rounded-xl border border-zinc-100 px-3 py-3"
        >
          <div class="flex items-start justify-between gap-2">
            <div>
              <p class="font-medium text-zinc-900">
                {{ room.title }}
              </p>
              <p class="text-xs text-zinc-500">
                {{ room.kind === 'public' ? '公共群' : '宿舍楼群' }}
                <template v-if="room.dormBuilding"> · {{ room.dormBuilding }}</template>
              </p>
            </div>
            <UButton
              size="xs"
              :color="room.isMutedAll ? 'warning' : 'neutral'"
              :variant="room.isMutedAll ? 'solid' : 'outline'"
              @click="toggleMuteAll(room)"
            >
              {{ room.isMutedAll ? '取消全员禁言' : '全员禁言' }}
            </UButton>
          </div>
        </div>
        <p
          v-if="!rooms.length"
          class="text-sm text-zinc-400"
        >
          暂无房间
        </p>
      </div>
    </section>

    <section class="grid gap-4 lg:grid-cols-[minmax(0,1.4fr)_minmax(16rem,0.8fr)]">
      <div class="rounded-2xl border border-zinc-200 bg-white p-4">
        <div class="flex flex-wrap items-end gap-3">
          <UFormField
            label="房间"
            class="min-w-[12rem] flex-1"
          >
            <USelect
              v-model="roomFilter"
              :items="[
                { label: '全部房间', value: '' },
                ...rooms.map(room => ({ label: room.title, value: room.id }))
              ]"
              class="w-full"
            />
          </UFormField>
          <UFormField
            label="关键词"
            class="min-w-[12rem] flex-1"
          >
            <UInput
              v-model="q"
              class="w-full"
              placeholder="消息内容"
              @keyup.enter="applyMessageFilter"
            />
          </UFormField>
          <UButton
            color="primary"
            icon="i-lucide-search"
            :loading="messageLoading"
            @click="applyMessageFilter"
          >
            查询
          </UButton>
        </div>

        <ul class="mt-4 max-h-[32rem] space-y-3 overflow-y-auto">
          <li
            v-for="message in messages"
            :key="message.id"
            class="rounded-xl border border-zinc-100 px-3 py-3"
          >
            <div class="flex flex-wrap items-center justify-between gap-2">
              <p class="text-xs text-zinc-500">
                <span class="font-medium text-zinc-800">{{ message.displayName }}</span>
                <span class="mx-1">·</span>
                {{ formatTime(message.createdAt) }}
                <span class="mx-1">·</span>
                {{ roomTitle(message.roomId) }}
              </p>
              <div class="flex flex-wrap gap-2">
                <UButton
                  size="xs"
                  color="warning"
                  variant="soft"
                  @click="prepMute(message)"
                >
                  禁言此人
                </UButton>
                <UButton
                  v-if="!message.deletedAt"
                  size="xs"
                  color="error"
                  variant="soft"
                  @click="softDeleteMessage(message)"
                >
                  删除消息
                </UButton>
              </div>
            </div>
            <p
              class="mt-2 whitespace-pre-wrap break-words text-sm leading-6"
              :class="message.deletedAt ? 'text-zinc-400 line-through' : 'text-zinc-800'"
            >
              {{ message.deletedAt ? '（已删除）' + message.body : message.body }}
            </p>
          </li>
          <li
            v-if="!messages.length && !messageLoading"
            class="py-10 text-center text-sm text-zinc-400"
          >
            暂无消息
          </li>
        </ul>

        <div class="mt-3 flex items-center justify-between text-sm text-zinc-500">
          <span>共 {{ total }} 条</span>
          <div class="flex gap-2">
            <UButton
              size="sm"
              color="neutral"
              variant="outline"
              :disabled="page <= 1"
              @click="page -= 1; loadMessages()"
            >
              上一页
            </UButton>
            <UButton
              size="sm"
              color="neutral"
              variant="outline"
              :disabled="page * pageSize >= total"
              @click="page += 1; loadMessages()"
            >
              下一页
            </UButton>
          </div>
        </div>
      </div>

      <div class="space-y-4">
        <section class="rounded-2xl border border-zinc-200 bg-white p-4">
          <h2 class="font-semibold text-zinc-950">
            个人禁言
          </h2>
          <div class="mt-3 space-y-3">
            <UFormField label="用户 ID">
              <UInput
                v-model="muteUserId"
                class="w-full"
              />
            </UFormField>
            <UFormField label="房间（空=全站禁言）">
              <USelect
                v-model="muteRoomId"
                :items="[
                  { label: '全部房间', value: '' },
                  ...rooms.map(room => ({ label: room.title, value: room.id }))
                ]"
                class="w-full"
              />
            </UFormField>
            <UFormField label="原因">
              <UInput
                v-model="muteReason"
                class="w-full"
              />
            </UFormField>
            <UButton
              color="warning"
              icon="i-lucide-volume-x"
              @click="muteUser"
            >
              禁言
            </UButton>
          </div>
        </section>

        <section class="rounded-2xl border border-zinc-200 bg-white p-4">
          <div class="flex items-center justify-between">
            <h2 class="font-semibold text-zinc-950">
              生效中的禁言
            </h2>
            <UButton
              size="xs"
              color="neutral"
              variant="ghost"
              :loading="muteLoading"
              @click="loadMutes"
            >
              刷新
            </UButton>
          </div>
          <ul class="mt-3 max-h-80 space-y-2 overflow-y-auto">
            <li
              v-for="mute in mutes"
              :key="mute.id"
              class="rounded-xl border border-zinc-100 px-3 py-2 text-sm"
            >
              <div class="flex items-start justify-between gap-2">
                <div>
                  <p class="font-medium text-zinc-900">
                    {{ mute.displayName || mute.username || mute.userId.slice(0, 8) }}
                  </p>
                  <p class="text-xs text-zinc-500">
                    {{ mute.roomTitle || (mute.roomId ? roomTitle(mute.roomId) : '全部房间') }}
                    · {{ formatTime(mute.createdAt) }}
                  </p>
                  <p
                    v-if="mute.reason"
                    class="mt-1 text-xs text-zinc-600"
                  >
                    {{ mute.reason }}
                  </p>
                </div>
                <UButton
                  v-if="mute.isActive"
                  size="xs"
                  color="neutral"
                  variant="outline"
                  @click="unmute(mute.id)"
                >
                  解除
                </UButton>
              </div>
            </li>
            <li
              v-if="!mutes.length"
              class="py-6 text-center text-sm text-zinc-400"
            >
              暂无禁言
            </li>
          </ul>
        </section>
      </div>
    </section>
  </div>
</template>
