<script setup lang="ts">
import type { FeedbackTargetType } from '~~/shared/constants/server'

useSeoMeta({
  title: '反馈纠错',
  description: '提交校园地点错误、过期信息或可靠资料来源。',
  robots: 'noindex, nofollow'
})

const route = useRoute()
const toast = useToast()
const uuidPattern = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i
const reasonOptions = [
  { label: '地点名称或位置错误', value: 'place_error' },
  { label: '内容已经过期', value: 'content_outdated' },
  { label: '缺少重要信息', value: 'missing_information' },
  { label: '补充可靠来源', value: 'source_suggestion' },
  { label: '其他问题', value: 'other' }
]

function routeQuery(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value) && typeof value[0] === 'string') return value[0]
  return ''
}

const requestedTargetType = computed(() => routeQuery(route.query.targetType).trim())
const requestedTargetId = computed(() => routeQuery(route.query.targetId).trim())
const targetType = computed<FeedbackTargetType>(() => {
  if (
    (requestedTargetType.value === 'place' || requestedTargetType.value === 'content')
    && uuidPattern.test(requestedTargetId.value)
  ) {
    return requestedTargetType.value
  }

  return 'general'
})
const targetId = computed(() => targetType.value === 'general' ? null : requestedTargetId.value)
const targetName = computed(() => targetType.value === 'general'
  ? ''
  : routeQuery(route.query.targetName).trim().slice(0, 160))
const targetLabel = computed(() => targetType.value === 'place' ? '地点' : '内容')
const targetDisplayName = computed(() => targetName.value || `已选择的${targetLabel.value}`)

const reasonType = ref(
  reasonOptions.some(option => option.value === route.query.type)
    ? String(route.query.type)
    : 'place_error'
)
const message = ref(typeof route.query.from === 'string' ? `关联页面：${route.query.from}\n` : '')
const evidenceUrl = ref('')
const contact = ref('')
const website = ref('')
const submitting = ref(false)
const submitted = ref(false)

const canSubmit = computed(() => message.value.trim().length >= 5 && !submitting.value)

async function submitFeedback() {
  if (!canSubmit.value) return
  submitting.value = true

  try {
    await $fetch('/api/public/feedback', {
      method: 'POST',
      body: {
        targetType: targetType.value,
        targetId: targetId.value,
        reasonType: reasonType.value,
        message: message.value.trim(),
        evidenceUrl: evidenceUrl.value.trim() || null,
        contact: contact.value.trim() || null,
        website: website.value
      }
    })
    submitted.value = true
  } catch {
    toast.add({
      title: '反馈暂未提交成功',
      description: '请检查网络后重试，或稍后再提交。',
      color: 'warning'
    })
  } finally {
    submitting.value = false
  }
}

function resetForm() {
  reasonType.value = 'place_error'
  message.value = ''
  evidenceUrl.value = ''
  contact.value = ''
  website.value = ''
  submitted.value = false
}
</script>

<template>
  <div>
    <header class="border-b border-[var(--line)] bg-white">
      <div class="page-shell py-8 md:py-10">
        <p class="section-kicker">
          内容共建
        </p>
        <h1 class="mt-2 text-2xl font-bold text-zinc-950 md:text-3xl">
          反馈错误或补充资料
        </h1>
        <p class="mt-3 max-w-2xl text-sm leading-7 text-zinc-600">
          地点搬迁、营业时间变化、通知过期或可靠来源都可以提交。管理员核验后再更新公开内容。
        </p>
      </div>
    </header>

    <div class="page-shell grid gap-8 py-8 md:grid-cols-[minmax(0,1fr)_18rem] md:py-12">
      <section class="min-w-0">
        <div
          v-if="submitted"
          class="border-y border-green-200 bg-green-50 px-5 py-10 text-center"
          role="status"
        >
          <span class="mx-auto grid size-11 place-items-center rounded-full bg-green-700 text-white">
            <UIcon
              name="i-lucide-check"
              class="size-5"
            />
          </span>
          <h2 class="mt-4 text-lg font-bold text-green-950">
            反馈已进入待处理列表
          </h2>
          <p class="mt-2 text-sm leading-6 text-green-800">
            管理员会先核对来源和时效，不会直接把未经确认的信息发布到前台。
          </p>
          <div class="mt-5 flex flex-wrap justify-center gap-2">
            <UButton
              to="/"
              icon="i-lucide-house"
              label="返回首页"
            />
            <UButton
              icon="i-lucide-plus"
              label="继续提交"
              color="neutral"
              variant="outline"
              @click="resetForm"
            />
          </div>
        </div>

        <form
          v-else
          class="space-y-6"
          @submit.prevent="submitFeedback"
        >
          <div
            v-if="targetType !== 'general'"
            class="flex items-start gap-3 border-l-2 border-green-600 bg-green-50 px-4 py-3"
            role="status"
          >
            <UIcon
              :name="targetType === 'place' ? 'i-lucide-map-pin' : 'i-lucide-file-text'"
              class="mt-0.5 size-4 shrink-0 text-green-700"
            />
            <div class="min-w-0">
              <p class="text-xs font-medium text-green-800">
                正在反馈{{ targetLabel }}
              </p>
              <p class="mt-0.5 break-words text-sm font-bold text-green-950">
                {{ targetDisplayName }}
              </p>
            </div>
          </div>

          <div>
            <label
              for="feedback-reason"
              class="text-sm font-semibold text-zinc-900"
            >问题类型</label>
            <select
              id="feedback-reason"
              v-model="reasonType"
              class="mt-2 min-h-11 w-full rounded-md border border-zinc-300 bg-white px-3 text-sm text-zinc-900 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
            >
              <option
                v-for="option in reasonOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
          </div>

          <div>
            <label
              for="feedback-message"
              class="text-sm font-semibold text-zinc-900"
            >问题说明 <span class="text-red-600">*</span></label>
            <p class="mt-1 text-xs leading-5 text-zinc-500">
              请写明地点或页面、当前错误内容，以及你认为正确的信息。
            </p>
            <UTextarea
              id="feedback-message"
              v-model="message"
              :rows="7"
              class="mt-2 w-full"
              placeholder="例如：某地点已经搬迁，现场标牌显示……"
              :maxlength="4000"
              required
            />
            <p class="mt-1 text-right text-xs text-zinc-400">
              {{ message.length }} / 4000
            </p>
          </div>

          <div class="grid gap-5 md:grid-cols-2">
            <div>
              <label
                for="feedback-evidence"
                class="text-sm font-semibold text-zinc-900"
              >来源链接</label>
              <UInput
                id="feedback-evidence"
                v-model="evidenceUrl"
                type="url"
                class="mt-2 w-full"
                icon="i-lucide-link"
                placeholder="https://（选填）"
              />
            </div>
            <div>
              <label
                for="feedback-contact"
                class="text-sm font-semibold text-zinc-900"
              >联系方式</label>
              <UInput
                id="feedback-contact"
                v-model="contact"
                class="mt-2 w-full"
                icon="i-lucide-at-sign"
                placeholder="便于追问，仅管理员可见（选填）"
                :maxlength="300"
              />
            </div>
          </div>

          <div
            class="hidden"
            aria-hidden="true"
          >
            <label for="feedback-website">Website</label>
            <input
              id="feedback-website"
              v-model="website"
              type="text"
              tabindex="-1"
              autocomplete="off"
            >
          </div>

          <div class="flex flex-col-reverse gap-3 border-t border-[var(--line)] pt-5 sm:flex-row sm:items-center sm:justify-between">
            <p class="text-xs leading-5 text-zinc-500">
              请勿提交账号密码、证件、宿舍房间、他人私人手机号或未经同意的群二维码。
              提交即表示你已阅读
              <NuxtLink
                to="/privacy"
                class="font-medium text-green-700 hover:underline"
              >隐私说明</NuxtLink>。
            </p>
            <UButton
              type="submit"
              icon="i-lucide-send"
              label="提交反馈"
              size="lg"
              class="min-h-11 shrink-0"
              :loading="submitting"
              :disabled="!canSubmit"
            />
          </div>
        </form>
      </section>

      <aside class="min-w-0">
        <div class="surface-panel p-4 md:sticky md:top-24">
          <h2 class="text-sm font-bold text-zinc-950">
            核验顺序
          </h2>
          <ol class="mt-4 space-y-4">
            <li class="flex gap-3 text-xs leading-5 text-zinc-600">
              <span class="grid size-5 shrink-0 place-items-center rounded-full bg-zinc-900 text-[10px] font-bold text-white">1</span>
              管理员检查链接、时间和适用对象
            </li>
            <li class="flex gap-3 text-xs leading-5 text-zinc-600">
              <span class="grid size-5 shrink-0 place-items-center rounded-full bg-zinc-900 text-[10px] font-bold text-white">2</span>
              与官网、主管部门或现场记录交叉核对
            </li>
            <li class="flex gap-3 text-xs leading-5 text-zinc-600">
              <span class="grid size-5 shrink-0 place-items-center rounded-full bg-zinc-900 text-[10px] font-bold text-white">3</span>
              更新内容并记录来源和核验日期
            </li>
          </ol>
        </div>
      </aside>
    </div>
  </div>
</template>
