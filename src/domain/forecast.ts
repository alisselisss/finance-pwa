import { addMonths, type CalendarDate, toISODate } from './dates'
import {
  calcPaydayAmounts,
  formatWorkPeriod,
  kindLabel,
  paydayDateInMonth,
  workMonthForPayday,
  type PaydayKind,
} from './salary'
import type { PaydayForecast, Settings } from './types'
import { periodKey } from './period'

export { kindLabel }

export function buildForecast(
  settings: Settings,
  from: CalendarDate,
  confirmedKeys: string[],
  monthsAhead = 6,
): PaydayForecast[] {
  const items: PaydayForecast[] = []
  const startMonthIndex = from.y * 12 + (from.m - 1)
  for (let i = 0; i < monthsAhead + 1; i += 1) {
    const cursor = addMonths({ y: from.y, m: from.m, d: 1 }, i)
    const year = cursor.y
    const month = cursor.m
    for (const kind of ['advance', 'salary'] as PaydayKind[]) {
      const day = kind === 'advance' ? settings.advanceDay : settings.salaryDay
      const date = paydayDateInMonth(year, month, day)
      if (date.y * 12 + date.m < startMonthIndex && toISODate(date) < toISODate(from)) {
        continue
      }
      if (toISODate(date) < toISODate(from) && i === 0) {
        // include today, skip past
        if (toISODate(date) < toISODate(from)) continue
      }
      const work = workMonthForPayday(date, kind, settings.salaryDay)
      const amounts = calcPaydayAmounts(settings.grossSalary, work.year, work.month, settings.ndflBps)
      const key = periodKey(kind, work.year, work.month)
      items.push({
        date: toISODate(date),
        kind,
        amount: kind === 'advance' ? amounts.advance : amounts.salary,
        workPeriod: formatWorkPeriod(kind, work.year, work.month),
        periodKey: key,
        confirmed: confirmedKeys.includes(key),
      })
    }
  }
  return items
    .filter((item, index, list) => list.findIndex((other) => other.periodKey === item.periodKey && other.date === item.date) === index)
    .filter((item) => item.date >= toISODate(from))
    .sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind))
    .slice(0, 12)
}
