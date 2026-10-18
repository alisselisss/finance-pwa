import { useCallback, useEffect, useState } from 'react'

export type ThemePreference = 'system' | 'light' | 'dark'

const STORAGE_KEY = 'finance-pwa-theme'

export function readThemePreference(): ThemePreference {
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY)
    if (raw === 'light' || raw === 'dark' || raw === 'system') return raw
  } catch {
    // localStorage недоступен — работаем с системной темой
  }
  return 'system'
}

function prefersDark(): boolean {
  return window.matchMedia('(prefers-color-scheme: dark)').matches
}

function syncDocument(pref: ThemePreference) {
  const root = document.documentElement
  if (pref === 'system') delete root.dataset.theme
  else root.dataset.theme = pref
  const bg = getComputedStyle(root).getPropertyValue('--bg').trim()
  if (bg) {
    let meta = document.querySelector<HTMLMetaElement>('meta[name="theme-color"]')
    if (!meta) {
      meta = document.createElement('meta')
      meta.name = 'theme-color'
      document.head.appendChild(meta)
    }
    meta.content = bg
  }
}

export function useTheme() {
  const [pref, setPref] = useState<ThemePreference>(readThemePreference)
  const [systemDark, setSystemDark] = useState(prefersDark)

  useEffect(() => {
    syncDocument(pref)
    try {
      window.localStorage.setItem(STORAGE_KEY, pref)
    } catch {
      // предпочтение не сохранится до перезапуска, но текущая сессия работает
    }
  }, [pref])

  useEffect(() => {
    const media = window.matchMedia('(prefers-color-scheme: dark)')
    const onChange = () => {
      setSystemDark(media.matches)
      if (readThemePreference() === 'system') syncDocument('system')
    }
    media.addEventListener('change', onChange)
    return () => media.removeEventListener('change', onChange)
  }, [])

  const toggle = useCallback(() => {
    const effective = pref === 'system' ? (prefersDark() ? 'dark' : 'light') : pref
    setPref(effective === 'dark' ? 'light' : 'dark')
  }, [pref])

  const effective = pref === 'system' ? (systemDark ? 'dark' : 'light') : pref
  return { pref, effective, setPref, toggle }
}
