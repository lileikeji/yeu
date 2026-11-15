<script setup lang="ts">
import { safeExternalHref } from '~/utils/safe-external-href'
import {
  buildNearbyGuideMapUrl,
  type NearbyGuideItem
} from '~~/data/nearby-guide'

const props = defineProps<{
  item: NearbyGuideItem
  categoryLabel: string
  index: number
}>()

const entranceStyle = computed(() => ({
  '--guide-delay': `${Math.min(props.index, 5) * 70}ms`
}))
const primaryDestination = computed(() => props.item.destinations[0]!)
</script>

<template>
  <article
    :id="`guide-${item.id}`"
    class="nearby-guide-card surface-panel scroll-mt-20 overflow-hidden"
    :style="entranceStyle"
  >
    <figure
      v-if="item.image"
      class="nearby-guide-image group relative aspect-[16/8.6] overflow-hidden bg-zinc-100 dark:bg-zinc-800"
    >
      <img
        :src="item.image.src"
        :alt="item.image.alt"
        width="800"
        height="430"
        loading="lazy"
        decoding="async"
        class="h-full w-full object-cover transition duration-700 ease-out group-hover:scale-[1.035]"
      >
      <div class="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/65 via-black/15 to-transparent px-4 pb-3 pt-10">
        <figcaption class="flex items-center gap-1.5 text-[11px] leading-4 text-white/90">
          <UIcon
            name="i-lucide-camera"
            class="size-3.5 shrink-0"
          />
          {{ item.image.credit }}
        </figcaption>
      </div>
    </figure>

    <div class="flex h-full flex-col p-5 md:p-6">
      <div class="flex items-start justify-between gap-3">
        <div class="flex min-w-0 items-start gap-3">
          <span class="grid size-10 shrink-0 place-items-center rounded-xl bg-green-50 dark:bg-green-950 text-green-700 dark:text-green-400">
            <UIcon
              :name="item.icon"
              class="size-5"
            />
          </span>
          <div class="min-w-0">
            <p class="text-xs font-semibold tracking-wide text-green-700 dark:text-green-400">
              {{ item.eyebrow }}
            </p>
            <h3 class="mt-1 text-lg font-bold leading-7 text-zinc-950 dark:text-zinc-100">
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

      <p class="mt-4 text-sm leading-6 text-zinc-600 dark:text-zinc-300">
        {{ item.summary }}
      </p>
      <ul class="mt-4 space-y-2">
        <li
          v-for="highlight in item.highlights"
          :key="highlight"
          class="flex items-start gap-2 text-sm leading-6 text-zinc-700 dark:text-zinc-200"
        >
          <UIcon
            name="i-lucide-circle-check"
            class="mt-1 size-4 shrink-0 text-green-600 dark:text-green-400"
          />
          <span>{{ highlight }}</span>
        </li>
      </ul>

      <dl class="mt-5 grid gap-3 rounded-xl bg-zinc-50 dark:bg-zinc-800/60 p-4 text-xs leading-5 sm:grid-cols-2">
        <div>
          <dt class="font-semibold text-zinc-900 dark:text-zinc-100">
            适合谁
          </dt>
          <dd class="mt-1 text-zinc-600 dark:text-zinc-300">
            {{ item.suitableFor }}
          </dd>
        </div>
        <div>
          <dt class="font-semibold text-zinc-900 dark:text-zinc-100">
            花钱前先看
          </dt>
          <dd class="mt-1 text-zinc-600 dark:text-zinc-300">
            {{ item.costNote }}
          </dd>
        </div>
        <div class="sm:col-span-2">
          <dt class="font-semibold text-zinc-900 dark:text-zinc-100">
            怎么安排
          </dt>
          <dd class="mt-1 text-zinc-600 dark:text-zinc-300">
            {{ item.travelNote }}
          </dd>
        </div>
      </dl>

      <div class="mt-auto pt-5">
        <p class="flex items-start gap-2 text-xs leading-5 text-amber-800 dark:text-amber-300">
          <UIcon
            name="i-lucide-clock-3"
            class="mt-0.5 size-3.5 shrink-0"
          />
          <span>{{ item.freshnessNote }}</span>
        </p>

        <details
          v-if="item.sources.length"
          class="group mt-4 rounded-xl border border-zinc-200 dark:border-zinc-800 bg-[var(--surface)] dark:bg-zinc-900"
        >
          <summary class="flex min-h-11 cursor-pointer list-none items-center justify-between gap-3 px-3 text-xs font-semibold text-zinc-700 dark:text-zinc-200 marker:hidden">
            <span class="inline-flex items-center gap-2">
              <UIcon
                name="i-lucide-book-open"
                class="size-4 text-green-700 dark:text-green-400"
              />
              这条攻略从哪里来
            </span>
            <UIcon
              name="i-lucide-chevron-down"
              class="size-4 text-zinc-400 dark:text-zinc-500 transition group-open:rotate-180"
            />
          </summary>
          <ul class="space-y-1 border-t border-zinc-100 dark:border-zinc-800 p-2">
            <li
              v-for="source in item.sources"
              :key="source.url"
            >
              <a
                :href="safeExternalHref(source.url) || undefined"
                target="_blank"
                rel="noopener noreferrer"
                class="flex min-h-11 items-center justify-between gap-3 rounded-lg px-2 text-xs text-zinc-700 dark:text-zinc-200 transition hover:bg-green-50 dark:hover:bg-green-950 hover:text-green-800 dark:hover:text-green-300"
              >
                <span>
                  <span class="block font-semibold">{{ source.title }}</span>
                  <span class="mt-0.5 block text-zinc-500 dark:text-zinc-400">{{ source.publisher }} · {{ source.publishedAt }}</span>
                </span>
                <UIcon
                  name="i-lucide-external-link"
                  class="size-3.5 shrink-0"
                />
              </a>
            </li>
          </ul>
        </details>

        <div class="mt-4 flex flex-wrap gap-2">
          <UButton
            :href="safeExternalHref(buildNearbyGuideMapUrl(primaryDestination)) || undefined"
            target="_blank"
            rel="noopener noreferrer"
            icon="i-lucide-map-pinned"
            :label="item.destinations.length > 1 ? '在高德看首站' : '在高德看地点'"
            color="primary"
            variant="solid"
            class="min-h-11"
          />
          <NearbyRouteDialog :item="item" />
          <UButton
            v-if="item.id === 'student-streets'"
            href="#nearby-results"
            icon="i-lucide-list-filter"
            label="看学生街地点"
            color="neutral"
            variant="ghost"
            class="min-h-11"
          />
        </div>
      </div>
    </div>
  </article>
</template>

<style scoped>
.nearby-guide-card {
  animation: nearby-card-enter 480ms cubic-bezier(0.22, 1, 0.36, 1) both;
  animation-delay: var(--guide-delay, 0ms);
  transition: border-color 220ms ease, box-shadow 220ms ease, transform 220ms ease;
}

.nearby-guide-card:hover {
  border-color: rgb(134 239 172);
  box-shadow: 0 18px 45px rgb(15 23 42 / 9%);
  transform: translateY(-2px);
}

.nearby-guide-image::after {
  position: absolute;
  inset: 0;
  background: linear-gradient(105deg, transparent 35%, rgb(255 255 255 / 24%) 50%, transparent 65%);
  content: '';
  pointer-events: none;
  transform: translateX(-120%);
  transition: transform 900ms ease;
}

.nearby-guide-card:hover .nearby-guide-image::after {
  transform: translateX(120%);
}

@keyframes nearby-card-enter {
  from {
    opacity: 0;
    transform: translateY(16px) scale(0.985);
  }

  to {
    opacity: 1;
    transform: translateY(0) scale(1);
  }
}

@media (prefers-reduced-motion: reduce) {
  .nearby-guide-card {
    animation: none;
    transition: none;
  }

  .nearby-guide-card:hover {
    transform: none;
  }

  .nearby-guide-image::after {
    display: none;
  }
}
</style>
