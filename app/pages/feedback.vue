<script setup lang="ts">
import type { FeedbackTargetType } from '~~/shared/constants/server'
import { safeLocalPath } from '~/utils/safe-navigation'
import {
  buildFeedbackSubmitBody,
  canSubmitFeedback,
  createEmptyFeedbackFormState,
  feedbackMessageNeedsMoreDetail,
  feedbackPageContextCopy,
  feedbackReasonOptions,
  resolveFeedbackFormCopy,
  resolveFeedbackReasonType,
  resolveFeedbackTargetDisplayName,
  resolveFeedbackTargetIcon,
  resolveFeedbackTargetId,
  resolveFeedbackTargetLabel,
  resolveFeedbackTargetName,
  resolveFeedbackTargetType,
  feedbackRouteQueryString
} from '~~/app/utils/feedback-presentation'

const route = useRoute()
const toast = useToast()
const reasonOptions = feedbackReasonOptions
const pageContextCopy = feedbackPageContextCopy
const initialReasonType = computed(() => resolveFeedbackReasonType(route.query.type))

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

const reasonType = ref(initialReasonType.value)
const formCopy = computed(() => resolveFeedbackFormCopy(reasonType.value))
const isPrivacyRequest = computed(() => reasonType.value === 'privacy_request')
const isDedicatedPrivacyRequest = computed(() => initialReasonType.value === 'privacy_request')
const message = ref('')
const evidenceUrl = ref('')
const contact = ref('')
const website = ref('')
const submitting = ref(false)
const submitted = ref(false)

useSeoMeta({
  title: () => formCopy.value.metaTitle,
  description: () => formCopy.value.metaDescription,
  robots: 'noindex, nofollow'
})

const canSubmit = computed(() => canSubmitFeedback(message.value, submitting.value))
const messageNeedsMoreDetail = computed(() => feedbackMessageNeedsMoreDetail(message.value))

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
  const empty = createEmptyFeedbackFormState(initialReasonType.value)
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
    <header class="border-b border-[var(--line)] bg-white dark:bg-zinc-900">
      <div class="page-shell py-8 md:py-10">
        <p class="section-kicker">
          {{ formCopy.kicker }}
        </p>
        <h1 class="mt-2 text-2xl font-bold text-zinc-950 dark:text-zinc-100 md:text-3xl">
          {{ formCopy.title }}
        </h1>
        <p class="mt-3 max-w-2xl text-sm leading-7 text-zinc-600 dark:text-zinc-300">
          {{ formCopy.description }}
        </p>
      </div>
    </header>

    <div class="page-shell grid gap-8 py-8 md:grid-cols-[minmax(0,1fr)_18rem] md:py-12">
      <section class="min-w-0">
        <div
          v-if="submitted"
          class="border-y border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 px-5 py-10 text-center"
          role="status"
        >
          <span class="mx-auto grid size-11 place-items-center rounded-full bg-green-700 text-white">
            <UIcon
              name="i-lucide-check"
              class="size-5"
            />
          </span>
          <h2 class="mt-4 text-lg font-bold text-green-950 dark:text-green-300">
            {{ formCopy.successTitle }}
          </h2>
          <p class="mt-2 text-sm leading-6 text-green-800 dark:text-green-300">
            {{ formCopy.successDescription }}
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
            v-if="isPrivacyRequest || targetType !== 'general' || pageUrl"
            class="flex items-start gap-3 border-l-2 border-green-600 bg-green-50 dark:bg-green-950 px-4 py-3"
            role="status"
          >
            <UIcon
              :name="isPrivacyRequest ? 'i-lucide-shield-check' : targetIcon"
              class="mt-0.5 size-4 shrink-0 text-green-700 dark:text-green-400"
            />
            <div class="min-w-0">
              <template v-if="isPrivacyRequest">
                <p class="text-xs font-medium text-green-800 dark:text-green-300">
                  申请内容
                </p>
                <p class="mt-0.5 text-sm font-bold text-green-950 dark:text-green-300">
                  查询或删除自己的信息
                </p>
                <p
                  v-if="pageUrl"
                  class="mt-2 text-xs text-green-900 dark:text-green-300"
                >
                  从“隐私说明”进入
                </p>
              </template>
              <template v-else>
                <template v-if="targetType !== 'general'">
                  <p class="text-xs font-medium text-green-800 dark:text-green-300">
                    正在反馈：{{ targetLabel }}
                  </p>
                  <p class="mt-0.5 break-words text-sm font-bold text-green-950 dark:text-green-300">
                    {{ targetDisplayName }}
                  </p>
                </template>
                <template v-if="pageUrl">
                  <p
                    class="text-xs font-semibold text-green-900 dark:text-green-300"
                    :class="targetType !== 'general' ? 'mt-2' : ''"
                  >
                    {{ pageContextCopy.title }}
                  </p>
                  <p class="mt-0.5 text-xs leading-5 text-green-800 dark:text-green-300">
                    {{ pageContextCopy.description }}
                  </p>
                </template>
              </template>
            </div>
          </div>

          <div>
            <label
              v-if="!isDedicatedPrivacyRequest"
              for="feedback-reason"
              class="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
            >{{ formCopy.reasonLabel }}</label>
            <p
              v-else
              id="feedback-reason-label"
              class="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
            >
              {{ formCopy.reasonLabel }}
            </p>
            <select
              v-if="!isDedicatedPrivacyRequest"
              id="feedback-reason"
              v-model="reasonType"
              class="mt-2 min-h-11 w-full rounded-md border border-zinc-300 dark:border-zinc-700 bg-white dark:bg-zinc-900 px-3 text-sm text-zinc-900 dark:text-zinc-100 outline-none focus:border-green-600 focus:ring-2 focus:ring-green-100"
            >
              <option
                v-for="option in reasonOptions"
                :key="option.value"
                :value="option.value"
              >
                {{ option.label }}
              </option>
            </select>
            <div
              v-else
              id="feedback-reason"
              aria-labelledby="feedback-reason-label"
              class="mt-2 flex min-h-11 items-center gap-2 rounded-md border border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 px-3 text-sm font-semibold text-green-900 dark:text-green-300"
            >
              <UIcon
                name="i-lucide-shield-check"
                class="size-4 shrink-0 text-green-700 dark:text-green-400"
              />
              查询或删除我的信息
            </div>
          </div>

          <div>
            <label
              for="feedback-message"
              class="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
            >{{ formCopy.messageLabel }} <span class="text-red-600 dark:text-red-400">*</span></label>
            <p class="mt-1 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              {{ formCopy.messageHint }}
            </p>
            <UTextarea
              id="feedback-message"
              v-model="message"
              :rows="7"
              class="mt-2 w-full"
              :placeholder="formCopy.messagePlaceholder"
              :maxlength="4000"
              required
              :aria-invalid="messageNeedsMoreDetail ? 'true' : undefined"
            />
            <div class="mt-1 flex items-start justify-between gap-3">
              <p
                v-if="messageNeedsMoreDetail"
                class="text-xs leading-5 text-orange-700 dark:text-orange-300"
                role="status"
              >
                还需要再写一点才能提交。
              </p>
              <span v-else />
              <p class="shrink-0 text-right text-xs text-zinc-400 dark:text-zinc-500">
                {{ message.length }} / 4000
              </p>
            </div>
          </div>

          <details
            class="group border-y border-zinc-200 dark:border-zinc-800 bg-white dark:bg-zinc-900"
            :open="isPrivacyRequest"
          >
            <summary class="flex min-h-14 cursor-pointer list-none items-center justify-between gap-3 px-1 py-3 [&::-webkit-details-marker]:hidden">
              <span class="flex min-w-0 items-start gap-3">
                <span class="mt-0.5 grid size-8 shrink-0 place-items-center rounded-md bg-sky-50 dark:bg-sky-950 text-sky-700 dark:text-sky-300">
                  <UIcon
                    name="i-lucide-paperclip"
                    class="size-4"
                  />
                </span>
                <span class="min-w-0">
                  <span class="block text-sm font-semibold text-zinc-900 dark:text-zinc-100">补充信息（选填）</span>
                  <span class="mt-0.5 block text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                    有学校通知链接，或希望我们回复时再填写
                  </span>
                </span>
              </span>
              <UIcon
                name="i-lucide-chevron-down"
                class="size-5 shrink-0 text-zinc-500 dark:text-zinc-400 transition-transform group-open:rotate-180"
              />
            </summary>

            <div class="grid gap-5 border-t border-zinc-100 dark:border-zinc-800 px-1 py-5 md:grid-cols-2">
              <div>
                <label
                  for="feedback-evidence"
                  class="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
                >可以核对的链接</label>
                <UInput
                  id="feedback-evidence"
                  v-model="evidenceUrl"
                  type="url"
                  size="lg"
                  class="mt-2 min-h-11 w-full"
                  :ui="{ base: 'min-h-11' }"
                  icon="i-lucide-link"
                  placeholder="https://（选填）"
                />
              </div>
              <div>
                <label
                  for="feedback-contact"
                  class="text-sm font-semibold text-zinc-900 dark:text-zinc-100"
                >{{ formCopy.contactLabel }}</label>
                <UInput
                  id="feedback-contact"
                  v-model="contact"
                  size="lg"
                  class="mt-2 min-h-11 w-full"
                  :ui="{ base: 'min-h-11' }"
                  icon="i-lucide-at-sign"
                  :placeholder="formCopy.contactPlaceholder"
                  :maxlength="300"
                />
              </div>
            </div>
          </details>

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
            <p class="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              请勿提交账号密码、证件、宿舍房间、他人私人手机号或未经同意的群二维码。
              提交即表示你已阅读
              <NuxtLink
                to="/privacy"
                class="-mx-1 inline-flex min-h-10 items-center px-1 align-middle font-medium text-green-700 dark:text-green-400 hover:underline"
              >隐私说明</NuxtLink>。
            </p>
            <UButton
              type="submit"
              icon="i-lucide-send"
              :label="formCopy.submitLabel"
              size="lg"
              class="min-h-11 w-full shrink-0 scroll-mb-[calc(var(--mobile-nav-height)+1rem)] sm:w-auto md:scroll-mb-0"
              :loading="submitting"
              :disabled="!canSubmit"
            />
          </div>
        </form>
      </section>

      <aside class="order-first min-w-0 md:order-none">
        <div class="border-l-2 border-sky-500 bg-sky-50/70 dark:bg-sky-950/70 px-4 py-4 md:sticky md:top-24">
          <h2 class="flex items-center gap-2 text-sm font-bold text-zinc-950 dark:text-zinc-100">
            <UIcon
              name="i-lucide-list-checks"
              class="size-4 text-sky-700 dark:text-sky-300"
            />
            {{ formCopy.sidebarTitle }}
          </h2>
          <ol class="mt-3 divide-y divide-sky-100">
            <li
              v-for="(item, index) in formCopy.sidebarItems"
              :key="item"
              class="flex items-start gap-3 py-3 text-xs leading-5 text-zinc-700 dark:text-zinc-200 first:pt-1 last:pb-0"
            >
              <span
                class="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full text-[11px] font-bold text-white"
                :class="[
                  index === 0 && 'bg-sky-700',
                  index === 1 && 'bg-amber-600',
                  index === 2 && 'bg-green-700'
                ]"
              >{{ index + 1 }}</span>
              <span>{{ item }}</span>
            </li>
          </ol>
        </div>
      </aside>
    </div>
  </div>
</template>
