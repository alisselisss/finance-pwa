import { useMemo, useState } from 'react'
import { createId } from '../domain/ids'
import { formatMoney, parseMoneyInput, type Money } from '../domain/money'
import { parseISODate } from '../domain/dates'
import { inferPaydayKind } from '../domain/period'
import { netFromGross, type PaydayKind } from '../domain/salary'
import {
  completeOnboarding,
  saveOnboardingDraft,
  validateOnboardingDraft,
} from '../domain/engine'
import type { AppState, OnboardingDraft, Settings } from '../domain/types'
import { Button, ErrorBanner, Field, Screen } from './components'

function moneyText(value: Money | undefined): string {
  if (value == null) return ''
  return formatMoney(value, { withCurrency: false, hideZeroKopecks: true }).replace('−', '-')
}

export function Onboarding({
  state,
  today,
  onChange,
}: {
  state: AppState
  today: string
  onChange: (next: AppState) => Promise<void>
}) {
  const draft = state.onboarding.draft
  const [error, setError] = useState<string | null>(null)

  async function patch(partial: Partial<OnboardingDraft>) {
    setError(null)
    await onChange(saveOnboardingDraft(state, { ...draft, ...partial }))
  }

  return (
    <Screen title="Настройка">
      <p className="lede">Шаг {draft.step} из 4</p>
      <div className="progress" aria-hidden="true">
        <span style={{ width: `${(draft.step / 4) * 100}%` }} />
      </div>
      {error ? <ErrorBanner text={error} /> : null}
      {draft.step === 1 ? (
        <SalaryStep
          draft={draft}
          onNext={async (values) => {
            await patch({ ...values, step: 2 })
          }}
          onError={setError}
        />
      ) : null}
      {draft.step === 2 ? (
        <AccountsStep
          draft={draft}
          onBack={() => patch({ step: 1 })}
          onNext={() => patch({ step: 3 })}
          onChange={(accounts) => patch({ accounts })}
        />
      ) : null}
      {draft.step === 3 ? (
        <SavingsModeStep
          draft={draft}
          onBack={() => patch({ step: 2 })}
          onNext={async (values) => {
            await patch({ ...values, step: 4 })
          }}
          onError={setError}
        />
      ) : null}
      {draft.step === 4 ? (
        <PeriodStep
          draft={draft}
          today={today}
          onBack={() => patch({ step: 3 })}
          onFinish={async (values) => {
            const nextDraft: OnboardingDraft = { ...draft, ...values, step: 4 }
            const prepared = saveOnboardingDraft(state, nextDraft)
            const invalid = validateOnboardingDraft(prepared.onboarding.draft)
            if (invalid) {
              setError(invalid)
              return
            }
            const result = completeOnboarding(prepared, today)
            if (!result.ok) {
              setError(result.error)
              return
            }
            await onChange(result.state)
          }}
          onError={setError}
        />
      ) : null}
    </Screen>
  )
}

function SalaryStep({
  draft,
  onNext,
  onError,
}: {
  draft: OnboardingDraft
  onNext: (values: Pick<OnboardingDraft, 'grossSalary' | 'advanceDay' | 'salaryDay' | 'ndflBps'>) => void
  onError: (text: string) => void
}) {
  const [gross, setGross] = useState(moneyText(draft.grossSalary))
  const [advanceDay, setAdvanceDay] = useState(String(draft.advanceDay ?? 10))
  const [salaryDay, setSalaryDay] = useState(String(draft.salaryDay ?? 25))
  const net = useMemo(() => {
    const parsed = parseMoneyInput(gross)
    return parsed && parsed > 0 ? netFromGross(parsed) : null
  }, [gross])

  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault()
        const grossSalary = parseMoneyInput(gross)
        const advance = Number(advanceDay)
        const salary = Number(salaryDay)
        if (!grossSalary || grossSalary <= 0) {
          onError('Укажите месячный оклад до налога')
          return
        }
        if (advance < 1 || advance > 31 || salary < 1 || salary > 31) {
          onError('День выплаты — число от 1 до 31')
          return
        }
        if (advance === salary) {
          onError('Даты аванса и зарплаты должны отличаться')
          return
        }
        onNext({ grossSalary, advanceDay: advance, salaryDay: salary, ndflBps: 1300 })
      }}
    >
      <Field label="Месячный оклад до налога" hint="НДФЛ 13% будет учтён автоматически">
        <input className="input" inputMode="decimal" value={gross} onChange={(e) => setGross(e.target.value)} />
      </Field>
      {net != null ? (
        <p className="hint-card">
          На руки: <strong>{formatMoney(net)}</strong>
        </p>
      ) : null}
      <div className="row">
        <Field label="День аванса">
          <input
            className="input"
            inputMode="numeric"
            value={advanceDay}
            onChange={(e) => setAdvanceDay(e.target.value)}
          />
        </Field>
        <Field label="День зарплаты">
          <input
            className="input"
            inputMode="numeric"
            value={salaryDay}
            onChange={(e) => setSalaryDay(e.target.value)}
          />
        </Field>
      </div>
      <Button type="submit" block>
        Далее
      </Button>
    </form>
  )
}

function AccountsStep({
  draft,
  onBack,
  onNext,
  onChange,
}: {
  draft: OnboardingDraft
  onBack: () => void
  onNext: () => void
  onChange: (accounts: OnboardingDraft['accounts']) => void
}) {
  const [name, setName] = useState('')
  const [balance, setBalance] = useState('')
  const [localError, setLocalError] = useState<string | null>(null)

  return (
    <div className="stack">
      <p className="muted">Добавьте накопительные счета. Можно пропустить и создать их позже.</p>
      {draft.accounts.map((account) => (
        <div className="list-card" key={account.id}>
          <div>
            <strong>{account.name}</strong>
            <div className="muted">{formatMoney(account.balance)}</div>
          </div>
          <div className="row-actions">
            <button
              type="button"
              className="text-btn"
              onClick={() => {
                const nextName = window.prompt('Новое название', account.name)
                if (!nextName?.trim()) return
                onChange(
                  draft.accounts.map((item) =>
                    item.id === account.id ? { ...item, name: nextName.trim() } : item,
                  ),
                )
              }}
            >
              Переименовать
            </button>
            <button
              type="button"
              className="text-btn danger"
              onClick={() => {
                if (account.balance !== 0) {
                  setLocalError('Нельзя удалить счёт с ненулевым балансом')
                  return
                }
                onChange(draft.accounts.filter((item) => item.id !== account.id))
              }}
            >
              Удалить
            </button>
          </div>
        </div>
      ))}
      <Field label="Название счёта">
        <input className="input" value={name} onChange={(e) => setName(e.target.value)} />
      </Field>
      <Field label="Текущий баланс">
        <input className="input" inputMode="decimal" value={balance} onChange={(e) => setBalance(e.target.value)} />
      </Field>
      {localError ? <ErrorBanner text={localError} /> : null}
      <Button
        variant="secondary"
        block
        onClick={() => {
          setLocalError(null)
          if (!name.trim()) {
            setLocalError('Укажите название счёта')
            return
          }
          const amount = balance.trim() ? parseMoneyInput(balance) : 0
          if (amount == null || amount < 0) {
            setLocalError('Баланс не может быть отрицательным')
            return
          }
          onChange([...draft.accounts, { id: createId(), name: name.trim(), balance: amount }])
          setName('')
          setBalance('')
        }}
      >
        Добавить счёт
      </Button>
      <div className="row">
        <Button variant="ghost" onClick={onBack}>
          Назад
        </Button>
        <Button onClick={onNext}>Далее</Button>
      </div>
    </div>
  )
}

function SavingsModeStep({
  draft,
  onBack,
  onNext,
  onError,
}: {
  draft: OnboardingDraft
  onBack: () => void
  onNext: (values: Pick<OnboardingDraft, 'savingsMode' | 'fixedSavingsAmount'>) => void
  onError: (text: string) => void
}) {
  const [mode, setMode] = useState(draft.savingsMode ?? 'fixed')
  const [fixed, setFixed] = useState(moneyText(draft.fixedSavingsAmount))

  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault()
        if (mode === 'fixed') {
          const amount = parseMoneyInput(fixed || '0')
          if (amount == null || amount < 0) {
            onError('Укажите неотрицательную сумму откладывания')
            return
          }
          onNext({ savingsMode: 'fixed', fixedSavingsAmount: amount })
          return
        }
        onNext({ savingsMode: 'variable', fixedSavingsAmount: 0 })
      }}
    >
      <label className="choice">
        <input type="radio" name="mode" checked={mode === 'fixed'} onChange={() => setMode('fixed')} />
        <span>
          <strong>Постоянная сумма</strong>
          <em>Откладывать одну и ту же сумму с каждой выплаты</em>
        </span>
      </label>
      {mode === 'fixed' ? (
        <Field label="Сумма к откладыванию с каждой выплаты">
          <input className="input" inputMode="decimal" value={fixed} onChange={(e) => setFixed(e.target.value)} />
        </Field>
      ) : null}
      <label className="choice">
        <input type="radio" name="mode" checked={mode === 'variable'} onChange={() => setMode('variable')} />
        <span>
          <strong>Переменная сумма</strong>
          <em>Спрашивать сумму и счёт при каждом поступлении зарплаты</em>
        </span>
      </label>
      <div className="row">
        <Button variant="ghost" onClick={onBack}>
          Назад
        </Button>
        <Button type="submit">Далее</Button>
      </div>
    </form>
  )
}

function PeriodStep({
  draft,
  today,
  onBack,
  onFinish,
  onError,
}: {
  draft: OnboardingDraft
  today: string
  onBack: () => void
  onFinish: (
    values: Pick<
      OnboardingDraft,
      'lastPayday' | 'lastPaydayKind' | 'lastAmount' | 'lastSaved' | 'lastSavedAccountId' | 'startingFreeMoney'
    >,
  ) => void
  onError: (text: string) => void
}) {
  const [lastPayday, setLastPayday] = useState(draft.lastPayday ?? today)
  const [kind, setKind] = useState<PaydayKind>(draft.lastPaydayKind ?? 'advance')
  const [amount, setAmount] = useState(moneyText(draft.lastAmount))
  const [saved, setSaved] = useState(moneyText(draft.lastSaved ?? 0))
  const [accountId, setAccountId] = useState(draft.lastSavedAccountId ?? draft.accounts[0]?.id ?? '')
  const [free, setFree] = useState(moneyText(draft.startingFreeMoney ?? 0))

  return (
    <form
      className="stack"
      onSubmit={(event) => {
        event.preventDefault()
        if (!parseISODate(lastPayday)) {
          onError('Укажите корректную дату последнего поступления')
          return
        }
        const lastAmount = parseMoneyInput(amount)
        const lastSaved = parseMoneyInput(saved || '0')
        const startingFreeMoney = parseMoneyInput(free || '0')
        if (!lastAmount || lastAmount <= 0) {
          onError('Укажите сумму последнего поступления')
          return
        }
        if (lastSaved == null || lastSaved < 0) {
          onError('Отложенная сумма не может быть отрицательной')
          return
        }
        if (lastSaved > lastAmount) {
          onError('Нельзя отложить больше, чем поступило')
          return
        }
        if (startingFreeMoney == null) {
          onError('Укажите сумму свободных денег или ноль')
          return
        }
        const settingsLike = {
          advanceDay: draft.advanceDay ?? 10,
          salaryDay: draft.salaryDay ?? 25,
        } as Settings
        const inferred = inferPaydayKind(parseISODate(lastPayday)!, settingsLike)
        onFinish({
          lastPayday,
          lastPaydayKind: inferred ?? kind,
          lastAmount,
          lastSaved,
          lastSavedAccountId: lastSaved > 0 ? accountId : undefined,
          startingFreeMoney,
        })
      }}
    >
      <p className="muted">
        Приложение установлено не в день зарплаты? Укажите последнее фактическое поступление. Прошлые расходы
        придумывать не будем.
      </p>
      <Field label="Дата последнего аванса или зарплаты">
        <input className="input" type="date" value={lastPayday} onChange={(e) => setLastPayday(e.target.value)} />
      </Field>
      <fieldset className="fieldset">
        <legend>Тип выплаты</legend>
        <label className="inline">
          <input type="radio" checked={kind === 'advance'} onChange={() => setKind('advance')} /> Аванс
        </label>
        <label className="inline">
          <input type="radio" checked={kind === 'salary'} onChange={() => setKind('salary')} /> Зарплата
        </label>
      </fieldset>
      <Field label="Сумма этого поступления">
        <input className="input" inputMode="decimal" value={amount} onChange={(e) => setAmount(e.target.value)} />
      </Field>
      <Field label="Уже отложено из него">
        <input className="input" inputMode="decimal" value={saved} onChange={(e) => setSaved(e.target.value)} />
      </Field>
      {draft.accounts.length > 0 ? (
        <Field label="Накопительный счёт">
          <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {draft.accounts.map((account) => (
              <option key={account.id} value={account.id}>
                {account.name}
              </option>
            ))}
          </select>
        </Field>
      ) : null}
      <Field label="Свободные деньги на начало учёта" hint="Это не остаток на банковской карте">
        <input className="input" inputMode="decimal" value={free} onChange={(e) => setFree(e.target.value)} />
      </Field>
      <div className="row">
        <Button variant="ghost" onClick={onBack}>
          Назад
        </Button>
        <Button type="submit">Открыть приложение</Button>
      </div>
    </form>
  )
}
