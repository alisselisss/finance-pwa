import { useMemo, useState } from 'react'
import { formatDateLong, parseISODate } from '../domain/dates'
import {
  addExtraIncome,
  adjustPeriodBudget,
  allocateExtraIncome,
  confirmPayday,
  derive,
  expectedSalaryAmount,
  pendingPayday,
  previewBudgetIncrease,
} from '../domain/engine'
import { buildForecast } from '../domain/forecast'
import { formatMoney, parseMoneyInput } from '../domain/money'
import type { AppState, DerivedState } from '../domain/types'
import {
  Amount,
  Banner,
  Button,
  ErrorBanner,
  Field,
  IconButton,
  ProgressBar,
  Sheet,
  ThemeToggle,
} from './components'
import { AlertIcon, ChevronRightIcon, CoinsIcon, InfoIcon } from './icons'
import { navigate } from './router'
import type { useTheme } from './theme'

type Theme = ReturnType<typeof useTheme>

export function Home({
  state,
  derived,
  today,
  onChange,
  theme,
  onOpenExpense,
}: {
  state: AppState
  derived: DerivedState
  today: string
  onChange: (next: AppState) => Promise<void>
  theme: Theme
  onOpenExpense: () => void
}) {
  const [error, setError] = useState<string | null>(null)
  const [incomeOpen, setIncomeOpen] = useState(false)
  const [payOpen, setPayOpen] = useState(false)
  const [budgetOpen, setBudgetOpen] = useState(false)
  const pending = pendingPayday(state, today)
  const todayExpense = derived.expensesByDate[today]
  const nextForecast = useMemo(() => {
    if (!state.settings) return null
    const items = buildForecast(state.settings, parseISODate(today)!, derived.confirmedPeriodKeys, 4)
    return items.find((item) => !item.confirmed) ?? null
  }, [state.settings, today, derived.confirmedPeriodKeys])

  const period = derived.currentPeriod
  const payday = nextForecast
    ? { date: nextForecast.date, kind: nextForecast.kind === 'advance' ? 'аванс' : 'зарплата' }
    : period
      ? { date: period.nextPayday, kind: period.kind === 'advance' ? 'аванс' : 'зарплата' }
      : null
  const undistributedTotal = derived.undistributed.reduce((sum, item) => sum + item.remaining, 0)
  const periodBudget = derived.dailyLimit * derived.remainingDays + derived.unusedBudget

  return (
    <section className="home">
      <header className="app-header">
        <div className="brand">
          <span className="brand-mark" aria-hidden="true">₽</span>
          <span className="brand-name">Финансы</span>
        </div>
        <div className="header-actions">
          <IconButton label="Добавить поступление" onClick={() => setIncomeOpen(true)}>
            <CoinsIcon size={20} />
          </IconButton>
          <ThemeToggle effective={theme.effective} onToggle={theme.toggle} />
        </div>
      </header>

      <div className="home-center">
        <div className={`hero ${derived.freeMoney < 0 ? 'hero-negative' : 'hero-positive'}`}>
          <div className="hero-glow" aria-hidden="true" />
          <p className="hero-eyebrow">Свободные деньги</p>
          <Amount value={derived.freeMoney} size="xl" tone={derived.freeMoney < 0 ? 'bad' : 'good'} />
          <p className="hero-hint">
            Накопилось сверх дневного лимита — можно потратить. Это не остаток на карте.
          </p>
        </div>
      </div>

      <div className="home-secondary">
        <div className="stat-list">
          <button
            type="button"
            className="stat-row stat-row-column"
            onClick={onOpenExpense}
            aria-label={
              todayExpense == null
                ? 'Записать расходы за сегодня'
                : `Изменить расходы за сегодня: ${formatMoney(todayExpense)}`
            }
          >
            <span className="stat-line">
              <span className="stat-label">Сегодня потрачено</span>
              <span className="stat-value">
                {todayExpense == null ? (
                  <span className="stat-sub">ещё не записано</span>
                ) : (
                  <Amount value={todayExpense} size="md" />
                )}
              </span>
            </span>
            <ProgressBar value={todayExpense ?? 0} max={derived.dailyLimit} />
          </button>

          <div className="stat-row">
            <span className="stat-label">Дневной лимит</span>
            <span className="stat-value">
              {formatMoney(derived.dailyLimit)}
              <span className="stat-sub">действует до выплаты</span>
            </span>
          </div>

          {payday ? (
            <button
              type="button"
              className="stat-row"
              onClick={() => navigate({ name: 'forecast' })}
              aria-label="Открыть график будущих поступлений"
            >
              <span className="stat-label">Следующая выплата</span>
              <span className="stat-value">
                {formatDateLong(parseISODate(payday.date)!)}
                <span className="stat-sub">
                  {payday.kind} ·{' '}
                  {derived.remainingDays <= 0
                    ? 'сегодня'
                    : derived.remainingDays === 1
                      ? 'завтра'
                      : `через ${derived.remainingDays} ${daysWord(derived.remainingDays)}`}
                </span>
              </span>
              <span className="stat-chevron">
                <ChevronRightIcon size={18} />
              </span>
            </button>
          ) : null}

        <button
          type="button"
          className="stat-row"
          onClick={() => setBudgetOpen(true)}
          aria-label="Скорректировать бюджет до выплаты"
        >
          <span className="stat-label">Бюджет до выплаты</span>
          <span className="stat-value">
            {formatMoney(periodBudget)}
            {derived.remainingDays > 0 ? (
              <span className="stat-sub">
                {formatMoney(derived.dailyLimit)} × {derived.remainingDays}{' '}
                {daysWord(derived.remainingDays)} · изменить
              </span>
            ) : null}
          </span>
          <span className="stat-chevron">
            <ChevronRightIcon size={18} />
          </span>
        </button>
        </div>

        {pending ? (
          <Banner
            tone="warn"
            icon={<AlertIcon size={20} />}
            action={
              <Button block onClick={() => setPayOpen(true)}>
                Подтвердить поступление
              </Button>
            }
          >
            Пора оформить {pending.kind === 'advance' ? 'аванс' : 'зарплату'} за {pending.workPeriod}.
          </Banner>
        ) : null}

        {undistributedTotal > 0 ? (
          <Banner tone="info" icon={<InfoIcon size={20} />}>
            Нераспределённый остаток поступлений: {formatMoney(undistributedTotal)}. Он не входит ни в дневной
            бюджет, ни в накопления.
          </Banner>
        ) : null}

        {error ? <ErrorBanner text={error} /> : null}
      </div>

      {budgetOpen && derived.currentPeriod && derived.remainingDays > 0 ? (
        <BudgetSheet
          state={state}
          derived={derived}
          today={today}
          periodBudget={periodBudget}
          onClose={() => setBudgetOpen(false)}
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

function BudgetSheet({
  state,
  derived,
  today,
  periodBudget,
  onClose,
  onChange,
  onError,
}: {
  state: AppState
  derived: DerivedState
  today: string
  periodBudget: number
  onClose: () => void
  onChange: (next: AppState) => Promise<void>
  onError: (text: string) => void
}) {
  const [raw, setRaw] = useState(
    formatMoney(periodBudget, { withCurrency: false, hideZeroKopecks: true }),
  )
  const days = derived.remainingDays
  const parsed = parseMoneyInput(raw)
  const newLimit = parsed != null && parsed >= 0 && days > 0 ? Math.trunc(parsed / days) : null

  return (
    <Sheet title="Бюджет до выплаты" onClose={onClose}>
      <div className="sheet-body">
        <Field
          label="Сколько денег осталось до выплаты"
          hint={`Дней до выплаты: ${days} (включая сегодня) · текущий лимит ${formatMoney(derived.dailyLimit)} в день`}
        >
          <input
            className="input input-amount"
            inputMode="decimal"
            value={raw}
            onChange={(event) => setRaw(event.target.value)}
            autoFocus
          />
        </Field>
        {newLimit != null && newLimit !== derived.dailyLimit ? (
          <p className="hint-card">
            Новый дневной лимит: <strong>{formatMoney(newLimit)}</strong> ({formatMoney(newLimit)} × {days}{' '}
            {daysWord(days)}). Сегодняшняя запись расходов будет пересчитана по новому лимиту.
          </p>
        ) : null}
        <div className="sheet-actions">
          <Button
            block
            size="lg"
            onClick={async () => {
              const amount = parseMoneyInput(raw)
              if (amount == null || amount < 0) {
                onError('Укажите неотрицательную сумму бюджета')
                return
              }
              const result = adjustPeriodBudget(state, amount, today)
              if (!result.ok) {
                onError(result.error)
                return
              }
              await onChange(result.state)
              onClose()
            }}
          >
            Пересчитать дневной лимит
          </Button>
        </div>
      </div>
    </Sheet>
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
    <Sheet title={stage === 'form' ? 'Дополнительное поступление' : 'Как распределить'} onClose={onClose}>
      {stage === 'form' ? (
        <div className="sheet-body">
          <Field label="Сумма">
            <input
              className="input input-amount"
              inputMode="decimal"
              placeholder="0"
              value={amountRaw}
              onChange={(event) => setAmountRaw(event.target.value)}
              autoFocus
            />
          </Field>
          <Field label="Дата">
            <input className="input" type="date" value={date} onChange={(event) => setDate(event.target.value)} />
          </Field>
          <Field label="Описание (необязательно)">
            <input className="input" value={description} onChange={(event) => setDescription(event.target.value)} />
          </Field>
          <div className="sheet-actions">
            <Button block size="lg" onClick={createIncome}>
              Далее
            </Button>
          </div>
        </div>
      ) : (
        <div className="sheet-body">
          <p className="center secondary">
            Поступило <strong>{formatMoney(incomeAmount)}</strong>
          </p>
          <Field label="В накопления">
            <input
              className="input"
              inputMode="decimal"
              value={savingsRaw}
              onChange={(event) => setSavingsRaw(event.target.value)}
            />
          </Field>
          {derived.accounts.filter((item) => !item.archived).length > 0 ? (
            <Field label="Счёт">
              <select className="input" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
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
            <input
              className="input"
              inputMode="decimal"
              value={budgetRaw}
              onChange={(event) => setBudgetRaw(event.target.value)}
            />
          </Field>
          <div className="row">
            <Button
              variant="soft"
              onClick={() => {
                setSavingsRaw('0')
                setBudgetRaw(formatMoney(incomeAmount, { withCurrency: false, hideZeroKopecks: true }))
              }}
            >
              Всё в бюджет
            </Button>
            <Button
              variant="soft"
              disabled={derived.accounts.filter((item) => !item.archived).length === 0}
              onClick={() => {
                setSavingsRaw(formatMoney(incomeAmount, { withCurrency: false, hideZeroKopecks: true }))
                setBudgetRaw('0')
              }}
            >
              Всё в накопления
            </Button>
          </div>
          {budget > 0 && limitPreview ? (
            <p className="hint-card">
              Текущий лимит {formatMoney(limitPreview.previousLimit)}. На бюджет {formatMoney(budget)}. Дней:{' '}
              {limitPreview.remainingDays}. Новый лимит {formatMoney(limitPreview.newLimit)}.
            </p>
          ) : null}
          <p className={leftover < 0 ? 'field-error' : 'muted'}>
            Останется нераспределённым: {formatMoney(leftover)}
          </p>
          <div className="sheet-actions">
            <Button block size="lg" onClick={allocate}>
              Подтвердить
            </Button>
          </div>
        </div>
      )}
    </Sheet>
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
    <Sheet title={pending.kind === 'advance' ? 'Аванс' : 'Зарплата'} onClose={onClose}>
      <div className="sheet-body">
        <p className="sheet-text">
          Расчётная сумма {formatMoney(expected)} за {pending.workPeriod}. Свободные деньги сохранятся.
        </p>
        <Field label="Фактическая сумма">
          <input
            className="input input-amount"
            inputMode="decimal"
            value={amountRaw}
            onChange={(event) => setAmountRaw(event.target.value)}
            autoFocus
          />
        </Field>
        <Field label="Отложить в накопления">
          <input
            className="input"
            inputMode="decimal"
            value={savedRaw}
            onChange={(event) => setSavedRaw(event.target.value)}
          />
        </Field>
        {accounts.length > 0 ? (
          <Field label="Накопительный счёт">
            <select className="input" value={accountId} onChange={(event) => setAccountId(event.target.value)}>
              {accounts.map((item) => (
                <option key={item.id} value={item.id}>
                  {item.name}
                </option>
              ))}
            </select>
          </Field>
        ) : null}
        <div className="sheet-actions">
          <Button
            block
            size="lg"
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
      </div>
    </Sheet>
  )
}
