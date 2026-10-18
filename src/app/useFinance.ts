import { useCallback, useEffect, useMemo, useState } from 'react'
import type { AppState } from '../domain/types'
import { emptyState } from '../domain/engine'
import { loadState, saveState } from '../storage/db'
import { todayLocal, toISODate } from '../domain/dates'
import { derive } from '../domain/engine'

export function useFinance() {
  const [state, setState] = useState<AppState | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [today, setToday] = useState(() => toISODate(todayLocal()))

  useEffect(() => {
    let cancelled = false
    loadState()
      .then((loaded) => {
        if (!cancelled) setState(loaded)
      })
      .catch(() => {
        if (!cancelled) {
          setError('Не удалось загрузить данные с устройства')
          setState(emptyState())
        }
      })
    return () => {
      cancelled = true
    }
  }, [])

  useEffect(() => {
    const timer = window.setInterval(() => {
      setToday(toISODate(todayLocal()))
    }, 60_000)
    const onVisible = () => setToday(toISODate(todayLocal()))
    document.addEventListener('visibilitychange', onVisible)
    return () => {
      window.clearInterval(timer)
      document.removeEventListener('visibilitychange', onVisible)
    }
  }, [])

  const persist = useCallback(async (next: AppState) => {
    setState(next)
    try {
      await saveState(next)
    } catch {
      setError('Не удалось сохранить данные на устройство. Изменения могут потеряться после закрытия приложения.')
    }
  }, [])

  const dismissError = useCallback(() => setError(null), [])

  const derived = useMemo(() => (state ? derive(state, today) : null), [state, today])

  return { state, derived, today, error, persist, setError, dismissError }
}
