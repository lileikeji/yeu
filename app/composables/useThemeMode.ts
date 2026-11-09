import {
  THEME_MODE_STORAGE_KEY,
  THEME_PALETTE_STORAGE_KEY,
  THEME_PALETTES,
  applyThemeClass,
  applyThemePalette,
  resolveThemeDark,
  storedThemeMode,
  storedThemePalette
} from '~/utils/theme-mode'
import type { ThemeMode, ThemePalette } from '~/utils/theme-mode'

export function useThemeMode() {
  const mode = ref<ThemeMode>(storedThemeMode())
  const isDark = ref(resolveThemeDark(mode.value))
  const palette = ref<ThemePalette>(storedThemePalette())
  let mediaQuery: MediaQueryList | null = null
  let mediaListener: ((event: MediaQueryListEvent) => void) | null = null

  function syncFromMode(next: ThemeMode): void {
    isDark.value = resolveThemeDark(next)
    applyThemeClass(isDark.value)
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(THEME_MODE_STORAGE_KEY, next)
      } catch {
        // localStorage 不可用时只影响本次会话
      }
    }
  }

  function syncPalette(next: ThemePalette): void {
    palette.value = next
    applyThemePalette(next)
    if (typeof window !== 'undefined') {
      try {
        window.localStorage.setItem(THEME_PALETTE_STORAGE_KEY, next)
      } catch {
        // localStorage 不可用时只影响本次会话
      }
    }
  }

  function setPalette(next: ThemePalette): void {
    syncPalette(next)
  }

  function refreshSystemPreference(): void {
    if (mode.value !== 'system') return
    isDark.value = resolveThemeDark('system')
    applyThemeClass(isDark.value)
  }

  function watchSystemPreference(): void {
    if (typeof window === 'undefined' || !window.matchMedia) return
    if (mediaQuery) mediaQuery.removeEventListener('change', mediaListener!)
    mediaQuery = window.matchMedia('(prefers-color-scheme: dark)')
    mediaListener = () => refreshSystemPreference()
    mediaQuery.addEventListener('change', mediaListener)
  }

  function setMode(next: ThemeMode): void {
    mode.value = next
    syncFromMode(next)
    watchSystemPreference()
  }

  onMounted(() => {
    mode.value = storedThemeMode()
    isDark.value = resolveThemeDark(mode.value)
    applyThemeClass(isDark.value)
    palette.value = storedThemePalette()
    applyThemePalette(palette.value)
    watchSystemPreference()
  })

  onBeforeUnmount(() => {
    if (mediaQuery && mediaListener) mediaQuery.removeEventListener('change', mediaListener)
  })

  return {
    mode,
    isDark,
    palette,
    palettes: THEME_PALETTES,
    setMode,
    setPalette
  }
}
