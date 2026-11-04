#!/usr/bin/env node
// 在生产服务器上构建是本项目最贵的一次错误判断：
// 那台机器 4 核 / 3.6G，还要同时跑 50+ 个站点；pnpm build 单次 40 分钟起，
// 中途会被 OOM 杀掉（exit 137），期间 load 上到 10，公开接口被拖慢。
// 本机 16 核只要 105 秒，产物跨平台一致，只有两个原生二进制要按平台替换。
//
// 所以构建入口直接拒绝低配机器，避免"文档写着别做、但脚本还是照做"。
// 确需在低配机器上构建（例如云端 CI 跑构建阶段），显式设 ALLOW_LOW_SPEC_BUILD=1。

import os from 'node:os'

if (process.env.ALLOW_LOW_SPEC_BUILD === '1') {
  process.exit(0)
}

const cpus
  = typeof os.availableParallelism === 'function'
    ? os.availableParallelism()
    : os.cpus().length
const memGiB = os.totalmem() / 1024 ** 3

const MIN_CPUS = 8
const MIN_MEM_GIB = 8

if (cpus >= MIN_CPUS && memGiB >= MIN_MEM_GIB) {
  process.exit(0)
}

console.error(
  [
    `拒绝在这台机器上构建：${cpus} 核 / ${memGiB.toFixed(1)}G 内存（要求 ≥ ${MIN_CPUS} 核 / ${MIN_MEM_GIB}G）。`,
    '',
    '在生产服务器上构建的实测代价：',
    '  · 单次 40 分钟起（本机同代码 105 秒）',
    '  · 中途 OOM 被杀，pnpm 只打 ELIFECYCLE，不显式报错',
    '  · 构建期间 load 到 10 以上，同机 50+ 站点一起变慢',
    '',
    '正确做法是「本机出制品、服务器只解包切换」：',
    '  1. 本机：bash scripts/build-linux-artifact.sh',
    '  2. 服务器：bash /data/yeu-build/deploy-incoming.sh',
    '整套 35–90 秒，含备份、冒烟、失败回滚。',
    '',
    '确实需要在这台机器上构建（例如云端 CI 的构建阶段），先设 ALLOW_LOW_SPEC_BUILD=1。',
  ].join('\n'),
)
process.exit(1)
