<script setup lang="ts">
import { portalState } from '../stores/portalStore';

defineProps<{
  open: boolean;
}>();

const emit = defineEmits<{
  close: [];
}>();
</script>

<template>
  <div v-if="open" class="drawer-backdrop" @click.self="emit('close')">
    <aside class="drawer-panel" aria-label="YEU 联调接口与数据结构监视器">
      <div style="display: flex; align-items: center; justify-content: space-between; gap: 0.6rem;">
        <div>
          <strong style="font-size: 1rem;">YEU 联立接口追踪</strong>
          <div style="font-size: 0.76rem; color: #b7aba0; margin-top: 0.15rem;">
            实时记录前后台操作对应的 yeu 后端端点与数据表
          </div>
        </div>
        <button
          type="button"
          class="trace-btn"
          @click="emit('close')"
        >
          关闭
        </button>
      </div>

      <div style="background: #1f1b18; border: 1px solid #352e28; border-radius: 8px; padding: 0.75rem; font-size: 0.78rem;">
        <div style="font-weight: 700; margin-bottom: 0.35rem; color: #f7c7c9;">
          E:\yeu 系统对接清单
        </div>
        <ul style="margin: 0; padding-left: 1.1rem; color: #d6cbc1; display: grid; gap: 0.25rem;">
          <li>协会主体 & 部门配置：<code>contents (slug='computer-association')</code></li>
          <li>活动发布与审核：<code>activities (organizationContentId)</code></li>
          <li>正式纳新与 Word 导出：<code>recruit_forms</code> / <code>recruit_submissions</code></li>
          <li>动态 & 项目扩展：建议沿用 <code>contents (kind='notice')</code> 与 <code>metadataJson</code></li>
        </ul>
      </div>

      <div style="display: grid; gap: 0.65rem;">
        <div
          v-for="log in portalState.apiLogs"
          :key="log.id"
          style="background: #1d1916; border: 1px solid #312a24; border-radius: 8px; padding: 0.7rem;"
        >
          <div style="display: flex; align-items: center; gap: 0.45rem; flex-wrap: wrap; font-family: var(--mono); font-size: 0.74rem;">
            <span style="color: #34d399;">{{ log.status }}</span>
            <span style="color: #fbbf24; font-weight: 700;">{{ log.method }}</span>
            <span style="color: #f3ece4;">{{ log.endpoint }}</span>
            <span style="color: #8f8479; margin-left: auto;">{{ log.timestamp }}</span>
          </div>
          <div style="font-size: 0.8rem; color: #d6cbc1; margin: 0.32rem 0;">
            {{ log.summary }}
          </div>
          <div style="font-size: 0.72rem; color: #9c8f83; margin-bottom: 0.38rem;">
            映射表：<code>{{ log.yeuTarget }}</code>
          </div>
          <pre style="font-size: 0.72rem; max-height: 150px;">{{ JSON.stringify(log.payload, null, 2) }}</pre>
        </div>
      </div>
    </aside>
  </div>
</template>
