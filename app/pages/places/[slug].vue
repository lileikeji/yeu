<script setup lang="ts">
import { throwPublicDetailError } from '~/utils/public-errors'
import { safeLocalPath } from '~/utils/safe-navigation'

const route = useRoute()
const slug = String(Array.isArray(route.params.slug) ? route.params.slug[0] : route.params.slug ?? '')
const { data: place, error } = await usePublicPlace(slug)
if (error.value) throwPublicDetailError(error.value, '地点')
if (!place.value) throw createError({ statusCode: 404, statusMessage: '地点不存在' })

useSeoMeta({
  title: () => place.value?.name ?? '地点',
  description: () => place.value?.summary ?? ''
})

const returnPath = computed(() => safeLocalPath(route.query.from))
const coordinateIsVerified = computed(() => Boolean(
  place.value?.navigationAvailable
  && place.value.coordinateVerification === 'verified'
  && place.value.coordinateSystem === 'WGS84'
  && place.value.longitude !== null
  && place.value.latitude !== null
))
const mapTarget = computed(() => ({
  path: '/map',
  query: {
    place: place.value?.slug ?? slug,
    ...(returnPath.value ? { from: returnPath.value } : {})
  }
}))

const categoryLabels: Record<string, string> = {
  'campus-building': '教学 / 学习',
  'dorm': '宿舍',
  'food': '餐饮',
  'service': '校园服务',
  'express': '快递',
  'gate': '校门',
  'nearby': '周边服务'
}
</script>

<template>
  <div v-if="place">
    <header class="border-b border-[var(--line)] bg-white">
      <div class="page-shell py-8 md:py-11">
        <nav
          class="flex items-center gap-2 text-xs text-zinc-500"
          aria-label="面包屑"
        >
          <NuxtLink
            to="/map"
            class="hover:text-green-700"
          >校园地图</NuxtLink>
          <UIcon
            name="i-lucide-chevron-right"
            class="size-3.5"
          />
          <span>{{ place.name }}</span>
        </nav>
        <div class="mt-5 flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
          <div class="max-w-3xl">
            <div class="flex flex-wrap items-center gap-2">
              <UBadge
                :label="categoryLabels[place.category ?? place.type] ?? (place.category ?? place.type)"
                color="neutral"
                variant="soft"
              />
              <UBadge
                :label="place.scope === 'campus' ? '校内' : '周边'"
                color="info"
                variant="soft"
              />
              <UBadge
                :label="coordinateIsVerified ? '坐标已核验' : '坐标待核验'"
                :color="coordinateIsVerified ? 'success' : 'warning'"
                variant="soft"
              />
            </div>
            <h1 class="mt-4 text-2xl font-bold text-zinc-950 md:text-3xl">
              {{ place.name }}
            </h1>
            <p class="mt-3 text-sm leading-7 text-zinc-600 md:text-base">
              {{ place.summary }}
            </p>
          </div>
          <div class="flex flex-wrap gap-2">
            <UButton
              :to="mapTarget"
              icon="i-lucide-map-pinned"
              label="地图查看"
              size="lg"
            />
            <UButton
              v-if="place.navigationAvailable && place.externalMapUrl"
              :to="place.externalMapUrl"
              target="_blank"
              icon="i-lucide-navigation"
              label="外部导航"
              color="neutral"
              variant="outline"
              size="lg"
            />
          </div>
        </div>
      </div>
    </header>

    <div class="page-shell grid gap-8 py-8 md:grid-cols-[minmax(0,1fr)_18rem] md:py-12">
      <article class="min-w-0">
        <section class="border-b border-zinc-200 pb-8">
          <h2 class="text-lg font-bold text-zinc-950">
            详细位置
          </h2>
          <dl class="mt-4 divide-y divide-zinc-100 border-y border-zinc-200 text-sm">
            <div
              v-if="place.campusArea"
              class="flex justify-between gap-6 py-3"
            >
              <dt class="text-zinc-500">
                区域
              </dt>
              <dd class="text-right text-zinc-900">
                {{ place.campusArea }}
              </dd>
            </div>
            <div
              v-if="place.address"
              class="flex justify-between gap-6 py-3"
            >
              <dt class="text-zinc-500">
                地址
              </dt>
              <dd class="text-right text-zinc-900">
                {{ place.address }}
              </dd>
            </div>
            <div
              v-if="place.floor || place.room"
              class="flex justify-between gap-6 py-3"
            >
              <dt class="text-zinc-500">
                楼层 / 房间
              </dt>
              <dd class="text-right text-zinc-900">
                {{ [place.floor, place.room].filter(Boolean).join(' · ') }}
              </dd>
            </div>
          </dl>
        </section>

        <section
          v-if="place.body"
          class="border-b border-zinc-200 py-8"
        >
          <h2 class="text-lg font-bold text-zinc-950">
            到达与服务说明
          </h2>
          <p class="mt-4 whitespace-pre-line text-sm leading-7 text-zinc-600">
            {{ place.body }}
          </p>
        </section>

        <section class="py-8">
          <h2 class="text-lg font-bold text-zinc-950">
            服务信息
          </h2>
          <dl class="mt-4 divide-y divide-zinc-100 border-y border-zinc-200 text-sm">
            <div
              v-if="place.openingHours"
              class="flex justify-between gap-6 py-3"
            >
              <dt class="text-zinc-500">
                开放时间
              </dt>
              <dd class="text-right text-zinc-900">
                {{ place.openingHours }}
              </dd>
            </div>
            <div
              v-if="place.phone"
              class="flex justify-between gap-6 py-3"
            >
              <dt class="text-zinc-500">
                公开电话
              </dt>
              <dd class="text-right text-zinc-900">
                {{ place.phone }}
              </dd>
            </div>
            <div
              v-if="place.website"
              class="flex justify-between gap-6 py-3"
            >
              <dt class="text-zinc-500">
                网站
              </dt>
              <dd class="text-right">
                <a
                  :href="place.website"
                  target="_blank"
                  rel="noopener noreferrer"
                  class="font-medium text-green-700 hover:underline"
                >打开官网</a>
              </dd>
            </div>
          </dl>
        </section>

        <UButton
          :to="{ path: '/feedback', query: { targetType: 'place', targetId: place.id, targetName: place.name, type: 'place_error' } }"
          icon="i-lucide-message-square-warning"
          label="纠错此地点"
          color="neutral"
          variant="outline"
        />
      </article>

      <aside class="min-w-0">
        <div class="surface-panel p-4 md:sticky md:top-24">
          <h2 class="text-sm font-bold text-zinc-950">
            数据状态
          </h2>
          <dl class="mt-4 space-y-3 text-xs">
            <div class="flex justify-between gap-4">
              <dt class="text-zinc-500">
                资料属性
              </dt>
              <dd class="text-right font-medium text-zinc-800">
                {{ place.isOfficial ? '校内官方设施' : '团队整理地点' }}
              </dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-zinc-500">
                坐标系
              </dt>
              <dd class="font-medium text-zinc-800">
                {{ place.coordinateSystem }}
              </dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-zinc-500">
                坐标核验
              </dt>
              <dd class="font-medium text-zinc-800">
                {{ place.coordinateVerifiedAt?.slice(0, 10) }}
              </dd>
            </div>
            <div
              v-if="coordinateIsVerified"
              class="flex justify-between gap-4"
            >
              <dt class="text-zinc-500">
                经纬度
              </dt>
              <dd class="text-right font-mono text-[11px] font-medium text-zinc-800">
                {{ place.latitude?.toFixed(6) }}, {{ place.longitude?.toFixed(6) }}
              </dd>
            </div>
            <div class="flex justify-between gap-4">
              <dt class="text-zinc-500">
                内容核验
              </dt>
              <dd class="font-medium text-zinc-800">
                {{ place.lastVerifiedAt?.slice(0, 10) }}
              </dd>
            </div>
          </dl>
          <h3 class="mt-5 border-t border-zinc-100 pt-4 text-xs font-bold text-zinc-800">
            参考来源
          </h3>
          <ul class="mt-3 space-y-3">
            <li
              v-for="source in place.sources"
              :key="source.id"
            >
              <a
                :href="source.url"
                target="_blank"
                rel="noopener noreferrer"
                class="flex items-start gap-2 text-xs leading-5 text-zinc-600 hover:text-green-700"
              >
                <UIcon
                  name="i-lucide-external-link"
                  class="mt-0.5 size-3.5 shrink-0"
                />
                <span>{{ source.title }}</span>
              </a>
            </li>
          </ul>
          <UButton
            v-if="returnPath"
            :to="returnPath"
            icon="i-lucide-undo-2"
            label="返回来源页面"
            color="neutral"
            variant="outline"
            block
            class="mt-5"
          />
        </div>
      </aside>
    </div>
  </div>
</template>
