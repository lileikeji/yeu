<script setup lang="ts">
import { officialDepartments } from '~~/data/seeds/public-content'
import {
  departmentListContactPreview,
  departmentListMessages,
  filterDepartmentListItems,
  prioritizeDepartmentListItems
} from '~~/app/utils/department-list-presentation'
import { mergePublicDepartments } from '~/utils/public-catalog'
import {
  directoryListBatchSize,
  directoryListToggleLabel,
  nextDirectoryVisibleCount,
  previewDirectoryItems
} from '~~/app/utils/directory-list-presentation'

useSeoMeta({
  title: '校内部门',
  description: '查找仰恩大学新生常用部门的职责、官网和公开联系方式。'
})

const searchQuery = ref('')
const visibleCount = ref(directoryListBatchSize)
const { data: response, error, refresh } = await usePublicDepartmentList()
const departments = computed(() => mergePublicDepartments(officialDepartments, response.value?.items ?? [], true))
const orderedDepartments = computed(() => prioritizeDepartmentListItems(departments.value))
const filteredDepartments = computed(() => filterDepartmentListItems(orderedDepartments.value, searchQuery.value))
const isFiltering = computed(() => Boolean(searchQuery.value.trim()))
const visibleDepartments = computed(() => previewDirectoryItems(filteredDepartments.value, {
  filtered: isFiltering.value,
  visibleCount: visibleCount.value
}))
const showListToggle = computed(() => !isFiltering.value
  && filteredDepartments.value.length > directoryListBatchSize)
const listToggleLabel = computed(() => directoryListToggleLabel(
  visibleDepartments.value.length,
  filteredDepartments.value.length
))

watch(searchQuery, () => {
  visibleCount.value = directoryListBatchSize
})

function toggleDepartmentList() {
  visibleCount.value = nextDirectoryVisibleCount(
    visibleDepartments.value.length,
    filteredDepartments.value.length
  )
}

function clearDepartmentSearch() {
  searchQuery.value = ''
}
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
          联系方式来自学校或部门官网。办公地点和时间可能调整，出发前请再确认。
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
        class="mb-5 border-l-2 border-amber-500 bg-amber-50 px-4 py-3"
        role="status"
      >
        <div class="flex items-start gap-3">
          <UIcon
            name="i-lucide-info"
            class="mt-0.5 size-4 shrink-0 text-amber-700"
          />
          <div class="min-w-0 flex-1">
            <h2 class="text-sm font-bold text-amber-950">
              部分部门信息还没更新出来
            </h2>
            <p class="mt-1 text-xs leading-5 text-amber-900">
              {{ departmentListMessages.serviceUnavailable }}
            </p>
            <UButton
              icon="i-lucide-refresh-cw"
              label="重新试一次"
              color="neutral"
              variant="outline"
              class="mt-3 min-h-11"
              @click="refresh()"
            />
          </div>
        </div>
      </div>

      <div
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
          class="min-h-11"
        />
      </div>

      <div
        v-if="filteredDepartments.length"
        class="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
      >
        <NuxtLink
          v-for="department in visibleDepartments"
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
        v-if="showListToggle"
        class="mt-6 flex justify-center"
      >
        <UButton
          :icon="visibleDepartments.length >= filteredDepartments.length ? 'i-lucide-chevron-up' : 'i-lucide-chevron-down'"
          :label="listToggleLabel"
          color="neutral"
          variant="ghost"
          class="min-h-11"
          @click="toggleDepartmentList"
        />
      </div>

      <div
        v-if="!error && !filteredDepartments.length"
        class="border-y border-zinc-200 bg-white px-5 py-12 text-center"
      >
        <UIcon
          name="i-lucide-search-x"
          class="mx-auto size-6 text-zinc-400"
        />
        <p class="mt-3 text-sm text-zinc-600">
          {{ departmentListMessages.emptyMatch }}
        </p>
        <UButton
          v-if="isFiltering"
          icon="i-lucide-x"
          label="清空搜索"
          color="neutral"
          variant="outline"
          class="mt-4 min-h-11"
          @click="clearDepartmentSearch"
        />
      </div>
    </div>
  </div>
</template>
