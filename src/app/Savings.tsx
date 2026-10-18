import { useState } from 'react'
import { formatDateLong, parseISODate } from '../domain/dates'
import { archiveAccount, createAccount, renameAccount } from '../domain/engine'
import { formatMoney, parseMoneyInput } from '../domain/money'
import type { AppState, DerivedState } from '../domain/types'
import {
  Amount,
  Avatar,
  Banner,
  Button,
  ConfirmDialog,
  Empty,
  ErrorBanner,
  Field,
  ListRow,
  PromptDialog,
  Screen,
  Sheet,
} from './components'
import { WalletIcon } from './icons'
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
  const [createOpen, setCreateOpen] = useState(false)
  const accounts = derived.accounts.filter((item) => !item.archived)
  const selected = accounts.find((item) => item.id === accountId)
  const total = accounts.reduce((sum, item) => sum + item.balance, 0)

  if (selected) {
    return (
      <AccountDetail
        state={state}
        derived={derived}
        today={today}
        accountId={selected.id}
        onChange={onChange}
      />
    )
  }

  return (
    <Screen title="Накопления">
      {error ? <ErrorBanner text={error} /> : null}

      <div className="card">
        <p className="today-label">Всего в накоплениях</p>
        <Amount value={total} size="lg" />
        <p className="card-hint">Накопления не входят в свободные деньги и дневной лимит.</p>
      </div>

      {accounts.length === 0 ? (
        <Empty
          icon={<WalletIcon size={22} />}
          title="Счетов пока нет"
          text="Создайте накопительный счёт, чтобы откладывать часть зарплаты или дополнительного дохода."
          action={
            <Button variant="soft" onClick={() => setCreateOpen(true)}>
              Создать счёт
            </Button>
          }
        />
      ) : (
        <ul className="journal">
          {accounts.map((account) => (
            <ListRow
              key={account.id}
              leading={<Avatar name={account.name} id={account.id} />}
              title={account.name}
              subtitle="История пополнений"
              trailing={<Amount value={account.balance} size="md" />}
              chevron
              onClick={() => navigate({ name: 'savings', accountId: account.id })}
              ariaLabel={`Открыть счёт ${account.name}`}
            />
          ))}
        </ul>
      )}

      <Button block variant="secondary" onClick={() => setCreateOpen(true)}>
        Новый счёт
      </Button>

      {createOpen ? (
        <CreateAccountSheet
          state={state}
          today={today}
          onClose={() => setCreateOpen(false)}
          onChange={onChange}
          onError={setError}
        />
      ) : null}
    </Screen>
  )
}

function CreateAccountSheet({
  state,
  today,
  onClose,
  onChange,
  onError,
}: {
  state: AppState
  today: string
  onClose: () => void
  onChange: (next: AppState) => Promise<void>
  onError: (text: string) => void
}) {
  const [name, setName] = useState('')
  const [balance, setBalance] = useState('')

  return (
    <Sheet title="Новый накопительный счёт" onClose={onClose}>
      <div className="sheet-body">
        <Field label="Название" hint="Например: «На отпуск» или «Резерв»">
          <input
            className="input"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="На отпуск"
            autoFocus
          />
        </Field>
        <Field label="Начальный баланс" hint="Можно оставить ноль и пополнить позже">
          <input
            className="input"
            inputMode="decimal"
            value={balance}
            onChange={(event) => setBalance(event.target.value)}
            placeholder="0"
          />
        </Field>
        <div className="sheet-actions">
          <Button
            block
            size="lg"
            onClick={async () => {
              const amount = balance.trim() ? parseMoneyInput(balance) : 0
              const result = createAccount(state, name, amount ?? -1, today)
              if (!result.ok) onError(result.error)
              else {
                await onChange(result.state)
                onClose()
              }
            }}
          >
            Создать счёт
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

function AccountDetail({
  state,
  derived,
  today,
  accountId,
  onChange,
}: {
  state: AppState
  derived: DerivedState
  today: string
  accountId: string
  onChange: (next: AppState) => Promise<void>
}) {
  const accounts = derived.accounts.filter((item) => !item.archived)
  const selected = accounts.find((item) => item.id === accountId)
  const [error, setError] = useState<string | null>(null)
  const [renameOpen, setRenameOpen] = useState(false)
  const [deleteOpen, setDeleteOpen] = useState(false)

  if (!selected) {
    return (
      <Screen title="Счёт" onBack={() => navigate({ name: 'savings' })}>
        <Banner tone="info">Счёт больше не существует.</Banner>
      </Screen>
    )
  }

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
      {error ? <ErrorBanner text={error} /> : null}

      <div className="card">
        <p className="today-label">Баланс счёта</p>
        <Amount value={selected.balance} size="lg" />
      </div>

      <div className="row">
        <Button variant="secondary" onClick={() => setRenameOpen(true)}>
          Переименовать
        </Button>
        <Button variant="danger" onClick={() => setDeleteOpen(true)}>
          Удалить
        </Button>
      </div>

      <h2 className="section-title">Пополнения</h2>
      {history.length === 0 ? (
        <Empty
          title="Пока нет пополнений"
          text="Счёт пополнится из зарплаты или дополнительного поступления."
        />
      ) : (
        <ul className="journal">
          {history.map((event) => (
            <ListRow
              key={event.id}
              leading={<Avatar name={selected.name} id={selected.id} />}
              title={event.description ?? eventLabel(event)}
              subtitle={formatDateLong(parseISODate(event.date)!)}
              trailing={<span className="amount amount-good">+{formatEventAmount(event, selected.id)}</span>}
            />
          ))}
        </ul>
      )}

      {renameOpen ? (
        <PromptDialog
          title="Переименовать счёт"
          label="Новое название"
          initial={selected.name}
          onResolve={async (nextName) => {
            setRenameOpen(false)
            if (!nextName?.trim()) return
            const result = renameAccount(state, selected.id, nextName, today)
            if (!result.ok) setError(result.error)
            else await onChange(result.state)
          }}
        />
      ) : null}

      {deleteOpen ? (
        <ConfirmDialog
          title={selected.balance > 0 ? `Удалить счёт с балансом ${formatMoney(selected.balance)}?` : 'Удалить счёт?'}
          text={
            selected.balance > 0
              ? `На счёте «${selected.name}» ${formatMoney(selected.balance)}. Удалённый баланс выйдет из учёта накоплений: он не попадёт ни в свободные деньги, ни в дневной бюджет. Пополнения останутся в истории операций.`
              : 'Пополнения из истории операций останутся в журнале.'
          }
          confirmLabel="Удалить"
          tone="danger"
          onResolve={async (ok) => {
            setDeleteOpen(false)
            if (!ok) return
            const result = archiveAccount(state, selected.id, today, true)
            if (!result.ok) setError(result.error)
            else {
              await onChange(result.state)
              navigate({ name: 'savings' })
            }
          }}
        />
      ) : null}
    </Screen>
  )
}

function eventLabel(event: AppState['events'][number]): string {
  if (event.type === 'account_created') return 'Счёт создан'
  if (event.type === 'period_started') return 'Пополнение из зарплаты'
  if (event.type === 'extra_allocation') return 'Дополнительное поступление'
  return event.type
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
