<script setup lang="ts">
import type { FeedbackTargetType } from '~~/shared/constants/server'
import { safeLocalPath } from '~/utils/safe-navigation'
import {
  buildFeedbackSubmitBody,
  canSubmitFeedback,
  createEmptyFeedbackFormState,
  feedbackReasonOptions,
  resolveFeedbackReasonType,
  resolveFeedbackTargetDisplayName,
  resolveFeedbackTargetIcon,
  resolveFeedbackTargetId,
  resolveFeedbackTargetLabel,
  resolveFeedbackTargetName,
  resolveFeedbackTargetType,
  feedbackRouteQueryString
} from '~~/app/utils/feedback-presentation'

useSeoMeta({
  title: '反馈信息',
  description: '告诉我们校园地点、办事步骤或指南内容哪里不对，也可以提供更准确的学校通知。',
  robots: 'noindex, nofollow'
})

const route = useRoute()
const toast = useToast()
const reasonOptions = feedbackReasonOptions

const requestedTargetType = computed(() => feedbackRouteQueryString(route.query.targetType).trim())
const requestedTargetId = computed(() => feedbackRouteQueryString(route.query.targetId).trim())
const targetType = computed<FeedbackTargetType>(() => resolveFeedbackTargetType(
  requestedTargetType.value,
  requestedTargetId.value
))
const targetId = computed(() => resolveFeedbackTargetId(targetType.value, requestedTargetId.value))
const targetName = computed(() => resolveFeedbackTargetName(
  targetType.value,
  feedbackRouteQueryString(route.query.targetName)
))
const targetLabel = computed(() => resolveFeedbackTargetLabel(targetType.value))
const targetIcon = computed(() => resolveFeedbackTargetIcon(targetType.value))
const targetDisplayName = computed(() => resolveFeedbackTargetDisplayName(
  targetType.value,
  targetName.value
))
const pageUrl = computed(() => safeLocalPath(route.query.from))

const reasonType = ref(resolveFeedbackReasonType(route.query.type))
const message = ref('')
const evidenceUrl = ref('')
const contact = ref('')
const website = ref('')
const submitting = ref(false)
const submitted = ref(false)

const canSubmit = computed(() => canSubmitFeedback(message.value, submitting.value))

async function submitFeedback() {
  if (!canSubmit.value) return
  submitting.value = true

  try {
    await $fetch('/api/public/feedback', {
      method: 'POST',
      body: buildFeedbackSubmitBody({
        targetType: targetType.value,
        targetId: targetId.value,
        reasonType: reasonType.value,
        message: message.value,
        evidenceUrl: evidenceUrl.value,
        pageUrl: pageUrl.value,
        contact: contact.value,
        website: website.value
      })
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
  const empty = createEmptyFeedbackFormState()
  reasonType.value = empty.reasonType
  message.value = empty.message
  evidenceUrl.value = empty.evidenceUrl
  contact.value = empty.contact
  website.value = empty.website
  submitted.value = empty.submitted
}
</script>

<template>
  <div>
    <header class="border-b border-[var(--line)] bg-white">
      <div class="page-shell py-8 md:py-10">
        <p class="section-kicker">
          一起完善指南
        </p>
        <h1 class="mt-2 text-2xl font-bold text-zinc-950 md:text-3xl">
          发现信息不对？告诉我们
        </h1>
        <p class="mt-3 max-w-2xl text-sm leading-7 text-zinc-600">
          地点搬了、营业时间变了、通知过期了，或者你有更准确的学校通知，都可以在这里告诉我们。
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
            已经收到你的反馈
          </h2>
          <p class="mt-2 text-sm leading-6 text-green-800">
            我们会先看清来源和日期，确认后再更新。相同问题不用重复提交。
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
            v-if="targetType !== 'general' || pageUrl"
            class="flex items-start gap-3 border-l-2 border-green-600 bg-green-50 px-4 py-3"
            role="status"
          >
            <UIcon
              :name="targetIcon"
              class="mt-0.5 size-4 shrink-0 text-green-700"
            />
            <div class="min-w-0">
              <p class="text-xs font-medium text-green-800">
                正在反馈：{{ targetLabel }}
              </p>
              <p class="mt-0.5 break-words text-sm font-bold text-green-950">
                {{ targetDisplayName }}
              </p>
              <template v-if="pageUrl">
                <p class="mt-2 text-xs font-medium text-green-800">
                  来自页面
                </p>
                <p class="mt-0.5 break-all text-xs text-green-900">
                  {{ pageUrl }}
                </p>
              </template>
            </div>
          </div>

          <div>
            <label
              for="feedback-reason"
              class="text-sm font-semibold text-zinc-900"
            >哪里需要修改</label>
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
            >具体情况 <span class="text-red-600">*</span></label>
            <p class="mt-1 text-xs leading-5 text-zinc-500">
              请写清哪个地点或页面、哪里不对，以及正确情况。
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
              >可以核对的链接</label>
              <UInput
                id="feedback-evidence"
                v-model="evidenceUrl"
                type="url"
                size="lg"
                class="mt-2 w-full"
                icon="i-lucide-link"
                placeholder="https://（选填）"
              />
            </div>
            <div>
              <label
                for="feedback-contact"
                class="text-sm font-semibold text-zinc-900"
              >怎么联系你（选填）</label>
              <UInput
                id="feedback-contact"
                v-model="contact"
                size="lg"
                class="mt-2 w-full"
                icon="i-lucide-at-sign"
                placeholder="不填也可以，仅用于追问这次反馈"
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

      <aside class="order-first min-w-0 md:order-none">
        <div class="border-y border-zinc-200 bg-white px-4 py-4 md:sticky md:top-24">
          <h2 class="text-sm font-bold text-zinc-950">
            写清楚这三点
          </h2>
          <ol class="mt-4 space-y-4">
            <li class="flex gap-3 text-xs leading-5 text-zinc-600">
              <span class="grid size-5 shrink-0 place-items-center rounded-full bg-zinc-900 text-[10px] font-bold text-white">1</span>
              哪一个地点、页面或办事步骤
            </li>
            <li class="flex gap-3 text-xs leading-5 text-zinc-600">
              <span class="grid size-5 shrink-0 place-items-center rounded-full bg-zinc-900 text-[10px] font-bold text-white">2</span>
              现在看到的内容哪里不对
            </li>
            <li class="flex gap-3 text-xs leading-5 text-zinc-600">
              <span class="grid size-5 shrink-0 place-items-center rounded-full bg-zinc-900 text-[10px] font-bold text-white">3</span>
              正确情况和可以核对的链接
            </li>
          </ol>
        </div>
      </aside>
    </div>
  </div>
</template>
