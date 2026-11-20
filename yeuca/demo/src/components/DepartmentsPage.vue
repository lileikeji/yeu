<script setup lang="ts">
import { portalState } from '../stores/portalStore';

const emit = defineEmits<{
  joinDept: [deptName: string];
}>();
</script>

<template>
  <div>
    <section class="subpage-head">
      <div class="wrap">
        <h1>部门与方向</h1>
        <p>
          目前五个部门并行运作，支持多选意向报名。部门设置、负责人和招新状态均在后台直接管理，改动后实时同步全站。
        </p>
      </div>
    </section>

    <section class="page-section">
      <div class="wrap" style="display: grid; gap: 1rem;">
        <article
          v-for="dept in portalState.departments"
          :key="dept.id"
          class="card"
          :style="dept.isFeatured ? 'border-color: #b7cae4;' : ''"
        >
          <div class="card-top">
            <div style="display: flex; align-items: center; gap: 0.55rem; flex-wrap: wrap;">
              <span class="pill" :class="dept.isFeatured ? 'pill-ai' : ''">{{ dept.code }}</span>
              <h2 style="margin: 0; font-size: 1.18rem;">{{ dept.name }}</h2>
              <span v-if="dept.acceptingRecruit" class="pill pill-ok">招新开放</span>
              <span v-else class="pill">暂不招新</span>
            </div>
            <button
              v-if="dept.acceptingRecruit"
              class="btn btn-primary btn-sm"
              type="button"
              @click="emit('joinDept', dept.name)"
            >
              选这个部门报名
            </button>
          </div>

          <p style="color: var(--ink);">{{ dept.summary }}</p>

          <div class="cards-2" style="margin-top: 0.2rem;">
            <div style="background: var(--bg); padding: 0.75rem 0.9rem; border-radius: 8px; border: 1px solid var(--border);">
              <strong style="font-size: 0.84rem; display: block; margin-bottom: 0.35rem;">核心实践方向</strong>
              <ul style="margin: 0; padding-left: 1.1rem; font-size: 0.86rem; color: var(--muted);">
                <li v-for="item in dept.focusList" :key="item">{{ item }}</li>
              </ul>
            </div>

            <div style="background: var(--bg); padding: 0.75rem 0.9rem; border-radius: 8px; border: 1px solid var(--border);">
              <strong style="font-size: 0.84rem; display: block; margin-bottom: 0.35rem;">新人说明与常用技术</strong>
              <p style="font-size: 0.85rem; margin: 0 0 0.5rem;">{{ dept.recruitDesc }}</p>
              <div class="tag-row">
                <span v-for="t in dept.tools" :key="t" class="pill">{{ t }}</span>
              </div>
            </div>
          </div>

          <div class="muted" style="font-size: 0.82rem; display: flex; justify-content: space-between; flex-wrap: wrap; gap: 0.5rem;">
            <span>近期分享：{{ dept.recentTopic }}</span>
            <span>负责人：{{ dept.lead }}</span>
          </div>
        </article>
      </div>
    </section>
  </div>
</template>
