import { compareDates, parseISODate, toISODate, type CalendarDate } from './dates'
import { createId } from './ids'
import { formatMoney, isMoney, splitEvenly, type Money, ZERO } from './money'
import {
  budgetDayCount,
  inferPaydayKind,
  iso,
  nextPayday,
  periodKey,
  remainingCalendarDays,
  remainingDaysAfter,
  requireDate,
  scheduledPaydayFor,
  upcomingPayday,
} from './period'
import {
  calcPaydayAmounts,
  formatWorkPeriod,
  workMonthForPayday,
  type PaydayKind,
} from './salary'
import type {
  ActionResult,
  AppState,
  DerivedState,
  FinanceEvent,
  IncomeRemainder,
  OnboardingDraft,
  OverspendPreview,
  Settings,
} from './types'
import { APP_VERSION, SCHEMA_VERSION } from './types'
import { buildForecast } from './forecast'

export function emptyState(): AppState {
  return {
    schemaVersion: SCHEMA_VERSION,
    appVersion: APP_VERSION,
    onboarding: {
      completed: false,
      draft: { step: 1, accounts: [] },
    },
    settings: null,
    accounts: [],
    events: [],
    trackingStartDate: null,
    seedFreeMoney: ZERO,
  }
}

export function saveOnboardingDraft(state: AppState, draft: OnboardingDraft): AppState {
  return {
    ...state,
    onboarding: { ...state.onboarding, draft },
  }
}

const EVENT_ORDER: Record<string, number> = {
  account_created: 0,
  account_renamed: 1,
  account_archived: 2,
  period_started: 3,
  extra_income: 4,
  extra_allocation: 5,
  settings_changed: 6,
  limit_recalc: 7,
  daily_expense: 8,
}

function orderedEvents(events: FinanceEvent[]): FinanceEvent[] {
  const lastExpense = new Map<string, FinanceEvent>()
  const rest: FinanceEvent[] = []
  const chronological = [...events].sort((a, b) => a.seq - b.seq)
  for (const event of chronological) {
    if (event.type === 'daily_expense') lastExpense.set(event.date, event)
    else rest.push(event)
  }
  return [...rest, ...lastExpense.values()].sort((a, b) => {
    if (a.date !== b.date) return a.date.localeCompare(b.date)
    const order = (EVENT_ORDER[a.type] ?? 50) - (EVENT_ORDER[b.type] ?? 50)
    if (order !== 0) return order
    return a.seq - b.seq
  })
}

function nextSeq(state: AppState): number {
  return state.events.reduce((max, event) => Math.max(max, event.seq), 0) + 1
}

function pushEvent(state: AppState, event: Omit<FinanceEvent, 'seq'>): AppState {
  return {
    ...state,
    events: [...state.events, { ...event, seq: nextSeq(state) }],
  }
}

export function derive(state: AppState, asOfIso: string): DerivedState {
  const asOf = requireDate(asOfIso)
  const balances = new Map<string, Money>()
  const names = new Map<string, { name: string; archived: boolean }>()
  for (const account of state.accounts) {
    balances.set(account.id, ZERO)
    names.set(account.id, { name: account.name, archived: account.archived })
  }

  let freeMoney = state.seedFreeMoney
  let dailyLimit = ZERO
  let unusedBudget = ZERO
  let currentPeriod: DerivedState['currentPeriod'] = null
  const confirmedPeriodKeys: string[] = []
  const expensesByDate: Record<string, Money> = {}
  const limitByDate: Record<string, Money> = {}
  const undistributedMap = new Map<string, IncomeRemainder>()
  const extraTotal = new Map<string, { date: string; description: string; total: Money }>()

  const events = orderedEvents(state.events)

  for (const event of events) {
    const date = requireDate(event.date)
    switch (event.type) {
      case 'account_created': {
        const accountId = String(event.payload.accountId)
        const initial = Number(event.payload.initialBalance) as Money
        const name = String(event.payload.name)
        names.set(accountId, { name, archived: false })
        balances.set(accountId, (balances.get(accountId) ?? ZERO) + initial)
        break
      }
      case 'account_renamed': {
        const accountId = String(event.payload.accountId)
        const prev = names.get(accountId)
        if (prev) names.set(accountId, { ...prev, name: String(event.payload.name) })
        break
      }
      case 'account_archived': {
        const accountId = String(event.payload.accountId)
        const prev = names.get(accountId)
        if (prev) names.set(accountId, { ...prev, archived: true })
        break
      }
      case 'period_started': {
        freeMoney += unusedBudget
        unusedBudget = ZERO
        const amount = Number(event.payload.amount) as Money
        const saved = Number(event.payload.saved) as Money
        const accountId = event.payload.accountId ? String(event.payload.accountId) : null
        if (saved > 0 && accountId) {
          balances.set(accountId, (balances.get(accountId) ?? ZERO) + saved)
        }
        const start = date
        const nextPaydayIso = String(event.payload.nextPayday)
        const next = requireDate(nextPaydayIso)
        const daysTotal = budgetDayCount(start, next)
        const pool = amount - saved
        if (daysTotal <= 0) {
          unusedBudget += pool
          dailyLimit = ZERO
        } else {
          const split = splitEvenly(pool, daysTotal)
          dailyLimit = split.perPart
          unusedBudget = split.remainder
        }
        const kind = event.payload.kind as PaydayKind
        const key = String(event.payload.periodKey)
        confirmedPeriodKeys.push(key)
        currentPeriod = {
          id: event.id,
          startDate: event.date,
          nextPayday: nextPaydayIso,
          kind,
          periodKey: key,
          incomeAmount: amount,
          savedAmount: saved,
          daysTotal,
        }
        break
      }
      case 'daily_expense': {
        const amount = Number(event.payload.amount) as Money
        expensesByDate[event.date] = amount
        limitByDate[event.date] = dailyLimit
        freeMoney = freeMoney + dailyLimit - amount
        const overspend = event.payload.overspend as
          | { choice: 'go_negative' | 'recalc_limit'; newLimit: Money | null }
          | undefined
        if (overspend?.choice === 'recalc_limit' && overspend.newLimit !== null && overspend.newLimit >= 0) {
          freeMoney = ZERO
          dailyLimit = overspend.newLimit
        }
        break
      }
      case 'extra_income': {
        const amount = Number(event.payload.amount) as Money
        extraTotal.set(event.id, {
          date: event.date,
          description: String(event.payload.description ?? ''),
          total: amount,
        })
        undistributedMap.set(event.id, {
          incomeId: event.id,
          date: event.date,
          description: String(event.payload.description ?? ''),
          total: amount,
          allocated: ZERO,
          remaining: amount,
        })
        break
      }
      case 'extra_allocation': {
        const incomeId = String(event.payload.incomeId)
        const savings = (event.payload.savings as { accountId: string; amount: Money }[]) ?? []
        const budgetAmount = Number(event.payload.budgetAmount ?? 0) as Money
        let allocated = ZERO
        for (const part of savings) {
          if (part.amount < 0) continue
          balances.set(part.accountId, (balances.get(part.accountId) ?? ZERO) + part.amount)
          allocated += part.amount
        }
        allocated += budgetAmount
        const current = undistributedMap.get(incomeId)
        if (current) {
          const nextAllocated = current.allocated + allocated
          undistributedMap.set(incomeId, {
            ...current,
            allocated: nextAllocated,
            remaining: current.total - nextAllocated,
          })
        }
        if (budgetAmount > 0 && currentPeriod) {
          const next = requireDate(currentPeriod.nextPayday)
          const n = remainingCalendarDays(date, next)
          if (n > 0) {
            const pool = dailyLimit * n + budgetAmount
            const split = splitEvenly(pool, n)
            dailyLimit = split.perPart
            unusedBudget += split.remainder
          } else {
            unusedBudget += budgetAmount
          }
        } else if (budgetAmount > 0) {
          unusedBudget += budgetAmount
        }
        break
      }
      case 'settings_changed': {
        const recalc = event.payload.limitRecalc as
          | { newLimit: Money }
          | undefined
        if (recalc && recalc.newLimit >= 0) {
          dailyLimit = recalc.newLimit
        }
        break
      }
      case 'limit_recalc': {
        const newLimit = Number(event.payload.newLimit) as Money
        if (newLimit >= 0) dailyLimit = newLimit
        const unused = event.payload.unusedBudget
        if (typeof unused === 'number') unusedBudget = unused
        break
      }
      default:
        break
    }
    void asOf
  }

  const remainingDays = currentPeriod
    ? remainingCalendarDays(asOf, requireDate(currentPeriod.nextPayday))
    : 0

  return {
    freeMoney,
    dailyLimit,
    unusedBudget,
    undistributed: [...undistributedMap.values()].filter((item) => item.remaining > 0),
    currentPeriod,
    remainingDays,
    accounts: [...names.entries()].map(([id, meta]) => ({
      id,
      name: meta.name,
      archived: meta.archived,
      balance: balances.get(id) ?? ZERO,
    })),
    expensesByDate,
    confirmedPeriodKeys,
    limitByDate,
  }
}

export function previewOverspend(
  state: AppState,
  dateIso: string,
  expense: Money,
): OverspendPreview {
  const derived = derive(state, dateIso)
  const date = requireDate(dateIso)
  const L = derived.dailyLimit
  const F = derived.freeMoney
  const availableFree = Math.max(F, 0)
  const overspend = expense - L - availableFree
  const needed = overspend > 0
  const daysAfterToday = derived.currentPeriod
    ? remainingDaysAfter(date, requireDate(derived.currentPeriod.nextPayday))
    : 0
  let newLimit: Money | null = null
  let budgetInsufficient = false
  if (needed && daysAfterToday > 0) {
    const pool = L * daysAfterToday - overspend
    if (pool < 0) {
      budgetInsufficient = true
    } else {
      newLimit = splitEvenly(pool, daysAfterToday).perPart
    }
  } else if (needed && daysAfterToday <= 0) {
    budgetInsufficient = true
  }
  return {
    needed,
    expense,
    dailyLimit: L,
    freeMoney: F,
    overspend: Math.max(overspend, 0),
    remainingDaysAfter: daysAfterToday,
    newLimit,
    budgetInsufficient,
    goNegativeFreeMoney: F + L - expense,
  }
}

function validateAmount(amount: Money, { allowZero = false } = {}): string | null {
  if (!Number.isInteger(amount) || !Number.isSafeInteger(amount)) return 'Сумма должна быть целым числом копеек'
  if (amount < 0) return 'Сумма не может быть отрицательной'
  if (!allowZero && amount === 0) return 'Сумма должна быть больше нуля'
  return null
}

export function completeOnboarding(
  state: AppState,
  todayIso: string,
): ActionResult {
  const draft = state.onboarding.draft
  const error = validateOnboardingDraft(draft)
  if (error) return { ok: false, error }

  const settings: Settings = {
    grossSalary: draft.grossSalary!,
    ndflBps: draft.ndflBps ?? 1300,
    advanceDay: draft.advanceDay!,
    salaryDay: draft.salaryDay!,
    savingsMode: draft.savingsMode!,
    fixedSavingsAmount: draft.fixedSavingsAmount ?? ZERO,
  }

  let next: AppState = {
    ...state,
    settings,
    trackingStartDate: todayIso,
    seedFreeMoney: draft.startingFreeMoney ?? ZERO,
    onboarding: { completed: true, draft },
    accounts: draft.accounts.map((account) => ({
      id: account.id,
      name: account.name,
      createdOn: todayIso,
      archived: false,
    })),
    events: [],
  }

  for (const account of draft.accounts) {
    next = pushEvent(next, {
      id: createId(),
      type: 'account_created',
      date: todayIso,
      description: `Накопительный счёт «${account.name}»`,
      payload: {
        accountId: account.id,
        name: account.name,
        initialBalance: account.balance,
      },
    })
  }

  const lastPayday = requireDate(draft.lastPayday!)
  const kind = draft.lastPaydayKind ?? inferPaydayKind(lastPayday, settings)
  if (!kind) return { ok: false, error: 'Не удалось определить тип последней выплаты' }
  // Период оплаты — по плановой дате (перенос с нерабочего дня не меняет период)
  const scheduledLast = scheduledPaydayFor(
    lastPayday,
    kind === 'advance' ? settings.advanceDay : settings.salaryDay,
  )
  const work = workMonthForPayday(scheduledLast, kind, settings.salaryDay)
  const nextPay = nextPayday(lastPayday, settings, kind)
  const days = budgetDayCount(lastPayday, nextPay.date)
  if (days <= 0) return { ok: false, error: 'Некорректный бюджетный период: следующая выплата должна быть позже текущей' }

  next = pushEvent(next, {
    id: createId(),
    type: 'period_started',
    date: draft.lastPayday!,
    description: kind === 'advance' ? 'Аванс' : 'Зарплата',
    payload: {
      kind,
      amount: draft.lastAmount!,
      saved: draft.lastSaved ?? ZERO,
      accountId: draft.lastSavedAccountId ?? null,
      nextPayday: iso(nextPay.date),
      periodKey: periodKey(kind, work.year, work.month),
      workPeriod: formatWorkPeriod(kind, work.year, work.month),
      daysTotal: days,
    },
  })

  return { ok: true, state: next }
}

export function validateOnboardingDraft(draft: OnboardingDraft): string | null {
  if (draft.grossSalary == null || draft.grossSalary <= 0) return 'Укажите месячный оклад'
  if (!draft.advanceDay || !draft.salaryDay) return 'Укажите даты выплат'
  if (draft.advanceDay < 1 || draft.advanceDay > 31 || draft.salaryDay < 1 || draft.salaryDay > 31) {
    return 'День выплаты должен быть от 1 до 31'
  }
  if (draft.advanceDay === draft.salaryDay) return 'Даты аванса и зарплаты должны отличаться'
  if (!draft.savingsMode) return 'Выберите режим накоплений'
  if (draft.savingsMode === 'fixed' && (draft.fixedSavingsAmount == null || draft.fixedSavingsAmount < 0)) {
    return 'Укажите сумму откладывания'
  }
  if (!draft.lastPayday || !parseISODate(draft.lastPayday)) return 'Укажите дату последнего поступления'
  if (draft.lastAmount == null || draft.lastAmount <= 0) return 'Укажите сумму последнего поступления'
  if ((draft.lastSaved ?? 0) < 0) return 'Отложенная сумма не может быть отрицательной'
  if ((draft.lastSaved ?? 0) > draft.lastAmount) return 'Нельзя отложить больше, чем поступило'
  if ((draft.lastSaved ?? 0) > 0 && !draft.lastSavedAccountId) {
    return 'Выберите накопительный счёт для отложенной суммы'
  }
  if (draft.startingFreeMoney != null && !Number.isInteger(draft.startingFreeMoney)) {
    return 'Некорректная сумма свободных денег'
  }
  for (const account of draft.accounts) {
    if (!account.name.trim()) return 'У накопительного счёта должно быть название'
    if (account.balance < 0) return 'Баланс накопительного счёта не может быть отрицательным'
  }
  return null
}

export function recordExpense(
  state: AppState,
  dateIso: string,
  amount: Money,
  overspendChoice?: 'go_negative' | 'recalc_limit',
  todayIso?: string,
): ActionResult {
  const amountError = validateAmount(amount, { allowZero: true })
  if (amountError) return { ok: false, error: amountError }
  if (!state.onboarding.completed || !state.settings) {
    return { ok: false, error: 'Сначала завершите настройку' }
  }
  const date = parseISODate(dateIso)
  if (!date) return { ok: false, error: 'Некорректная дата' }
  const today = requireDate(todayIso ?? dateIso)
  if (compareDates(date, today) > 0) return { ok: false, error: 'Нельзя записать расходы будущим числом' }
  if (state.trackingStartDate && dateIso < state.trackingStartDate) {
    return { ok: false, error: 'Нельзя записать расходы до начала учёта' }
  }

  const derived = derive(state, dateIso)
  if (!derived.currentPeriod) return { ok: false, error: 'Нет активного бюджетного периода' }
  if (dateIso >= derived.currentPeriod.nextPayday) {
    return { ok: false, error: 'Сначала подтвердите новое поступление зарплаты' }
  }

  const existing = derived.expensesByDate[dateIso]
  const preview = previewOverspend(withoutExpenseOn(state, dateIso), dateIso, amount)
  if (preview.needed && !overspendChoice) {
    return { ok: false, error: 'Недостаточно свободных денег', overspend: preview }
  }
  if (preview.needed && overspendChoice === 'recalc_limit') {
    if (preview.budgetInsufficient || preview.newLimit === null) {
      return { ok: false, error: 'Оставшегося бюджета недостаточно, чтобы пересчитать дневной лимит без отрицательного значения' }
    }
  }

  const warning =
    existing != null && existing !== amount
      ? 'Изменение прошлых расходов пересчитает свободные деньги за последующие дни. Зафиксированные лимиты прошлых дней не изменятся.'
      : undefined

  const overspend =
    preview.needed && overspendChoice
      ? {
          choice: overspendChoice,
          overspend: preview.overspend,
          previousLimit: preview.dailyLimit,
          newLimit: overspendChoice === 'recalc_limit' ? preview.newLimit : null,
          remainingDaysAfter: preview.remainingDaysAfter,
        }
      : undefined

  const without = withoutExpenseOn(state, dateIso)
  const next = pushEvent(without, {
    id: createId(),
    type: 'daily_expense',
    date: dateIso,
    description: 'Расходы за день',
    payload: { amount, overspend },
  })
  return { ok: true, state: next, warning }
}

function withoutExpenseOn(state: AppState, dateIso: string): AppState {
  return {
    ...state,
    events: state.events.filter((event) => !(event.type === 'daily_expense' && event.date === dateIso)),
  }
}

export function confirmPayday(
  state: AppState,
  input: {
    date: string
    kind: PaydayKind
    amount: Money
    saved: Money
    accountId: string | null
  },
): ActionResult {
  if (!state.settings) return { ok: false, error: 'Нет настроек' }
  const amountError = validateAmount(input.amount)
  if (amountError) return { ok: false, error: amountError }
  if (input.saved < 0) return { ok: false, error: 'Отложенная сумма не может быть отрицательной' }
  if (input.saved > input.amount) return { ok: false, error: 'Нельзя отложить больше, чем поступило' }
  if (input.saved > 0 && !input.accountId) return { ok: false, error: 'Выберите накопительный счёт' }
  const date = parseISODate(input.date)
  if (!date) return { ok: false, error: 'Некорректная дата' }

  const derived = derive(state, input.date)
  // Период оплаты — по плановой дате выплаты, даже если деньги получены
  // раньше из-за переноса с нерабочего дня
  const scheduled = scheduledPaydayFor(
    date,
    input.kind === 'advance' ? state.settings.advanceDay : state.settings.salaryDay,
  )
  const work = workMonthForPayday(scheduled, input.kind, state.settings.salaryDay)
  const key = periodKey(input.kind, work.year, work.month)
  if (derived.confirmedPeriodKeys.includes(key)) {
    return { ok: false, error: 'Эта выплата уже зачислена' }
  }

  const nextPay = nextPayday(date, state.settings, input.kind)
  const days = budgetDayCount(date, nextPay.date)
  if (days <= 0) return { ok: false, error: 'Следующая выплата должна быть позже текущей' }

  const next = pushEvent(state, {
    id: createId(),
    type: 'period_started',
    date: input.date,
    description: input.kind === 'advance' ? 'Аванс' : 'Зарплата',
    payload: {
      kind: input.kind,
      amount: input.amount,
      saved: input.saved,
      accountId: input.accountId,
      nextPayday: iso(nextPay.date),
      periodKey: key,
      workPeriod: formatWorkPeriod(input.kind, work.year, work.month),
      daysTotal: days,
    },
  })
  return { ok: true, state: next }
}

export function addExtraIncome(
  state: AppState,
  input: { date: string; amount: Money; description?: string },
): ActionResult {
  const amountError = validateAmount(input.amount)
  if (amountError) return { ok: false, error: amountError }
  if (!parseISODate(input.date)) return { ok: false, error: 'Некорректная дата' }
  const id = createId()
  const next = pushEvent(state, {
    id,
    type: 'extra_income',
    date: input.date,
    description: input.description?.trim() || 'Дополнительное поступление',
    payload: { amount: input.amount, description: input.description?.trim() || '' },
  })
  return { ok: true, state: next, incomeId: id }
}

export function allocateExtraIncome(
  state: AppState,
  input: {
    incomeId: string
    date: string
    savings: { accountId: string; amount: Money }[]
    budgetAmount: Money
  },
): ActionResult {
  if (input.budgetAmount < 0) return { ok: false, error: 'Сумма на бюджет не может быть отрицательной' }
  for (const part of input.savings) {
    if (part.amount < 0) return { ok: false, error: 'Сумма перевода в накопления не может быть отрицательной' }
  }
  const derived = derive(state, input.date)
  const remainder = derived.undistributed.find((item) => item.incomeId === input.incomeId)
  const incomeEvent = state.events.find((event) => event.id === input.incomeId && event.type === 'extra_income')
  if (!incomeEvent) return { ok: false, error: 'Поступление не найдено' }
  const remaining = remainder?.remaining ?? ZERO
  const totalParts = input.savings.reduce((sum, part) => sum + part.amount, 0) + input.budgetAmount
  if (totalParts > remaining) return { ok: false, error: 'Нельзя распределить больше, чем осталось от поступления' }
  if (totalParts === 0) return { ok: false, error: 'Укажите, как распределить деньги' }

  const previewLimit = (() => {
    if (input.budgetAmount <= 0 || !derived.currentPeriod) return null
    const n = remainingCalendarDays(requireDate(input.date), requireDate(derived.currentPeriod.nextPayday))
    if (n <= 0) return { previous: derived.dailyLimit, next: derived.dailyLimit, remainingDays: n }
    const split = splitEvenly(derived.dailyLimit * n + input.budgetAmount, n)
    return { previous: derived.dailyLimit, next: split.perPart, remainingDays: n }
  })()

  const next = pushEvent(state, {
    id: createId(),
    type: 'extra_allocation',
    date: input.date,
    description: 'Распределение дополнительного поступления',
    payload: {
      incomeId: input.incomeId,
      savings: input.savings.filter((part) => part.amount > 0),
      budgetAmount: input.budgetAmount,
      previousLimit: previewLimit?.previous ?? derived.dailyLimit,
      newLimit: previewLimit?.next ?? derived.dailyLimit,
      remainingDays: previewLimit?.remainingDays ?? 0,
    },
  })
  return { ok: true, state: next }
}

export function previewBudgetIncrease(
  state: AppState,
  dateIso: string,
  budgetAmount: Money,
): { previousLimit: Money; newLimit: Money; remainingDays: number } | null {
  const derived = derive(state, dateIso)
  if (!derived.currentPeriod || budgetAmount <= 0) return null
  const n = remainingCalendarDays(requireDate(dateIso), requireDate(derived.currentPeriod.nextPayday))
  if (n <= 0) return { previousLimit: derived.dailyLimit, newLimit: derived.dailyLimit, remainingDays: 0 }
  const split = splitEvenly(derived.dailyLimit * n + budgetAmount, n)
  return { previousLimit: derived.dailyLimit, newLimit: split.perPart, remainingDays: n }
}

export function createAccount(state: AppState, name: string, balance: Money, dateIso: string): ActionResult {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, error: 'Укажите название счёта' }
  if (balance < 0) return { ok: false, error: 'Баланс не может быть отрицательным' }
  const id = createId()
  const withAccount: AppState = {
    ...state,
    accounts: [
      ...state.accounts,
      { id, name: trimmed, createdOn: dateIso, archived: false },
    ],
  }
  return {
    ok: true,
    state: pushEvent(withAccount, {
      id: createId(),
      type: 'account_created',
      date: dateIso,
      description: `Накопительный счёт «${trimmed}»`,
      payload: { accountId: id, name: trimmed, initialBalance: balance },
    }),
  }
}

export function renameAccount(state: AppState, accountId: string, name: string, dateIso: string): ActionResult {
  const trimmed = name.trim()
  if (!trimmed) return { ok: false, error: 'Укажите название счёта' }
  const accounts = state.accounts.map((account) =>
    account.id === accountId ? { ...account, name: trimmed } : account,
  )
  return {
    ok: true,
    state: pushEvent(
      { ...state, accounts },
      {
        id: createId(),
        type: 'account_renamed',
        date: dateIso,
        description: `Счёт переименован в «${trimmed}»`,
        payload: { accountId, name: trimmed },
      },
    ),
  }
}

export function archiveAccount(
  state: AppState,
  accountId: string,
  dateIso: string,
  force = false,
): ActionResult {
  const derived = derive(state, dateIso)
  const account = derived.accounts.find((item) => item.id === accountId)
  if (!account) return { ok: false, error: 'Счёт не найден' }
  if (account.balance !== 0 && !force) {
    return { ok: false, error: 'Нельзя удалить счёт с ненулевым балансом. Сначала распределите остаток.' }
  }
  const accounts = state.accounts.map((item) =>
    item.id === accountId ? { ...item, archived: true } : item,
  )
  return {
    ok: true,
    state: pushEvent(
      { ...state, accounts },
      {
        id: createId(),
        type: 'account_archived',
        date: dateIso,
        description:
          account.balance !== 0
            ? `Счёт «${account.name}» удалён, баланс ${formatMoney(account.balance)} исключён из учёта`
            : `Счёт «${account.name}» удалён`,
        payload: { accountId, closedBalance: account.balance },
      },
    ),
  }
}

/**
 * Ручная корректировка: пользователь задаёт, сколько денег реально осталось
 * до следующей выплаты. Сумма делится по оставшимся дням (включая сегодня)
 * через существующий механизм limit_recalc; копеечный хвост уходит в
 * unusedBudget и добавится к свободным деньгам при следующей выплате.
 */
export function adjustPeriodBudget(state: AppState, remainingBudget: Money, dateIso: string): ActionResult {
  if (!isMoney(remainingBudget) || remainingBudget < 0) {
    return { ok: false, error: 'Укажите неотрицательную сумму бюджета' }
  }
  const derived = derive(state, dateIso)
  if (!derived.currentPeriod || derived.remainingDays <= 0) {
    return { ok: false, error: 'Период уже закончился — подтвердите поступление' }
  }
  const days = derived.remainingDays
  const { perPart, remainder } = splitEvenly(remainingBudget, days)
  return {
    ok: true,
    state: pushEvent(state, {
      id: createId(),
      type: 'limit_recalc',
      date: dateIso,
      description: 'Ручная корректировка бюджета',
      payload: { newLimit: perPart, unusedBudget: derived.unusedBudget + remainder },
    }),
  }
}

export function updateSettings(
  state: AppState,
  patch: Partial<Settings>,
  dateIso: string,
  confirmLimitChange: boolean,
): ActionResult {
  if (!state.settings) return { ok: false, error: 'Нет настроек' }
  const settings: Settings = { ...state.settings, ...patch }
  if (settings.advanceDay === settings.salaryDay) {
    return { ok: false, error: 'Даты аванса и зарплаты должны отличаться' }
  }
  if (settings.grossSalary <= 0) return { ok: false, error: 'Оклад должен быть больше нуля' }
  if (settings.fixedSavingsAmount < 0) return { ok: false, error: 'Сумма откладывания не может быть отрицательной' }

  const derived = derive(state, dateIso)
  let limitRecalc: { previousLimit: Money; newLimit: Money; remainingDays: number } | undefined
  let nextState: AppState = { ...state, settings }

  const paydayShifted =
    patch.advanceDay != null ||
    patch.salaryDay != null

  if (paydayShifted && derived.currentPeriod) {
    const periodEvent = state.events.find((event) => event.id === derived.currentPeriod?.id)
    const lastKind = (periodEvent?.payload.kind as PaydayKind) ?? derived.currentPeriod.kind
    const start = requireDate(derived.currentPeriod.startDate)
    const nextPay = nextPayday(start, settings, lastKind)
    const n = remainingCalendarDays(requireDate(dateIso), nextPay.date)
    const oldN = derived.remainingDays
    const pool = derived.dailyLimit * oldN + derived.unusedBudget
    if (n !== oldN) {
      if (n <= 0) {
        // Выплата по новой дате уже наступила: событие периода не трогаем,
        // чтобы не пересчитывать задним числом зафиксированные лимиты.
        // pendingPayday предложит оформить поступление по новым настройкам.
        if (!confirmLimitChange) {
          return {
            ok: false,
            error: `Новая дата выплаты уже наступила. Дневной лимит ${formatMoney(derived.dailyLimit)} и свободные деньги не изменятся; приложение предложит оформить это поступление на главном экране. Подтвердить?`,
          }
        }
      } else {
        if (!confirmLimitChange) {
          const newLimit = splitEvenly(pool, n).perPart
          return {
            ok: false,
            error: `Изменение дат выплат меняет длину текущего периода: осталось дней ${oldN} → ${n}. Текущий лимит ${formatMoney(derived.dailyLimit)}, новый составит ${formatMoney(newLimit)}. Свободные деньги не изменятся. Подтвердить?`,
          }
        }
        const split = splitEvenly(pool, n)
        limitRecalc = { previousLimit: derived.dailyLimit, newLimit: split.perPart, remainingDays: n }
        nextState = {
          ...nextState,
          events: nextState.events.map((event) =>
            event.id === derived.currentPeriod?.id
              ? {
                  ...event,
                  payload: {
                    ...event.payload,
                    nextPayday: iso(nextPay.date),
                    daysTotal: budgetDayCount(start, nextPay.date),
                  },
                }
              : event,
          ),
        }
      }
    }
  }

  nextState = pushEvent(nextState, {
    id: createId(),
    type: 'settings_changed',
    date: dateIso,
    description: 'Изменены настройки',
    payload: { settings, limitRecalc },
  })
  return { ok: true, state: nextState }
}

export function pendingPayday(
  state: AppState,
  todayIso: string,
): { date: string; kind: PaydayKind; expectedAmount: Money; periodKey: string; workPeriod: string } | null {
  if (!state.settings) return null
  const derived = derive(state, todayIso)
  const today = requireDate(todayIso)
  if (!derived.currentPeriod) {
    const upcoming = upcomingPayday(today, state.settings)
    if (compareDates(upcoming.date, today) <= 0) {
      return forecastItem(state.settings, upcoming.date, upcoming.kind, derived.confirmedPeriodKeys)
    }
    return null
  }
  const nextDate = requireDate(derived.currentPeriod.nextPayday)
  if (compareDates(nextDate, today) <= 0) {
    const periodEvent = state.events.find((event) => event.id === derived.currentPeriod?.id)
    const lastKind = (periodEvent?.payload.kind as PaydayKind) ?? derived.currentPeriod.kind
    const upcoming = nextPayday(requireDate(derived.currentPeriod.startDate), state.settings, lastKind)
    return forecastItem(state.settings, upcoming.date, upcoming.kind, derived.confirmedPeriodKeys)
  }
  // Даты выплат изменили так, что следующая выплата по настройкам наступила
  // раньше, чем закончится текущий период по старому расписанию.
  const bySettings = upcomingPayday(today, state.settings)
  if (compareDates(bySettings.date, nextDate) < 0 && compareDates(bySettings.date, today) <= 0) {
    const work = workMonthForPayday(bySettings.date, bySettings.kind, state.settings.salaryDay)
    const key = periodKey(bySettings.kind, work.year, work.month)
    if (!derived.confirmedPeriodKeys.includes(key)) {
      return forecastItem(state.settings, bySettings.date, bySettings.kind, derived.confirmedPeriodKeys)
    }
  }
  return null
}

function forecastItem(
  settings: Settings,
  date: CalendarDate,
  kind: PaydayKind,
  confirmed: string[],
) {
  const items = buildForecast(settings, date, confirmed, 1)
  const found = items.find((item) => item.kind === kind && item.date === toISODate(date))
  return {
    date: toISODate(date),
    kind,
    expectedAmount: found?.amount ?? ZERO,
    periodKey: found?.periodKey ?? '',
    workPeriod: found?.workPeriod ?? '',
  }
}

export function journal(state: AppState) {
  return [...state.events].sort((a, b) => b.date.localeCompare(a.date) || b.seq - a.seq)
}

export function expectedSalaryAmount(settings: Settings, dateIso: string, kind: PaydayKind): Money {
  const date = requireDate(dateIso)
  const work = workMonthForPayday(date, kind, settings.salaryDay)
  const amounts = calcPaydayAmounts(settings.grossSalary, work.year, work.month, settings.ndflBps)
  return kind === 'advance' ? amounts.advance : amounts.salary
}
