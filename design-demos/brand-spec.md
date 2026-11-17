# 仰恩大学迎新指南 · 线上基准与重构设计规范 (Design Context v2)

> 提炼自本仓库 `e:\yeu` 真实本地渲染结果（完整模式、简洁模式、`IntroOverlay` 开场动画）与 `app/assets/css/main.css`。

## 1. 线上已有审美 DNA（必须继承，不得破坏）
- **画布背景**：`#f7f8f6`（极浅暖灰绿，避免纯白刺眼，衬托纯白卡片层次）
- **卡片表面**：`#ffffff`，配合极克制发丝线 `1px solid #e5e8e4`（悬停 `rgba(23, 111, 70, 0.32)`）与微柔和阴影 `0 1px 2px rgba(15,23,42,0.03), 0 8px 24px -8px rgba(16,42,29,0.06)`
- **品牌主色**：森林绿 `#176f46`（Hover `#115536`，浅底徽章 `#ecf7f1` / `emerald-50`，文字 `#0f5132`）
- **低饱和功能色徽章体系**（线上四色点缀图标）：
  - 报到 / 清单（翡翠绿）：底 `#ecfdf5`，框/字 `#176f46`
  - 地图 / 导航（天青蓝）：底 `#eff6ff`，框/字 `#1d4ed8`
  - 网络 / 工具（浅堇紫）：底 `#f5f3ff`，框/字 `#6d28d9`
  - 快递 / 提醒（暖琥珀）：底 `#fffbeb`，框/字 `#b45309`
- **字体排印**：`"PingFang SC", "Microsoft YaHei", "Noto Sans CJK SC", system-ui, sans-serif`；标题粗重稳健 (`font-weight: 700~800`, 紧凑字距)，正文 `14px~15px` (`#52525b` zinc-600) 清爽易读，辅助说明 `12px~13px` (`#71717a`)。
- **图标体系**：统一使用 `1.75px` 细线 Lucide 风格矢量 SVG 图标，禁止使用杂乱 Emoji 替代功能图标。

## 2. 现有线上版真实痛点（本次首页重构突破口）
1. **完整模式缺少校园实景记忆点**：首屏大面积纯白留白（搜索区过高、4张常用卡片内部太空），手头优质的湖山航拍、手绘校园地图、宿舍实拍图完全没有在完整版首屏亮相。
2. **完整模式与简洁模式信息割裂**：简洁模式拥有焦点图、宿舍实拍、图文校园服务卡、入学三步编号条，但在桌面端单栏 `max-w-3xl` 拖出 3867px；完整模式结构清晰但视觉过于“素”。
3. **首屏信息触达效率可提升**：现有完整版首屏仅露出一半「按入学阶段查看 + 清单」，校内热线与服务导航全在第二屏，桌面端横向 1180px 空间尚未充分利用。

## 3. 真实本地可用视觉资产（相对路径：`../public/images/...`）
- Logo：`../public/images/brand/system-logo-mark-light.png`
- 航拍湖山主图：`../public/images/intro/yeu-campus-hero.webp`
- 手绘校园地图：`../public/images/posters/freshman-guide-campus-map.png`
- 宿舍实拍（普通 / 舒适）：`../public/images/panorama/ordinary-dorm-poster.jpg`、`../public/images/panorama/comfort-dorm-poster.jpg`
- 泉州美食与城市漫步：`../public/images/nearby/city-food.webp`、`../public/images/nearby/citywalk.webp`
