<script setup lang="ts">
const categoryLabels: Record<string, string> = {
  food: '餐饮',
  lodging: '住宿',
  retail: '零售',
  medical: '医疗',
  repair: '打印 / 维修',
  transit: '交通',
  nearby: '生活服务'
}

useSeoMeta({
  title: '校园周边',
  description: '查看经过位置与营业状态核验的仰恩大学周边商铺和生活服务。'
})

const searchQuery = ref('')
const activeCategory = ref('all')
const { data: response, error } = await usePublicPlaceList('nearby')
const places = computed(() => response.value?.items ?? [])
const categories = computed(() => [...new Set(places.value.map(place => place.category ?? place.type))]
  .map(value => ({ value, label: categoryLabels[value] ?? value })))
const filteredPlaces = computed(() => {
  const query = searchQuery.value.trim().toLocaleLowerCase('zh-CN')
  return places.value.filter((place) => {
    const category = place.category ?? place.type
    const categoryMatches = activeCategory.value === 'all' || category === activeCategory.value
    const queryMatches = !query || [place.name, place.summary, place.address, place.campusArea]
      .filter(Boolean).join(' ').toLocaleLowerCase('zh-CN').includes(query)
    return categoryMatches && queryMatches
  })
})
</script>

<template>
  <div>
    <header class="border-b border-[var(--line)] bg-white">
      <div class="page-shell py-8 md:py-11">
        <p class="section-kicker">
          校园周边
        </p>
        <h1 class="mt-2 text-2xl font-bold text-zinc-950 md:text-3xl">
          已核验商铺与生活服务
        </h1>
        <p class="mt-3 max-w-2xl text-sm leading-7 text-zinc-600">
          只展示已核对位置、来源和营业状态的地点，不使用平台评分或未经验证的推荐排名。
        </p>
        <div class="mt-6 grid gap-3 md:grid-cols-[minmax(0,1fr)_13rem]">
          <UInput
            v-model="searchQuery"
            icon="i-lucide-search"
            placeholder="搜索商铺或服务"
            aria-label="搜索校园周边"
            size="lg"
          />
          <USelect
            v-model="activeCategory"
            :items="[{ label: '全部分类', value: 'all' }, ...categories.map(category => ({ label: category.label, value: category.value }))]"
            value-key="value"
            label-key="label"
            aria-label="周边地点分类"
            size="lg"
          />
        </div>
      </div>
    </header>

    <div class="page-shell page-section">
      <div
        v-if="error"
        class="border-l-2 border-red-500 bg-red-50 px-3 py-2 text-sm text-red-800"
        role="alert"
      >
        周边资料暂时不可用，请稍后重试。
      </div>

      <div
        v-else
        class="mb-4 flex items-center justify-between gap-4"
      >
        <h2 class="text-sm font-semibold text-zinc-900">
          {{ filteredPlaces.length }} 个地点
        </h2>
        <UButton
          :to="{ path: '/map', query: { scope: 'nearby' } }"
          icon="i-lucide-map"
          label="地图查看"
          color="neutral"
          variant="outline"
        />
      </div>

      <div
        v-if="filteredPlaces.length"
        class="grid gap-3 md:grid-cols-2 xl:grid-cols-3"
      >
        <NuxtLink
          v-for="place in filteredPlaces"
          :key="place.id"
          :to="`/places/${place.slug}`"
          class="surface-panel group flex min-h-52 flex-col p-5 transition hover:border-green-300 hover:shadow-sm"
        >
          <div class="flex items-start justify-between gap-3">
            <span class="grid size-10 place-items-center rounded-md bg-orange-50 text-orange-700">
              <UIcon
                name="i-lucide-store"
                class="size-5"
              />
            </span>
            <UBadge
              :label="categoryLabels[place.category ?? place.type] ?? (place.category ?? place.type)"
              color="neutral"
              variant="soft"
            />
          </div>
          <h2 class="mt-4 font-bold text-zinc-950">
            {{ place.name }}
          </h2>
          <p class="mt-2 flex-1 text-sm leading-6 text-zinc-600">
            {{ place.summary }}
          </p>
          <p
            v-if="place.address"
            class="mt-3 text-xs leading-5 text-zinc-500"
          >
            {{ place.address }}
          </p>
          <span class="mt-4 inline-flex items-center gap-1 text-xs font-medium text-green-700">
            查看详情
            <UIcon
              name="i-lucide-arrow-right"
              class="size-3.5"
            />
          </span>
        </NuxtLink>
      </div>

      <div
        v-else-if="!error"
        class="border-y border-zinc-200 bg-white px-5 py-12 text-center"
      >
        <UIcon
          name="i-lucide-store"
          class="mx-auto size-7 text-zinc-400"
        />
        <h2 class="mt-3 text-base font-bold text-zinc-800">
          暂无达到发布标准的周边地点
        </h2>
        <p class="mx-auto mt-2 max-w-xl text-sm leading-6 text-zinc-500">
          候选商铺仍在核验位置、经营状态和营业时间，因此不会提前公开。
        </p>
        <UButton
          :to="{ path: '/feedback', query: { type: 'source_suggestion', from: '/nearby' } }"
          icon="i-lucide-link"
          label="提交可靠来源"
          color="neutral"
          variant="outline"
          class="mt-5"
        />
      </div>
    </div>
  </div>
</template>
