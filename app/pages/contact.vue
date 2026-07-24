<script setup lang="ts">
useSeoMeta({
  title: '联系我们',
  description: '联系仰恩新生指南整理者，反馈问题或申请加入新生交流群。'
})
</script>

<template>
  <div>
    <header class="border-b border-[var(--line)] bg-white">
      <div class="page-shell py-8 md:py-11">
        <p class="section-kicker">
          联系整理者
        </p>
        <h1 class="mt-2 text-2xl font-bold text-zinc-950 md:text-3xl">
          有问题，直接来找我
        </h1>
        <p class="mt-3 max-w-2xl text-sm leading-7 text-zinc-600">
          指南内容看不明白、发现信息有误，或者想加入新生交流群，都可以扫码添加微信。
        </p>
      </div>
    </header>

    <main class="page-shell py-8 md:py-12">
      <div class="grid items-start gap-8 lg:grid-cols-[minmax(0,1fr)_24rem] lg:gap-14">
        <section aria-labelledby="contact-help-heading">
          <div class="flex items-center gap-3">
            <span class="grid size-10 shrink-0 place-items-center rounded-md bg-green-50 text-green-700">
              <UIcon
                name="i-lucide-message-circle"
                class="size-5"
              />
            </span>
            <div>
              <p class="text-xs font-semibold text-green-700">
                微信联系
              </p>
              <h2
                id="contact-help-heading"
                class="mt-0.5 text-xl font-bold text-zinc-950"
              >
                添加时说一下你的来意
              </h2>
            </div>
          </div>

          <div class="mt-6 divide-y divide-zinc-200 border-y border-zinc-200">
            <div class="flex gap-4 py-5">
              <UIcon
                name="i-lucide-circle-question-mark"
                class="mt-0.5 size-5 shrink-0 text-green-700"
              />
              <div>
                <h3 class="text-sm font-bold text-zinc-950">
                  咨询指南问题
                </h3>
                <p class="mt-1 text-sm leading-6 text-zinc-600">
                  请带上你看到的页面名称或截图，我会更快定位到对应内容。
                </p>
              </div>
            </div>
            <div class="flex gap-4 py-5">
              <UIcon
                name="i-lucide-users-round"
                class="mt-0.5 size-5 shrink-0 text-green-700"
              />
              <div>
                <h3 class="text-sm font-bold text-zinc-950">
                  申请加入新生群
                </h3>
                <p class="mt-1 text-sm leading-6 text-zinc-600">
                  添加后备注“新生群”和你的年级；群内信息仍需自行核对，不代替学校通知。
                </p>
              </div>
            </div>
            <div class="flex gap-4 py-5">
              <UIcon
                name="i-lucide-message-square-warning"
                class="mt-0.5 size-5 shrink-0 text-green-700"
              />
              <div>
                <h3 class="text-sm font-bold text-zinc-950">
                  纠错或补充内容
                </h3>
                <p class="mt-1 text-sm leading-6 text-zinc-600">
                  说明哪里不对并附上可信来源；不方便加微信，也可以使用站内反馈。
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
          class="rounded-lg border border-green-200 bg-white p-4 shadow-sm sm:p-5"
          aria-labelledby="wechat-qr-heading"
        >
          <div class="flex items-center justify-between gap-3">
            <div>
              <p class="text-xs font-semibold text-green-700">
                扫码添加
              </p>
              <h2
                id="wechat-qr-heading"
                class="mt-1 text-base font-bold text-zinc-950"
              >
                微信二维码
              </h2>
            </div>
            <UIcon
              name="i-lucide-scan"
              class="size-5 text-green-700"
            />
          </div>
          <img
            src="/images/contact-wechat.png"
            alt="联系整理者的微信二维码"
            width="888"
            height="1131"
            class="mt-4 aspect-[888/1131] w-full rounded-md border border-zinc-100 object-contain"
          >
          <p class="mt-3 text-xs leading-5 text-zinc-500">
            请勿发送身份证号、银行卡、密码等敏感信息。涉及缴费、录取和学籍的事项，以学校官方渠道为准。
          </p>
        </section>
      </div>
    </main>
  </div>
</template>
