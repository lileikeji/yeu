<script setup lang="ts">
import { currentCohort } from '~~/shared/config/cohort'

useSeoMeta({
  title: '专业与学院查询',
  description: `查询${currentCohort}录取专业所属学院和住宿片区公开状态。`
})
</script>

<template>
  <HomeMajorLookup />
</template>
