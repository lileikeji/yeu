<script setup lang="ts">
import { computed, ref } from 'vue';
import { portalState } from '../stores/portalStore';
import type { ResourceItem } from '../types/portal';

const emit = defineEmits<{
  openResource: [res: ResourceItem];
  jumpJoin: [];
}>();

const activeTrack = ref<string>('全部');
const tracks = ['全部', 'AI / Agent', 'Web / 校内工具', '算法竞赛'];

const filteredProjects = computed(() =>
  activeTrack.value === '全部'
    ? portalState.projects
    : portalState.projects.filter((p) => p.track === activeTrack.value),
);

const statusMap = {
  active: { text: '开发中', cls: 'pill-ok' },
  maintaining: { text: '维护中', cls: 'pill-ai' },
  planning: { text: '构想中', cls: '' },
} as const;
</script>

<template>
  <div>
    <section class="subpage-head">
      <div class="wrap">
        <h1>项目与学习资料</h1>
        <p>
          社团成员认领开发的校内工具、Agent 样例与算法训练题单，以及面向大一新生的日常学习笔记。
        </p>
      </div>
    </section>

    <section class="page-section" style="padding-top: 0.5rem;">
      <div class="wrap">
        <div class="filter-bar">
          <button
            v-for="t in tracks"
            :key="t"
            type="button"
            class="filter-chip"
            :class="{ active: activeTrack === t }"
            @click="activeTrack = t"
          >
            {{ t }}
          </button>
        </div>

        <div class="cards-2">
          <article v-for="proj in filteredProjects" :key="proj.id" class="card">
            <div class="card-top">
              <span class="pill" :class="statusMap[proj.status].cls">{{ statusMap[proj.status].text }}</span>
              <span class="pill" :class="proj.deptName === 'AI 部' ? 'pill-ai' : ''">
                {{ proj.deptName }}
              </span>
            </div>
            <img v-if="proj.previewImage" :src="proj.previewImage" :alt="proj.title" class="proj-thumb" />
            <h3>{{ proj.title }}</h3>
            <p>{{ proj.summary }}</p>
            <ul v-if="proj.highlights?.length" style="margin: 0; padding-left: 1.1rem; font-size: 0.82rem; color: var(--muted);">
              <li v-for="hl in proj.highlights.slice(0, 2)" :key="hl">{{ hl }}</li>
            </ul>
            <div class="tag-row">
              <span v-for="tech in proj.stack" :key="tech" class="pill">{{ tech }}</span>
            </div>
            <div class="card-links">
              <a v-if="proj.repoUrl" :href="proj.repoUrl" target="_blank" rel="noreferrer">仓库源码 ↗</a>
              <span v-else class="muted">源码尚未公开</span>
              <button
                v-if="proj.demoUrl === '#join'"
                type="button"
                class="board-foot-link"
                @click="emit('jumpJoin')"
              >
                去报名体验 →
              </button>
            </div>
          </article>
        </div>
      </div>
    </section>

    <section class="page-section">
      <div class="wrap">
        <div class="section-bar">
          <div class="section-bar-left">
            <span class="section-num">DOCS</span>
            <h2 class="section-title">常用笔记与新人指南</h2>
          </div>
        </div>

        <div class="cards-3">
          <article
            v-for="res in portalState.resources"
            :key="res.id"
            class="card"
            style="cursor: pointer;"
            @click="emit('openResource', res)"
          >
            <div class="card-top">
              <span class="pill pill-red">{{ res.kind }}</span>
              <span class="pill">{{ res.deptName }}</span>
            </div>
            <h3>{{ res.title }}</h3>
            <p>{{ res.summary }}</p>
            <div class="card-links">
              <span>阅读全文 →</span>
              <span class="muted mono" style="margin-left: auto; font-weight: 400;">{{ res.updatedAt }}</span>
            </div>
          </article>
        </div>
      </div>
    </section>
  </div>
</template>
