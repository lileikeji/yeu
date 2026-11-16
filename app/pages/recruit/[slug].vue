<script setup lang="ts">
import type { RecruitFormField } from '~~/shared/types'

definePageMeta({
  layout: 'default'
})

interface PublicRecruitPayload {
  available: boolean
  reason?: 'closed'
  club?: { name: string, slug: string }
  form?: {
    title: string
    slogan: string
    intro: string
    fields: RecruitFormField[]
    draft?: {
      data: Record<string, string | string[]>
      submitted: boolean
    } | null
    payment?: {
      enabled: boolean
      wechatImage: string | null
      alipayImage: string | null
      note: string
    }
  }
}

const route = useRoute()
const toast = useToast()
const slug = computed(() => String(route.params.slug ?? ''))

const loading = ref(true)
const notFound = ref(false)
const payload = ref<PublicRecruitPayload | null>(null)
const textValues = ref<Record<string, string>>({})
const multiValues = ref<Record<string, string[]>>({})
const submitting = ref(false)
const submittedFilename = ref('')
const paymentConfirmed = ref<boolean | null>(null)
const expandedDetails = ref<Set<string>>(new Set())
const hasSavedDraft = ref(false)
const submittedInfo = ref<{ data: Record<string, string | string[]> } | null>(null)
let draftTimer: ReturnType<typeof setTimeout> | undefined

const fields = computed<RecruitFormField[]>(() => payload.value?.form?.fields ?? [])

watch([textValues, multiValues], () => {
  if (loading.value) return
  scheduleDraftSave()
}, { deep: true })

async function loadForm(): Promise<void> {
  loading.value = true
  notFound.value = false
  try {
    payload.value = await $fetch<PublicRecruitPayload>(`/api/public/recruit/${encodeURIComponent(slug.value)}`)
    const draft = payload.value?.form?.draft ?? { data: {}, submitted: false }
    textValues.value = Object.fromEntries(fields.value
      .filter(field => field.type !== 'multiselect')
      .map(field => [field.key, typeof draft.data[field.key] === 'string' ? draft.data[field.key] as string : '']))
    multiValues.value = Object.fromEntries(fields.value
      .filter(field => field.type === 'multiselect')
      .map(field => [field.key, Array.isArray(draft.data[field.key]) ? draft.data[field.key] as string[] : []]))
    if (draft.submitted) {
      submittedInfo.value = { data: draft.data }
    } else if (Object.keys(draft.data).length > 0) {
      hasSavedDraft.value = true
      toast.add({ title: '已恢复上次填写的进度', color: 'success' })
    }
  } catch {
    notFound.value = true
  } finally {
    loading.value = false
  }
}

function scheduleDraftSave(): void {
  if (draftTimer) clearTimeout(draftTimer)
  draftTimer = setTimeout(() => {
    void $fetch(`/api/public/recruit/${encodeURIComponent(slug.value)}/draft`, {
      method: 'POST',
      body: { data: { ...textValues.value, ...multiValues.value } }
    }).catch(() => {})
  }, 1500)
}

async function resetDraft(mode: 'edit' | 'fresh'): Promise<void> {
  await $fetch(`/api/public/recruit/${encodeURIComponent(slug.value)}/draft-reset`, {
    method: 'POST',
    body: { mode }
  }).catch(() => {})
  await loadForm()
}

function isMultiselectSelected(field: RecruitFormField, option: string): boolean {
  return (multiValues.value[field.key] ?? []).includes(option)
}

function toggleMultiselectOption(field: RecruitFormField, option: string, checked: boolean): void {
  const current = multiValues.value[field.key] ?? []
  multiValues.value = {
    ...multiValues.value,
    [field.key]: checked
      ? [...new Set([...current, option])]
      : current.filter(item => item !== option)
  }
}

const payment = computed(() => payload.value?.form?.payment)

function toggleOptionDetail(key: string, option: string): void {
  const tag = `${key}::${option}`
  const next = new Set(expandedDetails.value)
  if (next.has(tag)) next.delete(tag)
  else next.add(tag)
  expandedDetails.value = next
}

function isDetailExpanded(key: string, option: string): boolean {
  return expandedDetails.value.has(`${key}::${option}`)
}

function optionDetail(field: RecruitFormField, option: string): string {
  return field.optionDetails?.[option] ?? ''
}

// 不用 URLSearchParams：构建会把全局重写成坏掉的命名空间访问，浏览器里直接抛错。
function payRelayHref(kind: 'wechat' | 'alipay', src: string): string {
  const note = payment.value?.note ?? '付款请备注：班级+姓名+电话'
  return `/recruit/${encodeURIComponent(slug.value)}/pay`
    + `?src=${encodeURIComponent(src)}&label=${encodeURIComponent(kind)}&note=${encodeURIComponent(note)}`
}

function missingRequiredField(): RecruitFormField | null {
  for (const field of fields.value) {
    if (!field.required) continue
    if (field.type === 'multiselect') {
      if ((multiValues.value[field.key] ?? []).length === 0) return field
    } else if (!textValues.value[field.key]?.trim()) {
      return field
    }
  }
  return null
}

async function submitForm(): Promise<void> {
  const missing = missingRequiredField()
  if (missing) {
    toast.add({ title: `请填写「${missing.label}」`, color: 'warning' })
    return
  }

  if (payment.value?.enabled && paymentConfirmed.value !== true) {
    toast.add({
      title: '请先缴纳会费',
      color: 'warning'
    })
    return
  }

  submitting.value = true
  try {
    const result = await $fetch<{ id: string, filename: string }>(
      `/api/public/recruit/${encodeURIComponent(slug.value)}`,
      {
        method: 'POST',
        body: {
          data: { ...textValues.value, ...multiValues.value },
          ...(payment.value?.enabled ? { paymentConfirmed: paymentConfirmed.value === true } : {})
        }
      }
    )
    submittedFilename.value = result.filename
  } catch (error) {
    const reason = extractErrorMessage(error)
    toast.add({
      title: reason ? `提交失败：${reason}` : '提交未成功',
      description: reason ? '请修改后重新提交。' : '请检查填写内容后重试。',
      color: 'warning'
    })
  } finally {
    submitting.value = false
  }
}

function extractErrorMessage(error: unknown): string {
  // ofetch puts the whole h3 error body into error.data; the human-readable
  // reason from our validators lives one level deeper in body.data.
  if (typeof error === 'object' && error !== null && 'data' in error) {
    const body = (error as { data?: { data?: { message?: string, field?: string }, message?: string, issues?: Array<{ message?: string }> } }).data
    const detail = body?.data
    if (detail?.message) return detail.message
    if (detail?.field) {
      const label = fields.value.find(field => field.key === detail.field)?.label
      if (label) return `「${label}」填写有误，请检查`
    }
    return body?.issues?.[0]?.message || body?.message || ''
  }
  return ''
}

useSeoMeta({
  title: () => `${payload.value?.form?.title || '入会申请'} - ${payload.value?.club?.name || '社团纳新'}`,
  robots: 'noindex, nofollow'
})

onMounted(() => {
  void loadForm()
})
</script>

<template>
  <div>
    <header class="border-b border-[var(--line)] bg-[var(--surface)] dark:bg-zinc-900">
      <div class="page-shell py-8 md:py-10">
        <template v-if="payload?.club">
          <p class="section-kicker">
            {{ payload.club.name }} · 正式纳新
          </p>
          <h1 class="mt-2 text-2xl font-bold text-zinc-950 dark:text-zinc-100 md:text-3xl">
            {{ payload.form?.title || '入会申请表' }}
          </h1>
          <p
            v-if="payload.form?.slogan"
            class="mt-3 text-base font-semibold leading-7 text-emerald-700 dark:text-emerald-300"
          >
            {{ payload.form.slogan }}
          </p>
          <p
            v-if="payload.form?.intro"
            class="mt-3 max-w-3xl whitespace-pre-line text-sm leading-7 text-zinc-600 dark:text-zinc-300"
          >
            {{ payload.form.intro }}
          </p>
        </template>
        <template v-else>
          <p class="section-kicker">
            社团纳新
          </p>
          <h1 class="mt-2 text-2xl font-bold text-zinc-950 dark:text-zinc-100 md:text-3xl">
            入会申请表
          </h1>
        </template>
      </div>
    </header>

    <div class="page-shell py-8 md:py-12">
      <div
        v-if="loading"
        class="grid min-h-60 place-items-center text-zinc-500 dark:text-zinc-400"
        role="status"
      >
        <UIcon
          name="i-lucide-loader-circle"
          class="size-7 animate-spin"
        />
      </div>

      <div
        v-else-if="notFound"
        class="mx-auto max-w-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 px-6 py-10 text-center"
        role="alert"
      >
        <UIcon
          name="i-lucide-circle-x"
          class="mx-auto size-8 text-zinc-400"
        />
        <h2 class="mt-3 text-lg font-bold text-zinc-950 dark:text-zinc-100">
          没有找到纳新表单
        </h2>
        <p class="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          该社团还没有开放纳新。
        </p>
      </div>

      <div
        v-else-if="payload && !payload.available"
        class="mx-auto max-w-xl border border-amber-200 dark:border-amber-900 bg-amber-50 dark:bg-amber-950 px-6 py-10 text-center"
        role="status"
      >
        <UIcon
          name="i-lucide-clock"
          class="mx-auto size-8 text-amber-600 dark:text-amber-400"
        />
        <h2 class="mt-3 text-lg font-bold text-amber-950 dark:text-amber-200">
          纳新暂未开放
        </h2>
        <p class="mt-2 text-sm leading-6 text-amber-900 dark:text-amber-300">
          {{ payload.club?.name || '该社团' }}的纳新表单当前未开放。
        </p>
      </div>

      <div
        v-else-if="submittedFilename"
        class="mx-auto max-w-xl border-y border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 px-5 py-10 text-center"
        role="status"
      >
        <span class="mx-auto grid size-11 place-items-center rounded-full bg-green-700 text-[var(--surface)]">
          <UIcon
            name="i-lucide-check"
            class="size-5"
          />
        </span>
        <h2 class="mt-4 text-lg font-bold text-green-950 dark:text-green-300">
          报名提交成功
        </h2>
        <p class="mt-2 text-sm leading-6 text-green-800 dark:text-green-300">
          你的入会申请表已生成（{{ submittedFilename }}），请等待社团工作人员联系。
        </p>
      </div>

      <div
        v-else-if="submittedInfo"
        class="mx-auto max-w-xl border-y border-green-200 dark:border-green-800 bg-green-50 dark:bg-green-950 px-5 py-10 text-center"
        role="status"
      >
        <span class="mx-auto grid size-11 place-items-center rounded-full bg-green-700 text-[var(--surface)]">
          <UIcon
            name="i-lucide-check"
            class="size-5"
          />
        </span>
        <h2 class="mt-4 text-lg font-bold text-green-950 dark:text-green-300">
          你已完成报名
        </h2>
        <p class="mt-2 text-sm leading-6 text-green-800 dark:text-green-300">
          该设备已提交过入会申请（{{ submittedInfo.data.name || '未署名' }}）。
        </p>
        <div class="mt-6 flex flex-col items-center gap-2 sm:flex-row sm:justify-center">
          <UButton
            icon="i-lucide-pencil-line"
            label="修改提交信息"
            @click="resetDraft('edit')"
          />
          <UButton
            icon="i-lucide-file-plus-2"
            label="重新填一份"
            color="neutral"
            variant="soft"
            @click="resetDraft('fresh')"
          />
        </div>
      </div>

      <form
        v-else
        class="mx-auto max-w-2xl space-y-5"
        @submit.prevent="submitForm"
      >
        <div
          v-for="field in fields"
          :key="field.key"
          class="rounded-lg border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-4"
        >
          <label
            class="flex items-baseline gap-1 text-sm font-semibold text-zinc-900 dark:text-zinc-100"
            :for="`recruit-field-${field.key}`"
          >
            <span>{{ field.label }}</span>
            <span
              v-if="field.required"
              class="text-red-600 dark:text-red-400"
              aria-hidden="true"
            >*</span>
          </label>

          <div class="mt-3">
            <UTextarea
              v-if="field.type === 'textarea'"
              :id="`recruit-field-${field.key}`"
              v-model="textValues[field.key]"
              :placeholder="field.placeholder || `请填写${field.label}`"
              :rows="3"
              class="w-full"
            />
            <USelect
              v-else-if="field.type === 'select'"
              :id="`recruit-field-${field.key}`"
              v-model="textValues[field.key]"
              :items="field.options ?? []"
              :placeholder="field.placeholder || `请选择${field.label}`"
              class="w-full"
            />
            <div
              v-else-if="field.type === 'multiselect'"
              class="space-y-2"
            >
              <div
                v-for="option in field.options ?? []"
                :key="option"
              >
                <div class="flex items-center gap-2">
                  <UCheckbox
                    :model-value="isMultiselectSelected(field, option)"
                    :label="option"
                    @update:model-value="value => toggleMultiselectOption(field, option, value === true)"
                  />
                  <UButton
                    v-if="optionDetail(field, option)"
                    size="xs"
                    color="neutral"
                    variant="ghost"
                    icon="i-lucide-circle-question-mark"
                    :aria-label="`查看${option}介绍`"
                    @click="toggleOptionDetail(field.key, option)"
                  />
                </div>
                <p
                  v-if="optionDetail(field, option) && isDetailExpanded(field.key, option)"
                  class="mt-1 ml-7 rounded-md bg-zinc-50 dark:bg-zinc-800 px-3 py-2 text-xs leading-5 text-zinc-600 dark:text-zinc-300 whitespace-pre-line"
                >
                  {{ optionDetail(field, option) }}
                </p>
              </div>
            </div>
            <UInput
              v-else
              :id="`recruit-field-${field.key}`"
              v-model="textValues[field.key]"
              :placeholder="field.placeholder || `请填写${field.label}`"
              class="w-full"
            />
          </div>
        </div>

        <div
          v-if="payment?.enabled"
          class="rounded-lg border border-emerald-200 dark:border-emerald-900 bg-emerald-50/60 dark:bg-emerald-950/40 p-4 space-y-3"
        >
          <h3 class="text-sm font-bold text-zinc-900 dark:text-zinc-100">
            缴纳会费
          </h3>
          <p class="text-xs leading-5 text-zinc-600 dark:text-zinc-300">
            {{ payment.note }}。
          </p>
          <div
            v-if="payment.wechatImage || payment.alipayImage"
            class="grid grid-cols-2 gap-3"
          >
            <figure
              v-for="qr in [{ src: payment.wechatImage, kind: 'wechat' as const, label: '微信支付' }, { src: payment.alipayImage, kind: 'alipay' as const, label: '支付宝' }].filter(item => item.src)"
              :key="qr.kind"
              class="space-y-1"
            >
              <a
                :href="payRelayHref(qr.kind, qr.src!)"
                class="block w-full overflow-hidden rounded-md border border-zinc-200 dark:border-zinc-700"
              >
                <img
                  :src="qr.src!"
                  :alt="`${qr.label}收款码`"
                  class="w-full"
                  loading="lazy"
                >
              </a>
              <figcaption class="text-center text-xs text-zinc-500 dark:text-zinc-400">
                {{ qr.label }}（点击打开付款页）
              </figcaption>
            </figure>
          </div>
          <UFormField label="是否已缴纳会费">
            <USelect
              :model-value="paymentConfirmed === true ? 'yes' : 'no'"
              :items="[
                { label: '已缴纳会费', value: 'yes' },
                { label: '尚未缴纳', value: 'no' }
              ]"
              class="w-56"
              @update:model-value="value => (paymentConfirmed = value === 'yes' ? true : null)"
            />
          </UFormField>
        </div>

        <div class="flex flex-col gap-2 pt-1 sm:flex-row sm:justify-end">
          <UButton
            type="submit"
            icon="i-lucide-send"
            label="提交报名"
            size="lg"
            :loading="submitting"
          />
        </div>
      </form>
    </div>
  </div>
</template>
