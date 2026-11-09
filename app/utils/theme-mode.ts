export type ThemeMode = 'light' | 'dark' | 'system'

export type ThemePalette = 'green' | 'indigo' | 'violet' | 'rose' | 'teal'

export const THEME_MODE_STORAGE_KEY = 'yeu-theme'

export const THEME_PALETTE_STORAGE_KEY = 'yeu-palette'

export const DEFAULT_THEME_PALETTE: ThemePalette = 'green'

export const THEME_PALETTE_IDS: readonly ThemePalette[] = ['green', 'indigo', 'violet', 'rose', 'teal']

export const THEME_PALETTES: ReadonlyArray<{ id: ThemePalette, label: string, swatchClass: string }> = [
  { id: 'green', label: '绿（默认）', swatchClass: 'text-[#176f46]' },
  { id: 'indigo', label: '靛蓝', swatchClass: 'text-[#5159bb]' },
  { id: 'violet', label: '紫罗兰', swatchClass: 'text-[#7a49bd]' },
  { id: 'rose', label: '玫瑰', swatchClass: 'text-[#b23450]' },
  { id: 'teal', label: '青绿', swatchClass: 'text-[#0f6b73]' }
]

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

/** 把 palette 落到 <html data-palette>；SSR 早退。 */
export function applyThemePalette(palette: ThemePalette): void {
  if (typeof document === 'undefined') return
  document.documentElement.dataset.palette = palette
}

/** 早于 hydration 的内联启动脚本（避免暗色用户首帧闪白）。 */
const PALETTE_WHITELIST = THEME_PALETTE_IDS.map(id => `'${id}'`).join(',')

export const THEME_BOOT_SCRIPT = `(function(){try{var m=localStorage.getItem('${THEME_MODE_STORAGE_KEY}')||'system';var d=m==='dark'||(m==='system'&&window.matchMedia('(prefers-color-scheme: dark)').matches);var r=document.documentElement;r.classList.toggle('dark',d);r.classList.toggle('light',!d);r.style.colorScheme=d?'dark':'light';var p=localStorage.getItem('${THEME_PALETTE_STORAGE_KEY}');if([${PALETTE_WHITELIST}].indexOf(p)<0)p='${DEFAULT_THEME_PALETTE}';r.setAttribute('data-palette',p);}catch(e){}})();`
