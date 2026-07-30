# 2026 新生手册导入说明

- 文件：`public/media/handbooks/yeu-freshman-handbook-2026.pdf`
- 标题：仰恩大学新生手册 2026
- 署名：阿杰
- 性质：学生整理资料，不是学校官方通知
- 导入：`pnpm exec tsx scripts/import-freshman-handbook.ts`

导入会保存完整 PDF 正文、按页建立学生经验检索条目，并把自动切分的知识声明放入审核队列。报到地点、票价、快递站点、缴费和军训安排等易变化内容不能覆盖学校官网原文或已审核站内资料。

手册中的 5 张校园实拍图已提取到 `public/images/freshman-handbook-2026/`，来源页码和替代文本见同目录 `manifest.json`。
