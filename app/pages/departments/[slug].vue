<script setup lang="ts">
import { safeExternalHref } from '~/utils/safe-external-href'
import { findOfficialDepartment, officialSources } from '~~/data/seeds/public-content'
import { mergePublicDepartments } from '~/utils/public-catalog'
import { buildDetailFeedbackLink } from '~/utils/feedback-context'
import {
  buildDepartmentDetailSources,
  extractDepartmentUseCases,
  resolveDepartmentContactPreparation,
  resolveDepartmentUsageSuggestion,
  resolveDepartmentVerificationSummary,
  resolveDepartmentVerifiedDate
} from '~~/app/utils/department-detail-presentation'
import {
  parsePublicPhoneContacts,
  resolvePublicEmailHref
} from '~~/app/utils/public-phone-contact'

const route = useRoute()
const slug = String(Array.isArray(route.params.slug) ? route.params.slug[0] : route.params.slug ?? '')
const seedDepartment = findOfficialDepartment(slug)
const { data: content } = await usePublicDepartment(slug)

const department = computed(() => mergePublicDepartments(
  seedDepartment ? [seedDepartment] : [],
  content.value ? [content.value] : [],
  true
)[0] ?? null)

if (!department.value) {
  throw createError({ statusCode: 404, statusMessage: '部门不存在' })
}

const verifiedDate = computed(() => resolveDepartmentVerifiedDate(
  content.value?.lastVerifiedAt,
  content.value?.updatedAt,
  officialSources.organizations.accessedAt
))
const departmentUseCases = computed(() => extractDepartmentUseCases(department.value?.body ?? ''))
const contactPreparation = computed(() => resolveDepartmentContactPreparation(department.value?.body ?? ''))
const usageSuggestion = computed(() => resolveDepartmentUsageSuggestion(department.value?.body ?? ''))
const verificationSummary = computed(() => resolveDepartmentVerificationSummary(department.value?.body ?? ''))
const detailSources = computed(() => buildDepartmentDetailSources(
  content.value?.sources,
  {
    organizationsTitle: officialSources.organizations.title,
    organizationsUrl: officialSources.organizations.url,
    departmentName: seedDepartment?.name ?? department.value?.name,
    website: seedDepartment?.website ?? department.value?.website ?? null
  }
))

useSeoMeta({
  title: () => department.value?.name ?? '部门',
  description: () => department.value?.summary ?? ''
})
const phoneContacts = computed(() => parsePublicPhoneContacts(department.value?.phone))
const emailHref = computed(() => resolvePublicEmailHref(department.value?.email))

const feedbackLink = computed(() => content.value
  ? buildDetailFeedbackLink({
      targetType: 'content',
      targetId: content.value.id,
      targetName: department.value!.name,
      reasonType: 'content_outdated',
      from: route.fullPath
    })
  : `/feedback?from=${encodeURIComponent(route.fullPath)}`)
</script>

<template>
  <div v-if="department">
    <header class="border-b border-[var(--line)] bg-white">
      <div class="page-shell py-8 md:py-11">
        <nav
          class="flex items-center gap-2 text-xs text-zinc-500"
          aria-label="当前位置"
        >
          <NuxtLink
            to="/departments"
            class="inline-flex min-h-10 items-center hover:text-green-700"
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
            v-if="safeExternalHref(department.website)"
            :to="safeExternalHref(department.website) || undefined"
            target="_blank"
            rel="noopener noreferrer"
            icon="i-lucide-external-link"
            label="部门官网"
            size="lg"
            class="min-h-11"
          />
        </div>
      </div>
    </header>

    <div class="page-shell py-7 md:py-10">
      <article class="mx-auto min-w-0 max-w-4xl">
        <section
          v-if="departmentUseCases.length || contactPreparation || usageSuggestion"
          class="border-b border-zinc-200 pb-8"
        >
          <h2 class="text-lg font-bold text-zinc-950">
            新生先看这几件事
          </h2>
          <div class="mt-4 grid gap-3 md:grid-cols-3">
            <div
              v-for="item in departmentUseCases"
              :key="item"
              class="rounded-lg border border-blue-100 bg-blue-50/60 p-4 text-sm leading-6 text-blue-950"
            >
              {{ item }}
            </div>
          </div>
          <div class="mt-4 grid gap-3 md:grid-cols-2">
            <div
              v-if="contactPreparation"
              class="rounded-lg border border-zinc-200 bg-white p-4"
            >
              <p class="text-xs font-semibold text-zinc-500">
                咨询前准备
              </p>
              <p class="mt-2 text-sm leading-6 text-zinc-700">
                {{ contactPreparation }}
              </p>
            </div>
            <div
              v-if="usageSuggestion"
              class="rounded-lg border border-zinc-200 bg-white p-4"
            >
              <p class="text-xs font-semibold text-zinc-500">
                使用建议
              </p>
              <p class="mt-2 text-sm leading-6 text-zinc-700">
                {{ usageSuggestion }}
              </p>
            </div>
          </div>
        </section>

        <section class="py-7">
          <h2 class="text-lg font-bold text-zinc-950">
            公开联系方式
          </h2>
          <p
            v-if="verificationSummary"
            class="mt-3 rounded-lg border border-emerald-100 bg-emerald-50 px-4 py-3 text-sm leading-6 text-emerald-950"
          >
            {{ verificationSummary }}
          </p>
          <dl class="mt-4 divide-y divide-zinc-100 border-y border-zinc-200 text-sm">
            <div
              v-if="department.address"
              class="flex items-start justify-between gap-6 py-3"
            >
              <dt class="text-zinc-500">
                地址
              </dt>
              <dd class="text-right font-medium text-zinc-900">
                {{ department.address }}
              </dd>
            </div>
            <div
              v-if="phoneContacts.length"
              class="flex items-start justify-between gap-6 py-3"
            >
              <dt class="shrink-0 text-zinc-500">
                电话
              </dt>
              <dd class="min-w-0 text-right">
                <div class="flex flex-col items-end gap-2">
                  <a
                    v-for="phone in phoneContacts"
                    :key="phone.href"
                    :href="phone.href"
                    class="inline-flex min-h-11 items-center gap-2 rounded-md border border-green-200 bg-green-50 px-3 text-sm font-semibold text-green-800 transition-colors hover:border-green-300 hover:bg-green-100 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
                  >
                    <UIcon
                      name="i-lucide-phone"
                      class="size-4 shrink-0"
                    />
                    <span>{{ phone.label }}</span>
                  </a>
                </div>
              </dd>
            </div>
            <div
              v-if="department.email"
              class="flex items-start justify-between gap-6 py-3"
            >
              <dt class="shrink-0 text-zinc-500">
                邮箱
              </dt>
              <dd class="min-w-0 break-all text-right">
                <a
                  v-if="emailHref"
                  :href="emailHref"
                  class="inline-flex min-h-11 items-center break-all font-medium text-green-700 hover:underline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green-700"
                >{{ department.email }}</a>
                <span
                  v-else
                  class="font-medium text-zinc-900"
                >{{ department.email }}</span>
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
          <p
            v-if="!department.address && !department.phone && !department.email && !department.officeHours"
            class="mt-4 text-sm leading-6 text-zinc-500"
          >
            暂时没有找到电话、邮箱或服务时间，可以先打开上方部门官网。
          </p>
        </section>

        <PublicSourceDetails
          :sources="detailSources"
          :verified-at="verifiedDate"
        />

        <UButton
          :to="feedbackLink"
          icon="i-lucide-message-square-warning"
          label="告诉我们哪里需要修改"
          color="neutral"
          variant="outline"
          class="mt-6 min-h-11"
        />
      </article>
    </div>
  </div>
</template>
