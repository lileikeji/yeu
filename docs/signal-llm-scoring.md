# 热点内容的模型评分（可选）

默认关闭。不设 `SIGNAL_LLM_SCORING=1` 时，热点排序完全由规则打分决定，行为与之前一致。

## 为什么是两次评分

单次模型分数抖动大。同一篇打两次取平均，任一次失败算「未评分」而不是「不合格」——
未评分的内容照常展示，等网关恢复后再补评，避免一次网络抖动把通知藏掉。

## 门槛

按信源分级取门槛（`server/modules/signal/llm-score.ts` 的 `LLM_TIER_THRESHOLDS`）：

| 分级 | 含义 | 门槛 |
|---|---|---|
| A | 官方通知、教务/学工直发 | 55 |
| B | 学院、部门站点 | 62 |
| C | 转载、媒体稿 | 70 |

**这三个数是初值，不是实测结论。** 定值前先跑校准：

```bash
npx tsx scripts/score-signal-llm.ts --limit 40   # 打分并写 data/runtime/signal-llm-scores.json
npx tsx scripts/score-signal-llm.ts --report     # 按门槛看通过率与均分
```

## 额度

`runtimeConfig.signalLlmMonthlyCallLimit`（默认 3000）按自然月计，落在缓存文件的 `usage` 里。
额度不足时脚本停止并打印剩余次数；构建快照只读缓存，不触发调用。

## 环境变量

| 变量 | 作用 |
|---|---|
| `SIGNAL_LLM_SCORING=1` | 打开评分闸门（构建时读缓存淘汰低分事件） |
| `SIGNAL_LLM_MODEL` | 覆盖模型名，默认跟随 `aiGatewayModel` |
| `SIGNAL_LLM_MONTHLY_CALL_LIMIT` | 月度调用上限 |
| `SIGNAL_LLM_CACHE_PATH` | 评分缓存路径，默认 `data/runtime/signal-llm-scores.json` |

网关地址与密钥沿用助手模块的 `aiGatewayBaseUrl` / `aiGatewayApiKey`，不另配一套。
