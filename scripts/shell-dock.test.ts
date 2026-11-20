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
  assert.match(dock, /opacity 200ms linear 60ms/)
  assert.match(dock, /transform 200ms cubic-bezier\(0\.22, 1, 0\.36, 1\) 60ms/)
  assert.match(dock, /transform: translateY\(10px\) scale\(0\.98\);/)
  assert.match(dock, /transform: translateY\(6px\);/)
  assert.match(dock, /transform: translateY\(12px\);/)
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
  // 半屏下沉 6px、展开淡出并让出点击
  assert.match(dock, /\.shell-dock-root\.shell-dock--sheet-half \{[^}]*transform: translateY\(6px\);/)
  // 半屏不许半透明：dock 压在面板上，淡化会把面板里的橙/蓝块透出来
  assert.match(dock, /\.shell-dock-root\.shell-dock--sheet-half \{[^}]*opacity: 1;/)
  assert.match(dock, /\.shell-dock-root\.shell-dock--sheet-expanded \{[^}]*pointer-events: none;/)
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
    assert.match(source, /--(mobile-nav-height|header-height)/, file + ' 应该引用新变量')
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

test('F-40 面板从搜索条放大：origin 50% calc(100% - 84px)、首帧 scale(0.86) + opacity 0.72、300ms 放大（T-033 R6）', () => {
  // R5 的 clip-path 写法已被用户否决（观感还是「从底下顶上来」），两条规则必须删干净
  assert.doesNotMatch(mapPage, /clip-path/, 'R5 的 clip-path 规则还留在页面里')
  assert.doesNotMatch(mapPage, /height: 110px !important;/, '面板仍靠钉高做 bloom，观感会是从底下顶上来')
  assert.match(
    mapPage,
    /\.map-workspace\[data-sheet-bloom='on'\] \.map-glass-sheet \{[\s\S]{0,240}?transform-origin: 50% calc\(100% - 84px\);[\s\S]{0,200}?transform: scale\(0\.86\);[\s\S]{0,120}?opacity: 0\.72;[\s\S]{0,80}?transition: none;/,
    '首帧没有缩到搜索条（origin/scale/opacity 不全）'
  )
  assert.match(
    mapPage,
    /\.map-workspace\[data-sheet-bloom='off'\] \.map-glass-sheet \{[\s\S]{0,240}?transform: scale\(1\);[\s\S]{0,120}?opacity: 1;[\s\S]{0,320}?transform 300ms var\(--ease-sheet\),[\s\S]{0,200}?opacity 220ms var\(--ease-sheet\),[\s\S]{0,200}?height 320ms var\(--ease-sheet\);/,
    '放大相缺 300ms transform / 220ms opacity，或把面板自己的 320ms 高度过渡冲掉了'
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
  assert.doesNotMatch(dock, /visibility: hidden/)
  assert.doesNotMatch(dock, /display: none/)
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

test('F-43 收起＝展开逆动作：先缩回搜索条再落高，不整体下滑（T-033 R7）', () => {
  assert.match(mapPage, /type SheetCollapsePhase = 'off' \| 'pin' \| 'shrink' \| 'drop'/)
  assert.match(mapPage, /:data-sheet-collapse="sheetCollapsePhase"/)
  const pinAt = mapPage.indexOf('[data-sheet-collapse=\'pin\']')
  assert.ok(pinAt > 0, 'pin 相缺失：收起会直接从 518 滑到 844')
  const pin = mapPage.slice(pinAt, pinAt + 400)
  assert.match(pin, /\[data-sheet-collapse='pin'\] \.map-glass-sheet \{[^}]*transform-origin: 50% calc\(100% - 84px\);/)
  assert.match(pin, /\[data-sheet-collapse='pin'\] \.map-glass-sheet \{[^}]*transform: scale\(1\);/)
  assert.match(pin, /transition: none;/)
  const shrinkAt = mapPage.indexOf('[data-sheet-collapse=\'shrink\']')
  assert.ok(shrinkAt > 0, 'shrink 相缺失：看不到缩回搜索条')
  const shrink = mapPage.slice(shrinkAt, shrinkAt + 420)
  assert.match(shrink, /\[data-sheet-collapse='shrink'\] \.map-glass-sheet \{[^}]*transform-origin: 50% calc\(100% - 84px\);/)
  assert.match(shrink, /\[data-sheet-collapse='shrink'\] \.map-glass-sheet \{[^}]*transform: scale\(0\.86\);/)
  assert.match(shrink, /\[data-sheet-collapse='shrink'\] \.map-glass-sheet \{[^}]*opacity: 0\.72;/)
  assert.doesNotMatch(shrink, /height:/, 'shrink 相不该在过渡里带 height，否则会顺着 320ms 曲线往下滑')
  const dropAt = mapPage.indexOf('[data-sheet-collapse=\'drop\']')
  assert.ok(dropAt > 0, 'drop 相缺失：高度落 0 这一步没有')
  assert.match(mapPage.slice(dropAt, dropAt + 300), /\[data-sheet-collapse='drop'\] \.map-glass-sheet \{[^}]*opacity: 0;/)
  // 高度钉住必须写在 utilities 层（!h-0 也在这一层且 important）
  assert.match(mapPage, /@layer utilities \{[\s\S]{0,260}?\[data-sheet-collapse='pin'\][\s\S]{0,220}?height: var\(--sheet-collapse-h, 326px\) !important;/)
  assert.match(mapPage, /\[data-sheet-collapse='drop'\] \.map-glass-sheet \{\s*height: 0 !important;/)
  assert.match(mapPage, /'--sheet-collapse-h': sheetCollapseHeight \+ 'px'/)
  assert.match(mapPage, /sheetCollapseHeight\.value = Math\.round\(mobileSheetElement\.value\?\.getBoundingClientRect\(\)\.height/)
  // 跳过条件：reduce / 拖拽松手 240ms / 叮叮车视图
  assert.ok((mapPage.match(/prefers-reduced-motion: reduce/g) ?? []).length >= 2, '收起少了 reduce 短路')
  assert.match(mapPage, /mapSheetView\.value === 'bus'/)
  assert.match(mapPage, /Date\.now\(\) - sheetDragEndedAt < 240/)
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

test('F-44 dock 不透明 + 玻璃 fallback 与折射态同一条（T-033 R7）', () => {
  assert.doesNotMatch(dock, /backdrop-filter: blur\(18px\)/)
  const baseAt = mapPage.indexOf('.map-workspace .map-glass-sheet {')
  assert.ok(baseAt > 0, '面板基础规则不存在')
  const base = mapPage.slice(baseAt, baseAt + 260)
  assert.match(base, /background: color-mix\(in srgb, var\(--surface\) 66%, transparent\);/)
  assert.match(base, /backdrop-filter: blur\(2px\) saturate\(1\.05\);/)
  const refractAt = mapPage.indexOf('.map-workspace .map-glass-sheet.map-glass-refracting {')
  if (refractAt > 0) {
    const refract = mapPage.slice(refractAt, refractAt + 300)
    assert.match(refract, /color-mix\(in srgb, var\(--surface\) 66%, transparent\)/)
  }
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
