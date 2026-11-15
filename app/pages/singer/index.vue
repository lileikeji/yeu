<script setup lang="ts">
definePageMeta({ layout: false })

useSeoMeta({
  title: '新声歌手大赛 · Songs of Autumn | 仰恩大学音乐协会',
  description: '仰恩大学音乐协会2026新声歌手大赛：报名时间11.7-11.14，初赛11.14-11.15旧区宏船楼303，复赛11.21新区和昌讲堂，决赛12.5旧区普照大礼堂。'
})
</script>

<template>
  <div class="min-h-dvh bg-gradient-to-b from-[#ffe8d9] via-[#fdf6ec] to-[#ddf3ea] text-[#33413a]">
    <main class="mx-auto max-w-2xl px-4 py-8 sm:px-6 sm:py-12">
      <!-- 头部 -->
      <header class="text-center">
        <p class="inline-flex items-center gap-2 rounded-full bg-[color-mix(in_srgb,var(--surface)_70%,transparent)] px-4 py-1.5 text-xs font-semibold tracking-wider text-[#b4552f] shadow-sm">
          仰恩大学音乐协会 · Music Association of YUE
        </p>
        <h1 class="mt-5 text-4xl font-black leading-tight tracking-wide text-[#2f3a34] sm:text-5xl">
          新声歌手大赛
        </h1>
        <p class="mt-2 font-serif text-2xl italic text-[#7d8a80]">
          Songs of Autumn
        </p>
        <p class="mt-1 text-sm text-[#8b968c]">
          秋天的歌 · 秋日恋歌，新的序曲
        </p>
      </header>

      <!-- 关键信息卡 -->
      <section class="mt-8 grid gap-3 sm:grid-cols-3">
        <div class="rounded-2xl bg-[color-mix(in_srgb,var(--surface)_80%,transparent)] p-4 shadow-sm ring-1 ring-[#f2d8c4]">
          <p class="text-xs font-semibold text-[#b4552f]">
            报名时间
          </p>
          <p class="mt-1.5 text-lg font-bold leading-snug">
            11.7 - 11.14
          </p>
          <p class="mt-0.5 text-xs text-[#8b968c]">
            现场报名也可以
          </p>
        </div>
        <div class="rounded-2xl bg-[color-mix(in_srgb,var(--surface)_80%,transparent)] p-4 shadow-sm ring-1 ring-[#f2d8c4]">
          <p class="text-xs font-semibold text-[#b4552f]">
            初赛时间
          </p>
          <p class="mt-1.5 text-lg font-bold leading-snug">
            11.14 - 11.15
          </p>
          <p class="mt-0.5 text-xs text-[#8b968c]">
            两天 19:00 开始，自选一天
          </p>
        </div>
        <div class="rounded-2xl bg-[color-mix(in_srgb,var(--surface)_80%,transparent)] p-4 shadow-sm ring-1 ring-[#f2d8c4]">
          <p class="text-xs font-semibold text-[#b4552f]">
            初赛地点
          </p>
          <p class="mt-1.5 text-lg font-bold leading-snug">
            旧区宏船楼303
          </p>
          <p class="mt-0.5 text-xs text-[#8b968c]">
            N 进 30
          </p>
        </div>
      </section>

      <!-- 登记入口 -->
      <section class="mt-6 rounded-2xl bg-gradient-to-r from-[#e2725b] to-[#e9997a] p-5 text-white shadow-md sm:p-6">
        <p class="text-lg font-bold">
          报名方式
        </p>
        <dl class="mt-3 grid gap-1 text-sm leading-6 text-white/90">
          <div class="flex gap-2">
            <dt class="shrink-0 font-semibold">
              时间
            </dt>
            <dd>11.14 / 11.15 任选一天 19:00</dd>
          </div>
          <div class="flex gap-2">
            <dt class="shrink-0 font-semibold">
              地点
            </dt>
            <dd>旧区宏船楼303</dd>
          </div>
          <div class="flex gap-2">
            <dt class="shrink-0 font-semibold">
              报名入口
            </dt>
            <dd>现场扫码，或先填预报名</dd>
          </div>
        </dl>
        <div class="mt-4">
          <NuxtLink
            to="/singer/pre-register"
            class="inline-flex w-full items-center justify-center gap-2 rounded-xl bg-[var(--surface)] px-4 py-3 text-sm font-bold text-[#c2543c] shadow transition hover:bg-orange-50 sm:w-auto"
          >
            <UIcon
              name="i-lucide-calendar-plus"
              class="size-4"
              aria-hidden="true"
            />
            填写预报名
          </NuxtLink>
        </div>
      </section>

      <!-- 赛程与规则 -->
      <section class="mt-8 space-y-5">
        <article class="rounded-2xl bg-[color-mix(in_srgb,var(--surface)_85%,transparent)] p-5 shadow-sm ring-1 ring-[#eef0e9] sm:p-6">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h2 class="text-xl font-black text-[#2f3a34]">
              初赛
            </h2>
            <span class="rounded-full bg-[#fdeee4] px-3 py-1 text-xs font-bold text-[#b4552f]">
              N 进 30
            </span>
          </div>
          <dl class="mt-3 space-y-1 text-sm">
            <div class="flex gap-2">
              <dt class="w-20 shrink-0 font-semibold text-[#6b7a70]">
                比赛时间
              </dt>
              <dd>
                11.14（周六）19:00 开始至参赛成员唱完结束<br>
                11.15（周日）19:00 开始至参赛成员唱完结束
              </dd>
            </div>
            <div class="flex gap-2">
              <dt class="w-20 shrink-0 font-semibold text-[#6b7a70]">
                比赛地点
              </dt>
              <dd>旧区宏船楼303</dd>
            </div>
          </dl>
          <ol class="mt-4 list-decimal space-y-2.5 pl-5 text-sm leading-6 text-[#4a564e]">
            <li>选手简单介绍个人信息及自己所演唱歌曲。</li>
            <li>
              初赛选手自选半首歌曲并准备伴奏，正常情况下使用全民K歌播放（或可带乐器弹唱，如果所需伴奏在全民K歌搜索不到，则需自带伴奏文件），限时2分半内演唱完毕。
            </li>
            <li>初赛评定标准：由评委根据选手表现进行打分，满分100分（五个维度，每项20分），取平均值。最终取前30名进入复赛。</li>
            <li>有填写报名信息的选手，工作人员以QQ联系形式通知其来参加。如果两天都未能在比赛时间段之内到达现场参赛，且未向负责人说明原因，则默认视为弃权。</li>
            <li>初赛共分两天，自选一天参加。支持现场报名，比赛顺序以现场签到顺序为主。</li>
          </ol>
        </article>

        <article class="rounded-2xl bg-[color-mix(in_srgb,var(--surface)_85%,transparent)] p-5 shadow-sm ring-1 ring-[#eef0e9] sm:p-6">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h2 class="text-xl font-black text-[#2f3a34]">
              复赛
            </h2>
            <span class="rounded-full bg-[#fdeee4] px-3 py-1 text-xs font-bold text-[#b4552f]">
              30 进 12
            </span>
          </div>
          <dl class="mt-3 space-y-1 text-sm">
            <div class="flex gap-2">
              <dt class="w-20 shrink-0 font-semibold text-[#6b7a70]">
                比赛时间
              </dt>
              <dd>11.21（周六）19:00 开始至30人唱完</dd>
            </div>
            <div class="flex gap-2">
              <dt class="w-20 shrink-0 font-semibold text-[#6b7a70]">
                比赛地点
              </dt>
              <dd>新区和昌讲堂</dd>
            </div>
          </dl>
          <ol class="mt-4 list-decimal space-y-2.5 pl-5 text-sm leading-6 text-[#4a564e]">
            <li>初赛结束第二天，公布初赛结果并通知可进入复赛的选手。</li>
            <li>晋级复赛的选手自选歌曲，复赛需要完整地演唱一首歌曲，选手需自行准备伴奏并发给工作人员。</li>
            <li>复赛评定标准：由评委根据选手表现进行打分。最终取前12名进入决赛。</li>
          </ol>
        </article>

        <article class="rounded-2xl bg-[color-mix(in_srgb,var(--surface)_85%,transparent)] p-5 shadow-sm ring-1 ring-[#eef0e9] sm:p-6">
          <div class="flex flex-wrap items-baseline justify-between gap-2">
            <h2 class="text-xl font-black text-[#2f3a34]">
              决赛
            </h2>
            <span class="rounded-full bg-[#fdeee4] px-3 py-1 text-xs font-bold text-[#b4552f]">
              巅峰之夜
            </span>
          </div>
          <dl class="mt-3 space-y-1 text-sm">
            <div class="flex gap-2">
              <dt class="w-20 shrink-0 font-semibold text-[#6b7a70]">
                比赛时间
              </dt>
              <dd>12.5（周六）19:00 - 21:30</dd>
            </div>
            <div class="flex gap-2">
              <dt class="w-20 shrink-0 font-semibold text-[#6b7a70]">
                比赛地点
              </dt>
              <dd>旧区普照大礼堂</dd>
            </div>
          </dl>
          <ol class="mt-4 list-decimal space-y-2.5 pl-5 text-sm leading-6 text-[#4a564e]">
            <li>复赛结束次日公布结果，并以QQ方式通知进入决赛的选手。</li>
            <li>决赛具体规则另行通知。</li>
          </ol>
        </article>
      </section>

      <!-- 底部 -->
      <footer class="mt-10 pb-6 text-center">
        <p class="text-xs text-[#a8b0a6]">
          主办：仰恩大学音乐协会 · 最终解释权归主办方所有
        </p>
      </footer>
    </main>
  </div>
</template>
