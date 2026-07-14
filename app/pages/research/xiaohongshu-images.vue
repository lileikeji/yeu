<script setup lang="ts">
useSeoMeta({
  title: '小红书线索图',
  description: '仰恩大学新生指南的社交平台待核验图片线索，展示 AI 重构图、来源笔记和发布边界。'
})

const basePath = '/images/xiaohongshu-recreations-2026-07-15/'

const imageGroups = [
  {
    title: '宿舍与公共卫浴',
    description: '来自宿舍答疑笔记的视觉线索，只能帮助理解可能的空间类型，不能代表全部楼栋或当前房型。',
    items: [
      {
        title: '普通型宿舍房间',
        file: 'dorm-standard-room-overview-hd.png',
        source: 'https://www.xiaohongshu.com/explore/6a45ba77000000000702a5ff',
        note: 'AI重构图；上床下桌、空调、风扇等细节需按楼栋核验。'
      },
      {
        title: '普通型宿舍环境封面',
        file: 'dorm-standard-environment-cover-hd.png',
        source: 'https://www.xiaohongshu.com/explore/6a45ba77000000000702a5ff',
        note: 'AI重构封面；不作为宿舍分配或收费依据。'
      },
      {
        title: '公共浴室隔间',
        file: 'dorm-public-shower-stalls-hd.png',
        source: 'https://www.xiaohongshu.com/explore/6a45ba77000000000702a5ff',
        note: 'AI重构图；楼栋、开放状态和维护情况待现场确认。'
      },
      {
        title: '公共厕所隔间',
        file: 'dorm-public-restroom-stalls-hd.png',
        source: 'https://www.xiaohongshu.com/explore/6a45ba77000000000702a5ff',
        note: 'AI重构图；只保留设施类型线索。'
      },
      {
        title: '公共洗漱区',
        file: 'dorm-communal-washroom-hd.png',
        source: 'https://www.xiaohongshu.com/explore/6a45ba77000000000702a5ff',
        note: 'AI重构图；不能推断所有宿舍楼一致。'
      }
    ]
  },
  {
    title: '快递点示意',
    description: '来自 2025 年快递地图笔记，适合做现场核验清单，不可替代高德坐标或导航。',
    items: [
      {
        title: '新区学生街快递点参考',
        file: 'express-new-area-student-street-reference-hd.png',
        source: 'https://www.xiaohongshu.com/explore/689c97e4000000001b023cb9',
        note: '参考示意图；品牌、数量、营业状态必须重新核验。'
      },
      {
        title: '旧区南门路线参考',
        file: 'express-old-area-south-gate-route-reference-hd.png',
        source: 'https://www.xiaohongshu.com/explore/689c97e4000000001b023cb9',
        note: '参考示意图；不用于精确导航。'
      },
      {
        title: '旧区南门快递点参考',
        file: 'express-old-area-south-gate-pickup-reference-hd.png',
        source: 'https://www.xiaohongshu.com/explore/689c97e4000000001b023cb9',
        note: '参考示意图；需现场确认入口和取件规则。'
      },
      {
        title: '红侣楼附近快递参考',
        file: 'express-old-area-honglu-building-reference-hd.png',
        source: 'https://www.xiaohongshu.com/explore/689c97e4000000001b023cb9',
        note: '参考示意图；仅作为走访路线线索。'
      }
    ]
  },
  {
    title: '周边餐饮候选',
    description: '喜又、思念小馆已与高德 POI 形成交叉线索，但菜品、价格和营业状态仍需商家或现场确认。',
    items: [
      {
        title: '喜又牛肉类菜品',
        file: 'food-xiyou-black-pepper-beef-hd.png',
        source: 'https://www.xiaohongshu.com/explore/6a4526e900000000200388d6',
        note: 'AI重构图；不代表当前菜单或售价。'
      },
      {
        title: '喜又炸鸡面类菜品',
        file: 'food-xiyou-fried-chicken-noodles-hd.png',
        source: 'https://www.xiaohongshu.com/explore/6a4526e900000000200388d6',
        note: 'AI重构图；菜品归属仍待商家确认。'
      },
      {
        title: '思念小馆抹茶冰与芋圆',
        file: 'food-sinian-matcha-shaved-ice-taro-balls-hd.png',
        source: 'https://www.xiaohongshu.com/explore/6a4526e900000000200388d6',
        note: 'AI重构图；只作为核验候选。'
      },
      {
        title: '思念小馆鸡肉锅类菜品',
        file: 'food-sinian-spicy-chicken-pot-hd.png',
        source: 'https://www.xiaohongshu.com/explore/6a4526e900000000200388d6',
        note: 'AI重构图；不作为推荐或广告。'
      }
    ]
  },
  {
    title: '叮叮车资料与概念图',
    description: '校内用户已确认“叮叮车”名称存在，但票价、时刻、车辆和候车点仍按待核验变化信息处理。',
    items: [
      {
        title: '历史运营资料卡',
        file: 'dingding-historical-operation-info-hd.png',
        source: 'https://www.xiaohongshu.com/explore/686f0ee4000000001202cb14',
        note: 'AI重构资料卡；历史票价、座位和站点不得直接发布为当前规则。'
      },
      {
        title: '叮叮车车队概念图',
        file: 'dingding-shuttle-fleet-concept-hd.png',
        source: 'https://www.xiaohongshu.com/explore/686f0ee4000000001202cb14',
        note: '概念示意图；不代表真实车辆。'
      },
      {
        title: '叮叮车停放区概念图',
        file: 'dingding-shuttle-depot-concept-hd.png',
        source: 'https://www.xiaohongshu.com/explore/686f0ee4000000001202cb14',
        note: '概念示意图；不代表真实车库或建筑。'
      },
      {
        title: '新区候车点概念图',
        file: 'dingding-new-area-stop-concept-hd.png',
        source: 'https://www.xiaohongshu.com/explore/686f0ee4000000001202cb14',
        note: '概念示意图；非和昌楼实景。'
      },
      {
        title: '旧区候车点概念图',
        file: 'dingding-old-area-stop-concept-hd.png',
        source: 'https://www.xiaohongshu.com/explore/686f0ee4000000001202cb14',
        note: '概念示意图；非创业园实景。'
      }
    ]
  }
]

const allImages = imageGroups.flatMap(group => group.items)
</script>

<template>
  <div>
    <header class="border-b border-[var(--line)] bg-white">
      <div class="page-shell py-8 md:py-11">
        <nav class="flex items-center gap-2 text-xs text-zinc-500">
          <NuxtLink
            to="/discover"
            class="hover:text-green-700"
          >
            更多服务
          </NuxtLink>
          <UIcon
            name="i-lucide-chevron-right"
            class="size-3.5"
          />
          <span class="text-zinc-700">小红书线索图</span>
        </nav>
        <div class="mt-5 max-w-3xl">
          <p class="section-kicker">
            社交平台待核验素材
          </p>
          <h1 class="mt-2 text-2xl font-bold text-zinc-950 md:text-3xl">
            小红书线索图
          </h1>
          <p class="mt-3 text-sm leading-7 text-zinc-600 md:text-base">
            这里展示的是根据公开笔记线索生成的 AI 重构图和概念示意图。它们用于整理现场核验目标，不是官方图片、原始实拍或独立事实证据。
          </p>
        </div>
      </div>
    </header>

    <main class="page-shell py-8 md:py-12">
      <div class="grid gap-4 border-l-4 border-orange-500 bg-orange-50 px-4 py-3 text-sm leading-6 text-orange-950 md:grid-cols-[1fr_auto] md:items-center">
        <p>
          发布前必须继续核验宿舍楼栋、快递点、商家菜品和叮叮车运营细节。页面引用图片时，应保留“AI重构图”“参考示意”或“概念示意”的标注。
        </p>
        <UBadge
          color="warning"
          variant="soft"
          class="justify-self-start md:justify-self-end"
        >
          {{ allImages.length }} 张待核验图
        </UBadge>
      </div>

      <section
        v-for="group in imageGroups"
        :key="group.title"
        class="mt-10"
      >
        <div class="max-w-3xl">
          <p class="section-kicker">
            {{ group.title }}
          </p>
          <h2 class="mt-1 text-xl font-bold text-zinc-950">
            {{ group.title }}
          </h2>
          <p class="mt-2 text-sm leading-7 text-zinc-600">
            {{ group.description }}
          </p>
        </div>

        <div class="mt-5 grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <article
            v-for="item in group.items"
            :key="item.file"
            class="surface-panel overflow-hidden"
          >
            <img
              :src="`${basePath}${item.file}`"
              :alt="item.title"
              loading="lazy"
              class="aspect-[4/3] w-full bg-zinc-100 object-cover"
            >
            <div class="p-4">
              <div class="flex items-start justify-between gap-3">
                <h3 class="text-sm font-bold text-zinc-950">
                  {{ item.title }}
                </h3>
                <UBadge
                  color="warning"
                  variant="soft"
                  size="sm"
                  class="shrink-0"
                >
                  AI重构
                </UBadge>
              </div>
              <p class="mt-2 text-xs leading-5 text-zinc-600">
                {{ item.note }}
              </p>
              <a
                :href="item.source"
                target="_blank"
                rel="noopener noreferrer"
                class="mt-3 inline-flex items-center gap-1 text-xs font-medium text-green-700 hover:text-green-800"
              >
                来源笔记
                <UIcon
                  name="i-lucide-external-link"
                  class="size-3.5"
                />
              </a>
            </div>
          </article>
        </div>
      </section>
    </main>
  </div>
</template>
