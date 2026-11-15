<script setup lang="ts">
useSeoMeta({
  title: '联系我们',
  description: '反馈内容错误、加入新生群，或联系整理者。'
})
</script>

<template>
  <div>
    <header class="border-b border-[var(--line)] bg-[var(--surface)] dark:bg-zinc-900">
      <div class="page-shell py-8 md:py-11">
        <p class="section-kicker">
          联系整理者
        </p>
        <h1 class="mt-2 text-2xl font-bold text-zinc-950 dark:text-zinc-100 md:text-3xl">
          有问题，直接来找我
        </h1>
      </div>
    </header>

    <main class="page-shell py-8 md:py-12">
      <div class="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-14">
        <section aria-labelledby="contact-help-heading">
          <div class="flex items-center gap-3">
            <span class="grid size-10 shrink-0 place-items-center rounded-md bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400">
              <UIcon
                name="i-lucide-message-circle"
                class="size-5"
              />
            </span>
            <div>
              <p class="text-xs font-semibold text-green-700 dark:text-green-400">
                微信联系
              </p>
              <h2
                id="contact-help-heading"
                class="mt-0.5 text-xl font-bold text-zinc-950 dark:text-zinc-100"
              >
                加好友时写一句要问的事
              </h2>
            </div>
          </div>

          <div class="mt-6 divide-y divide-zinc-200 dark:divide-zinc-800 border-y border-zinc-200 dark:border-zinc-800">
            <div class="flex gap-4 py-5">
              <UIcon
                name="i-lucide-circle-question-mark"
                class="mt-0.5 size-5 shrink-0 text-green-700 dark:text-green-400"
              />
              <div>
                <h3 class="text-sm font-bold text-zinc-950 dark:text-zinc-100">
                  咨询指南问题
                </h3>
                <p class="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                  带上页面名或截图
                </p>
              </div>
            </div>
            <div class="flex gap-4 py-5">
              <UIcon
                name="i-lucide-users-round"
                class="mt-0.5 size-5 shrink-0 text-green-700 dark:text-green-400"
              />
              <div>
                <h3 class="text-sm font-bold text-zinc-950 dark:text-zinc-100">
                  申请加入新生群
                </h3>
                <p class="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                  备注“新生群”和年级
                </p>
              </div>
            </div>
            <div class="flex gap-4 py-5">
              <UIcon
                name="i-lucide-message-square-warning"
                class="mt-0.5 size-5 shrink-0 text-green-700 dark:text-green-400"
              />
              <div>
                <h3 class="text-sm font-bold text-zinc-950 dark:text-zinc-100">
                  纠错或补充内容
                </h3>
                <p class="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                  说清哪句不对，附截图
                </p>
              </div>
            </div>
          </div>

          <div class="mt-6 flex flex-wrap gap-2">
            <UButton
              to="/feedback"
              icon="i-lucide-message-square-warning"
              label="站内反馈"
              color="neutral"
              variant="outline"
              class="min-h-11"
            />
            <UButton
              to="/about"
              icon="i-lucide-info"
              label="了解本站"
              color="neutral"
              variant="ghost"
              class="min-h-11"
            />
          </div>
        </section>

        <section
          class="rounded-lg border border-green-200 dark:border-green-800 bg-[var(--surface)] dark:bg-zinc-900 p-4 shadow-sm sm:p-5"
          aria-labelledby="wechat-qr-heading"
        >
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-xs font-semibold text-green-700 dark:text-green-400">
                扫码添加
              </p>
              <h2
                id="wechat-qr-heading"
                class="mt-1 text-base font-bold text-zinc-950 dark:text-zinc-100"
              >
                微信二维码
              </h2>
            </div>
            <UIcon
              name="i-lucide-scan"
              class="size-5 text-green-700 dark:text-green-400"
            />
          </div>
          <img
            src="/images/contact-wechat.png"
            alt="联系整理者的微信二维码"
            width="888"
            height="1131"
            class="mt-4 aspect-[888/1131] w-full rounded-md border border-zinc-100 dark:border-zinc-800 object-contain"
          >
          <p class="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
            身份证、银行卡、密码别发。缴费和学籍走学校官方渠道。
          </p>
        </section>
      </div>
    </main>
  </div>
</template>
