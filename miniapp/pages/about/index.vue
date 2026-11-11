<script setup lang="ts">
import { onMounted } from 'vue'
import AppPage from '../../components/AppPage.vue'
import { trackMiniApp } from '../../services/http'
import { openExternal } from '../../utils/navigation'

function openFeedback(): void {
  trackMiniApp('feedback_open', '/pages/about/index', { target: 'feedback' })
  openExternal('https://yx.huiliyill.cn')
}

onMounted(() => trackMiniApp('page_view', '/pages/about/index'))
</script>

<template>
  <AppPage eyebrow="校园值班台" title="关于与反馈">
    <text class="t-title slogan">让找路和办事少绕一点。</text>
    <text class="t-body intro">值班台聚合公开的校园地点、指南、流程和通知。它不代替迎新系统、教务系统或学院审批，也不会要求你在这里输入账号、验证码或付款信息。</text>

    <view class="block">
      <view class="label-row">
        <text class="t-label">非官方声明</text>
      </view>
      <text class="t-body">本站是学生自发的信息整理页，不是仰恩大学官方系统。所有页面标注的来源、更新时间和核验状态都可以点开查看；学校有正式文件时，以正式文件为准。</text>
    </view>

    <view class="block">
      <view class="label-row">
        <text class="t-label">隐私说明</text>
      </view>
      <text class="t-body">小程序只读取公开内容，不收集账号、密码、验证码、身份证或付款信息。访问统计只记录页面路径、接口状态和机型类别这类匿名信息，用来判断哪些页面需要改进。</text>
    </view>

    <view class="block">
      <view class="label-row">
        <text class="t-label">内容时效</text>
      </view>
      <text class="t-body">遇到日期、费用、名额、宿舍和管理规则，请以学校当届通知、迎新系统和负责老师的说明为准。</text>
    </view>

    <view class="note note-pending feedback">
      <text class="t-item">反馈入口</text>
      <text class="t-body feedback-copy">记录页面标题、问题描述和可核验来源，再通过学校官方渠道或项目维护入口反馈。</text>
      <button class="btn btn-quiet btn-sm feedback-action" @click="openFeedback">复制维护入口</button>
    </view>

    <view class="note note-error warning">
      <text class="t-item">安全提醒</text>
      <text class="t-body warning-copy">不要把账号、验证码、银行卡、付款截图或个人证件发给陌生人。需要办理敏感事项时，直接从录取材料、学校官方公众号或校内系统进入。</text>
    </view>
  </AppPage>
</template>

<style scoped>
.slogan {
  margin-bottom: 18rpx;
}

.intro {
  color: var(--ink-soft);
}

.feedback {
  margin-top: 36rpx;
}

.feedback-copy {
  margin-top: 10rpx;
}

.feedback-action {
  width: 280rpx;
  margin-top: 20rpx;
}

.warning {
  margin-top: 24rpx;
}

.warning-copy {
  margin-top: 10rpx;
}
</style>
