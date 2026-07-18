<script setup lang="ts">
useSeoMeta({
  title: '社交平台研究素材暂不公开',
  description: '未取得原作者或权利人许可的研究素材仅用于内部事实核验，不在新生指南公开展示。',
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
          <span class="text-zinc-700">研究素材边界</span>
        </nav>

        <div class="mt-5 max-w-3xl">
          <p class="section-kicker">
            内容与版权治理
          </p>
          <h1 class="mt-2 text-2xl font-bold text-zinc-950 md:text-3xl">
            社交平台研究素材暂不公开
          </h1>
          <p class="mt-3 text-sm leading-7 text-zinc-600 md:text-base">
            项目曾依据公开笔记整理宿舍、快递、餐饮和校内交通线索。由于尚未取得原作者或相关权利人的书面再利用许可，原始图片及基于这些图片生成的视觉重构仅保留在内部研究区，不作为公开图片、事实证据或导航依据。
          </p>
        </div>
      </div>
    </header>

    <main class="page-shell py-8 md:py-12">
      <section class="surface-panel max-w-3xl p-5 md:p-6">
        <div class="flex items-start gap-3">
          <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-orange-50 text-orange-700">
            <UIcon
              name="i-lucide-shield-alert"
              class="size-5"
            />
          </span>
          <div>
            <h2 class="text-lg font-bold text-zinc-950">
              当前处理规则
            </h2>
            <ul class="mt-3 space-y-2 text-sm leading-7 text-zinc-600">
              <li>原始平台图片保持 research-only，不进入公开静态目录。</li>
              <li>AI 重构或概念示意不能替代原素材的再利用授权。</li>
              <li>笔记中的地点、价格、时刻、设施和营业状态必须由现场或主管方独立核验。</li>
              <li>取得明确授权，或换成项目独立拍摄、独立创作的素材后，才重新进行发布确认。</li>
            </ul>
          </div>
        </div>
      </section>

      <div class="mt-6 flex flex-wrap gap-3">
        <UButton
          to="/sources"
          icon="i-lucide-list-checks"
          label="查看公开来源说明"
        />
        <UButton
          to="/feedback"
          icon="i-lucide-message-square-warning"
          label="提交可核验资料"
          color="neutral"
          variant="outline"
        />
      </div>
    </main>
  </div>
</template>
