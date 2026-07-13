<script setup lang="ts">
import { mergePublicDepartments } from '~/utils/public-catalog'
import { throwPublicDetailError } from '~/utils/public-errors'

const route = useRoute()
const slug = String(Array.isArray(route.params.slug) ? route.params.slug[0] : route.params.slug ?? '')
const { data: content, error } = await usePublicDepartment(slug)
if (error.value) throwPublicDetailError(error.value, '部门')

const department = computed(() => mergePublicDepartments([], content.value ? [content.value] : [], false)[0] ?? null)
if (!department.value || !content.value) {
  throw createError({ statusCode: 404, statusMessage: '部门不存在' })
}

useSeoMeta({
  title: () => department.value?.name ?? '部门',
  description: () => department.value?.summary ?? ''
})
</script>

<template>
  <div v-if="department && content">
    <header class="border-b border-[var(--line)] bg-white">
      <div class="page-shell py-8 md:py-11">
        <nav
          class="flex items-center gap-2 text-xs text-zinc-500"
          aria-label="面包屑"
        >
          <NuxtLink
            to="/departments"
            class="hover:text-green-700"
          >校内部门</NuxtLink>
          <UIcon
            name="i-lucide-chevron-right"
            class="size-3.5"
          />
          <span>{{ department.name }}</span>
        </nav>
        <div class="mt-5 flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div class="max-w-3xl">
            <span class="grid size-11 place-items-center rounded-md bg-blue-50 text-blue-700">
              <UIcon
                name="i-lucide-landmark"
                class="size-5"
              />
            </span>
            <h1 class="mt-4 text-2xl font-bold text-zinc-950 md:text-3xl">
              {{ department.name }}
            </h1>
            <p class="mt-3 text-sm leading-7 text-zinc-600 md:text-base">
              {{ department.summary }}
            </p>
          </div>
          <UButton
            v-if="department.website"
            :to="department.website"
            target="_blank"
            icon="i-lucide-external-link"
            label="部门官网"
            size="lg"
          />
        </div>
      </div>
    </header>

    <div class="page-shell grid gap-8 py-8 md:grid-cols-[minmax(0,1fr)_18rem] md:py-12">
      <article class="min-w-0">
        <section class="border-b border-zinc-200 pb-8">
          <h2 class="text-lg font-bold text-zinc-950">
            新生相关职责
          </h2>
          <p
            v-if="department.body"
            class="mt-4 whitespace-pre-line text-sm leading-7 text-zinc-600"
          >
            {{ department.body }}
          </p>
          <p
            v-else
            class="mt-4 text-sm leading-7 text-zinc-600"
          >
            当前仅发布官网可确认的职责摘要；具体办理材料和服务时间以部门最新通知为准。
          </p>
        </section>

        <section class="py-8">
          <h2 class="text-lg font-bold text-zinc-950">
            公开联系方式
          </h2>
          <dl class="mt-4 divide-y divide-zinc-100 border-y border-zinc-200 text-sm">
            <div
              v-if="department.phone"
              class="flex items-start justify-between gap-6 py-3"
            >
              <dt class="text-zinc-500">
                电话
              </dt>
              <dd class="text-right font-medium text-zinc-900">
                {{ department.phone }}
              </dd>
            </div>
            <div
              v-if="department.email"
              class="flex items-start justify-between gap-6 py-3"
            >
              <dt class="text-zinc-500">
                邮箱
              </dt>
              <dd class="break-all text-right font-medium text-zinc-900">
                {{ department.email }}
              </dd>
            </div>
            <div
              v-if="department.officeHours"
              class="flex items-start justify-between gap-6 py-3"
            >
              <dt class="text-zinc-500">
                服务时间
              </dt>
              <dd class="text-right font-medium text-zinc-900">
                {{ department.officeHours }}
              </dd>
            </div>
          </dl>
        </section>

        <UButton
          :to="{ path: '/feedback', query: { targetType: 'content', targetId: content.id, targetName: department.name, type: 'content_outdated' } }"
          icon="i-lucide-message-square-warning"
          label="反馈部门资料"
          color="neutral"
          variant="outline"
        />
      </article>

      <aside class="min-w-0">
        <div class="surface-panel p-4 md:sticky md:top-24">
          <h2 class="text-sm font-bold text-zinc-950">
            参考来源
          </h2>
          <ul class="mt-3 space-y-3">
            <li
              v-for="source in content.sources"
              :key="source.id"
            >
              <a
                :href="source.url"
                target="_blank"
                rel="noopener noreferrer"
                class="flex items-start gap-2 text-xs leading-5 text-zinc-600 hover:text-green-700"
              >
                <UIcon
                  name="i-lucide-external-link"
                  class="mt-0.5 size-3.5 shrink-0"
                />
                <span>{{ source.title }}</span>
              </a>
            </li>
          </ul>
          <p class="mt-4 text-xs text-zinc-400">
            核验于 {{ (content.lastVerifiedAt ?? content.updatedAt).slice(0, 10) }}
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>
