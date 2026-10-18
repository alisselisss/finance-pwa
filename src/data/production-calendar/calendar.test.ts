import { describe, expect, it } from 'vitest'
import { parseISODate, weekday } from '../../domain/dates'
import { getActualPayday, getYearCalendar, hasCalendarData, isWorkingDay } from './index'
import { workingDaysInMonth } from '../../domain/salary'
import { buildForecast } from '../../domain/forecast'
import { nextPayday, scheduledPaydayFor } from '../../domain/period'
import { confirmPayday, emptyState, saveOnboardingDraft, completeOnboarding } from '../../domain/engine'
import type { OnboardingDraft, Settings } from '../../domain/types'

function d(iso: string) {
  const parsed = parseISODate(iso)
  if (!parsed) throw new Error(`Некорректная дата: ${iso}`)
  return parsed
}

const settings: Settings = {
  grossSalary: 100_000_00,
  ndflBps: 1300,
  advanceDay: 10,
  salaryDay: 25,
  savingsMode: 'fixed',
  fixedSavingsAmount: 10_000_00,
}

describe('производственный календарь: рабочие дни', () => {
  const cases: [string, boolean][] = [
    ['2026-01-09', true],
    ['2026-02-23', false],
    ['2026-03-09', false],
    ['2026-05-11', false],
    ['2026-12-31', false],
    ['2027-02-20', true],
    ['2027-02-22', false],
    ['2027-02-23', false],
    ['2027-05-03', false],
    ['2027-05-10', false],
    ['2027-11-05', false],
    ['2027-12-31', false],
  ]
  for (const [iso, working] of cases) {
    it(`${iso} — ${working ? 'рабочий' : 'нерабочий'} день`, () => {
      expect(isWorkingDay(d(iso))).toBe(working)
    })
  }

  it('обычная среда 2026-10-14 — рабочий день', () => {
    expect(isWorkingDay(d('2026-10-14'))).toBe(true)
  })

  it('праздники, выпавшие на выходные, не делают соседние будни нерабочими', () => {
    // 8 марта 2026 — воскресенье: понедельник 9 марта нерабочий только
    // потому, что он есть в списке переносов, а не автоматически
    expect(isWorkingDay(d('2026-03-10'))).toBe(true)
  })

  it('работает с произвольными датами, а не только с тестовыми примерами', () => {
    for (const iso of ['2026-04-15', '2026-07-20', '2027-03-16', '2027-09-13']) {
      const date = d(iso)
      expect(isWorkingDay(date)).toBe(weekday(date) >= 1 && weekday(date) <= 5)
    }
  })
})

describe('перенос выплаты на предыдущий рабочий день', () => {
  it('рабочая дата не смещается', () => {
    expect(getActualPayday(d('2026-10-16'))).toEqual(d('2026-10-16'))
  })

  it('2026-02-23 (праздник, понедельник) → 2026-02-20', () => {
    expect(getActualPayday(d('2026-02-23'))).toEqual(d('2026-02-20'))
  })

  it('2026-03-08 (воскресенье) → 2026-03-06', () => {
    expect(getActualPayday(d('2026-03-08'))).toEqual(d('2026-03-06'))
  })

  it('2027-11-04 (праздник, четверг) → 2027-11-03', () => {
    expect(getActualPayday(d('2027-11-04'))).toEqual(d('2027-11-03'))
  })

  it('2027-02-23 (праздник) → 2027-02-20 (рабочая суббота)', () => {
    // 22 февраля — перенос выходного, 21-е — воскресенье,
    // 20 февраля — специальная рабочая суббота.
    // Примечание: 19 февраля получилось бы, только если пропускать
    // рабочие субботи, но по правилам 20 февраля — рабочий день.
    expect(getActualPayday(d('2027-02-23'))).toEqual(d('2027-02-20'))
  })

  it('переходит через границу месяца: 2026-05-01 → 2026-04-30', () => {
    expect(getActualPayday(d('2026-05-01'))).toEqual(d('2026-04-30'))
  })

  it('переходит из января в декабрь предыдущего года: 2027-01-01 → 2026-12-30', () => {
    expect(getActualPayday(d('2027-01-01'))).toEqual(d('2026-12-30'))
  })
})

describe('резервный режим для годов без данных', () => {
  it('данные есть только для 2026 и 2027', () => {
    expect(hasCalendarData(2026)).toBe(true)
    expect(hasCalendarData(2027)).toBe(true)
    expect(hasCalendarData(2025)).toBe(false)
    expect(hasCalendarData(2028)).toBe(false)
  })

  it('без данных рабочими считаются будни пн–пт', () => {
    expect(isWorkingDay(d('2025-05-01'))).toBe(true) // четверг
    expect(isWorkingDay(d('2025-05-03'))).toBe(false) // суббота
    expect(getActualPayday(d('2025-05-04'))).toEqual(d('2025-05-02')) // вс → пт
  })

  it('перенос из года без данных работает: 2028-01-01 (суббота) → 2027-12-31', () => {
    // 31 декабря 2027 нерабочее, далее 30 декабря (четверг) без данных — рабочий
    expect(getActualPayday(d('2028-01-01'))).toEqual(d('2027-12-30'))
  })
})

describe('рабочие дни в половинах месяца', () => {
  it('январь 2026: праздники и перенос 9 января', () => {
    expect(workingDaysInMonth(2026, 1)).toEqual({ firstHalf: 5, secondHalf: 11, total: 16 })
  })

  it('ноябрь 2026: 4 ноября в первой половине', () => {
    expect(workingDaysInMonth(2026, 11)).toEqual({ firstHalf: 9, secondHalf: 11, total: 20 })
  })

  it('декабрь 2026: 31 декабря нерабочий', () => {
    expect(workingDaysInMonth(2026, 12)).toEqual({ firstHalf: 11, secondHalf: 11, total: 22 })
  })

  it('февраль 2027: рабочая суббота 20-го и переносы 22/23', () => {
    expect(workingDaysInMonth(2027, 2)).toEqual({ firstHalf: 11, secondHalf: 8, total: 19 })
  })

  it('год без данных считается по пятидневке', () => {
    expect(workingDaysInMonth(2024, 2)).toEqual({ firstHalf: 11, secondHalf: 10, total: 21 })
  })

  it('октябрь 2026 без праздников не изменился', () => {
    expect(workingDaysInMonth(2026, 10)).toEqual({ firstHalf: 11, secondHalf: 11, total: 22 })
  })
})

describe('прогноз и периоды используют фактические даты', () => {
  it('прогноз показывает фактическую дату и исходную настройку', () => {
    const items = buildForecast({ ...settings, salaryDay: 23 }, d('2026-02-01'), [])
    const february = items.find((item) => item.kind === 'salary' && item.workPeriod.includes('феврал'))
    expect(february?.date).toBe('2026-02-20')
    expect(february?.scheduledDate).toBe('2026-02-23')
  })

  it('фактические даты без смещения не помечаются переносом', () => {
    const items = buildForecast(settings, d('2026-11-01'), [])
    const advance = items.find((item) => item.kind === 'advance' && item.date === '2026-11-10')
    expect(advance).toBeDefined()
    expect(advance?.scheduledDate).toBeUndefined()
  })

  it('следующая выплата после аванса смещается на рабочий день', () => {
    const next = nextPayday(d('2026-02-10'), { ...settings, salaryDay: 23 }, 'advance')
    expect(next.kind).toBe('salary')
    expect(next.date).toEqual(d('2026-02-20'))
  })

  it('перенос через границу года сохраняет оплачиваемый период января', () => {
    // Аванс за 1–15 января 2027 (10-е, воскресенье) выплачивается 30 декабря 2026:
    // период и сумма остаются январскими
    const items = buildForecast({ ...settings, salaryDay: 18 }, d('2026-12-01'), [])
    const januaryAdvance = items.find((item) => item.date === '2026-12-30')
    expect(januaryAdvance).toBeDefined()
    expect(januaryAdvance?.scheduledDate).toBe('2027-01-10')
    expect(januaryAdvance?.workPeriod).toContain('январь 2027')
    // январь 2027: 5 рабочих дней в первой половине из 15 всего
    expect(januaryAdvance?.amount).toBe(29_000_00)
  })

  it('восстановление плановой даты по фактической через границу года', () => {
    expect(scheduledPaydayFor(d('2026-12-30'), 10)).toEqual(d('2027-01-10'))
    expect(scheduledPaydayFor(d('2026-02-20'), 23)).toEqual(d('2026-02-23'))
  })

  it('подтверждение январского аванса 30 декабря не зачисляется дважды', () => {
    const draft: OnboardingDraft = {
      step: 4,
      grossSalary: 100_000_00,
      ndflBps: 1300,
      advanceDay: 10,
      salaryDay: 18,
      accounts: [{ id: 'acc-1', name: 'Подушка', balance: 0 }],
      savingsMode: 'fixed',
      fixedSavingsAmount: 0,
      lastPayday: '2026-12-18',
      lastPaydayKind: 'salary',
      lastAmount: 43_500_00,
      lastSaved: 0,
      startingFreeMoney: 0,
    }
    const state = completeOnboarding(saveOnboardingDraft(emptyState(), draft), '2026-12-18')
    if (!state.ok) throw new Error(state.error)
    const first = confirmPayday(state.state, {
      date: '2026-12-30',
      kind: 'advance',
      amount: 29_000_00,
      saved: 0,
      accountId: null,
    })
    if (!first.ok) throw new Error(first.error)
    // Повторное подтверждение той же выплаты — 10 января — отклоняется
    const second = confirmPayday(first.state, {
      date: '2027-01-10',
      kind: 'advance',
      amount: 29_000_00,
      saved: 0,
      accountId: null,
    })
    expect(second.ok).toBe(false)
    if (!second.ok) expect(second.error).toContain('уже зачислена')
  })
})

describe('целостность данных календаря', () => {
  for (const year of [2026, 2027]) {
    it(`данные ${year} года согласованы`, () => {
      const calendar = getYearCalendar(year)
      if (!calendar) throw new Error('нет данных')
      const dates = calendar.holidays.map((holiday) => holiday.date)
      expect(new Set(dates).size).toBe(dates.length)
      expect(calendar.holidays.every((holiday) => parseISODate(holiday.date) !== null)).toBe(true)
      for (const iso of calendar.extraNonWorking) {
        const date = parseISODate(iso)
        expect(date).not.toBeNull()
        // Дополнительные нерабочие дни — будни
        expect(weekday(date!)).toBeGreaterThanOrEqual(1)
        expect(weekday(date!)).toBeLessThanOrEqual(5)
        // Не дублируют праздники
        expect(dates).not.toContain(iso)
      }
      for (const iso of calendar.workingWeekends) {
        const date = parseISODate(iso)
        expect(date).not.toBeNull()
        // Специальные рабочие дни — выходные
        expect([0, 6]).toContain(weekday(date!))
      }
      expect(calendar.source.length).toBeGreaterThan(0)
    })
  }
})
