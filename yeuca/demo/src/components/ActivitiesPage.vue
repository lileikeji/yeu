<script setup lang="ts">
import { computed, ref } from 'vue';
import { portalState, publishedActivities } from '../stores/portalStore';
import { formatMonthDay } from '../utils/markdown';
import type { ActivityItem } from '../types/portal';

const emit = defineEmits<{
  openActivity: [activity: ActivityItem];
}>();

const selectedCategory = ref<string>('全部');
const selectedDept = ref<string>('全部');

const categories = ['全部', 'AI工作坊', '技术分享', '算法训练', '社团招新'];

const filtered = computed(() =>
  publishedActivities.value.filter((act) => {
    const hitCat = selectedCategory.value === '全部' || act.category === selectedCategory.value;
    const hitDept = selectedDept.value === '全部' || act.deptName === selectedDept.value;
    return hitCat && hitDept;
  }),
);

const stateMap = {
  open: { text: '报名中', cls: 'pill-ok' },
  planned: { text: '筹备中', cls: 'pill-warn' },
  done: { text: '已结束', cls: '' },
} as const;
</script>

<template>
  <div>
    <section class="subpage-head">
      <div class="wrap">
        <h1>活动排期</h1>
        <p>
          上机工作坊、算法训练夜与招新宣讲。时间、教室与报名状态由主办部门在后台实时更新。
        </p>
      </div>
    </section>

    <section class="page-section" style="padding-top: 0.5rem;">
      <div class="wrap">
        <div class="filter-bar">
          <button
            v-for="cat in categories"
            :key="cat"
            type="button"
            class="filter-chip"
            :class="{ active: selectedCategory === cat }"
            @click="selectedCategory = cat"
          >
            {{ cat }}
          </button>

          <select
            v-model="selectedDept"
            aria-label="按主办部门筛选"
            class="select"
            style="width: auto; margin-left: auto; padding: 0.3rem 0.7rem; font-size: 0.84rem;"
          >
            <option value="全部">全部部门</option>
            <option v-for="d in portalState.departments" :key="d.id" :value="d.name">
              {{ d.name }}
            </option>
          </select>
        </div>

        <div v-if="filtered.length === 0" class="alert alert-info">
          当前筛选条件下暂无已发布的活动记录。可以在右上角「组织后台」新建一条并设为已发布。
        </div>

        <div v-else class="activity-grid">
          <article
            v-for="act in filtered"
            :key="act.id"
            class="activity-card"
            @click="emit('openActivity', act)"
          >
            <div class="date-box">
              <span class="date-month">{{ formatMonthDay(act.date).month }}</span>
              <span class="date-day">{{ formatMonthDay(act.date).day }}</span>
            </div>
            <div class="activity-body">
              <div class="activity-meta">
                <span class="pill" :class="stateMap[act.recruitState].cls">
                  {{ stateMap[act.recruitState].text }}
                </span>
                <span class="pill" :class="act.deptName === 'AI 部' ? 'pill-ai' : ''">
                  {{ act.deptName }}
                </span>
                <span class="pill">{{ act.category }}</span>
                <span>{{ act.timeRange }} · {{ act.place }}</span>
                <span v-if="act.capacity">· {{ act.capacity }}</span>
              </div>
              <h3>{{ act.title }}</h3>
              <p>{{ act.summary }}</p>
            </div>
            <div class="activity-action">
              <button class="btn btn-ghost btn-sm" type="button">查看大纲</button>
            </div>
          </article>
        </div>
      </div>
    </section>
  </div>
</template>
