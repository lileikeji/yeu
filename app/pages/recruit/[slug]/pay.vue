<script setup lang="ts">
/**
 * QR relay page (中转页). WeChat's in-app browser blocks long-press recognition
 * on modal-overlay images, but a real page navigation long-presses reliably.
 * Opens as a full navigation from the signup page, shows the code big with
 * instructions, and lets the applicant hop back.
 */
const route = useRoute()

const rawSrc = computed(() => String(route.query.src ?? ''))
const label = computed(() => {
  const value = String(route.query.label ?? '')
  return value === 'wechat' ? '微信支付' : value === 'alipay' ? '支付宝' : '付款'
})
const note = computed(() => String(route.query.note ?? '付款请备注：班级+姓名+电话'))

// Only site-uploaded images may be relayed (no open redirect / abuse).
const src = computed(() => rawSrc.value.startsWith('/uploads/') ? rawSrc.value : '')
const backPath = computed(() => `/recruit/${encodeURIComponent(String(route.params.slug ?? ''))}`)

// 微信限制网页内直接长按识别付款码（聊天里可以，网页里不行），
// 唯一可靠路径是保存图片后从「扫一扫 → 相册」识别，故用分步指引。
const steps = computed(() => label.value === '微信支付'
  ? [
      '长按下方二维码，选择「保存图片」',
      '回到微信首页，点右上角「+」→「扫一扫」',
      '点右下角「相册」，选刚保存的二维码付款'
    ]
  : [
      '长按下方二维码，选择「保存图片」',
      '打开支付宝，点「扫一扫」',
      '点右下角「相册」，选中该二维码完成付款'
    ])

useSeoMeta({
  title: () => `${label.value} · 付款码`,
  robots: 'noindex, nofollow'
})
</script>

<template>
  <div class="min-h-dvh bg-white dark:bg-zinc-950">
    <div class="mx-auto flex min-h-dvh max-w-md flex-col items-center px-5 py-8">
      <h1 class="text-lg font-bold text-zinc-950 dark:text-zinc-100">
        {{ label }} · 扫码付款
      </h1>
      <p class="mt-1 text-center text-xs text-zinc-500 dark:text-zinc-400">
        付款请备注：{{ note }}
      </p>

      <div
        v-if="src"
        class="mt-5 w-full overflow-hidden rounded-xl border border-zinc-200 dark:border-zinc-800"
      >
        <img
          :src="src"
          :alt="`${label}收款码`"
          class="w-full"
        >
      </div>
      <p
        v-else
        class="mt-8 text-sm text-zinc-500"
        role="alert"
      >
        付款码链接无效
      </p>

      <UButton
        class="mt-6"
        icon="i-lucide-arrow-left"
        label="返回填写报名表"
        color="neutral"
        variant="soft"
        :to="backPath"
      />

      <ol class="mt-6 w-full space-y-2 rounded-xl border border-zinc-200 bg-zinc-50 p-4 dark:border-zinc-800 dark:bg-zinc-900">
        <li
          v-for="(step, index) in steps"
          :key="index"
          class="flex items-start gap-2 text-sm leading-6 text-zinc-700 dark:text-zinc-300"
        >
          <span class="mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full bg-emerald-600 text-[11px] font-bold text-white">
            {{ index + 1 }}
          </span>
          {{ step }}
        </li>
      </ol>
    </div>
  </div>
</template>
