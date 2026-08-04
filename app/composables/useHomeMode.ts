export type HomeMode = 'full' | 'compact'

const HOME_MODE_COOKIE = 'yeu-home-mode'

export function useHomeMode() {
  const cookie = useCookie<HomeMode>(HOME_MODE_COOKIE, {
    default: () => 'full',
    sameSite: 'lax',
    maxAge: 60 * 60 * 24 * 365
  })
  const mode = useState<HomeMode>('home-mode', () => (
    cookie.value === 'compact' ? 'compact' : 'full'
  ))

  if (import.meta.client) {
    watch(cookie, (value) => {
      if (value === 'full' || value === 'compact') mode.value = value
    })
  }

  function setMode(nextMode: HomeMode): void {
    mode.value = nextMode
    cookie.value = nextMode
  }

  return {
    mode,
    setMode
  }
}
