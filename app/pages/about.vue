<script setup lang="ts">
import {
  aboutBoundaries,
  aboutGovernanceLinks,
  aboutProjectFacts
} from '~~/app/utils/about-presentation'

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
          把新生常用的地图、办事、清单和校园生活信息放在一起，方便你少走弯路。它由个人或学生团队维护，不代表学校。
        </p>
      </div>
    </header>

    <div>
      <section class="page-shell py-8 md:py-10">
        <dl class="grid border-y border-[var(--line)] sm:grid-cols-2 lg:grid-cols-4">
          <div
            v-for="fact in aboutProjectFacts"
            :key="fact.label"
            class="border-b border-zinc-100 px-1 py-4 sm:px-4 lg:border-b-0 lg:border-r lg:last:border-r-0"
          >
            <dt class="text-xs text-zinc-500">
              {{ fact.label }}
            </dt>
            <dd class="mt-1.5 text-sm font-bold text-zinc-950">
              {{ fact.value }}
            </dd>
          </div>
        </dl>
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
                  <span class="grid size-9 shrink-0 place-items-center rounded-md bg-green-50 text-green-700">
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
              查出处，或告诉我们哪里不对
            </h2>
            <p class="mt-3 text-sm leading-7 text-zinc-600">
              每条重要信息尽量附上出处和日期。发现错误时，写清页面和正确情况即可，我们会确认后更新。请不要提交密码、证件或他人的私人信息。
            </p>
          </div>

          <div class="divide-y divide-zinc-200 border-y border-zinc-200">
            <NuxtLink
              v-for="link in aboutGovernanceLinks"
              :key="link.to"
              :to="link.to"
              class="group flex min-h-24 items-center gap-4 py-4"
            >
              <span class="grid size-10 shrink-0 place-items-center rounded-md bg-zinc-100 text-zinc-700 group-hover:bg-green-50 group-hover:text-green-700">
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
              报到、缴费等重要事项请看学校通知
            </h2>
            <p class="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
              学校名称、校徽和官网内容属于相应权利人。本站引用这些内容，不表示学校认可或参与维护本站。
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
