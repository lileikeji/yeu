<script setup lang="ts">
useSeoMeta({
  title: '校园活动',
  description: '社团与部门发布的校园活动，经校方审核后展示。'
})
</script>

<template>
  <main class="min-h-screen bg-zinc-50 pb-16 dark:bg-zinc-950">
    <div class="page-shell pt-5">
      <nav
        class="flex items-center gap-1.5 text-xs text-zinc-500 dark:text-zinc-400"
        aria-label="面包屑"
      >
        <NuxtLink
          to="/"
          class="hover:text-emerald-700 dark:hover:text-emerald-300"
        >
          首页
        </NuxtLink>
        <UIcon
          name="i-lucide-chevron-right"
          class="size-3.5"
        />
        <span class="text-zinc-700 dark:text-zinc-300">校园活动</span>
      </nav>

      <header class="mt-6 max-w-3xl">
        <h1 class="text-2xl font-bold tracking-tight text-zinc-950 dark:text-zinc-100 md:text-3xl">
          校园活动
        </h1>
        <p class="mt-2 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
          社团与部门发布的活动，按开始时间排序。活动由组织负责人提交，校方审核后展示。
        </p>
      </header>
    </div>

    <div class="page-shell mt-2">
      <PublicActivityList
        :limit="50"
        show-empty
      />
    </div>
  </main>
</template>
