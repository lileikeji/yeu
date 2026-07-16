<script setup lang="ts">
import {
  aboutBoundaries,
  aboutGovernanceLinks,
  aboutProjectFacts
} from '~~/app/utils/about-presentation'

useSeoMeta({
  title: '关于项目',
  description: '了解仰恩新生指南的非官方身份、维护主体、资料边界、纠错与隐私规则。'
})
</script>

<template>
  <div>
    <header class="border-b border-[var(--line)] bg-white">
      <div class="page-shell py-8 md:py-11">
        <UBadge
          label="非官方项目"
          color="warning"
          variant="soft"
        />
        <h1 class="mt-4 text-2xl font-bold text-zinc-950 md:text-3xl">
          关于仰恩新生指南
        </h1>
        <p class="mt-3 max-w-3xl text-sm leading-7 text-zinc-600">
          这是由个人或学生团队维护的校园信息项目，目前不代表仰恩大学，也不是学校的通知、办事或缴费平台。
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
                服务边界
              </p>
              <h2 class="mt-2 text-xl font-bold text-zinc-950">
                什么能作参考，什么必须再确认
              </h2>
              <p class="mt-3 text-sm leading-7 text-zinc-600">
                项目整理公开资料和可复核的现场信息，但不替新生做身份、缴费或学籍决定。
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
              来源、纠错与隐私
            </p>
            <h2 class="mt-2 text-xl font-bold text-zinc-950">
              公开边界可查，错误可提交
            </h2>
            <p class="mt-3 text-sm leading-7 text-zinc-600">
              反馈不会自动发布，将由管理员核对来源和时效。请不要提交密码、证件、他人私人联系方式或未经同意的群二维码。
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
              学校事项请回到官方渠道确认
            </h2>
            <p class="mt-2 max-w-3xl text-sm leading-6 text-zinc-600">
              学校名称、标识及官网内容的权利归相应权利人所有；本项目的引用不表示学校对项目进行背书。
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
