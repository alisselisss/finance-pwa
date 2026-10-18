import { useMemo, useState } from 'react'
import { formatDateLong, parseISODate } from '../domain/dates'
import { journal, recordExpense } from '../domain/engine'
import { formatMoney, parseMoneyInput } from '../domain/money'
import type { AppState, FinanceEvent } from '../domain/types'
import { Button, Empty, ErrorBanner, Field, Screen } from './components'
import { navigate } from './router'

const LABELS: Record<string, string> = {
  period_started: 'Зарплата или аванс',
  savings_like: 'Пополнение накоплений',
  extra_income: 'Дополнительное поступление',
  extra_allocation: 'Распределение поступления',
  daily_expense: 'Ежедневные расходы',
  limit_recalc: 'Пересчёт дневного лимита',
  account_created: 'Создан накопительный счёт',
  account_renamed: 'Счёт переименован',
  account_archived: 'Счёт удалён',
  settings_changed: 'Изменены настройки',
}

export function History({
  state,
  today,
  eventId,
  onChange,
}: {
  state: AppState
  today: string
  eventId?: string
  onChange: (next: AppState) => Promise<void>
}) {
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const items = useMemo(() => {
    return journal(state).filter((event) => {
      if (from && event.date < from) return false
      if (to && event.date > to) return false
      return true
    })
  }, [state, from, to])
  const selected = items.find((event) => event.id === eventId) ?? state.events.find((event) => event.id === eventId)

  if (selected) {
    return (
      <EventDetail
        state={state}
        event={selected}
        today={today}
        onChange={onChange}
      />
    )
  }

  return (
    <Screen title="История" onBack={() => navigate({ name: 'home' })}>
      <div className="row">
        <Field label="С">
          <input className="input" type="date" value={from} onChange={(e) => setFrom(e.target.value)} />
        </Field>
        <Field label="По">
          <input className="input" type="date" value={to} onChange={(e) => setTo(e.target.value)} />
        </Field>
      </div>
      {items.length === 0 ? (
        <Empty title="Операций нет" text="Запишите расходы или поступление, и они появятся здесь." />
      ) : (
        <ul className="journal">
          {items.map((event) => (
            <li key={event.id}>
              <button type="button" className="linkish" onClick={() => navigate({ name: 'history', eventId: event.id })}>
                <strong>{eventLabel(event)}</strong>
                <div className="muted">{formatDateLong(parseISODate(event.date)!)}</div>
              </button>
              <span>{eventAmount(event)}</span>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  )
}

function EventDetail({
  state,
  event,
  today,
  onChange,
}: {
  state: AppState
  event: FinanceEvent
  today: string
  onChange: (next: AppState) => Promise<void>
}) {
  const [error, setError] = useState<string | null>(null)
  const [raw, setRaw] = useState(
    event.type === 'daily_expense'
      ? formatMoney(Number(event.payload.amount), { withCurrency: false, hideZeroKopecks: true })
      : '',
  )

  return (
    <Screen title="Операция" onBack={() => navigate({ name: 'history' })}>
      <p>
        <strong>{eventLabel(event)}</strong>
      </p>
      <p className="muted">{formatDateLong(parseISODate(event.date)!)}</p>
      <p>{event.description}</p>
      <pre className="payload">{detailText(event)}</pre>
      {event.type === 'daily_expense' ? (
        <div className="stack">
          <Field label="Исправить сумму расходов">
            <input className="input" inputMode="decimal" value={raw} onChange={(e) => setRaw(e.target.value)} />
          </Field>
          {error ? <ErrorBanner text={error} /> : null}
          <Button
            block
            onClick={async () => {
              const amount = parseMoneyInput(raw)
              if (amount == null || amount < 0) {
                setError('Некорректная сумма')
                return
              }
              if (
                !window.confirm(
                  'Изменение прошлых расходов пересчитает свободные деньги за последующие дни. Зафиксированные лимиты не изменятся. Продолжить?',
                )
              ) {
                return
              }
              const result = recordExpense(state, event.date, amount, undefined, today)
              if (!result.ok) {
                if (result.overspend) {
                  const go = window.confirm(
                    `Перерасход ${formatMoney(result.overspend.overspend)}. Уйти в минус по свободным деньгам? Нажмите «Отмена», чтобы пересчитать лимит.`,
                  )
                  const retry = recordExpense(
                    state,
                    event.date,
                    amount,
                    go ? 'go_negative' : 'recalc_limit',
                    today,
                  )
                  if (!retry.ok) {
                    setError(retry.error)
                    return
                  }
                  await onChange(retry.state)
                  navigate({ name: 'history' })
                  return
                }
                setError(result.error)
                return
              }
              await onChange(result.state)
              navigate({ name: 'history' })
            }}
          >
            Сохранить изменение
          </Button>
        </div>
      ) : (
        <p className="muted">
          Удаление связанных операций ограничено, чтобы не потерять согласованность балансов. Для коррекции
          расходов используйте правку дневной записи.
        </p>
      )}
    </Screen>
  )
}

function eventLabel(event: FinanceEvent): string {
  if (event.type === 'period_started') {
    return event.payload.kind === 'advance' ? 'Аванс' : 'Зарплата'
  }
  if (event.type === 'daily_expense' && event.payload.overspend) {
    const overspend = event.payload.overspend as { choice: string }
    if (overspend.choice === 'recalc_limit') return 'Расходы и пересчёт лимита'
  }
  return event.description || LABELS[event.type] || event.type
}

function eventAmount(event: FinanceEvent): string {
  if (event.type === 'daily_expense') return formatMoney(Number(event.payload.amount ?? 0))
  if (event.type === 'period_started') return formatMoney(Number(event.payload.amount ?? 0))
  if (event.type === 'extra_income') return formatMoney(Number(event.payload.amount ?? 0))
  if (event.type === 'extra_allocation') return formatMoney(Number(event.payload.budgetAmount ?? 0))
  return ''
}

function detailText(event: FinanceEvent): string {
  if (event.type === 'period_started') {
    return `Сумма: ${formatMoney(Number(event.payload.amount))}\nОтложено: ${formatMoney(Number(event.payload.saved ?? 0))}\nПериод: ${String(event.payload.workPeriod ?? '')}`
  }
  if (event.type === 'extra_allocation') {
    const savings = (event.payload.savings as { amount: number }[]) ?? []
    const toSavings = savings.reduce((sum, part) => sum + part.amount, 0)
    return `В накопления: ${formatMoney(toSavings)}\nВ бюджет: ${formatMoney(Number(event.payload.budgetAmount ?? 0))}`
  }
  if (event.type === 'daily_expense') {
    const overspend = event.payload.overspend as { choice?: string; newLimit?: number } | undefined
    return `Сумма: ${formatMoney(Number(event.payload.amount))}${
      overspend?.choice === 'recalc_limit' && overspend.newLimit != null
        ? `\nНовый лимит: ${formatMoney(overspend.newLimit)}`
        : ''
    }`
  }
  return eventAmount(event)
}
