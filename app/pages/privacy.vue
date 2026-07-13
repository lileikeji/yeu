<script setup lang="ts">
useSeoMeta({
  title: '隐私说明',
  description: '仰恩新生指南的反馈、定位、缓存与管理员数据处理说明。',
  robots: 'noindex, nofollow'
})

const sections = [
  {
    title: '公开访问',
    icon: 'i-lucide-globe-2',
    items: [
      '浏览公开指南不需要学生账号，不收集学号、校园卡密码、校园网密码或个人档案。',
      '定位只在你主动点击后由浏览器请求，当前用于设备端地图视野，不写入本站数据库。',
      'PWA 会缓存应用外壳和静态资源；公开 API、后台和地图瓦片不作为离线数据保存。'
    ]
  },
  {
    title: '反馈纠错',
    icon: 'i-lucide-message-square-warning',
    items: [
      '保存你提交的问题说明、可选来源链接和可选联系方式，仅管理员可查看。',
      '服务端会保存带密钥的网络标识摘要用于限流和滥用排查，不保存原始 IP 字符串。',
      '请勿提交密码、证件、个人宿舍房间、他人私人联系方式或未经同意的群二维码。'
    ]
  },
  {
    title: '保留与删除',
    icon: 'i-lucide-clock-3',
    items: [
      '网络标识摘要默认 30 天后清除。',
      '反馈处理结束后，可选联系方式默认再保留 90 天；反馈记录自提交起最多保留 730 天。',
      '需要查询或删除自己提交的信息时，可再次通过反馈页说明原提交时间、内容和可用于核对的信息。'
    ]
  },
  {
    title: '第三方服务',
    icon: 'i-lucide-map',
    items: [
      '地图加载时会连接所选地图或瓦片服务，对方可能按其隐私规则处理常规网络请求信息。',
      '外部官网、来源链接和导航链接离开本站后，适用对应网站的隐私规则。',
      '正式上线前会按最终地图供应商、域名和统计方案更新本说明。'
    ]
  }
]
</script>

<template>
  <div>
    <header class="border-b border-[var(--line)] bg-white">
      <div class="page-shell py-8 md:py-10">
        <p class="section-kicker">
          PRIVACY
        </p>
        <h1 class="mt-2 text-2xl font-bold text-zinc-950 md:text-3xl">
          隐私说明
        </h1>
        <p class="mt-3 max-w-3xl text-sm leading-7 text-zinc-600">
          本项目由个人或学生团队维护，按最少必要原则处理数据。以下规则适用于当前 V0.1，更新日期为 2026-07-13。
        </p>
      </div>
    </header>

    <div class="page-shell py-8 md:py-12">
      <div class="grid gap-x-10 gap-y-8 md:grid-cols-2">
        <section
          v-for="section in sections"
          :key="section.title"
          class="border-t border-zinc-200 pt-5"
        >
          <div class="flex items-center gap-3">
            <span class="grid size-9 place-items-center rounded-md bg-green-50 text-green-700">
              <UIcon
                :name="section.icon"
                class="size-4"
              />
            </span>
            <h2 class="font-bold text-zinc-950">
              {{ section.title }}
            </h2>
          </div>
          <ul class="mt-4 space-y-3 text-sm leading-7 text-zinc-600">
            <li
              v-for="item in section.items"
              :key="item"
              class="flex gap-2"
            >
              <span class="mt-3 size-1.5 shrink-0 rounded-full bg-green-700" />
              <span>{{ item }}</span>
            </li>
          </ul>
        </section>
      </div>

      <div class="mt-10 flex flex-wrap gap-2 border-t border-zinc-200 pt-6">
        <UButton
          to="/feedback"
          icon="i-lucide-message-square"
          label="提交查询或删除请求"
        />
        <UButton
          to="/"
          icon="i-lucide-house"
          label="返回首页"
          color="neutral"
          variant="outline"
        />
      </div>
    </div>
  </div>
</template>
