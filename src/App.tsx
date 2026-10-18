import { useEffect, useState } from 'react'
import { useFinance } from './app/useFinance'
import { useTheme } from './app/theme'
import { parseHash, type AppRoute } from './app/router'
import { Onboarding } from './app/Onboarding'
import { Home } from './app/Home'
import { Savings } from './app/Savings'
import { Forecast } from './app/Forecast'
import { History } from './app/History'
import { SettingsScreen } from './app/Settings'
import { ExpenseSheet } from './app/ExpenseSheet'
import { TabBar } from './app/components'
import './App.css'

export default function App() {
  const { state, derived, today, error, persist } = useFinance()
  const theme = useTheme()
  const [route, setRoute] = useState<AppRoute>(() => parseHash(window.location.hash))
  const [expenseOpen, setExpenseOpen] = useState(false)

  useEffect(() => {
    const onHashChange = () => setRoute(parseHash(window.location.hash))
    window.addEventListener('hashchange', onHashChange)
    return () => window.removeEventListener('hashchange', onHashChange)
  }, [])

  if (!state || !derived) {
    return (
      <div className="app-frame">
        <div className="loading">
          <div className="spinner" role="status" aria-label="Загрузка" />
          <p className="muted">Загружаем данные с устройства…</p>
        </div>
      </div>
    )
  }

  if (error) {
    return (
      <div className="app-frame">
        <div className="loading">
          <p className="banner banner-error" role="alert">{error}</p>
        </div>
      </div>
    )
  }

  const onboarded = state.onboarding.completed && !!state.settings

  let screen
  if (!onboarded) {
    screen = <Onboarding state={state} today={today} onChange={persist} />
  } else {
    switch (route.name) {
      case 'savings':
        screen = (
          <Savings
            state={state}
            derived={derived}
            today={today}
            accountId={route.accountId}
            onChange={persist}
          />
        )
        break
      case 'forecast':
        screen = <Forecast settings={state.settings!} derived={derived} today={today} />
        break
      case 'history':
        screen = (
          <History
            state={state}
            today={today}
            eventId={route.eventId}
            onChange={persist}
          />
        )
        break
      case 'settings':
        screen = (
          <SettingsScreen
            state={state}
            derived={derived}
            today={today}
            onChange={persist}
            theme={theme}
          />
        )
        break
      default:
        screen = (
          <Home
            state={state}
            derived={derived}
            today={today}
            onChange={persist}
            theme={theme}
            onOpenExpense={() => setExpenseOpen(true)}
          />
        )
    }
  }

  return (
    <div className="app-frame">
      <main className="app-main">{screen}</main>
      {onboarded ? <TabBar active={route.name} onAdd={() => setExpenseOpen(true)} /> : null}
      {expenseOpen && onboarded ? (
        <ExpenseSheet
          state={state}
          today={today}
          dailyLimit={derived.dailyLimit}
          initial={derived.expensesByDate[today]}
          onClose={() => setExpenseOpen(false)}
          onChange={persist}
        />
      ) : null}
    </div>
  )
}
