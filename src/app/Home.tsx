import { useMemo, useState } from 'react'
import { formatDateLong, parseISODate } from '../domain/dates'
import {
  addExtraIncome,
  allocateExtraIncome,
  confirmPayday,
  derive,
  expectedSalaryAmount,
  pendingPayday,
  previewBudgetIncrease,
  previewOverspend,
  recordExpense,
} from '../domain/engine'
import { buildForecast } from '../domain/forecast'
import { formatMoney, parseMoneyInput } from '../domain/money'
import type { AppState, DerivedState } from '../domain/types'
import { Amount, Button, ErrorBanner, Field, Modal } from './components'
import { navigate } from './router'

export function Home({
  state,
  derived,
  today,
  onChange,
}: {
  state: AppState
  derived: DerivedState
  today: string
  onChange: (next: AppState) => Promise<void>
}) {
  const [error, setError] = useState<string | null>(null)
  const [expenseOpen, setExpenseOpen] = useState(false)
  const [incomeOpen, setIncomeOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const pending = pendingPayday(state, today)
  const todayExpense = derived.expensesByDate[today]
  const nextForecast = useMemo(() => {
    if (!state.settings) return null
    const items = buildForecast(state.settings, parseISODate(today)!, derived.confirmedPeriodKeys, 4)
    return items.find((item) => !item.confirmed) ?? null
  }, [state.settings, today, derived.confirmedPeriodKeys])

  return (
    <section className="home">
      <p className="eyebrow">Свободные деньги</p>
      <div className="hero-amount">
        <Amount value={derived.freeMoney} size="xl" tone={derived.freeMoney < 0 ? 'bad' : 'good'} />
      </div>
      <p className="muted center">
        Можно потратить сверх дневного лимита. Это не остаток на карте.
      </p>

      <div className="stats">
        <div>
          <span>Дневной лимит</span>
          <strong>
            <Amount value={derived.dailyLimit} />
          </strong>
        </div>
        <div>
          <span>До выплаты</span>
          <strong>
            {derived.remainingDays} {daysWord(derived.remainingDays)}
          </strong>
        </div>
      </div>
      {nextForecast ? (
        <p className="center muted">
          Следующая выплата: {formatDateLong(parseISODate(nextForecast.date)!)} ·{' '}
          {nextForecast.kind === 'advance' ? 'аванс' : 'зарплата'} · {formatMoney(nextForecast.amount)}
        </p>
      ) : null}

      {todayExpense == null ? (
        <p className="banner">Сегодня расходы ещё не записаны</p>
      ) : (
        <p className="banner banner-ok">
          Сегодня потрачено {formatMoney(todayExpense)}.{' '}
          <button type="button" className="text-btn" onClick={() => setExpenseOpen(true)}>
            Изменить
          </button>
        </p>
      )}

      {pending ? (
        <div className="banner banner-warn">
          Пора оформить {pending.kind === 'advance' ? 'аванс' : 'зарплату'} за {pending.workPeriod}.
          <Button block onClick={() => setPayOpen(true)}>
            Подтвердить поступление
          </Button>
        </div>
      ) : null}

      {derived.undistributed.length > 0 ? (
        <p className="banner">
          Нераспределено: {formatMoney(derived.undistributed.reduce((sum, item) => sum + item.remaining, 0))}
        </p>
      ) : null}

      {error ? <ErrorBanner text={error} /> : null}

      <div className="stack">
        <Button block onClick={() => setExpenseOpen(true)}>
          {todayExpense == null ? 'Записать расходы за сегодня' : 'Изменить расходы за сегодня'}
        </Button>
        <Button variant="secondary" block onClick={() => setIncomeOpen(true)}>
          Добавить поступление
        </Button>
      </div>

      <nav className="grid-nav">
        <button type="button" onClick={() => navigate({ name: 'savings' })}>
          Накопления
        </button>
        <button type="button" onClick={() => navigate({ name: 'forecast' })}>
          Будущие поступления
        </button>
        <button type="button" onClick={() => navigate({ name: 'history' })}>
          История
        </button>
        <button type="button" onClick={() => navigate({ name: 'settings' })}>
          Настройки
        </button>
      </nav>

      {expenseOpen ? (
        <ExpenseModal
          state={state}
          today={today}
          initial={todayExpense}
          onClose={() => setExpenseOpen(false)}
          onChange={onChange}
          onError={setError}
        />
      ) : null}
      {incomeOpen ? (
        <IncomeModal
          state={state}
          derived={derived}
          today={today}
          onClose={() => setIncomeOpen(false)}
          onChange={onChange}
          onError={setError}
        />
      ) : null}
      {payOpen && pending && state.settings ? (
        <PaydayModal
          state={state}
          pending={pending}
          expected={expectedSalaryAmount(state.settings, pending.date, pending.kind)}
          onClose={() => setPayOpen(false)}
          onChange={onChange}
          onError={setError}
        />
      ) : null}
    </section>
  )
}

function daysWord(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'день'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дня'
  return 'дней'
}

function ExpenseModal({
  state,
  today,
  initial,
  onClose,
  onChange,
  onError,
}: {
  state: AppState
  today: string
  initial?: number
  onClose: () => void
  onChange: (next: AppState) => Promise<void>
  onError: (text: string) => void
}) {
  const [raw, setRaw] = useState(
    initial == null ? '' : formatMoney(initial, { withCurrency: false, hideZeroKopecks: true }),
  )
  const [preview, setPreview] = useState<ReturnType<typeof previewOverspend> | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(choice?: 'go_negative' | 'recalc_limit') {
    const amount = parseMoneyInput(raw)
    if (amount == null || amount < 0) {
      onError('Укажите сумму расходов')
      return
    }
    setBusy(true)
    const result = recordExpense(state, today, amount, choice, today)
    if (!result.ok) {
      if (result.overspend) {
        setPreview(result.overspend)
        setBusy(false)
        return
      }
      onError(result.error)
      setBusy(false)
      return
    }
    if (result.warning && !window.confirm(result.warning + ' Продолжить?')) {
      setBusy(false)
      return
    }
    await onChange(result.state)
    setBusy(false)
    onClose()
  }

  return (
    <Modal title="Расходы за сегодня" onClose={onClose}>
      {!preview ? (
        <div className="stack">
          <Field label="Сколько потратили за день">
            <input className="input" inputMode="decimal" value={raw} onChange={(e) => setRaw(e.target.value)} autoFocus />
          </Field>
          <Button block disabled={busy} onClick={() => submit()}>
            Сохранить
          </Button>
        </div>
      ) : (
        <div className="stack">
          <p>
            Перерасход сверх лимита и свободных денег: <strong>{formatMoney(preview.overspend)}</strong>
          </p>
          <p className="muted">
            Дней до следующей выплаты после сегодня: {preview.remainingDaysAfter}. Текущий лимит:{' '}
            {formatMoney(preview.dailyLimit)}.
          </p>
          <div className="choice-card">
            <strong>Уйти в минус</strong>
            <p>Свободные деньги станут {formatMoney(preview.goNegativeFreeMoney)}. Лимит не изменится.</p>
            <Button block onClick={() => submit('go_negative')}>
              Уйти в минус
            </Button>
          </div>
          <div className="choice-card">
            <strong>Пересчитать дневной лимит</strong>
            {preview.budgetInsufficient || preview.newLimit == null ? (
              <p>Оставшегося бюджета недостаточно для неотрицательного лимита. Фиктивные деньги не создаём.</p>
            ) : (
              <>
                <p>Свободные деньги обнулятся. Новый лимит: {formatMoney(preview.newLimit)}.</p>
                <Button block variant="secondary" onClick={() => submit('recalc_limit')}>
                  Пересчитать лимит
                </Button>
              </>
            )}
          </div>
        </div>
      )}
    </Modal>
  )
}

function IncomeModal({
  state,
  derived,
  today,
  onClose,
  onChange,
  onError,
}: {
  state: AppState
  derived: DerivedState
  today: string
  onClose: () => void
  onChange: (next: AppState) => Promise<void>
  onError: (text: string) => void
}) {
  const [amountRaw, setAmountRaw] = useState('')
  const [date, setDate] = useState(today)
  const [description, setDescription] = useState('')
  const [stage, setStage] = useState<'form' | 'split'>('form')
  const [working, setWorking] = useState(state)
  const [incomeId, setIncomeId] = useState<string | null>(null)
  const [incomeAmount, setIncomeAmount] = useState(0)
  const [savingsRaw, setSavingsRaw] = useState('0')
  const [budgetRaw, setBudgetRaw] = useState('0')
  const [accountId, setAccountId] = useState(derived.accounts.filter((a) => !a.archived)[0]?.id ?? '')

  const savings = parseMoneyInput(savingsRaw || '0') ?? 0
  const budget = parseMoneyInput(budgetRaw || '0') ?? 0
  const leftover = incomeAmount - savings - budget
  const limitPreview = previewBudgetIncrease(working, date, budget)

  async function createIncome() {
    const amount = parseMoneyInput(amountRaw)
    if (!amount || amount <= 0) {
      onError('Укажите сумму поступления')
      return
    }
    const result = addExtraIncome(working, { date, amount, description })
    if (!result.ok || !result.incomeId) {
      onError(result.ok ? 'Не удалось сохранить поступление' : result.error)
      return
    }
    setIncomeId(result.incomeId)
    setIncomeAmount(amount)
    setWorking(result.state)
    await onChange(result.state)
    setStage('split')
  }

  async function allocate() {
    if (!incomeId) return
    if (savings + budget > incomeAmount) {
      onError('Нельзя распределить больше, чем поступило')
      return
    }
    if (savings + budget === 0) {
      onClose()
      return
    }
    if (savings > 0 && !accountId) {
      onError('Выберите накопительный счёт')
      return
    }
    const result = allocateExtraIncome(working, {
      incomeId,
      date,
      savings: savings > 0 ? [{ accountId, amount: savings }] : [],
      budgetAmount: budget,
    })
    if (!result.ok) {
      onError(result.error)
      return
    }
    await onChange(result.state)
    onClose()
  }

  return (
    <Modal title={stage === 'form' ? 'Дополнительное поступление' : 'Как распределить'} onClose={onClose}>
      {stage === 'form' ? (
        <div className="stack">
          <Field label="Сумма">
            <input className="input" inputMode="decimal" value={amountRaw} onChange={(e) => setAmountRaw(e.target.value)} />
          </Field>
          <Field label="Дата">
            <input className="input" type="date" value={date} onChange={(e) => setDate(e.target.value)} />
          </Field>
          <Field label="Описание (необязательно)">
            <input className="input" value={description} onChange={(e) => setDescription(e.target.value)} />
          </Field>
          <Button block onClick={createIncome}>
            Далее
          </Button>
        </div>
      ) : (
        <div className="stack">
          <p>Поступило {formatMoney(incomeAmount)}</p>
          <Field label="В накопления">
            <input className="input" inputMode="decimal" value={savingsRaw} onChange={(e) => setSavingsRaw(e.target.value)} />
          </Field>
          {derived.accounts.filter((item) => !item.archived).length > 0 ? (
            <Field label="Счёт">
              <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
                {derived.accounts
                  .filter((item) => !item.archived)
                  .map((item) => (
                    <option key={item.id} value={item.id}>
                      {item.name}
                    </option>
                  ))}
              </select>
            </Field>
          ) : null}
          <Field label="В повседневный бюджет">
            <input className="input" inputMode="decimal" value={budgetRaw} onChange={(e) => setBudgetRaw(e.target.value)} />
          </Field>
          {budget > 0 && limitPreview ? (
            <p className="hint-card">
              Текущий лимит {formatMoney(limitPreview.previousLimit)}. На бюджет {formatMoney(budget)}. Дней:{' '}
              {limitPreview.remainingDays}. Новый лимит {formatMoney(limitPreview.newLimit)}.
            </p>
          ) : null}
          <p className={leftover < 0 ? 'field-error' : 'muted'}>
            Останется нераспределённым: {formatMoney(leftover)}
          </p>
          <Button
            block
            onClick={() => allocate()}
          >
            Подтвердить
          </Button>
        </div>
      )}
    </Modal>
  )
}

function PaydayModal({
  state,
  pending,
  expected,
  onClose,
  onChange,
  onError,
}: {
  state: AppState
  pending: NonNullable<ReturnType<typeof pendingPayday>>
  expected: number
  onClose: () => void
  onChange: (next: AppState) => Promise<void>
  onError: (text: string) => void
}) {
  const settings = state.settings!
  const suggested = settings.savingsMode === 'fixed' ? Math.min(settings.fixedSavingsAmount, expected) : 0
  const [amountRaw, setAmountRaw] = useState(
    formatMoney(expected, { withCurrency: false, hideZeroKopecks: true }),
  )
  const [savedRaw, setSavedRaw] = useState(
    formatMoney(suggested, { withCurrency: false, hideZeroKopecks: true }),
  )
  const accounts = derive(state, pending.date).accounts.filter((item) => !item.archived)
  const [accountId, setAccountId] = useState(accounts[0]?.id ?? '')

  return (
    <Modal
      title={pending.kind === 'advance' ? 'Аванс' : 'Зарплата'}
      onClose={onClose}
    >
      <div className="stack">
        <p className="muted">
          Расчётная сумма {formatMoney(expected)} за {pending.workPeriod}. Свободные деньги сохранятся.
        </p>
        <Field label="Фактическая сумма">
          <input className="input" inputMode="decimal" value={amountRaw} onChange={(e) => setAmountRaw(e.target.value)} />
        </Field>
        <Field label="Отложить в накопления">
          <input className="input" inputMode="decimal" value={savedRaw} onChange={(e) => setSavedRaw(e.target.value)} />
        </Field>
        {accounts.length > 0 ? (
          <Field label="Накопительный счёт">
            <select className="input" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
              {accounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <Button
          block
          onClick={async () => {
            const amount = parseMoneyInput(amountRaw)
            const saved = parseMoneyInput(savedRaw || '0')
            if (!amount || amount <= 0 || saved == null) {
              onError('Проверьте суммы поступления')
              return
            }
            const result = confirmPayday(state, {
              date: pending.date,
              kind: pending.kind,
              amount,
              saved,
              accountId: saved > 0 ? accountId : null,
            })
            if (!result.ok) {
              onError(result.error)
              return
            }
            await onChange(result.state)
            onClose()
          }}
        >
          Зачислить
        </Button>
      </div>
    </Modal>
  )
}
