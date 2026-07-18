<script setup lang="ts">
useSeoMeta({
  title: '部分社交平台图片暂不展示',
  description: '说明为什么部分校园图片暂不展示，以及图片获得作者同意后怎样使用。',
  robots: 'noindex, nofollow'
})
</script>

<template>
  <div>
    <header class="border-b border-[var(--line)] bg-white">
      <div class="page-shell py-8 md:py-11">
        <nav class="flex items-center gap-2 text-xs text-zinc-500">
          <NuxtLink
            to="/discover"
            class="hover:text-green-700"
          >
            更多服务
          </NuxtLink>
          <UIcon
            name="i-lucide-chevron-right"
            class="size-3.5"
          />
          <span class="text-zinc-700">图片使用说明</span>
        </nav>

        <div class="mt-5 max-w-3xl">
          <p class="section-kicker">
            图片使用说明
          </p>
          <h1 class="mt-2 text-2xl font-bold text-zinc-950 md:text-3xl">
            部分社交平台图片暂不展示
          </h1>
          <p class="mt-3 text-sm leading-7 text-zinc-600 md:text-base">
            整理校园信息时，我们参考过公开发布的宿舍、快递、餐饮和交通图片。这些图片属于原作者，在没有获得明确同意前，本站不会展示或改编它们。图片里的地点和营业信息也可能过时，不能直接用来导航。
          </p>
        </div>
      </div>
    </header>

    <main class="page-shell py-8 md:py-12">
      <section class="max-w-3xl border-y border-zinc-200 bg-white py-5 md:py-6">
        <div class="flex items-start gap-3">
          <span class="grid size-10 shrink-0 place-items-center rounded-md bg-orange-50 text-orange-700">
            <UIcon
              name="i-lucide-shield-alert"
              class="size-5"
            />
          </span>
          <div>
            <h2 class="text-lg font-bold text-zinc-950">
              什么情况下可以展示
            </h2>
            <ul class="mt-3 space-y-2 text-sm leading-7 text-zinc-600">
              <li>没有获得作者同意的图片，不会出现在公开页面。</li>
              <li>用 AI 重画也不能代替作者同意。</li>
              <li>图片里提到的地点、价格和营业时间，需要再看现场或学校通知。</li>
              <li>获得作者同意，或使用自己拍摄和创作的图片后，才会公开展示。</li>
            </ul>
          </div>
        </div>
      </section>

      <div class="mt-6 flex flex-wrap gap-3">
        <UButton
          to="/sources"
          icon="i-lucide-list-checks"
          label="看看信息从哪里来"
        />
        <UButton
          to="/feedback"
          icon="i-lucide-message-square-warning"
          label="告诉我们更准确的信息"
          color="neutral"
          variant="outline"
        />
      </div>
    </main>
  </div>
</template>
