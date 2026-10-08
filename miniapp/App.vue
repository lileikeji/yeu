<script setup lang="ts">
</script>

<template>
  <view class="app-root">
    <slot />
  </view>
</template>

<style>
/* 与网页端 app/assets/css/main.css 对齐的绿色主色，页面底色用米黄纸张调。 */
:root,
page {
  --paper: #f8f4e9;
  --paper-deep: #efe8d8;
  --surface: #fffdf8;
  --surface-sunk: #f3ecdd;
  --ink: #23281f;
  --ink-soft: #39402f;
  --muted: #6b7263;
  --line: #e6decb;
  --line-strong: #d6cbb2;
  --teal: #176f46;
  --teal-dark: #125a3a;
  --teal-soft: #e8f3ec;
  --teal-tint: #f1f8f3;
  --brick: #b4232c;
  --brick-soft: #fbe9e7;
  --mustard: #a1620a;
  --mustard-soft: #fbf0d4;
  --on-teal: #ffffff;
  --disabled-ink: #a29a86;
  --disabled-surface: #ece5d6;
  --shadow-card: 0 1rpx 2rpx 0 rgba(45, 40, 28, .04);
}

page {
  background: var(--paper);
  color: var(--ink);
  font-family: "PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif;
  font-size: 28rpx;
  line-height: 1.55;
  -webkit-font-smoothing: antialiased;
}

text,
button,
input,
textarea {
  font-family: inherit;
  font-size: 28rpx;
  font-variant-numeric: tabular-nums;
}

.app-root {
  box-sizing: border-box;
  min-height: 100vh;
  background: var(--paper);
}

/* —— 文字层级 —— */
.t-display { display: block; color: var(--ink); font-size: 46rpx; font-weight: 700; line-height: 1.25; letter-spacing: -.01em; }
.t-title { display: block; color: var(--ink); font-size: 38rpx; font-weight: 700; line-height: 1.3; }
.t-section { display: block; color: var(--ink); font-size: 34rpx; font-weight: 700; line-height: 1.35; }
.t-item { display: block; color: var(--ink); font-size: 30rpx; font-weight: 600; line-height: 1.4; }
.t-body { display: block; color: var(--ink-soft); font-size: 28rpx; line-height: 1.6; }
.t-meta { display: block; color: var(--muted); font-size: 24rpx; line-height: 1.45; }
.t-label {
  display: inline-block;
  color: var(--muted);
  font-size: 24rpx;
  font-weight: 700;
  line-height: 1.4;
}

/* —— 分隔线与容器 —— */
.rule { height: 1rpx; background: var(--line); }
.block { padding: 28rpx 0; border-top: 1rpx solid var(--line); }
.block:first-child { border-top: 0; padding-top: 0; }
.label-row { display: flex; align-items: center; }
.card { padding: 28rpx; border: 1rpx solid var(--line); border-radius: 16rpx; background: var(--surface); box-sizing: border-box; }
/* 列表统一成网页端 surface-panel 的卡片堆叠，而不是裸行分隔线。 */
.list-stack { display: grid; gap: 16rpx; }
.list-card { padding: 24rpx 26rpx; border: 1rpx solid var(--line); border-radius: 16rpx; background: var(--surface); box-sizing: border-box; }
.card-sunk { padding: 28rpx; border-radius: 16rpx; background: var(--surface-sunk); box-sizing: border-box; }

/* 状态条：只用于待确认 / 错误。 */
.note { padding: 22rpx 26rpx; border-radius: 12rpx; background: var(--surface); box-sizing: border-box; }
.note-pending { background: var(--mustard-soft); }
.note-error { background: var(--brick-soft); }
.note-calm { background: var(--teal-soft); }

/* —— 按钮 —— */
button { box-sizing: border-box; margin: 0; }
button::after { border: 0; }

.btn { display: block; min-height: 88rpx; padding: 0 32rpx; border-radius: 12rpx; font-size: 30rpx; font-weight: 600; line-height: 88rpx; }
.btn-primary { color: var(--on-teal); background: var(--teal); }
.btn-quiet { color: var(--teal-dark); background: var(--teal-soft); }
.btn-outline { border: 1rpx solid var(--line); color: var(--ink); background: var(--surface); }
.btn-link { display: inline-block; min-height: 0; padding: 8rpx 0; border: 0; color: var(--teal-dark); background: transparent; font-size: 26rpx; font-weight: 600; line-height: 1.5; }
.btn-sm { min-height: 72rpx; padding: 0 26rpx; font-size: 28rpx; line-height: 72rpx; }
button:active { opacity: .72; }

button[disabled] {
  color: var(--disabled-ink) !important;
  background: var(--disabled-surface) !important;
  opacity: 1;
}

/* 小角标：中文分类等。 */
.chip { display: inline-block; padding: 4rpx 14rpx; border-radius: 8rpx; color: var(--teal-dark); background: var(--teal-soft); font-size: 22rpx; font-weight: 600; line-height: 1.6; }
.chip-plain { display: inline-block; padding: 4rpx 12rpx; border: 1rpx solid var(--line); border-radius: 8rpx; color: var(--muted); font-size: 22rpx; line-height: 1.6; }
</style>
