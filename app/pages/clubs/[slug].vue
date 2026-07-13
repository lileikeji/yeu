<script setup lang="ts">
import { publicClubs } from '~/utils/public-catalog'
import { throwPublicDetailError } from '~/utils/public-errors'

const route = useRoute()
const slug = String(Array.isArray(route.params.slug) ? route.params.slug[0] : route.params.slug ?? '')
const { data: content, error } = await usePublicClub(slug)
if (error.value) throwPublicDetailError(error.value, '社团')

const club = computed(() => publicClubs(content.value ? [content.value] : [])[0] ?? null)
if (!club.value || !content.value) throw createError({ statusCode: 404, statusMessage: '社团不存在' })

useSeoMeta({
  title: () => club.value?.name ?? '学生社团',
  description: () => club.value?.summary ?? ''
})
</script>

<template>
  <div v-if="club && content">
    <header class="border-b border-[var(--line)] bg-white">
      <div class="page-shell py-8 md:py-11">
        <nav
          class="flex items-center gap-2 text-xs text-zinc-500"
          aria-label="面包屑"
        >
          <NuxtLink
            to="/clubs"
            class="hover:text-green-700"
          >学生社团</NuxtLink>
          <UIcon
            name="i-lucide-chevron-right"
            class="size-3.5"
          />
          <span>{{ club.name }}</span>
        </nav>
        <div class="mt-5 flex items-center gap-3">
          <span class="grid size-11 place-items-center rounded-md bg-violet-50 text-violet-700">
            <UIcon
              name="i-lucide-users-round"
              class="size-5"
            />
          </span>
          <UBadge
            label="近期活动可核验"
            color="success"
            variant="soft"
          />
          <UBadge
            label="2026级招新待发布"
            color="warning"
            variant="soft"
          />
        </div>
        <h1 class="mt-4 text-2xl font-bold text-zinc-950 md:text-3xl">
          {{ club.name }}
        </h1>
        <p class="mt-3 max-w-3xl text-sm leading-7 text-zinc-600 md:text-base">
          {{ club.summary }}
        </p>
      </div>
    </header>

    <div class="page-shell grid gap-8 py-8 md:grid-cols-[minmax(0,1fr)_18rem] md:py-12">
      <article class="min-w-0">
        <div
          class="border-l-4 border-orange-500 bg-orange-50 px-4 py-3 text-sm leading-6 text-orange-950"
          role="status"
        >
          <div class="flex items-start gap-2">
            <UIcon
              name="i-lucide-calendar-clock"
              class="mt-0.5 size-4 shrink-0"
            />
            <p>招新时间、地点、报名入口和公开联系方式尚未取得2026级有效来源。</p>
          </div>
        </div>

        <section class="border-b border-zinc-200 py-8">
          <h2 class="text-lg font-bold text-zinc-950">
            当前可确认信息
          </h2>
          <p
            v-if="club.body"
            class="mt-4 whitespace-pre-line text-sm leading-7 text-zinc-600"
          >
            {{ club.body }}
          </p>
          <p
            v-else
            class="mt-4 text-sm leading-7 text-zinc-600"
          >
            校团委2026年活动报道中出现该社团名称，可确认其近期参与校级社团活动；不据此补写社团简介或招新条件。
          </p>
        </section>

        <dl
          v-if="club.recruitmentPeriod || club.activitySchedule || club.contactMethod"
          class="divide-y divide-zinc-100 border-b border-zinc-200 py-4 text-sm"
        >
          <div
            v-if="club.recruitmentPeriod"
            class="flex justify-between gap-6 py-3"
          >
            <dt class="text-zinc-500">
              招新时间
            </dt>
            <dd class="text-right text-zinc-900">
              {{ club.recruitmentPeriod }}
            </dd>
          </div>
          <div
            v-if="club.activitySchedule"
            class="flex justify-between gap-6 py-3"
          >
            <dt class="text-zinc-500">
              活动安排
            </dt>
            <dd class="text-right text-zinc-900">
              {{ club.activitySchedule }}
            </dd>
          </div>
          <div
            v-if="club.contactMethod"
            class="flex justify-between gap-6 py-3"
          >
            <dt class="text-zinc-500">
              公开联系
            </dt>
            <dd class="text-right text-zinc-900">
              {{ club.contactMethod }}
            </dd>
          </div>
        </dl>

        <UButton
          :to="{ path: '/feedback', query: { targetType: 'content', targetId: content.id, targetName: club.name, type: 'missing_information' } }"
          icon="i-lucide-message-square-warning"
          label="补充社团资料"
          color="neutral"
          variant="outline"
          class="mt-8"
        />
      </article>

      <aside class="min-w-0">
        <div class="surface-panel p-4 md:sticky md:top-24">
          <h2 class="text-sm font-bold text-zinc-950">
            参考来源
          </h2>
          <ul class="mt-3 space-y-3">
            <li
              v-for="source in club.sources"
              :key="source.url"
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
            核验于 {{ club.updatedAt }}
          </p>
        </div>
      </aside>
    </div>
  </div>
</template>
