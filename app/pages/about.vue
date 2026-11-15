<script setup lang="ts">
import {
  aboutBoundaries,
  aboutContributionTracks,
  aboutGovernanceLinks,
  aboutHeroActions,
  aboutMaintainers,
  aboutProjectFacts,
  aboutRepositories
} from '~~/app/utils/about-presentation'
import type { AboutTone } from '~~/app/utils/about-presentation'

const aboutToneClasses: Record<AboutTone, string> = {
  amber: 'bg-amber-50 dark:bg-amber-950 text-amber-700 dark:text-amber-300',
  green: 'bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400',
  sky: 'bg-sky-50 dark:bg-sky-950 text-sky-700 dark:text-sky-300',
  zinc: 'bg-zinc-100 dark:bg-zinc-800 text-zinc-700 dark:text-zinc-200'
}

useSeoMeta({
  title: '关于本站',
  description: '学生个人整理的非官方新生指南；报到、缴费等以学校通知为准。'
})
</script>

<template>
  <div>
    <header class="border-b border-[var(--line)] bg-[var(--surface)] dark:bg-zinc-900">
      <div class="page-shell py-8 md:py-11">
        <UBadge
          label="非官方学生指南"
          color="warning"
          variant="soft"
        />
        <h1 class="mt-4 text-2xl font-bold text-zinc-950 dark:text-zinc-100 md:text-3xl">
          关于本站
        </h1>
        <p class="mt-3 max-w-3xl text-sm leading-7 text-zinc-600 dark:text-zinc-300">
          内容由学生个人整理，不代表学校。
        </p>
        <nav
          aria-label="关于本站常用入口"
          class="mt-5 flex flex-wrap gap-2"
        >
          <NuxtLink
            v-for="action in aboutHeroActions"
            :key="action.to"
            :to="action.to"
            class="inline-flex min-h-11 items-center gap-2 rounded-full border border-zinc-200 dark:border-zinc-800 bg-zinc-50 dark:bg-zinc-800/60 px-4 text-sm font-semibold text-zinc-700 dark:text-zinc-200 transition-colors hover:border-green-300 dark:hover:border-green-700 hover:bg-green-50 dark:hover:bg-green-950 hover:text-green-800 dark:hover:text-green-300 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
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
            class="min-w-0 border-b border-zinc-100 dark:border-zinc-800 px-3 py-4 odd:border-r [&:nth-last-child(-n+2)]:border-b-0 sm:px-5 lg:border-b-0 lg:border-r lg:last:border-r-0"
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
                <p class="text-xs text-zinc-500 dark:text-zinc-400">
                  {{ fact.label }}
                </p>
                <p class="mt-1 text-sm font-bold leading-5 text-zinc-950 dark:text-zinc-100">
                  {{ fact.value }}
                </p>
              </div>
            </div>
          </li>
        </ul>
      </section>

      <section class="border-y border-[var(--line)] bg-[var(--page-bg)]">
        <div class="page-shell py-8 md:py-10">
          <div class="grid gap-7 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-12">
            <div>
              <p class="section-kicker">
                谁在维护
              </p>
              <h2 class="mt-2 text-xl font-bold text-zinc-950 dark:text-zinc-100">
                维护者
              </h2>
              <p class="mt-3 text-sm leading-7 text-zinc-600 dark:text-zinc-300">
                内容、地图数据、页面和发布，一个人做。改动都在仓库提交里。
              </p>
            </div>

            <div class="space-y-4">
              <article
                v-for="person in aboutMaintainers"
                :key="person.name"
                class="rounded-lg border border-zinc-200 dark:border-zinc-800 p-4 sm:p-5"
              >
                <div class="flex items-start gap-4">
                  <span
                    class="grid size-11 shrink-0 place-items-center rounded-full"
                    :class="aboutToneClasses[person.tone]"
                  >
                    <UIcon
                      :name="person.icon"
                      class="size-5"
                    />
                  </span>
                  <div class="min-w-0 flex-1">
                    <div class="flex flex-wrap items-center gap-2">
                      <h3 class="text-base font-bold text-zinc-950 dark:text-zinc-100">
                        {{ person.name }}
                      </h3>
                      <UBadge
                        :label="person.role"
                        color="success"
                        variant="soft"
                      />
                    </div>
                    <p class="mt-1 text-xs text-zinc-500 dark:text-zinc-400">
                      {{ person.handle }}
                    </p>
                    <ul class="mt-3 flex flex-wrap gap-1.5">
                      <li
                        v-for="item in person.focus"
                        :key="item"
                        class="rounded-full bg-zinc-100 dark:bg-zinc-800 px-2.5 py-1 text-xs text-zinc-600 dark:text-zinc-300"
                      >
                        {{ item }}
                      </li>
                    </ul>
                    <p class="mt-3 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                      {{ person.note }}
                    </p>
                  </div>
                </div>
              </article>
              <p class="text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                过期的条目会标核验时间，核不到就撤。
              </p>
            </div>
          </div>
        </div>
      </section>

      <section class="page-shell py-8 md:py-10">
        <div class="grid gap-7 lg:grid-cols-[minmax(0,1fr)_22rem] lg:gap-12">
          <div>
            <p class="section-kicker">
              一起做
            </p>
            <h2 class="mt-2 text-xl font-bold text-zinc-950 dark:text-zinc-100">
              可以帮的事
            </h2>
            <p class="mt-3 text-sm leading-7 text-zinc-600 dark:text-zinc-300">
              不要求会写代码。想接哪一块，加微信说。
            </p>

            <ul class="mt-6 divide-y divide-zinc-200 dark:divide-zinc-800 border-y border-zinc-200 dark:border-zinc-800">
              <li
                v-for="track in aboutContributionTracks"
                :key="track.title"
                class="flex gap-4 py-4"
              >
                <UIcon
                  :name="track.icon"
                  class="mt-0.5 size-5 shrink-0 text-green-700 dark:text-green-400"
                />
                <div>
                  <h3 class="text-sm font-bold text-zinc-950 dark:text-zinc-100">
                    {{ track.title }}
                  </h3>
                  <p class="mt-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                    {{ track.detail }}
                  </p>
                </div>
              </li>
            </ul>
          </div>

          <aside class="rounded-lg border border-green-200 dark:border-green-800 bg-[var(--surface)] dark:bg-zinc-900 p-4 shadow-sm sm:p-5">
            <p class="text-xs font-semibold text-green-700 dark:text-green-400">
              加微信
            </p>
            <h3 class="mt-1 text-base font-bold text-zinc-950 dark:text-zinc-100">
              备注“想一起做”
            </h3>
            <img
              src="/images/contact-wechat.png"
              alt="维护者微信二维码，加好友时备注想一起做"
              width="888"
              height="1131"
              class="mt-4 aspect-[888/1131] w-full rounded-md border border-zinc-100 dark:border-zinc-800 object-contain"
            >
            <p class="mt-3 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
              纠错和加群都用这个号
            </p>
          </aside>
        </div>
      </section>

      <section class="border-y border-[var(--line)] bg-[var(--page-bg)]">
        <div class="page-shell py-8 md:py-10">
          <div class="grid gap-7 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-12">
            <div>
              <p class="section-kicker">
                开源
              </p>
              <h2 class="mt-2 text-xl font-bold text-zinc-950 dark:text-zinc-100">
                仓库
              </h2>
              <p class="mt-3 text-sm leading-7 text-zinc-600 dark:text-zinc-300">
                觉得有用就点个 star。
              </p>
              <p class="mt-2 text-xs leading-5 text-zinc-500 dark:text-zinc-400">
                代码用 MIT 许可；引用的学校通知和官网内容，版权归原单位。
              </p>
            </div>

            <div class="grid gap-3 sm:grid-cols-2">
              <article
                v-for="repo in aboutRepositories"
                :key="repo.url"
                class="flex flex-col rounded-lg border border-zinc-200 dark:border-zinc-800 p-4"
              >
                <div class="flex items-center gap-2">
                  <span
                    class="grid size-8 place-items-center rounded-md"
                    :class="aboutToneClasses[repo.tone]"
                  >
                    <UIcon
                      :name="repo.icon"
                      class="size-4"
                    />
                  </span>
                  <span class="text-xs font-semibold text-zinc-500 dark:text-zinc-400">
                    {{ repo.meta }}
                  </span>
                </div>
                <h3 class="mt-3 font-mono text-sm font-bold text-zinc-950 dark:text-zinc-100">
                  {{ repo.name }}
                </h3>
                <p class="mt-2 flex-1 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
                  {{ repo.description }}
                </p>
                <UButton
                  :to="repo.url"
                  target="_blank"
                  rel="noopener noreferrer"
                  :icon="repo.icon"
                  :label="repo.label"
                  color="neutral"
                  variant="outline"
                  class="mt-4 min-h-11 self-start"
                />
              </article>
            </div>
          </div>
        </div>
      </section>

      <section class="border-y border-[var(--line)] bg-[var(--page-bg)]">
        <div class="page-shell py-8 md:py-10">
          <div class="grid gap-7 lg:grid-cols-[18rem_minmax(0,1fr)] lg:gap-12">
            <div>
              <p class="section-kicker">
                使用前先知道
              </p>
              <h2 class="mt-2 text-xl font-bold text-zinc-950 dark:text-zinc-100">
                四条规则
              </h2>
            </div>

            <div class="grid gap-x-8 md:grid-cols-2">
              <article
                v-for="boundary in aboutBoundaries"
                :key="boundary.title"
                class="border-t border-zinc-200 dark:border-zinc-800 py-5"
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
                  <h3 class="text-sm font-bold text-zinc-950 dark:text-zinc-100">
                    {{ boundary.title }}
                  </h3>
                </div>
                <p class="mt-3 text-sm leading-7 text-zinc-600 dark:text-zinc-300">
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
            <h2 class="mt-2 text-xl font-bold text-zinc-950 dark:text-zinc-100">
              想确认来源，或发现信息不对
            </h2>
            <p class="mt-3 text-sm leading-7 text-zinc-600 dark:text-zinc-300">
              提交时不要写密码、证件号码或他人的私人信息。
            </p>
          </div>

          <div class="divide-y divide-zinc-200 dark:divide-zinc-800 border-y border-zinc-200 dark:border-zinc-800">
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
                <span class="block text-sm font-bold text-zinc-950 dark:text-zinc-100">{{ link.title }}</span>
                <span class="mt-1 block text-xs leading-5 text-zinc-500 dark:text-zinc-400">{{ link.description }}</span>
              </span>
              <UIcon
                name="i-lucide-chevron-right"
                class="size-4 shrink-0 text-zinc-300 dark:text-zinc-600 group-hover:text-green-700 dark:group-hover:text-green-400"
              />
            </NuxtLink>
          </div>
        </div>
      </section>

      <section class="border-t border-[var(--line)] bg-[var(--page-bg)]">
        <div class="page-shell grid gap-5 py-8 md:grid-cols-[minmax(0,1fr)_auto] md:items-center">
          <div>
            <h2 class="text-base font-bold text-zinc-950 dark:text-zinc-100">
              重要事项以学校通知为准
            </h2>
            <p class="mt-2 max-w-3xl text-sm leading-6 text-zinc-600 dark:text-zinc-300">
              校名、校徽和官网内容归学校及相关单位所有；引用不代表学校认可本站。
            </p>
          </div>
          <UButton
            to="https://www.yeu.edu.cn/"
            target="_blank"
            rel="noopener noreferrer"
            icon="i-lucide-external-link"
            label="学校官网"
            color="neutral"
            variant="outline"
            class="min-h-11 self-start md:self-auto"
          />
        </div>
      </section>
    </div>
  </div>
</template>
