<script setup lang="ts">
import { officialDepartments } from '~~/data/seeds/public-content'
import {
  departmentListContactPreview,
  departmentListMessages,
  filterDepartmentListItems
} from '~~/app/utils/department-list-presentation'
import { mergePublicDepartments } from '~/utils/public-catalog'

useSeoMeta({
  title: '校内部门',
  description: '查找仰恩大学新生常用部门的职责、官网和公开联系方式。'
})

const searchQuery = ref('')
const { data: response, error } = await usePublicDepartmentList()
const departments = computed(() => mergePublicDepartments(officialDepartments, response.value?.items ?? [], true))
const filteredDepartments = computed(() => filterDepartmentListItems(departments.value, searchQuery.value))
</script>

<template>
  <div>
    <header class="border-b border-[var(--line)] bg-white">
      <div class="page-shell py-8 md:py-11">
        <p class="section-kicker">
          校内办事
        </p>
        <h1 class="mt-2 text-2xl font-bold text-zinc-950 md:text-3xl">
          新生常用部门
        </h1>
        <p class="mt-3 max-w-2xl text-sm leading-7 text-zinc-600">
          联系方式来自学校或部门官网；办公地点和时间只在取得明确来源后显示。
        </p>
        <UInput
          v-model="searchQuery"
          icon="i-lucide-search"
          placeholder="搜索部门或办理事项"
          aria-label="搜索校内部门"
          size="lg"
          class="mt-6 max-w-2xl"
        />
      </div>
    </header>

    <div class="page-shell page-section">
      <div
        v-if="error"
        class="border-l-2 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-800"
        role="alert"
      >
        {{ departmentListMessages.serviceUnavailable }}
      </div>

      <div
        v-else
        class="mb-4 flex items-center justify-between gap-4"
      >
        <h2 class="text-sm font-semibold text-zinc-900">
          {{ filteredDepartments.length }} 个部门
        </h2>
        <UButton
          to="/campus#departments"
          icon="i-lucide-school"
          label="校园概览"
          color="neutral"
          variant="ghost"
        />
      </div>

      <div
        v-if="filteredDepartments.length"
        class="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
      >
        <NuxtLink
          v-for="department in filteredDepartments"
          :key="department.slug"
          :to="`/departments/${department.slug}`"
          class="surface-panel group flex min-h-48 flex-col p-5 transition hover:border-green-300 hover:shadow-sm"
        >
          <span class="grid size-10 place-items-center rounded-md bg-blue-50 text-blue-700">
            <UIcon
              name="i-lucide-landmark"
              class="size-5"
            />
          </span>
          <h2 class="mt-4 font-bold text-zinc-950">
            {{ department.name }}
          </h2>
          <p class="mt-2 flex-1 text-sm leading-6 text-zinc-600">
            {{ department.summary }}
          </p>
          <div class="mt-4 flex items-center justify-between border-t border-zinc-100 pt-3 text-xs text-zinc-500">
            <span>{{ departmentListContactPreview(department) }}</span>
            <UIcon
              name="i-lucide-arrow-right"
              class="size-4 text-green-700"
            />
          </div>
        </NuxtLink>
      </div>

      <div
        v-else-if="!error"
        class="border-y border-zinc-200 bg-white px-5 py-12 text-center"
      >
        <UIcon
          name="i-lucide-search-x"
          class="mx-auto size-6 text-zinc-400"
        />
        <p class="mt-3 text-sm text-zinc-600">
          {{ departmentListMessages.emptyMatch }}
        </p>
      </div>
    </div>
  </div>
</template>
