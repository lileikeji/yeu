<script setup lang="ts">
import {
  aboutBoundaries,
  aboutGovernanceLinks,
  aboutHeroActions,
  aboutProjectFacts
} from '~~/app/utils/about-presentation'
import type { AboutTone } from '~~/app/utils/about-presentation'

const aboutToneClasses: Record<AboutTone, string> = {
  amber: 'bg-amber-50 text-amber-700',
  green: 'bg-green-50 text-green-700',
  sky: 'bg-sky-50 text-sky-700',
  zinc: 'bg-zinc-100 text-zinc-700'
}

useSeoMeta({
  title: '关于这份指南',
  description: '了解仰恩新生指南能帮你做什么、哪些事项要看学校通知，以及怎样反馈错误。'
})
</script>

<template>
  <div>
    <header class="border-b border-[var(--line)] bg-white">
      <div class="page-shell py-8 md:py-11">
        <UBadge
          label="非官方学生指南"
          color="warning"
          variant="soft"
        />
        <h1 class="mt-4 text-2xl font-bold text-zinc-950 md:text-3xl">
          这个指南能帮你做什么
        </h1>
        <p class="mt-3 max-w-3xl text-sm leading-7 text-zinc-600">
          把新生常用的地图、办事、清单和校园生活信息放在一起，方便你少走弯路。内容由个人或学生团队整理，不代表学校。
        </p>
        <nav
          aria-label="关于本站常用入口"
          class="mt-5 flex flex-wrap gap-2"
        >
          <NuxtLink
            v-for="action in aboutHeroActions"
            :key="action.to"
            :to="action.to"
            class="inline-flex min-h-11 items-center gap-2 rounded-full border border-zinc-200 bg-zinc-50 px-4 text-sm font-semibold text-zinc-700 transition-colors hover:border-green-300 hover:bg-green-50 hover:text-green-800 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
          >
            <UIcon
              :name="action.icon"
              class="size-4"
            />
            {{ action.label }}
          </NuxtLink>
        </nav>
      </div>
    </header>

    <div>
      <section class="page-shell py-8 md:py-10">
        <ul class="grid grid-cols-2 border-y border-[var(--line)] lg:grid-cols-4">
          <li
            v-for="fact in aboutProjectFacts"
            :key="fact.label"
            class="min-w-0 border-b border-zinc-100 px-3 py-4 odd:border-r [&:nth-last-child(-n+2)]:border-b-0 sm:px-5 lg:border-b-0 lg:border-r lg:last:border-r-0"
          >
            <div class="flex items-start gap-3">
              <span
                class="grid size-8 shrink-0 place-items-center rounded-md"
                :class="aboutToneClasses[fact.tone]"
              >
                <UIcon
                  :name="fact.icon"
                  class="size-4"
                />
              </span>
              <div class="min-w-0">
                <p class="text-xs text-zinc-500">
                  {{ fact.label }}
                </p>
                <p class="mt-1 text-sm font-bold leading-5 text-zinc-950">
                  {{ fact.value }}
                </p>
              </div>
            </div>
          </li>
        </ul>
      </section>

      <section class="border-y border-[var(--line)] bg-white">
        <div class="page-shell py-8 md:py-10">
          <div class="grid gap-7 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-12">
            <div>
              <p class="section-kicker">
                使用前先知道
              </p>
              <h2 class="mt-2 text-xl font-bold text-zinc-950">
                这些信息可以怎么用
              </h2>
              <p class="mt-3 text-sm leading-7 text-zinc-600">
                日常找路和查资料可以从这里开始，报到、缴费等重要事项仍要看学校通知。
              </p>
            </div>

            <div class="grid gap-x-8 md:grid-cols-2">
              <article
                v-for="boundary in aboutBoundaries"
                :key="boundary.title"
                class="border-t border-zinc-200 py-5"
              >
                <div class="flex items-center gap-3">
                  <span
                    class="grid size-9 shrink-0 place-items-center rounded-md"
                    :class="aboutToneClasses[boundary.tone]"
                  >
                    <UIcon
                      :name="boundary.icon"
                      class="size-4"
                    />
                  </span>
                  <h3 class="text-sm font-bold text-zinc-950">
                    {{ boundary.title }}
                  </h3>
                </div>
                <p class="mt-3 text-sm leading-7 text-zinc-600">
                  {{ boundary.text }}
                </p>
              </article>
            </div>
          </div>
        </div>
      </section>

      <section class="page-shell py-8 md:py-10">
        <div class="grid gap-7 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-12">
          <div>
            <p class="section-kicker">
              有问题怎么办
            </p>
            <h2 class="mt-2 text-xl font-bold text-zinc-950">
              想确认来源，或发现信息不对
            </h2>
            <p class="mt-3 text-sm leading-7 text-zinc-600">
              重要信息会尽量附上参考链接，并写明我们最近查看的时间。发现错误时，只要告诉我们哪个页面、哪里不对以及正确情况。请不要提交密码、证件号码或他人的私人信息。
            </p>
          </div>

          <div class="divide-y divide-zinc-200 border-y border-zinc-200">
            <NuxtLink
              v-for="link in aboutGovernanceLinks"
              :key="link.to"
              :to="link.to"
              class="group flex min-h-24 items-center gap-4 py-4"
            >
              <span
                class="grid size-10 shrink-0 place-items-center rounded-md"
                :class="aboutToneClasses[link.tone]"
              >
                <UIcon
                  :name="link.icon"
                  class="size-5"
                />
              </span>
              <span class="min-w-0 flex-1">
                <span class="block text-sm font-bold text-zinc-950">{{ link.title }}</span>
                <span class="mt-1 block text-xs leading-5 text-zinc-500">{{ link.description }}</span>
              </span>
              <UIcon
                name="i-lucide-chevron-right"
                class="size-4 shrink-0 text-zinc-300 group-hover:text-green-700"
              />
            </NuxtLink>
          </div>
        </div>
      </section>

      <section class="border-t border-[var(--line)] bg-white">
        <div class="page-shell grid gap-5 py-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div>
            <h2 class="text-base font-bold text-zinc-950">
              重要事项以学校通知为准
            </h2>
            <p class="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
              校名、校徽和官网内容归学校及相关单位所有。本站引用这些内容只是为了帮助新生查找信息，不表示学校参与维护或认可本站。
            </p>
          </div>
          <UButton
            to="https://www.yeu.edu.cn/"
            target="_blank"
            rel="noopener noreferrer"
            icon="i-lucide-external-link"
            label="仰恩大学官网"
            color="neutral"
            variant="outline"
            class="min-h-11 self-start md:self-auto"
          />
        </div>
      </section>
    </div>
  </div>
</template>
