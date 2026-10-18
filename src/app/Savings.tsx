import { useState } from 'react'
import { formatDateLong, parseISODate } from '../domain/dates'
import { archiveAccount, createAccount, renameAccount } from '../domain/engine'
import { formatMoney, parseMoneyInput } from '../domain/money'
import type { AppState, DerivedState } from '../domain/types'
import { Amount, Button, Empty, ErrorBanner, Field, Screen } from './components'
import { navigate } from './router'

export function Savings({
  state,
  derived,
  today,
  accountId,
  onChange,
}: {
  state: AppState
  derived: DerivedState
  today: string
  accountId?: string
  onChange: (next: AppState) => Promise<void>
}) {
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [balance, setBalance] = useState('0')
  const accounts = derived.accounts.filter((item) => !item.archived)
  const selected = accounts.find((item) => item.id === accountId)
  const total = accounts.reduce((sum, item) => sum + item.balance, 0)

  if (selected) {
    const history = state.events.filter((event) => {
      if (event.type === 'account_created' && event.payload.accountId === selected.id) return true
      if (event.type === 'period_started' && event.payload.accountId === selected.id) return true
      if (event.type === 'extra_allocation') {
        const savings = event.payload.savings as { accountId: string; amount: number }[] | undefined
        return savings?.some((part) => part.accountId === selected.id)
      }
      return false
    })
    return (
      <Screen title={selected.name} onBack={() => navigate({ name: 'savings' })}>
        <p className="hero-amount">
          <Amount value={selected.balance} size="xl" />
        </p>
        <div className="row">
          <Button
            variant="secondary"
            onClick={async () => {
              const nextName = window.prompt('Название счёта', selected.name)
              if (!nextName?.trim()) return
              const result = renameAccount(state, selected.id, nextName, today)
              if (!result.ok) setError(result.error)
              else await onChange(result.state)
            }}
          >
            Переименовать
          </Button>
          <Button
            variant="danger"
            onClick={async () => {
              if (!window.confirm('Удалить счёт? Баланс должен быть нулевым.')) return
              const result = archiveAccount(state, selected.id, today)
              if (!result.ok) setError(result.error)
              else {
                await onChange(result.state)
                navigate({ name: 'savings' })
              }
            }}
          >
            Удалить
          </Button>
        </div>
        {error ? <ErrorBanner text={error} /> : null}
        <h2 className="section-title">Пополнения</h2>
        {history.length === 0 ? (
          <Empty title="Пока нет пополнений" text="Счёт пополнится из зарплаты или дополнительного поступления." />
        ) : (
          <ul className="journal">
            {history.map((event) => (
              <li key={event.id}>
                <div>
                  <strong>{event.description ?? event.type}</strong>
                  <div className="muted">{formatDateLong(parseISODate(event.date)!)}</div>
                </div>
                <span>{formatEventAmount(event, selected.id)}</span>
              </li>
            ))}
          </ul>
        )}
      </Screen>
    )
  }

  return (
    <Screen title="Накопления" onBack={() => navigate({ name: 'home' })}>
      <p className="muted">Общий баланс накоплений не входит в свободные деньги.</p>
      <p>
        Всего: <Amount value={total} />
      </p>
      {accounts.length === 0 ? (
        <Empty title="Счетов пока нет" text="Создайте накопительный счёт, чтобы откладывать часть зарплаты." />
      ) : (
        <ul className="journal">
          {accounts.map((account) => (
            <li key={account.id}>
              <button type="button" className="linkish" onClick={() => navigate({ name: 'savings', accountId: account.id })}>
                <strong>{account.name}</strong>
                <div className="muted">Открыть историю</div>
              </button>
              <Amount value={account.balance} />
            </li>
          ))}
        </ul>
      )}
      <h2 className="section-title">Новый счёт</h2>
      {error ? <ErrorBanner text={error} /> : null}
      <div className="stack">
        <Field label="Название">
          <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
        </Field>
        <Field label="Начальный баланс">
          <input className="input" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} />
        </Field>
        <Button
          block
          onClick={async () => {
            const amount = parseMoneyInput(balance || '0')
            const result = createAccount(state, name, amount ?? -1, today)
            if (!result.ok) setError(result.error)
            else {
              setName('')
              setBalance('0')
              await onChange(result.state)
            }
          }}
        >
          Создать счёт
        </Button>
      </div>
    </Screen>
  )
}

function formatEventAmount(event: AppState['events'][number], accountId: string): string {
  if (event.type === 'account_created') return formatMoney(Number(event.payload.initialBalance ?? 0))
  if (event.type === 'period_started') return formatMoney(Number(event.payload.saved ?? 0))
  if (event.type === 'extra_allocation') {
    const savings = (event.payload.savings as { accountId: string; amount: number }[]) ?? []
    const part = savings.find((item) => item.accountId === accountId)
    return formatMoney(part?.amount ?? 0)
  }
  return ''
}
