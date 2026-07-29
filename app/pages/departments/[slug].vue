<script setup lang="ts">
import { safeExternalHref } from '~/utils/safe-external-href'
import { findOfficialDepartment, officialSources } from '~~/data/seeds/public-content'
import { mergePublicDepartments } from '~/utils/public-catalog'
import { buildDetailFeedbackLink } from '~/utils/feedback-context'
import {
  buildDepartmentDetailSources,
  departmentSectionLabels,
  extractDepartmentUseCases,
  resolveDepartmentContactPreparation,
  resolveDepartmentContactSectionState,
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

const requestUrl = useRequestURL()
const shareImage = new URL('/icons/app-icon-512.png', requestUrl.origin).toString()
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
  title: () => department.value ? `${department.value.name}｜校内部门` : '校内部门',
  description: () => department.value?.summary ?? '',
  ogTitle: () => department.value ? `${department.value.name}｜仰恩新生指南` : '校内部门｜仰恩新生指南',
  ogDescription: () => department.value?.summary ?? '',
  ogType: 'website',
  ogImage: shareImage,
  twitterCard: 'summary',
  twitterImage: shareImage
})
const phoneContacts = computed(() => parsePublicPhoneContacts(department.value?.phone))
const emailHref = computed(() => resolvePublicEmailHref(department.value?.email))
const { copyText, isWechat, sharePage } = useShareActions()

async function copyDepartmentPhone(value: string): Promise<void> {
  await copyText(value, '电话号码')
}

function boxesAt(placement: string) {
  return department.value?.boxes.filter(box => box.placement === placement) ?? []
}

async function shareDepartment(): Promise<void> {
  if (!import.meta.client || !department.value) return
  if (isWechat.value) {
    await sharePage({
      title: `${department.value.name}｜仰恩新生指南`,
      text: department.value.summary,
      imageUrl: shareImage,
      url: window.location.href
    })
    return
  }
  await copyText(
    `${department.value.name}｜仰恩新生指南\n查看部门介绍：${window.location.href}`,
    '部门分享内容'
  )
}

const contactSection = computed(() => resolveDepartmentContactSectionState(
  Boolean(
    phoneContacts.value.length
    || emailHref.value
    || department.value?.email?.trim()
    || department.value?.groupQrUrls.length
    || department.value?.contactQrUrls.length
    || department.value?.contactPhones.length
  )
))

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
            <div class="mt-4 flex flex-wrap items-center gap-3">
              <h1 class="text-2xl font-bold text-zinc-950 md:text-3xl">
                {{ department.name }}
              </h1>
              <UButton
                icon="i-lucide-share-2"
                :label="isWechat ? '微信分享' : '复制分享链接'"
                color="neutral"
                variant="outline"
                class="min-h-11"
                @click="shareDepartment"
              />
            </div>
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
            {{ departmentSectionLabels.firstLook }}
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

        <PublicContentBoxes :boxes="boxesAt('after-overview')" />

        <PublicContentBody
          :body="department.body"
          title="部门介绍"
        />

        <PublicContentBoxes :boxes="boxesAt('after-intro')" />

        <section
          v-if="department.address || phoneContacts.length || department.email || department.officeHours || contactSection.kind === 'pending'"
          class="py-7"
        >
          <h2 class="text-lg font-bold text-zinc-950">
            {{ departmentSectionLabels.publicContact }}
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
                  <div
                    v-for="phone in phoneContacts"
                    :key="phone.href"
                    class="flex flex-wrap justify-end gap-2"
                  >
                    <UButton
                      icon="i-lucide-copy"
                      label="复制号码"
                      color="neutral"
                      variant="outline"
                      class="min-h-11"
                      @click="copyDepartmentPhone(phone.label)"
                    />
                    <UButton
                      :to="phone.href"
                      icon="i-lucide-phone"
                      :label="phone.label"
                      color="success"
                      variant="soft"
                      class="min-h-11"
                    />
                  </div>
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
          <div
            v-if="contactSection.kind === 'pending'"
            class="mt-4 border-l-4 border-amber-400 bg-amber-50 px-4 py-3 text-sm leading-6 text-amber-950"
            role="status"
          >
            <div class="flex items-start gap-2">
              <UIcon
                name="i-lucide-phone-off"
                class="mt-0.5 size-4 shrink-0"
              />
              <div>
                <p class="font-semibold text-amber-950">
                  {{ contactSection.title }}
                </p>
                <p class="mt-1">
                  {{ contactSection.notice }}
                </p>
              </div>
            </div>
          </div>
          <p
            v-else-if="!department.address && !department.officeHours"
            class="mt-4 text-sm leading-6 text-zinc-500"
          >
            {{ departmentSectionLabels.emptyContact }}
          </p>
        </section>

        <PublicContentBoxes :boxes="boxesAt('after-contact')" />
        <PublicContentBoxes :boxes="[...boxesAt('default'), ...boxesAt('before-community')]" />

        <div
          v-if="contactSection.kind === 'pending'"
          class="border-b border-zinc-200 pb-7"
        >
          <UButton
            :to="feedbackLink"
            icon="i-lucide-message-square-plus"
            :label="contactSection.actionLabel"
            color="neutral"
            variant="outline"
            class="min-h-11"
          />
        </div>

        <PublicCommunityContactPanel
          :group-qr-url="department.groupQrUrl"
          :group-qr-urls="department.groupQrUrls"
          :group-qr-titles="department.groupQrTitles"
          :contact-qr-url="department.contactQrUrl"
          :contact-qr-urls="department.contactQrUrls"
          :contact-qr-titles="department.contactQrTitles"
          :contact-name="department.contactName"
          :contact-phone="department.contactPhone"
          :contact-phones="department.contactPhones"
        />

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
