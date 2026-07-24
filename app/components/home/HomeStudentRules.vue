<script setup lang="ts">
import { scholarships, studentRuleCatalog } from '~~/data/student-rules'
</script>

<template>
  <section
    class="border-t border-[var(--line)] bg-white"
    aria-labelledby="home-student-rules-title"
  >
    <div class="page-shell grid gap-6 py-9 md:grid-cols-[minmax(0,1fr)_auto] md:items-center md:py-12">
      <div class="max-w-3xl">
        <p class="section-kicker">
          在校规则工具
        </p>
        <h2
          id="home-student-rules-title"
          class="mt-2 text-2xl font-bold text-zinc-950"
        >
          绩点、奖学金和学生规则，一处查清
        </h2>
        <p class="mt-3 text-sm leading-7 text-zinc-600">
          已按学校官网公开文件整理 {{ scholarships.length }} 类奖学金、{{ studentRuleCatalog.length }} 项学生制度，并提供可直接试算的 GPA 计算器。
        </p>
        <div class="mt-4 flex flex-wrap gap-x-5 gap-y-2 text-sm text-zinc-700">
          <span class="inline-flex items-center gap-2">
            <UIcon
              name="i-lucide-calculator"
              class="size-4 text-emerald-700"
            />
            百分制、五级制、补考
          </span>
          <span class="inline-flex items-center gap-2">
            <UIcon
              name="i-lucide-award"
              class="size-4 text-amber-600"
            />
            奖项条件与兼得规则
          </span>
          <span class="inline-flex items-center gap-2">
            <UIcon
              name="i-lucide-shield-check"
              class="size-4 text-sky-700"
            />
            每条保留官方来源
          </span>
        </div>
      </div>
      <UButton
        to="/student-rules"
        label="打开学生规则库"
        icon="i-lucide-book-open-check"
        trailing-icon="i-lucide-arrow-right"
        size="xl"
        class="min-h-12 justify-center md:min-w-52"
      />
    </div>
  </section>
</template>
