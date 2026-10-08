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

const hint = computed(() => label.value === '微信支付'
  ? '长按上方二维码，选择「识别二维码」完成付款'
  : '截图保存二维码，打开支付宝「扫一扫」从相册选取付款')

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
      <p class="mt-2 text-center text-sm leading-6 text-emerald-700 dark:text-emerald-300">
        {{ hint }}
      </p>
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
    </div>
  </div>
</template>
