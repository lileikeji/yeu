<script setup lang="ts">
import { parsePublicPhoneContacts } from '~/utils/public-phone-contact'

const props = defineProps<{
  groupQrUrl?: string | null
  groupQrUrls?: string[] | null
  contactQrUrl?: string | null
  contactQrUrls?: string[] | null
  contactName?: string | null
  contactPhone?: string | null
  contactPhones?: string[] | null
}>()

const groupQrUrls = computed(() => [...new Set([
  ...(props.groupQrUrls ?? []),
  ...(props.groupQrUrl ? [props.groupQrUrl] : [])
].filter(Boolean))])
const contactQrUrls = computed(() => [...new Set([
  ...(props.contactQrUrls ?? []),
  ...(props.contactQrUrl ? [props.contactQrUrl] : [])
].filter(Boolean))])
const phoneContacts = computed(() => {
  const contacts = [
    ...(props.contactPhones ?? []),
    ...(props.contactPhone ? [props.contactPhone] : [])
  ].flatMap(value => parsePublicPhoneContacts(value))
  return [...new Map(contacts.map(contact => [contact.href, contact])).values()]
})
const hasContent = computed(() => Boolean(
  groupQrUrls.value.length || contactQrUrls.value.length || props.contactName || phoneContacts.value.length
))
const { copyText } = useShareActions()

async function copyPhone(value: string): Promise<void> {
  await copyText(value, '负责人电话')
}
</script>

<template>
  <section
    v-if="hasContent"
    class="border-b border-zinc-200 py-8"
  >
    <div class="flex items-center gap-2">
      <UIcon
        name="i-lucide-contact-round"
        class="size-5 text-green-700"
      />
      <h2 class="text-lg font-bold text-zinc-950">
        加入群聊与联系负责人
      </h2>
    </div>

    <div
      v-if="groupQrUrls.length || contactQrUrls.length"
      class="mt-5 grid gap-4 sm:grid-cols-2 lg:grid-cols-3"
    >
      <figure
        v-for="(qrUrl, index) in groupQrUrls"
        :key="qrUrl"
        class="rounded-md border border-zinc-200 bg-white p-4"
      >
        <figcaption class="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <UIcon
            name="i-lucide-messages-square"
            class="size-4 text-green-700"
          />
          {{ groupQrUrls.length > 1 ? `招新与群聊二维码 ${index + 1}` : '招新与群聊二维码' }}
        </figcaption>
        <img
          :src="qrUrl"
          :alt="`招新与群聊二维码第 ${index + 1} 张`"
          class="mx-auto mt-4 aspect-square w-full max-w-64 rounded-md border border-zinc-100 bg-white object-contain"
        >
      </figure>
      <figure
        v-for="(qrUrl, index) in contactQrUrls"
        :key="qrUrl"
        class="rounded-md border border-zinc-200 bg-white p-4"
      >
        <figcaption class="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <UIcon
            name="i-lucide-user-round"
            class="size-4 text-green-700"
          />
          {{ contactName || '负责人' }}二维码{{ contactQrUrls.length > 1 ? ` ${index + 1}` : '' }}
        </figcaption>
        <img
          :src="qrUrl"
          :alt="`${contactName || '负责人'}二维码第 ${index + 1} 张`"
          class="mx-auto mt-4 aspect-square w-full max-w-64 rounded-md border border-zinc-100 bg-white object-contain"
        >
      </figure>
    </div>

    <div
      v-if="contactName || phoneContacts.length"
      class="mt-4 flex flex-col gap-3 border-y border-zinc-200 py-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div class="min-w-0">
        <p class="text-xs font-semibold text-zinc-500">
          负责人
        </p>
        <p
          v-if="contactName"
          class="mt-1 text-sm font-semibold text-zinc-900"
        >
          {{ contactName }}
        </p>
        <p
          v-if="phoneContacts.length"
          class="mt-1 text-sm text-zinc-500"
        >
          {{ phoneContacts.length }} 个公开联系电话
        </p>
      </div>
      <div
        v-if="phoneContacts.length"
        class="grid gap-2"
      >
        <div
          v-for="phone in phoneContacts"
          :key="phone.href"
          class="flex flex-wrap items-center justify-end gap-2"
        >
          <span class="mr-1 break-all text-sm font-semibold text-zinc-900">
            {{ phone.label }}
          </span>
          <UButton
            icon="i-lucide-copy"
            label="复制"
            color="neutral"
            variant="outline"
            class="min-h-11"
            @click="copyPhone(phone.label)"
          />
          <UButton
            :to="phone.href"
            icon="i-lucide-phone"
            label="拨打"
            color="success"
            variant="soft"
            class="min-h-11"
          />
        </div>
      </div>
    </div>
  </section>
</template>
