<script setup lang="ts">
import { parsePublicPhoneContacts } from '~/utils/public-phone-contact'

const props = defineProps<{
  groupQrUrl?: string | null
  contactQrUrl?: string | null
  contactName?: string | null
  contactPhone?: string | null
}>()

const phoneContacts = computed(() => parsePublicPhoneContacts(props.contactPhone))
const hasContent = computed(() => Boolean(
  props.groupQrUrl || props.contactQrUrl || props.contactName || props.contactPhone
))
const { copyText } = useShareActions()

function copyPhone(value: string) {
  return copyText(value, '负责人电话')
}
</script>

<template>
  <section
    v-if="hasContent"
    class="border-b border-zinc-200 py-8"
  >
    <div class="flex items-center gap-2">
      <UIcon name="i-lucide-contact-round" class="size-5 text-green-700" />
      <h2 class="text-lg font-bold text-zinc-950">
        加入群聊与联系负责人
      </h2>
    </div>

    <div
      v-if="groupQrUrl || contactQrUrl"
      class="mt-5 grid gap-4 sm:grid-cols-2"
    >
      <figure v-if="groupQrUrl" class="rounded-md border border-zinc-200 bg-white p-4">
        <figcaption class="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <UIcon name="i-lucide-messages-square" class="size-4 text-green-700" />
          群聊二维码
        </figcaption>
        <img
          :src="groupQrUrl"
          alt="群聊二维码"
          class="mx-auto mt-4 aspect-square w-full max-w-64 rounded-md border border-zinc-100 bg-white object-contain"
        >
      </figure>
      <figure v-if="contactQrUrl" class="rounded-md border border-zinc-200 bg-white p-4">
        <figcaption class="flex items-center gap-2 text-sm font-semibold text-zinc-900">
          <UIcon name="i-lucide-user-round" class="size-4 text-green-700" />
          {{ contactName || '负责人' }}二维码
        </figcaption>
        <img
          :src="contactQrUrl"
          :alt="`${contactName || '负责人'}二维码`"
          class="mx-auto mt-4 aspect-square w-full max-w-64 rounded-md border border-zinc-100 bg-white object-contain"
        >
      </figure>
    </div>

    <div
      v-if="contactName || contactPhone"
      class="mt-4 flex flex-col gap-3 border-y border-zinc-200 py-4 sm:flex-row sm:items-center sm:justify-between"
    >
      <div class="min-w-0">
        <p class="text-xs font-semibold text-zinc-500">负责人</p>
        <p v-if="contactName" class="mt-1 text-sm font-semibold text-zinc-900">
          {{ contactName }}
        </p>
        <p v-if="contactPhone" class="mt-1 break-all text-sm text-zinc-700">
          {{ contactPhone }}
        </p>
      </div>
      <div v-if="contactPhone" class="flex flex-wrap gap-2">
        <UButton
          icon="i-lucide-copy"
          label="复制号码"
          color="neutral"
          variant="outline"
          class="min-h-11"
          @click="copyPhone(contactPhone)"
        />
        <UButton
          v-if="phoneContacts[0]"
          :to="phoneContacts[0].href"
          icon="i-lucide-phone"
          label="拨打电话"
          color="success"
          variant="soft"
          class="min-h-11"
        />
      </div>
    </div>
  </section>
</template>
