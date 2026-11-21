<script setup lang="ts">
import { computed, ref } from 'vue';
import { portalState, publishedNews } from '../stores/portalStore';
import type { NewsPost } from '../types/portal';

const emit = defineEmits<{
  openNews: [post: NewsPost];
}>();

const selectedDept = ref('全部');
const keyword = ref('');

const filtered = computed(() => {
  const q = keyword.value.trim().toLowerCase();
  return publishedNews.value.filter((post) => {
    const hitDept = selectedDept.value === '全部' || post.deptName === selectedDept.value;
    const hitQuery =
      !q ||
      post.title.toLowerCase().includes(q) ||
      post.summary.toLowerCase().includes(q) ||
      post.tags.some((t) => t.toLowerCase().includes(q));
    return hitDept && hitQuery;
  });
});
</script>

<template>
  <div>
    <section class="subpage-head">
      <div class="wrap">
        <h1>协会动态</h1>
        <p>社团通知、技术分享回顾与项目进展记录，按发布时间倒序排列。</p>
      </div>
    </section>

    <section class="page-section" style="padding-top: 0.5rem;">
      <div class="wrap">
        <div class="filter-bar">
          <button
            type="button"
            class="filter-chip"
            :class="{ active: selectedDept === '全部' }"
            @click="selectedDept = '全部'"
          >
            全部
          </button>
          <button
            v-for="dept in portalState.departments"
            :key="dept.id"
            type="button"
            class="filter-chip"
            :class="{ active: selectedDept === dept.name }"
            @click="selectedDept = dept.name"
          >
            {{ dept.name }}
          </button>

          <input
            v-model="keyword"
            type="search"
            class="input"
            placeholder="搜索标题或标签…"
            style="width: 210px; margin-left: auto; padding: 0.32rem 0.65rem; font-size: 0.84rem;"
          />
        </div>

        <div v-if="filtered.length === 0" class="alert alert-info">
          没有匹配的动态内容。你可以在右上角「组织后台」发布新的动态。
        </div>

        <div v-else class="news-list">
          <article
            v-for="post in filtered"
            :key="post.id"
            class="news-row"
            @click="emit('openNews', post)"
          >
            <div class="news-date">{{ post.publishedAt }}</div>
            <div>
              <div class="tag-row">
                <span class="pill" :class="post.deptName === 'AI 部' ? 'pill-ai' : ''">
                  {{ post.deptName }}
                </span>
                <span v-if="post.pinned" class="pill pill-red">置顶</span>
                <span v-for="t in post.tags" :key="t" class="pill">{{ t }}</span>
              </div>
              <h3 class="news-title">{{ post.title }}</h3>
              <p class="news-summary">{{ post.summary }}</p>
            </div>
          </article>
        </div>
      </div>
    </section>
  </div>
</template>
