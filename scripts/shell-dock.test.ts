/**
 * T-033 底部 dock 守门。
 *
 * 六条断言对应 tasks/T-033-dock-slim/spec.md §2 几何 / §3 动效 / §5 守门。
 * 每条都做过可红自证：把对应那处改坏（高度改 3rem、删掉 translateY(6px)、把 band 26 改成 0、
 * 去掉 mask-image、把面板 320ms 换成 280ms、把 push 签名换掉），对应用例立刻变红。
 */
import assert from 'node:assert/strict'
import { readFileSync } from 'node:fs'
import { resolve } from 'node:path'
import { test } from 'node:test'

const read = (path: string): string => readFileSync(resolve(path), 'utf8')

const css = read('app/assets/css/main.css')
const dock = read('app/components/ShellDock.vue')
const layout = read('app/layouts/default.vue')
const mapPage = read('app/pages/map/index.vue')
const judgePage = read('app/pages/judge/index.vue')

test('底部浮钮让位：不得写死 bottom-20，评委台选手按钮按 dock 实际高度计算', () => {
  // 80px 是 dock 瘦身前的旧值，带安全区的机型会被 96px 的 dock 盖住。
  assert.doesNotMatch(judgePage, /bottom-20/)
  assert.doesNotMatch(read('app/components/MapBusRoutePanel.vue'), /bottom-20/)
  assert.doesNotMatch(read('app/components/MapTransitPanel.vue'), /bottom-20/)
  // 评委台是 layout: false、没有底栏，混进 dock 变量只会造成「看起来在躲一个不存在的底栏」。
  assert.doesNotMatch(judgePage, /--mobile-nav-height|--mobile-dock-inset|--mobile-dock-extra/)
  assert.match(judgePage, /bottom-\[calc\(env\(safe-area-inset-bottom\)\+4\.625rem\)\]/)
})

test('顶栏 44px / 胶囊 52px / 地图块 114px 的几何都写在变量与组件里', () => {
  assert.match(css, /--header-height: 2\.75rem;/)
  assert.match(css, /--mobile-nav-height: 3\.25rem;/)
  assert.match(css, /--mobile-dock-inset: 0\.625rem;/)
  // md 档仍走 4.5rem（72px），桌面不受影响
  assert.match(css, /--header-height: 4\.5rem;/)
  assert.match(dock, /height: var\(--mobile-nav-height, 3\.25rem\);/)
  // 114px = 8 + 40 + 6 + 52
  assert.match(css, /--shell-dock-map-height: 6\.25rem/)
  assert.match(dock, /height: var\(--shell-dock-map-height, 6\.25rem\)/)
  assert.match(dock, /height: 2\.25rem/)
  assert.match(dock, /margin-bottom: 0\.25rem/)
})

test('两态互斥且导航行零位移：M 态 bottom 少 0.5rem、padding 多 0.5rem', () => {
  assert.match(dock, /isMapDock\.value \? 'shell-dock--map' : 'shell-dock'/)
  assert.match(dock, /\.shell-dock-root\.shell-dock--map \{/)
  // N 态 padding 0 + bottom inset；M 态 padding 0.5rem + bottom (inset - 0.5rem)
  assert.match(dock, /bottom: calc\(var\(--mobile-dock-inset, 0\.625rem\) - 0\.25rem \+ env\(safe-area-inset-bottom\)\);/)
  assert.match(dock, /padding: 0\.25rem/)
  // 导航行高度两态一致
  assert.match(dock, /grid-template-columns: repeat\(5, minmax\(0, 1fr\)\);/)
})

test('动效时长与曲线照 spec：进入 240ms、离开 180ms 延迟 60ms、收回 260ms 延迟 80ms', () => {
  assert.match(dock, /height 240ms cubic-bezier\(0\.22, 1, 0\.36, 1\)/)
  assert.match(dock, /height 180ms cubic-bezier\(0\.4, 0, 1, 1\) 60ms/)
  // 搜索行入场：跟 dock 一起长高（height/margin/transform 220ms），文字延后 100ms 才淡入，
  // 免得 0 高度里被压扁的字先冒出来（2026-11-26 加收起动效时一并调整）。
  assert.match(dock, /opacity 160ms linear 100ms/)
  assert.match(dock, /transform 220ms var\(--ease-sheet\),\s*visibility 0s linear 0s;/)
  assert.match(dock, /transform: translateY\(10px\) scale\(0\.98\);/)
  // 用户 2026-11-23：半屏/展开不再下沉位移（dock 就是面板底栏，留在原位）
  assert.doesNotMatch(dock, /transform: translateY\(6px\);/)
  assert.doesNotMatch(dock, /transform: translateY\(12px\);/)
  assert.match(dock, /transform 260ms var\(--ease-sheet\) 80ms/)
  // 面板自己的 320ms 曲线不许被这次改动碰
  assert.match(mapPage, /duration-\[320ms\] ease-\[var\(--ease-sheet\)\]/)
})

test('R2 收窄与不透明底色：块左右各 10px 内衬、dock 底色不透明（T-033 R7）', () => {
  assert.match(css, /--mobile-dock-inline: 0\.625rem;/)
  // 底部口径不动：N 态 bottom 仍算 inset，M 态 padding 0.5rem 的零位移契约不受影响
  assert.match(dock, /bottom: calc\(var\(--mobile-dock-inset, 0\.625rem\) \+ env\(safe-area-inset-bottom\)\);/)
  assert.match(dock, /right: var\(--mobile-dock-inline, 0\.625rem\);/)
  assert.match(dock, /left: var\(--mobile-dock-inline, 0\.625rem\);/)
  // T-033 R4：dock 不再有 glass 分支，表面恒为 95% 白，不许再出现透明底色
  // T-033 R7（F-44）：dock 底色改成不透明的 --surface，不再透出背后的文字与地图
  assert.doesNotMatch(dock, /255 255 255/)
  assert.match(dock, /background: var\(--surface\);/)
  // R6 起 .shell-dock-primary 未选中态合法地用 transparent（描边圆），这里只锁 dock 自己的表面
  assert.doesNotMatch(dock, /\.shell-dock-root\.shell-dock--map \{[^}]*background:\s*transparent/)
  // 用户 2026-11-23 两次口径（m02188 / m02192）：「跟 dock 栏合为一体」「还是没有缝呀」——
  // 底栏不再自己压一层底色 / 发丝线 / 圆角，而是完全融进面板玻璃；只保留贴底与不淡出。
  for (const state of ['half', 'expanded']) {
    const at = dock.indexOf(`.shell-dock-root.shell-dock--sheet-${state} {`)
    assert.ok(at > 0, `${state} 态规则缺失`)
    const block = dock.slice(at, at + 700)
    // 用户 2026-11-23 最终口径：「不论什么时候都要没缝」—— 两态都不许有顶边线。
    assert.doesNotMatch(block, /border-top: 1px solid/, `${state} 态画了顶边线（就是那道缝）`)
    assert.doesNotMatch(block, /box-shadow: (?!none)/, `${state} 态又给 dock 加了投影，等于第二条缝`)
    // 用户 2026-11-23：「我下面要圆角呀，不要和屏幕底部接触」—— 整块是浮起的卡片：
    // 底部离屏 --map-float-gap + 安全区，下两角 26px 收圆。
    // 底色必须是 transparent：表面只由 .map-glass-sheet 那一层 66% 玻璃画，两层各画一次会叠成 88%，
    // 接缝处出现一条亮度台阶（用户 2026-11-23「四角有异常」排查出来的双层叠加）。
    assert.match(block, /background: transparent;/, `${state} 态自己又画了一层底色，会和面板叠出亮度台阶`)
    assert.match(block, /border-radius: 0 0 26px 26px;/, `${state} 态下两角没有 26px 圆角`)
    assert.match(block, /bottom: calc\(var\(--map-float-gap, 0\.625rem\) \+ env\(safe-area-inset-bottom\)\);/, `${state} 态没离屏幕底部`)
    assert.doesNotMatch(block, /opacity: 0;/, `${state} 态又把 dock 淡出了`)
  }
  // 展开态：卡片收成导航行高度（52 + 上下 8 = 60），搜索行整条隐去；半屏保留搜索行
  assert.match(
    dock,
    /\.shell-dock-root\.shell-dock--sheet-expanded \{[\s\S]{0,200}?height: calc\(var\(--mobile-nav-height, 3\.25rem\) \+ 0\.5rem\);/,
    '展开态没把卡片收到 60px'
  )
  // 选择器表在中途插了 detached（浮卡视图），窗口放宽到 200 字符仍锁「同一条规则」
  assert.match(dock, /\.shell-dock-root\.shell-dock--sheet-expanded \.shell-dock-search,[\s\S]{0,200}?shell-dock--sheet-half \.shell-dock-search \{\s*height: 0;/)
  // 用户 2026-11-23 19:56：「就算在半屏的时候搜索框也应该隐藏」—— 两态都收起搜索行。
  // 用户 2026-11-26：「还有搜索框在别的面板弹出时的动画动效」—— 收法是缩高 + 下沉 + 淡出，不是硬切。
  assert.match(dock, /\.shell-dock-root\.shell-dock--sheet-half \.shell-dock-search \{\s*height: 0;/, '半屏没收起搜索行')
  assert.match(dock, /\.shell-dock--sheet-half \.shell-dock-search \{[\s\S]{0,400}?height 220ms var\(--ease-sheet\)/, '搜索行收起必须带高度过渡')
  assert.match(dock, /visibility 0s linear 220ms/, 'visibility 要延迟到缩完再关，动画期间照常绘制')
  assert.match(dock, /\.shell-dock-root\.shell-dock--sheet-half \{[\s\S]{0,400}?height: calc\(var\(--mobile-nav-height, 3\.25rem\) \+ 0\.5rem\);/, '半屏 dock 没收到导航行高度')
  // 面板侧：两态滚动区都要收在 dock 上沿（margin，而不是只留 padding），
  // 否则同玻璃 dock 会把文字透出来
  assert.match(mapPage, /\[data-sheet-state='half'\] \.shell-fade-bottom--map[\s\S]{0,300}?margin-bottom: calc\(var\(--mobile-nav-height, 3\.25rem\) \+ 0\.5rem\)/)
  assert.match(mapPage, /\[data-sheet-state='expanded'\] \.shell-fade-bottom--map[\s\S]{0,260}?margin-bottom: calc\(var\(--mobile-nav-height, 3\.25rem\) \+ 0\.5rem\)/)
  // 面板本体的下沿：离屏底 10px；下两角由面板自己收 26px —— dock 两态底色已改 transparent，
  // 表面只由面板画一次，所以圆角也必须挂在面板上（两处各画一次会叠出 88% 的亮度台阶）。
  assert.match(mapPage, /\[data-sheet-state='half'\] \.map-glass-sheet,[\s\S]{0,320}?bottom: calc\(var\(--map-float-gap, 0\.625rem\) \+ env\(safe-area-inset-bottom\)\)/)
  assert.match(mapPage, /\[data-sheet-state='half'\] \.map-glass-sheet,[\s\S]{0,420}?border-bottom-right-radius: 26px/)
  assert.doesNotMatch(mapPage, /rounded-\[26px\]/)
  // 面板与 dock 同宽：两个态下 aside 都要内收 --mobile-dock-inline
  assert.match(mapPage, /\[data-sheet-state='half'\] \.map-glass-sheet,[\s\S]{0,200}?right: var\(--mobile-dock-inline, 0\.625rem\)/)
})

test('搜索行定位钮：只渲染不持逻辑，aria-pressed 跟共享态、点击发 locate 命令', () => {
  assert.match(dock, /class="shell-search-locate"/)
  assert.match(dock, /:aria-pressed="dockTracking \? 'true' : 'false'"/)
  assert.match(dock, /:aria-label="dockTracking \? '停止实时定位' : '开启实时定位'"/)
  assert.match(dock, /:disabled="dockLocating"/)
  assert.match(dock, /i-lucide-locate-fixed/)
  assert.match(dock, /\.shell-search-locate \{[^}]*width: 2rem;/)
  // dock 只发命令：locate 交给页面执行
  assert.match(dock, /kind: 'locate', seq: dockCommand\.value\.seq \+ 1/)
  assert.match(dock, /'shell-dock-tracking'/)
  assert.match(dock, /'shell-dock-locating'/)
  // 页面执行侧：tracking 时关、否则开，并把两个 ref 回流给 dock
  assert.match(mapPage, /if \(kind === 'locate'\) \{/)
  assert.match(mapPage, /if \(tracking\.value\) toggleTracking\(\)/)
  assert.match(mapPage, /else locateUser\(\)/)
  assert.match(mapPage, /watch\(tracking, \(value\) => \{/)
  assert.match(mapPage, /watch\(locating, \(value\) => \{/)
})

test('底部内容隐化：mask-image 与 padding-bottom 同时存在（地图 124 / 其他 62）', () => {
  assert.match(css, /-webkit-mask-image: linear-gradient\(to bottom, #000 0, #000 calc\(100% - 84px\), transparent 100%\);/)
  assert.match(css, /mask-image: linear-gradient\(to bottom, #000 0, #000 calc\(100% - 84px\), transparent 100%\);/)
  assert.match(css, /padding-bottom: calc\(var\(--mobile-nav-height\) \+ var\(--mobile-dock-inset\)\);/)
  assert.match(css, /padding-bottom: 124px;/)
  assert.match(layout, /shell-fade-bottom/)
  assert.match(mapPage, /shell-fade-bottom--map/)
})

test('接入到位：layout 换成 ShellDock、12 处下游引用改到新变量、reduced-motion 全 0ms', () => {
  assert.match(layout, /aria-label="移动端主导航"/)
  assert.match(layout, /ShellDock/)
  // 旧通栏导航的固定类不该再出现
  assert.doesNotMatch(layout, /grid h-\[var\(--mobile-nav-height\)\] grid-cols-5/)
  // 旧高度值（4.5625rem）全库清零
  assert.doesNotMatch(css, /4\.5625rem/)
  // /map 地图铺到屏幕底：main.map-page 只减 header，不再减 nav/inset（否则 dock 下方留白条）
  assert.match(css, /main\.map-page \{\n {2}height: calc\(100vh - var\(--header-height\)\)/)
  assert.doesNotMatch(css, /calc\(100svh - var\(--header-height\) - var\(--mobile-nav-height\)/)
  for (const file of [
    'app/components/AppUpdateBanner.vue',
    'app/components/PwaUpdatePrompt.vue',
    'app/components/PublicPageViewStats.vue',
    // PlaceDetailsPanel 手机分支已删（T-028 A1），不再引用 dock 变量
    'app/pages/chat/index.vue',
    'app/pages/feedback.vue',
    'app/pages/guides/[slug].vue',
    'app/pages/checklist.vue',
    'app/components/student-rules/ZongceBonusCalculator.vue'
  ]) {
    const source = read(file)
    const needsDock = /(AppUpdateBanner|PwaUpdatePrompt|PublicPageViewStats|feedback|guides\/\[slug\])/.test(file)
    if (needsDock) {
      // 真正要躲开 dock 的浮层：必须同时用高度与内距两个变量，只写一个是旧写法。
      assert.match(source, /var\(--mobile-nav-height\)\s*\+\s*var\(--mobile-dock-inset\)/, file + ' 的下沉浮层必须同时用 --mobile-nav-height 与 --mobile-dock-inset')
    } else {
      // 吸顶 / 滚动锚点只跟顶栏有关，混进 dock 变量说明抄错了。
      assert.match(source, /var\(--header-height\)/, file + ' 应引用 --header-height')
      assert.doesNotMatch(source, /--mobile-dock-inset/, file + ' 不该依赖 dock 变量')
    }
  }
  // prefers-reduced-motion 下全部动效 0ms
  assert.match(dock, /@media \(prefers-reduced-motion: reduce\) \{/)
  assert.equal((dock.match(/0ms !important/g) ?? []).length >= 4, true)
})

test('水合门：dock 的 sheet 类挂载前恒为 collapsed，SSR 与客户端首帧同态（T-033 R3）', () => {
  assert.match(dock, /const dockHydrated = ref\(false\)/)
  assert.match(dock, /dockHydrated\.value \? sheetState\.value : 'collapsed'/)
  // class 必须走水合门；直接读 sheetState 会让客户端首帧带上 half，Vue 报 Hydration class mismatch
  assert.match(dock, /shell-dock--sheet-\$\{dockSheetState\.value\}/)
  assert.doesNotMatch(dock, /shell-dock--sheet-\$\{sheetState\.value\}/)
  assert.match(dock, /onMounted\(\(\) => \{\s*dockHydrated\.value = true/)
})

test('F-31 dock 不再接 WebGL 折射：无画布节点、无玻璃类，95% 表面全交给 CSS（T-033 R4）', () => {
  assert.doesNotMatch(dock, /useMapGlassRefraction/)
  assert.doesNotMatch(dock, /shell-dock-glass/)
  assert.doesNotMatch(dock, /shell-dock--glass/)
  assert.doesNotMatch(dock, /glassVisible/)
  // T-033 R7（F-44）：表面改成不透明的 --surface，95% 白退场
  assert.match(dock, /background: var\(--surface\);/)
  // 页面侧也不许再把折射状态写给 dock
  assert.doesNotMatch(mapPage, /shellDockGlass/)
  assert.doesNotMatch(mapPage, /'shell-dock-glass'/)
})

test('F-40 面板从按钮原点放大：origin 取 --sheet-origin-x、首帧 scale(0.62) + opacity 0、340ms 放大（T-046 R2）', () => {
  // R5 的 clip-path 写法已被用户否决（观感还是「从底下顶上来」），两条规则必须删干净
  assert.doesNotMatch(mapPage, /clip-path/, 'R5 的 clip-path 规则还留在页面里')
  assert.doesNotMatch(mapPage, /height: 110px !important;/, '面板仍靠钉高做 bloom，观感会是从底下顶上来')
  assert.match(
    mapPage,
    /\.map-workspace\[data-sheet-bloom='on'\] \.map-glass-sheet \{[\s\S]{0,240}?transform-origin: var\(--sheet-origin-x, 50%\) var\(--sheet-origin-y, 100%\);[\s\S]{0,200}?transform: translate3d\(var\(--sheet-tx, 0px\), var\(--sheet-ty, 24px\), 0\) scale\(var\(--sheet-scale, 0\.74\), var\(--sheet-scale-y, 0\.68\)\);[\s\S]{0,120}?opacity: 0;[\s\S]{0,80}?transition: none;/,
    '首帧没有缩到按钮原点（origin/scale/opacity 不全）'
  )
  assert.match(
    mapPage,
    /\.map-workspace\[data-sheet-bloom='off'\] \.map-glass-sheet \{[\s\S]{0,240}?transform: translate3d\(0, 0, 0\) scale\(1, 1\);[\s\S]{0,120}?opacity: 1;[\s\S]{0,320}?transform 560ms var\(--ease-spring-sheet\),[\s\S]{0,200}?opacity 200ms var\(--ease-fade\),[\s\S]{0,240}?height 320ms var\(--ease-sheet\);/,
    '放大相缺 340ms transform / 240ms opacity，或把面板自己的 320ms 高度过渡冲掉了'
  )
  assert.match(mapPage, /const sheetBlooming = ref\(false\)/)
  assert.match(mapPage, /:data-sheet-bloom="sheetBlooming \? 'on' : 'off'"/)
  // Tailwind v4：工具类在 @layer utilities 里，无层级规则优先于任何层 —— 进了 utilities 层就会被 duration-[320ms] 抢走高度
  // 直接检查 utilities 块的正文，而不是按字符距离猜——相邻规则一多（叮叮车让位 CSS）就会误判
  const utilitiesBlocks = [...mapPage.matchAll(/@layer utilities \{[\s\S]*?\r?\n\}/g)].map(match => match[0])
  assert.ok(utilitiesBlocks.length > 0, '页面里找不到 @layer utilities 块')
  for (const block of utilitiesBlocks) {
    assert.doesNotMatch(block, /data-sheet-bloom/, 'bloom 规则进了 utilities 层，切换瞬间拿不到最终高度')
  }
  // 只在离散切换 bloom：拖拽松手、bus 视图、水合未完成都跳过
  assert.match(mapPage, /if \(previous !== 'collapsed' \|\| state === 'collapsed'\) return/)
  assert.match(mapPage, /if \(Date\.now\(\) - sheetDragEndedAt < 240\) return/)
  assert.match(mapPage, /if \(mapSheetView\.value === 'bus'\) return/)
  // reduce 下直接到位，不许先缩再放大
  assert.match(mapPage, /window\.matchMedia\?\.\('\(prefers-reduced-motion: reduce\)'\)/)
  // 面板自己的 320ms 曲线未被这次改动碰
  assert.match(mapPage, /duration-\[320ms\] ease-\[var\(--ease-sheet\)\]/)
})

test('F-42 五槽统一：38px 图标盒 + 22px 图标 + label 常显 + 全站只留当前页一个实心墨圆（T-033 R7）', () => {
  // 地图槽不再有 46px 实心/描边特例
  assert.doesNotMatch(dock, /shell-dock-primary/)
  assert.doesNotMatch(dock, /shell-dock-slot--primary/)
  assert.doesNotMatch(dock, /46px/)
  // label 一律常显（R6 的视觉隐藏撤销）
  assert.doesNotMatch(dock, /\.shell-dock-label \{[^}]*visibility: hidden/)
  assert.doesNotMatch(dock, /\.shell-dock-label \{[^}]*display: none/)
  // 搜索行收起不再走 display:none（用户 2026-11-26 要动效）——全文件不许再用这招
  assert.equal((dock.match(/display: none/g) ?? []).length, 0)
  assert.match(dock, /\.shell-dock--sheet-(expanded|half) \.shell-dock-search \{\s*height: 0;/)
  assert.match(dock, /\.shell-dock-icon \{[^}]*width: 38px;[^}]*height: 38px;/)
  assert.match(dock, /\.shell-dock-icon \{[^}]*background: transparent;/)
  assert.match(dock, /\.shell-dock-slot--active \.shell-dock-icon \{\s*background: var\(--ink\);\s*color: var\(--surface\);/)
  assert.match(dock, /\.shell-dock-slot--active \.shell-dock-label \{\s*color: var\(--ink\)/)
  // 单槽模板：一个 v-for、一份 aria-current、一个 22px 槽图标
  assert.equal(dock.match(/:aria-current="/g)?.length, 1)
  assert.match(dock, /v-for="item in props\.items"/)
  assert.doesNotMatch(dock, /v-if="item\.to === '\/map'"/)
  assert.equal(dock.match(/class="size-\[22px\]"/g)?.length, 2)
  assert.match(dock, /<span class="shell-dock-icon">[\s\S]{0,140}?class="size-\[22px\]"/)
})

test('F-42 之二：/login 也算「我的」，回跳登录页不丢选中（T-033 R7）', () => {
  assert.match(layout, /prefix: '\/login', key: 'me'/)
  assert.match(layout, /prefix: '\/me', key: 'me'/)
  assert.match(layout, /prefix: '\/feedback', key: 'me'/)
})

test('F-43 收起＝一相 CSS 过渡：缩向右下角那枚箭头（m06190）', () => {
  assert.match(mapPage, /type SheetCollapsePhase = 'off' \| 'on'/)
  assert.match(mapPage, /:data-sheet-collapse="sheetCollapsePhase"/)
  const at = mapPage.indexOf('[data-sheet-collapse=\'on\']')
  assert.ok(at > 0, '收起相位缺失：面板会直接塌掉')
  const rule = mapPage.slice(at, at + 640)
  // 原点必须是底栏右下角那枚箭头的中心，而不是最后一次指针位置
  assert.match(rule, /transform-origin: var\(--sheet-origin-x, 50%\) var\(--sheet-origin-y, 100%\);/)
  // 液体感：纵横两轴不同缩放（挤出形变）+ 圆角同时收，opacity 延后才归零
  assert.match(rule, /scale\(var\(--sheet-exit-scale, 0\.12\), var\(--sheet-exit-scale-y, 0\.12\)\)/)
  assert.match(rule, /opacity: 0;/)
  assert.match(rule, /border-radius: 18px;/)
  assert.match(rule, /transform 460ms var\(--ease-liquid-out\),/)
  // 淡出只留末尾 150ms（m06662：全程淡＝生硬，液体感靠形变而不是透明度）
  assert.match(rule, /opacity 140ms linear 330ms,/)
  // 曲线本身必须是 linear() 弹簧（m06662），且只定义一处
  assert.equal((mapPage.match(/--ease-spring-sheet:/g) ?? []).length, 1)
  assert.match(mapPage, /--ease-spring-sheet: linear\(0, 0\.1281 3%, /)
  assert.doesNotMatch(mapPage, /cubic-bezier\(0\.(22|36)/, '面板进出还留着旧的贝塞尔曲线')
  // 稳态那条权重更高、实际生效，曲线必须是弹簧（否则 bloom 会被它顶回 --ease-sheet）
  assert.match(mapPage, /\[data-sheet-bloom='off'\]\[data-sheet-collapse='off'\] > aside\.map-glass-sheet \{\s*transition:[\s\S]{0,200}?transform 560ms var\(--ease-spring-sheet\),/)
  // 收起期间高度钉住（--sheet-collapse-h）：height 若同时过渡到 0，bottom 锚定会让顶边下滑 = 「往下沉」。
  assert.doesNotMatch(rule, /height \d+ms var\(--ease-sheet\)/)
  assert.match(mapPage, /height: var\(--sheet-collapse-h, 326px\) !important;/)
  // 高度落 0 仍写在 utilities 层（!h-0 也在这一层且 important）
  assert.match(mapPage, /@layer utilities \{[\s\S]{0,260}?\[data-sheet-collapse='on'\][\s\S]{0,120}?height: var\(--sheet-collapse-h, 326px\) !important;/)
  // 不再有 rAF / 定时器三相位
  assert.doesNotMatch(mapPage, /sheetCollapseFrame|sheetCollapseTimer|teardownSheetCollapse/)
  // 收起高度由收起那一刻量出（sheetCollapseHeight），不是写死 326
  assert.match(mapPage, /const sheetCollapseHeight = ref<number \| null>\(null\)/)
  // 跳过条件：reduce / 拖拽松手 240ms / 叮叮车视图
  assert.ok((mapPage.match(/prefers-reduced-motion: reduce/g) ?? []).length >= 2, '收起少了 reduce 短路')
  assert.match(mapPage, /mapSheetView\.value === 'bus'/)
  assert.match(mapPage, /Date\.now\(\) - sheetDragEndedAt < 240/)
})
test('F-47 面板动效原点跟着指针走：--sheet-origin-x / --sheet-scale / pointerdown 记录（T-046 R2）', () => {
  assert.match(mapPage, /const sheetMotionAnchor = shallowRef<\{ x: number, y: number \} \| null>\(null\)/)
  assert.match(mapPage, /function rememberSheetMotionAnchor\(event: PointerEvent\): void/)
  assert.match(mapPage, /window\.addEventListener\('pointerdown', rememberSheetMotionAnchor, \{ capture: true, passive: true \}\)/)
  assert.match(mapPage, /function syncSheetMotionOrigin\(anchor\?: \{ x: number, y: number \} \| null\): void/)
  // 收起原点改为纯 CSS 常量（右下角箭头中心），不再读最后一次指针位置（m06190）
  assert.match(mapPage, /syncSheetMotionOrigin\(sheetBloomAnchor\.value \?\? sheetMotionAnchor\.value\)/)
  // 原点/缩放从 workspace 变量下发，TS 常量与 CSS 变量同值
  assert.match(mapPage, /'--sheet-origin-x': sheetOriginCss, '--sheet-origin-y': sheetOriginYCss/)
  assert.match(mapPage, /'--sheet-scale': String\(SHEET_MOTION_SCALE\)/)
  // 只剩入场两态用它（收起改成纯 CSS 常量原点）
  assert.equal((mapPage.match(/transform-origin: var\(--sheet-origin-x, 50%\) var\(--sheet-origin-y, 100%\);/g) ?? []).length, 3)
  // 入场只在 bloom on 用一次（两轴缩放，0.9 / 0.82）；收起同样一次（0.12 / 0.12）
  assert.equal((mapPage.match(/scale\(var\(--sheet-scale, 0\.74\), var\(--sheet-scale-y, 0\.68\)\)/g) ?? []).length, 1)
  assert.equal((mapPage.match(/scale\(var\(--sheet-exit-scale, 0\.12\), var\(--sheet-exit-scale-y, 0\.12\)\)/g) ?? []).length, 1)
  // 旧写法（固定 84px origin + 0.86 缩放）必须清干净：缩放差只有 14%，用户读成「往底下沉」
  assert.doesNotMatch(mapPage, /transform-origin: 50% calc\(100% - 84px\);/)
  assert.doesNotMatch(mapPage, /transform: scale\(0\.86\);/)
})

test('F-46a 桌面端清掉底部渐隐 mask（T-033 R8 · CR-1）', () => {
  // 手机仍要渐隐：基础规则原样保留
  assert.match(css, /^ {2}-webkit-mask-image: linear-gradient\(to bottom, #000 0, #000 calc\(100% - 84px\), transparent 100%\);$/m)
  assert.match(css, /@media \(min-width: 768px\) \{\n {2}\.shell-fade-bottom \{\n {4}-webkit-mask-image: none;\n {4}mask-image: none;\n {2}\}/)
  // 地图页的全关规则不能被顺手删掉
  assert.match(css, /\.shell-fade-bottom--map \{[^}]*-webkit-mask-image: none;/)
})

test('F-46b 输入法组词期间不发布中间态（T-033 R8 · CR-2）', () => {
  assert.match(dock, /const searchIsComposing = ref\(false\)/)
  assert.match(dock, /function onSearchCompositionStart\(\): void \{\n {2}searchIsComposing\.value = true/)
  assert.match(dock, /function onSearchCompositionEnd\(event: Event\): void \{\n {2}searchIsComposing\.value = false\n {2}onSearchInput\(event\)/)
  assert.match(dock, /function onSearchInput\(event: Event\): void \{\n {2}if \(searchIsComposing\.value\) return/)
  assert.match(dock, /function clearSearch\(\): void \{\n {2}searchQuery\.value = ''\n {2}searchIsComposing\.value = false/)
  assert.match(dock, /@compositionstart="onSearchCompositionStart"/)
  assert.match(dock, /@compositionend="onSearchCompositionEnd"/)
})

test('F-46c 展开态 dock 对键盘不可达（T-033 R8 · CR-3）', () => {
  // 状态源必须是水合门后的 dockSheetState，退回裸 sheetState 会再出 hydration mismatch
  assert.match(dock, /const dockInert = computed\(\(\) => isMapDock\.value && dockSheetState\.value === 'expanded'\)/)
  assert.doesNotMatch(dock, /dockInert = computed\(\(\) => isMapDock\.value && sheetState\.value === 'expanded'\)/)
  assert.match(dock, /:inert="dockInert"/)
  assert.match(dock, /:aria-hidden="dockInert \? 'true' : undefined"/)
  const inertAt = dock.indexOf('watch(dockInert')
  assert.ok(inertAt > 0, '缺少 dockInert 的焦点迁移 watch')
  const inertBlock = dock.slice(inertAt, inertAt + 240)
  assert.match(inertBlock, /document\.activeElement/)
  assert.match(inertBlock, /el\.closest\('\.shell-dock-root'\)/)
  assert.match(inertBlock, /\.blur\(\)/)
})

test('F-44 dock 不透明 + 折射态只由 WebGL2 画（CSS 不再叠白纱/blur）', () => {
  assert.doesNotMatch(dock, /backdrop-filter: blur\(18px\)/)
  const baseAt = mapPage.indexOf('.map-workspace .map-glass-sheet {')
  assert.ok(baseAt > 0, '面板基础规则不存在')
  const base = mapPage.slice(baseAt, baseAt + 260)
  assert.match(base, /background: color-mix\(in srgb, var\(--surface\) 96%, transparent\);/)
  assert.match(base, /backdrop-filter: blur\(2px\) saturate\(1\.05\);/)
  const refractAt = mapPage.indexOf('.map-workspace .map-glass-sheet.map-glass-refracting {')
  if (refractAt > 0) {
    const refract = mapPage.slice(refractAt, refractAt + 300)
    // 2026-11-26 用户「我要把折射都改为 webgl2」：折射态的底色与雾化都在着色器里，
    // CSS 白纱一留，WebGL2 弯折出来的底图就被压平，看起来像没有折射。
    assert.match(refract, /background: transparent;/)
    assert.match(refract, /backdrop-filter: none;/)
  }
})

test('浮卡视图（叮叮车 / 附近活动）的 dock 不跟着透明：底栏回白底、只收起搜索行', () => {
  // 用户 2026-11-24 截图：打开叮叮车面板后底栏变透明、底图透上来。叮叮车面板是独立浮卡、
  // 不到 dock 上沿，所以只有「贴 dock 的地点面板」才配透明。
  const block = dock.match(/\.shell-dock-root\.shell-dock--sheet-detached \{[\s\S]*?\}/)?.[0] ?? ''
  assert.ok(block, '缺少 .shell-dock--sheet-detached 规则')
  assert.match(block, /background: var\(--surface\);/, '叮叮车视图 dock 必须回不透明底')
  assert.doesNotMatch(block, /background: transparent/, '透明会让底图从底栏透上来')
  assert.match(block, /height: calc\(var\(--mobile-nav-height, 3\.25rem\) \+ 0\.5rem\)/, '只收起搜索行')
  assert.match(block, /border-radius: 24px;/, '独立浮卡状态 dock 自己收圆角')
  assert.match(dock, /\.shell-dock-root\.shell-dock--sheet-detached \.shell-dock-search,/, '搜索行要一起隐藏')
  assert.match(mapPage, /view === 'bus' \|\| view === 'activity' \? 'detached' : state/, '页面必须把叮叮车与附近活动都映射成 dock 的第四态')
})

test('F-51 dock 让位量按变量相减，不写死旧几何（100 − 52 = 48px）', () => {
  const at = dock.indexOf('function syncDockExtra()')
  assert.ok(at > 0, '缺少 syncDockExtra')
  const body = dock.slice(at, at + 420)
  assert.match(body, /--mobile-dock-extra/)
  assert.match(
    body,
    /calc\(var\(--shell-dock-map-height, 6\.25rem\) - var\(--mobile-nav-height, 3\.25rem\)\)/,
    '让位量必须由两个壳层变量相减得出'
  )
  assert.doesNotMatch(body, /'3\.875rem'/, '旧的 62px 常量会把浮层顶高 14px')
})

test('F-52 进页面默认收起不播动效：抬起钮只认真实手势，初始 half 不跑收起相位', () => {
  // 用户 2026-11-26「切换或者打开这个页面的时候面板不能呈现展开态或者收回去」：
  // ① 客户端导航进 /map 时，挂载把初始 half 落成 collapsed 会触发 watcher 播收起动效 —— 首帧先被钉成 326 再缩没；
  // ② dev 的画布工具会合成 click 打到 dock 的抬起钮（isTrusted=false），面板就自己弹开。
  const raiseAt = dock.indexOf('function raiseSheet(')
  assert.ok(raiseAt > 0, '缺少 raiseSheet')
  const raiseBody = dock.slice(raiseAt, raiseAt + 500)
  assert.match(raiseBody, /if \(ev && !ev\.isTrusted\) return/, '抬起钮只能被真实手势触发')
  assert.match(mapPage, /const skipInitialSheetCollapse = ref\(false\)/, '缺少首帧跳过收起相位的开关')
  const flagAt = mapPage.indexOf('skipInitialSheetCollapse.value = true')
  assert.ok(flagAt > 0, '挂载时没有设置首帧开关')
  assert.ok(flagAt < mapPage.indexOf('sheetHydrated.value = true', flagAt), '开关必须先于水合打开设好')
  assert.match(mapPage, /if \(skipInitialSheetCollapse\.value\) \{\r?\n\s+skipInitialSheetCollapse\.value = false\r?\n\s+return\r?\n\s+\}/, '收起 watcher 必须消费这个开关')
})
