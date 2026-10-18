import { useMemo, useState, type ReactNode } from 'react'
import { formatDateLong, parseISODate } from '../domain/dates'
import { journal, recordExpense } from '../domain/engine'
import { formatMoney, parseMoneyInput } from '../domain/money'
import type { AppState, FinanceEvent, OverspendPreview } from '../domain/types'
import {
  Button,
  Card,
  ConfirmDialog,
  Empty,
  ErrorBanner,
  Field,
  ListRow,
  Screen,
} from './components'
import { OverspendOptions } from './ExpenseSheet'
import {
  BanknoteIcon,
  CoinsIcon,
  HistoryIcon,
  ReceiptIcon,
  RefreshIcon,
  SettingsIcon,
  WalletIcon,
} from './icons'
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

/**
 * Семантика операции по её типу (а не по знаку числа): поступления
 * и пополнения подсвечиваются тёплым зелёным, расходы остаются нейтральными.
 */
function eventIsIncome(event: FinanceEvent): boolean {
  return (
    event.type === 'period_started' ||
    event.type === 'extra_income' ||
    event.type === 'extra_allocation'
  )
}

function eventIcon(event: FinanceEvent): ReactNode {
  switch (event.type) {
    case 'period_started':
      return <BanknoteIcon size={20} />
    case 'extra_income':
      return <CoinsIcon size={20} />
    case 'extra_allocation':
    case 'account_created':
    case 'account_renamed':
    case 'account_archived':
      return <WalletIcon size={20} />
    case 'daily_expense':
      return <ReceiptIcon size={20} />
    case 'limit_recalc':
      return <RefreshIcon size={20} />
    case 'settings_changed':
      return <SettingsIcon size={20} />
    default:
      return <HistoryIcon size={20} />
  }
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
    return <EventDetail state={state} event={selected} today={today} onChange={onChange} />
  }

  return (
    <Screen title="История">
      <div className="row">
        <Field label="С">
          <input className="input" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </Field>
        <Field label="По">
          <input className="input" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </Field>
      </div>
      {items.length === 0 ? (
        <Empty
          icon={<HistoryIcon size={22} />}
          title="Операций нет"
          text="Запишите расходы или поступление, и они появятся здесь."
        />
      ) : (
        <ul className="journal">
          {items.map((event) => (
            <ListRow
              key={event.id}
              leading={eventIcon(event)}
              title={eventLabel(event)}
              subtitle={formatDateLong(parseISODate(event.date)!)}
              trailing={eventAmount(event)}
              income={eventIsIncome(event)}
              chevron
              onClick={() => navigate({ name: 'history', eventId: event.id })}
              ariaLabel={`Открыть операцию: ${eventLabel(event)}`}
            />
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
  const [confirmOpen, setConfirmOpen] = useState(false)
  const [overspend, setOverspend] = useState<OverspendPreview | null>(null)

  const details = detailRows(event)

  async function applyEdit(amount: number, choice?: 'go_negative' | 'recalc_limit') {
    setError(null)
    const result = recordExpense(state, event.date, amount, choice, today)
    if (!result.ok) {
      if (result.overspend) {
        setOverspend(result.overspend)
        return
      }
      setError(result.error)
      return
    }
    await onChange(result.state)
    navigate({ name: 'history' })
  }

  return (
    <Screen title="Операция" onBack={() => navigate({ name: 'history' })}>
      {error ? <ErrorBanner text={error} /> : null}

      <Card>
        <div className={`row-leading${eventIsIncome(event) ? ' is-income' : ''}`} style={{ width: 46, height: 46 }}>
          {eventIcon(event)}
        </div>
        <h2 className="card-title">{eventLabel(event)}</h2>
        <p className="card-hint">{formatDateLong(parseISODate(event.date)!)}</p>
        {eventAmount(event) ? (
          <span className={`detail-amount${eventIsIncome(event) ? ' is-income' : ''}`}>
            {eventAmount(event)}
          </span>
        ) : null}
        {event.description ? <p className="secondary">{event.description}</p> : null}
        {details.map(([label, value]) => (
          <div className="settings-row" key={label}>
            <span className="settings-row-hint">{label}</span>
            <span className="settings-row-title">{value}</span>
          </div>
        ))}
      </Card>

      {event.type === 'daily_expense' ? (
        <Card title="Исправление расходов">
          <Field label="Сумма расходов за этот день">
            <input
              className="input input-amount"
              inputMode="decimal"
              value={raw}
              onChange={(event) => setRaw(event.target.value)}
            />
          </Field>
          <p className="field-hint">
            Изменение прошлых расходов пересчитает свободные деньги за последующие дни. Зафиксированные лимиты не
            изменятся.
          </p>
          {overspend ? (
            <OverspendOptions preview={overspend} onChoose={(choice) => void applyEdit(parseMoneyInput(raw)!, choice)} />
          ) : (
            <Button
              block
              onClick={() => {
                const amount = parseMoneyInput(raw)
                if (amount == null || amount < 0) {
                  setError('Некорректная сумма')
                  return
                }
                setConfirmOpen(true)
              }}
            >
              Сохранить изменение
            </Button>
          )}
        </Card>
      ) : (
        <p className="muted">
          Удаление связанных операций ограничено, чтобы не потерять согласованность балансов. Для коррекции
          расходов используйте правку дневной записи.
        </p>
      )}

      {confirmOpen ? (
        <ConfirmDialog
          title="Изменить расходы?"
          text="Свободные деньги за последующие дни будут пересчитаны. Зафиксированные лимиты не изменятся."
          confirmLabel="Изменить"
          onResolve={async (ok) => {
            setConfirmOpen(false)
            if (!ok) return
            const amount = parseMoneyInput(raw)
            if (amount == null || amount < 0) {
              setError('Некорректная сумма')
              return
            }
            await applyEdit(amount)
          }}
        />
      ) : null}
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

function detailRows(event: FinanceEvent): [string, string][] {
  if (event.type === 'period_started') {
    return [
      ['Сумма', formatMoney(Number(event.payload.amount))],
      ['Отложено', formatMoney(Number(event.payload.saved ?? 0))],
      ['Период', String(event.payload.workPeriod ?? '')],
    ]
  }
  if (event.type === 'extra_allocation') {
    const savings = (event.payload.savings as { amount: number }[]) ?? []
    const toSavings = savings.reduce((sum, part) => sum + part.amount, 0)
    return [
      ['В накопления', formatMoney(toSavings)],
      ['В бюджет', formatMoney(Number(event.payload.budgetAmount ?? 0))],
    ]
  }
  if (event.type === 'daily_expense') {
    const overspend = event.payload.overspend as { choice?: string; newLimit?: number } | undefined
    const rows: [string, string][] = [['Сумма', formatMoney(Number(event.payload.amount))]]
    if (overspend?.choice === 'recalc_limit' && overspend.newLimit != null) {
      rows.push(['Новый лимит', formatMoney(overspend.newLimit)])
    }
    return rows
  }
  const amount = eventAmount(event)
  return amount ? [['Сумма', amount]] : []
}
