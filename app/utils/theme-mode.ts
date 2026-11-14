export type ThemeMode = 'light' | 'dark' | 'system'

export type ThemePalette = 'paper' | 'mist' | 'cream' | 'berry'

export const THEME_MODE_STORAGE_KEY = 'yeu-theme'

export const THEME_PALETTE_STORAGE_KEY = 'yeu-palette'

export const DEFAULT_THEME_PALETTE: ThemePalette = 'paper'

/* 2026-11-14 第二轮配色候选（用户：之前的都不满意，要四套，且要贴项目主题）。
   项目主题＝本科/专升本新生报到 · 校园地图 · 宿舍 · 校园生活，所以四套从场景反推：
   paper  白纸 ← 纯黑白灰，最克制（默认）
   mist   雾蓝 ← 冷白底 + 一个克制的蓝，工具感
   cream  奶油 ← 暖白底 + 深琥珀，像手账纸，最亲和
   berry  莓红 ← 中性白 + 高饱和玫红，最跳、最年轻
   四套 id 与 main.css 的 html[data-palette='…'] 块一一对应，默认 paper（2026-11-14 用户确认极光紫舍弃）。变量落地在 app/assets/css/main.css 末尾的
   html[data-palette='…'] 块里。 */
export const THEME_PALETTE_IDS: readonly ThemePalette[] = ['paper', 'mist', 'cream', 'berry']

export const THEME_PALETTES: ReadonlyArray<{ id: ThemePalette, label: string, swatchClass: string }> = [
  { id: 'paper', label: '白纸', swatchClass: 'text-[#171717]' },
  { id: 'mist', label: '雾蓝', swatchClass: 'text-[#2c5bd9]' },
  { id: 'cream', label: '奶油', swatchClass: 'text-[#ab4f09]' },
  { id: 'berry', label: '莓红', swatchClass: 'text-[#d01b43]' }
]

/** 浏览器 UI（地址栏、PWA 标题栏）跟随纸面色，不跟主色。 */
export const THEME_PALETTE_THEME_COLORS: Readonly<Record<ThemePalette, string>> = {
  paper: '#fcfcfc',
  mist: '#f4f6f9',
  cream: '#faf7f2',
  berry: '#fcfbfc'
}

function systemPrefersDark(): boolean {
  return typeof window !== 'undefined'
    && window.matchMedia('(prefers-color-scheme: dark)').matches
}

export function resolveThemeDark(mode: ThemeMode): boolean {
  return mode === 'dark' || (mode === 'system' && systemPrefersDark())
}

export function storedThemeMode(): ThemeMode {
  if (typeof window === 'undefined') return 'system'
  const stored = window.localStorage.getItem(THEME_MODE_STORAGE_KEY)
  return stored === 'light' || stored === 'dark' || stored === 'system' ? stored : 'system'
}

/** 把解析后的暗色状态落到 <html>（类 + color-scheme）。 */
export function applyThemeClass(dark: boolean): void {
  if (typeof document === 'undefined') return
  const root = document.documentElement
  root.classList.toggle('dark', dark)
  root.classList.toggle('light', !dark)
  root.style.colorScheme = dark ? 'dark' : 'light'
}

export function isThemePalette(value: unknown): value is ThemePalette {
  return typeof value === 'string' && (THEME_PALETTE_IDS as readonly string[]).includes(value)
}

/** 未知值、大小写不符或空值一律回落默认 palette。 */
export function resolveThemePalette(raw: string | null | undefined): ThemePalette {
  return isThemePalette(raw) ? raw : DEFAULT_THEME_PALETTE
}

/** SSR 返回默认；localStorage 不可用（隐私模式等）时同样回落默认。 */
export function storedThemePalette(): ThemePalette {
  if (typeof window === 'undefined') return DEFAULT_THEME_PALETTE
  try {
    return resolveThemePalette(window.localStorage.getItem(THEME_PALETTE_STORAGE_KEY))
  } catch {
    return DEFAULT_THEME_PALETTE
  }
}

/** 同步 <meta name="theme-color">；标签缺失时补一个，避免换肤后地址栏仍留旧绿。 */
function applyThemeColorMeta(palette: ThemePalette): void {
  let meta = document.querySelector('meta[name="theme-color"]')
  if (!meta) {
    meta = document.createElement('meta')
    meta.setAttribute('name', 'theme-color')
    document.head.append(meta)
  }
  meta.setAttribute('content', THEME_PALETTE_THEME_COLORS[palette])
}

/** 把 palette 落到 <html data-palette> 与浏览器 UI 色；SSR 早退。 */
export function applyThemePalette(palette: ThemePalette): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.palette = palette
  applyThemeColorMeta(palette)
}

/** 早于 hydration 的内联启动脚本（避免暗色用户首帧闪白、换色用户地址栏留旧绿）。 */
const PALETTE_WHITELIST = THEME_PALETTE_IDS.map(id => `'${id}'`).join(',')
const PALETTE_THEME_COLOR_MAP = THEME_PALETTE_IDS
  .map(id => `'${id}':'${THEME_PALETTE_THEME_COLORS[id]}'`)
  .join(',')

export const THEME_BOOT_SCRIPT = `(function(){try{var m=localStorage.getItem('${THEME_MODE_STORAGE_KEY}')||'system';var d=m==='dark'||(m==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.classList.toggle('light',!d);r.style.colorScheme=d?'dark':'light';var p=localStorage.getItem('${THEME_PALETTE_STORAGE_KEY}');if([${PALETTE_WHITELIST}].indexOf(p)<0)p='${DEFAULT_THEME_PALETTE}';r.setAttribute('data-palette',p);var mc=document.querySelector('meta[name="theme-color"]');if(mc)mc.setAttribute('content',({${PALETTE_THEME_COLOR_MAP}})[p]||'${THEME_PALETTE_THEME_COLORS[DEFAULT_THEME_PALETTE]}');}catch(e){}})();`
