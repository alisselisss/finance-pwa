import { describe, expect, it } from 'vitest'
import { parseBackup, serializeBackup } from './backup'
import {
  addDays,
  daysBetween,
  isLeapYear,
  parseISODate,
  toISODate,
} from './dates'
import {
  addExtraIncome,
  allocateExtraIncome,
  archiveAccount,
  completeOnboarding,
  confirmPayday,
  createAccount,
  derive,
  emptyState,
  pendingPayday,
  previewBudgetIncrease,
  previewOverspend,
  recordExpense,
  saveOnboardingDraft,
  updateSettings,
} from './engine'
import { formatMoney, parseMoneyInput, roundDiv, splitEvenly } from './money'
import { calcPaydayAmounts, netFromGross, workingDaysInMonth } from './salary'
import type { AppState, OnboardingDraft } from './types'

function draft(overrides: Partial<OnboardingDraft> = {}): OnboardingDraft {
  const accountId = 'acc-1'
  return {
    step: 4,
    grossSalary: 100_000_00,
    ndflBps: 1300,
    advanceDay: 10,
    salaryDay: 25,
    accounts: [{ id: accountId, name: 'Подушка', balance: 10_000_00 }],
    savingsMode: 'fixed',
    fixedSavingsAmount: 10_000_00,
    lastPayday: '2026-10-10',
    lastPaydayKind: 'advance',
    lastAmount: 40_000_00,
    lastSaved: 10_000_00,
    lastSavedAccountId: accountId,
    startingFreeMoney: 5_000_00,
    ...overrides,
  }
}

function onboarded(overrides: Partial<OnboardingDraft> = {}): AppState {
  const started = saveOnboardingDraft(emptyState(), draft(overrides))
  const result = completeOnboarding(started, overrides.lastPayday ?? '2026-10-10')
  if (!result.ok) throw new Error(result.error)
  return result.state
}

describe('зарплата и рабочие дни', () => {
  it('считает оклад после удержания 13%', () => {
    expect(netFromGross(100_000_00)).toBe(87_000_00)
    expect(netFromGross(100_00)).toBe(87_00)
  })

  it('считает рабочие дни в половинах месяца', () => {
    const october = workingDaysInMonth(2026, 10)
    expect(october.firstHalf).toBe(11)
    expect(october.secondHalf).toBe(11)
    expect(october.total).toBe(22)
  })

  it('делит аванс и вторую выплату так, что сумма равна нетто', () => {
    const result = calcPaydayAmounts(100_000_00, 2026, 10)
    expect(result.net).toBe(87_000_00)
    expect(result.advance + result.salary).toBe(result.net)
    expect(result.advance).toBe(roundDiv(result.net * result.workingDays.firstHalf, result.workingDays.total))
  })

  it('корректно обрабатывает февраль високосного года', () => {
    expect(isLeapYear(2024)).toBe(true)
    expect(isLeapYear(2023)).toBe(false)
    const febLeap = workingDaysInMonth(2024, 2)
    expect(febLeap.firstHalf + febLeap.secondHalf).toBe(febLeap.total)
    const feb29 = parseISODate('2024-02-29')
    expect(feb29).toEqual({ y: 2024, m: 2, d: 29 })
    expect(toISODate(addDays(feb29!, 1))).toBe('2024-03-01')
    const amounts = calcPaydayAmounts(80_000_00, 2024, 2)
    expect(amounts.advance + amounts.salary).toBe(amounts.net)
  })
})

describe('свободные деньги и расходы', () => {
  it('увеличивает свободные деньги, если расходы ниже лимита', () => {
    const state = onboarded()
    const before = derive(state, '2026-10-10')
    const recorded = recordExpense(state, '2026-10-10', before.dailyLimit - 100_00)
    if (!recorded.ok) throw new Error(recorded.error)
    const after = derive(recorded.state, '2026-10-10')
    expect(after.freeMoney).toBe(before.freeMoney + 100_00)
  })

  it('не меняет свободные деньги при расходах ровно по лимиту', () => {
    const state = onboarded()
    const before = derive(state, '2026-10-10')
    const recorded = recordExpense(state, '2026-10-10', before.dailyLimit)
    if (!recorded.ok) throw new Error(recorded.error)
    expect(derive(recorded.state, '2026-10-10').freeMoney).toBe(before.freeMoney)
  })

  it('уменьшает свободные деньги при расходах выше лимита', () => {
    const state = onboarded()
    const before = derive(state, '2026-10-10')
    const recorded = recordExpense(state, '2026-10-10', before.dailyLimit + 200_00)
    if (!recorded.ok) throw new Error(recorded.error)
    expect(derive(recorded.state, '2026-10-10').freeMoney).toBe(before.freeMoney - 200_00)
  })

  it('отражает отрицательные свободные деньги', () => {
    const state = onboarded({ startingFreeMoney: 50_00 })
    const before = derive(state, '2026-10-10')
    const expense = before.dailyLimit + before.freeMoney + 10_00
    const preview = previewOverspend(state, '2026-10-10', expense)
    expect(preview.needed).toBe(true)
    const recorded = recordExpense(state, '2026-10-10', expense, 'go_negative')
    if (!recorded.ok) throw new Error(recorded.error)
    expect(derive(recorded.state, '2026-10-10').freeMoney).toBeLessThan(0)
    expect(derive(recorded.state, '2026-10-10').freeMoney).toBe(preview.goNegativeFreeMoney)
  })

  it('пересчитывает лимит при недостатке свободных денег', () => {
    const state = onboarded({ startingFreeMoney: 0, lastSaved: 0, lastAmount: 15_000_00 })
    const before = derive(state, '2026-10-10')
    const expense = before.dailyLimit + 3_000_00
    const preview = previewOverspend(state, '2026-10-10', expense)
    expect(preview.needed).toBe(true)
    expect(preview.newLimit).not.toBeNull()
    const recorded = recordExpense(state, '2026-10-10', expense, 'recalc_limit')
    if (!recorded.ok) throw new Error(recorded.error)
    const after = derive(recorded.state, '2026-10-10')
    expect(after.freeMoney).toBe(0)
    expect(after.dailyLimit).toBe(preview.newLimit)
    expect(after.dailyLimit).toBeLessThan(before.dailyLimit)
  })
})

describe('дополнительные поступления и зарплата', () => {
  it('увеличивает лимит после дополнительного поступления в бюджет', () => {
    const state = onboarded()
    const before = derive(state, '2026-10-11')
    const added = addExtraIncome(state, { date: '2026-10-11', amount: 6_000_00, description: 'Подработка' })
    if (!added.ok || !added.incomeId) throw new Error('income')
    const preview = previewBudgetIncrease(added.state, '2026-10-11', 6_000_00)
    const allocated = allocateExtraIncome(added.state, {
      incomeId: added.incomeId,
      date: '2026-10-11',
      savings: [],
      budgetAmount: 6_000_00,
    })
    if (!allocated.ok) throw new Error(allocated.error)
    const after = derive(allocated.state, '2026-10-11')
    expect(after.dailyLimit).toBeGreaterThan(before.dailyLimit)
    expect(after.dailyLimit).toBe(preview?.newLimit)
    expect(after.freeMoney).toBe(before.freeMoney)
  })

  it('распределяет поступление между бюджетом и накоплениями', () => {
    const state = onboarded()
    const before = derive(state, '2026-10-11')
    const cushion = before.accounts.find((item) => item.name === 'Подушка')!
    const added = addExtraIncome(state, { date: '2026-10-11', amount: 5_000_00 })
    if (!added.ok || !added.incomeId) throw new Error('income')
    const allocated = allocateExtraIncome(added.state, {
      incomeId: added.incomeId,
      date: '2026-10-11',
      savings: [{ accountId: cushion.id, amount: 3_000_00 }],
      budgetAmount: 1_500_00,
    })
    if (!allocated.ok) throw new Error(allocated.error)
    const after = derive(allocated.state, '2026-10-11')
    expect(after.accounts.find((item) => item.id === cushion.id)!.balance).toBe(cushion.balance + 3_000_00)
    expect(after.undistributed[0]?.remaining).toBe(500_00)
    expect(after.dailyLimit).toBeGreaterThan(before.dailyLimit)
    expect(after.freeMoney).toBe(before.freeMoney)
  })

  it('сохраняет свободные деньги при следующей зарплате', () => {
    const state = onboarded()
    const withExpense = recordExpense(state, '2026-10-10', 0)
    if (!withExpense.ok) throw new Error(withExpense.error)
    const free = derive(withExpense.state, '2026-10-10').freeMoney
    const confirmed = confirmPayday(withExpense.state, {
      date: '2026-10-25',
      kind: 'salary',
      amount: 40_000_00,
      saved: 5_000_00,
      accountId: 'acc-1',
    })
    if (!confirmed.ok) throw new Error(confirmed.error)
    const after = derive(confirmed.state, '2026-10-25')
    expect(after.freeMoney).toBeGreaterThanOrEqual(free)
    expect(after.currentPeriod?.kind).toBe('salary')
  })

  it('не допускает двойного зачисления одной выплаты', () => {
    const state = onboarded()
    const first = confirmPayday(state, {
      date: '2026-10-25',
      kind: 'salary',
      amount: 40_000_00,
      saved: 0,
      accountId: null,
    })
    if (!first.ok) throw new Error(first.error)
    const second = confirmPayday(first.state, {
      date: '2026-10-25',
      kind: 'salary',
      amount: 40_000_00,
      saved: 0,
      accountId: null,
    })
    expect(second.ok).toBe(false)
  })

  it('сдвиг даты выплаты на наступивший день не пересчитывает лимит задним числом', () => {
    const state = onboarded()
    const before = derive(state, '2026-10-18')
    const first = updateSettings(state, { salaryDay: 18 }, '2026-10-18', false)
    expect(first.ok).toBe(false)
    if (first.ok) return
    expect(first.error).toContain('Подтвердить?')
    const second = updateSettings(state, { salaryDay: 18 }, '2026-10-18', true)
    if (!second.ok) throw new Error(second.error)
    const after = derive(second.state, '2026-10-18')
    expect(after.dailyLimit).toBe(before.dailyLimit)
    expect(after.freeMoney).toBe(before.freeMoney)
    const pending = pendingPayday(second.state, '2026-10-18')
    expect(pending?.kind).toBe('salary')
    // 18 октября 2026 — воскресенье: фактическая выплата в пятницу 16-го
    expect(pending?.date).toBe('2026-10-16')
    expect(pending?.expectedAmount).toBe(43_500_00)
    const confirmed = confirmPayday(second.state, {
      date: '2026-10-16',
      kind: 'salary',
      amount: 43_500_00,
      saved: 10_000_00,
      accountId: 'acc-1',
    })
    if (!confirmed.ok) throw new Error(confirmed.error)
    const done = derive(confirmed.state, '2026-10-18')
    // новый период: 16 октября → 10 ноября, бюджет 33 500 ₽ на 25 дней
    expect(done.remainingDays).toBe(23)
    expect(done.dailyLimit).toBe(splitEvenly(33_500_00, 25).perPart)
  })
})

describe('хранение, история и валидация', () => {
  it('сохраняет и восстанавливает резервную копию', () => {
    const state = onboarded()
    const json = serializeBackup(state)
    const parsed = parseBackup(json)
    expect(parsed.ok).toBe(true)
    if (!parsed.ok) return
    expect(parsed.backup.state.seedFreeMoney).toBe(state.seedFreeMoney)
    expect(parsed.backup.state.events).toHaveLength(state.events.length)
    expect(parseBackup('{"format":"nope"}').ok).toBe(false)
    expect(parseBackup('not-json').ok).toBe(false)
  })

  it('пересчитывает свободные деньги после правки прошлых расходов', () => {
    const state = onboarded({ startingFreeMoney: 0, lastSaved: 0, lastAmount: 30_000_00 })
    const limit = derive(state, '2026-10-10').dailyLimit
    const day1 = recordExpense(state, '2026-10-10', limit - 100_00)
    if (!day1.ok) throw new Error(day1.error)
    const day2 = recordExpense(day1.state, '2026-10-11', limit)
    if (!day2.ok) throw new Error(day2.error)
    expect(derive(day2.state, '2026-10-11').freeMoney).toBe(100_00)
    const edited = recordExpense(day2.state, '2026-10-10', limit)
    if (!edited.ok) throw new Error(edited.error)
    expect(edited.warning).toBeTruthy()
    expect(derive(edited.state, '2026-10-11').freeMoney).toBe(0)
  })

  it('отклоняет пустые значения, отрицательные суммы и некорректные даты', () => {
    expect(parseMoneyInput('')).toBeNull()
    expect(parseMoneyInput('-10')).toBe(-1000)
    expect(parseMoneyInput('12,3')).toBe(1230)
    expect(parseMoneyInput('12.345')).toBeNull()
    expect(parseISODate('2026-13-01')).toBeNull()
    expect(parseISODate('2023-02-29')).toBeNull()
    expect(parseISODate('2024-02-29')).not.toBeNull()
    const state = onboarded()
    expect(recordExpense(state, '2026-10-10', -1).ok).toBe(false)
    expect(recordExpense(state, 'не дата', 100).ok).toBe(false)
    expect(recordExpense(state, '2026-10-09', 100, undefined, '2026-10-10').ok).toBe(false)
    expect(addExtraIncome(state, { date: '2026-10-11', amount: -5 }).ok).toBe(false)
    const del = archiveAccount(state, 'acc-1', '2026-10-10')
    expect(del.ok).toBe(false)
    const created = createAccount(state, 'Отпуск', 0, '2026-10-10')
    expect(created.ok).toBe(true)
    const emptyName = createAccount(state, '  ', 0, '2026-10-10')
    expect(emptyName.ok).toBe(false)
  })
})

describe('вспомогательные правила', () => {
  it('форматирует суммы по русской локали', () => {
    expect(formatMoney(123456)).toContain('1')
    expect(formatMoney(100_00, { hideZeroKopecks: true })).toContain('100')
  })

  it('делит период без потери копеек', () => {
    const split = splitEvenly(100, 3)
    expect(split.perPart * 3 + split.remainder).toBe(100)
  })

  it('считает дни периода от выплаты включительно до следующей исключительно', () => {
    expect(daysBetween({ y: 2026, m: 10, d: 10 }, { y: 2026, m: 10, d: 25 })).toBe(15)
  })
})
