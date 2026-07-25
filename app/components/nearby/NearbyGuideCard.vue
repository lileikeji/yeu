<script setup lang="ts">
import { safeExternalHref } from '~/utils/safe-external-href'
import type { NearbyGuideItem } from '~~/data/nearby-guide'

defineProps<{
  item: NearbyGuideItem
  categoryLabel: string
}>()
</script>

<template>
  <article
    :id="`guide-${item.id}`"
    class="surface-panel scroll-mt-20 overflow-hidden"
  >
    <div class="flex h-full flex-col p-5 md:p-6">
      <div class="flex items-start justify-between gap-4">
        <div class="flex min-w-0 items-start gap-3">
          <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-green-50 text-green-700">
            <UIcon
              :name="item.icon"
              class="size-5"
            />
          </span>
          <div class="min-w-0">
            <p class="text-xs font-semibold tracking-wide text-green-700">
              {{ item.eyebrow }}
            </p>
            <h3 class="mt-1 text-lg font-bold leading-7 text-zinc-950">
              {{ item.title }}
            </h3>
          </div>
        </div>
        <UBadge
          :label="categoryLabel"
          color="warning"
          variant="soft"
          class="shrink-0"
        />
      </div>

      <p class="mt-4 text-sm leading-6 text-zinc-600">
        {{ item.summary }}
      </p>
      <ul class="mt-4 space-y-2">
        <li
          v-for="highlight in item.highlights"
          :key="highlight"
          class="flex items-start gap-2 text-sm leading-6 text-zinc-700"
        >
          <UIcon
            name="i-lucide-circle-check"
            class="mt-1 size-4 shrink-0 text-green-600"
          />
          <span>{{ highlight }}</span>
        </li>
      </ul>

      <dl class="mt-5 grid gap-3 rounded-xl bg-zinc-50 p-4 text-xs leading-5 sm:grid-cols-2">
        <div>
          <dt class="font-semibold text-zinc-900">
            适合
          </dt>
          <dd class="mt-1 text-zinc-600">
            {{ item.suitableFor }}
          </dd>
        </div>
        <div>
          <dt class="font-semibold text-zinc-900">
            费用提醒
          </dt>
          <dd class="mt-1 text-zinc-600">
            {{ item.costNote }}
          </dd>
        </div>
        <div class="sm:col-span-2">
          <dt class="font-semibold text-zinc-900">
            出发建议
          </dt>
          <dd class="mt-1 text-zinc-600">
            {{ item.travelNote }}
          </dd>
        </div>
      </dl>

      <div class="mt-auto pt-5">
        <p class="flex items-start gap-2 text-xs leading-5 text-amber-800">
          <UIcon
            name="i-lucide-clock-3"
            class="mt-0.5 size-3.5 shrink-0"
          />
          <span>{{ item.freshnessNote }}</span>
        </p>
        <div class="mt-4 flex flex-wrap gap-2">
          <UButton
            :href="safeExternalHref(item.mapUrl) || undefined"
            target="_blank"
            rel="noopener noreferrer"
            icon="i-lucide-map-pinned"
            label="在高德地图查看"
            color="primary"
            variant="solid"
            class="min-h-11"
          />
          <UButton
            v-if="item.scope === 'city'"
            to="/transport"
            icon="i-lucide-bus-front"
            label="查看进城与返校"
            color="neutral"
            variant="outline"
            class="min-h-11"
          />
          <UButton
            v-for="source in item.sources"
            :key="source.url"
            :href="safeExternalHref(source.url) || undefined"
            target="_blank"
            rel="noopener noreferrer"
            icon="i-lucide-book-open"
            :label="`查看${source.publisher}来源`"
            color="neutral"
            variant="ghost"
            class="min-h-11"
          />
          <UButton
            v-if="item.id === 'student-streets'"
            href="#nearby-results"
            icon="i-lucide-list-filter"
            label="筛选学生街地点"
            color="neutral"
            variant="ghost"
            class="min-h-11"
          />
        </div>
      </div>
    </div>
  </article>
</template>
