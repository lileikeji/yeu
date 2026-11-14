<script setup lang="ts">
import { majorCollegeCount, majorProfiles, ordinaryPlanSource, transferPlanSource } from '~~/data/major-profiles'
import type { MajorProfile } from '~~/data/major-profiles'
import { currentCohort, currentCohortYear } from '~~/shared/config/cohort'

const query = ref('')
const selected = ref<MajorProfile | null>(null)
const inputFocused = ref(false)

const matches = computed(() => {
  const value = query.value.trim().toLocaleLowerCase('zh-CN')
  if (!value) return majorProfiles.slice(0, 8)
  return majorProfiles
    .filter(item => `${item.name} ${item.collegeName} ${item.code}`.toLocaleLowerCase('zh-CN').includes(value))
    .slice(0, 8)
})

const showOptions = computed(() => inputFocused.value && !selected.value)

function selectMajor(profile: MajorProfile) {
  selected.value = profile
  query.value = profile.name
  inputFocused.value = false
}

function handleInput() {
  selected.value = null
}

function clearSelection() {
  query.value = ''
  selected.value = null
  inputFocused.value = true
}

function admissionLabel(profile: MajorProfile): string {
  return profile.admissionTypes.includes('transfer-undergraduate') ? '普通本科 · 专升本' : '普通本科'
}
</script>

<template>
  <section
    id="major-lookup"
    class="border-t border-[var(--line)] bg-emerald-950 text-white"
    aria-labelledby="major-lookup-title"
  >
    <div class="page-shell grid gap-8 py-10 md:py-14 lg:grid-cols-[minmax(0,0.82fr)_minmax(28rem,1.18fr)] lg:items-start">
      <div class="max-w-xl">
        <p class="text-xs font-semibold text-emerald-300">
          专业与学院
        </p>
        <h2
          id="major-lookup-title"
          class="mt-2 text-2xl font-bold md:text-3xl"
        >
          录取专业属于哪个学院？
        </h2>
        <p class="mt-3 text-sm leading-7 text-emerald-50/75">
          {{ currentCohortYear }} 年招生计划 · {{ majorProfiles.length }} 个本科专业 · {{ majorCollegeCount }} 个学院
        </p>

        <dl class="mt-6 grid grid-cols-3 gap-px overflow-hidden rounded-lg bg-[color-mix(in_srgb,var(--surface)_15%,transparent)] dark:bg-zinc-900/15">
          <div class="bg-emerald-950 px-3 py-4">
            <dt class="text-xs text-emerald-200/70">
              普通本科
            </dt>
            <dd class="mt-1 text-xl font-bold">
              26
            </dd>
          </div>
          <div class="bg-emerald-950 px-3 py-4">
            <dt class="text-xs text-emerald-200/70">
              专升本专业
            </dt>
            <dd class="mt-1 text-xl font-bold">
              17
            </dd>
          </div>
          <div class="bg-emerald-950 px-3 py-4">
            <dt class="text-xs text-emerald-200/70">
              资料核验
            </dt>
            <dd class="mt-1 text-sm font-bold">
              7月24日
            </dd>
          </div>
        </dl>

        <div class="mt-5 flex flex-wrap gap-x-4 gap-y-2 text-xs text-emerald-100/75">
          <a
            :href="ordinaryPlanSource.url"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex min-h-11 items-center gap-1.5 hover:text-white"
          >
            普通本科计划
            <UIcon
              name="i-lucide-external-link"
              class="size-3.5"
            />
          </a>
          <a
            :href="transferPlanSource.url"
            target="_blank"
            rel="noopener noreferrer"
            class="inline-flex min-h-11 items-center gap-1.5 hover:text-white"
          >
            专升本计划
            <UIcon
              name="i-lucide-external-link"
              class="size-3.5"
            />
          </a>
        </div>
      </div>

      <div class="min-w-0 rounded-lg border border-white/20 bg-[var(--surface)] dark:bg-zinc-900 p-4 text-zinc-950 dark:text-zinc-100 shadow-2xl shadow-black/20 md:p-6">
        <label
          for="major-search"
          class="text-sm font-semibold"
        >输入录取专业</label>
        <div class="relative mt-2">
          <UInput
            id="major-search"
            v-model="query"
            icon="i-lucide-graduation-cap"
            size="xl"
            class="w-full"
            placeholder="例如：会计学、人工智能、汉语言文学"
            autocomplete="off"
            @focus="inputFocused = true"
            @input="handleInput"
          />

          <div
            v-if="showOptions"
            class="absolute inset-x-0 top-[calc(100%+0.5rem)] z-20 max-h-72 overflow-y-auto rounded-lg border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900 p-1.5 shadow-xl"
            role="listbox"
          >
            <button
              v-for="profile in matches"
              :key="profile.name"
              type="button"
              class="flex min-h-12 w-full items-center justify-between gap-3 rounded-md px-3 text-left hover:bg-emerald-50 dark:hover:bg-emerald-950 focus:bg-emerald-50 dark:focus:bg-emerald-950 focus:outline-none"
              role="option"
              @mousedown.prevent="selectMajor(profile)"
            >
              <span class="min-w-0">
                <span class="block truncate text-sm font-semibold">{{ profile.name }}</span>
                <span class="block truncate text-xs text-zinc-500 dark:text-zinc-400">{{ profile.collegeName }}</span>
              </span>
              <span class="shrink-0 text-xs text-zinc-400 dark:text-zinc-500">{{ profile.code }}</span>
            </button>
            <p
              v-if="matches.length === 0"
              class="px-3 py-5 text-center text-sm text-zinc-500 dark:text-zinc-400"
            >
              2026招生计划中没有找到这个专业
            </p>
          </div>
        </div>

        <div
          v-if="selected"
          class="mt-6"
          aria-live="polite"
        >
          <div class="flex items-start justify-between gap-4 border-b border-zinc-200 dark:border-zinc-800 pb-4">
            <div class="min-w-0">
              <div class="flex flex-wrap items-center gap-2">
                <h3 class="text-xl font-bold">
                  {{ selected.name }}
                </h3>
                <UBadge
                  color="neutral"
                  variant="soft"
                >
                  {{ selected.code }}
                </UBadge>
              </div>
              <p class="mt-1 text-sm text-zinc-500 dark:text-zinc-400">
                {{ admissionLabel(selected) }}
              </p>
            </div>
            <UButton
              icon="i-lucide-x"
              color="neutral"
              variant="ghost"
              aria-label="重新查询专业"
              @click="clearSelection"
            />
          </div>

          <div class="grid gap-5 py-5 sm:grid-cols-2">
            <div>
              <p class="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                所属学院
              </p>
              <p class="mt-1 font-bold text-emerald-800 dark:text-emerald-300">
                {{ selected.collegeName }}
              </p>
              <div class="mt-2 flex flex-wrap gap-x-3 text-xs">
                <NuxtLink
                  :to="`/departments/${selected.collegeSlug}`"
                  class="inline-flex min-h-11 items-center gap-1 text-emerald-700 dark:text-emerald-300 hover:text-emerald-900 dark:hover:text-emerald-300"
                >
                  学院页
                  <UIcon
                    name="i-lucide-arrow-right"
                    class="size-3.5"
                  />
                </NuxtLink>
                <a
                  :href="selected.collegeProfileUrl"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="inline-flex min-h-11 items-center gap-1 text-zinc-600 dark:text-zinc-300 hover:text-zinc-950 dark:hover:text-zinc-100"
                >
                  学院官网
                  <UIcon
                    name="i-lucide-external-link"
                    class="size-3.5"
                  />
                </a>
              </div>
            </div>

            <div>
              <p class="text-xs font-medium text-zinc-500 dark:text-zinc-400">
                {{ currentCohort }}宿舍片区
              </p>
              <p class="mt-1 inline-flex items-center gap-2 font-bold text-amber-700 dark:text-amber-300">
                <UIcon
                  name="i-lucide-clock-3"
                  class="size-4"
                />
                {{ selected.dormLabel }}
              </p>
            </div>
          </div>

          <p class="border-l-2 border-amber-400 dark:border-amber-700 bg-amber-50 dark:bg-amber-950 px-3 py-2.5 text-xs leading-5 text-amber-950 dark:text-amber-100">
            {{ selected.dormNote }}
          </p>
        </div>

        <p
          v-else
          class="mt-6 border-t border-zinc-200 dark:border-zinc-800 pt-4 text-xs text-zinc-500 dark:text-zinc-400"
        >
          {{ currentCohort }} 片区整理 · 以迎新系统为准
        </p>
      </div>
    </div>
  </section>
</template>
