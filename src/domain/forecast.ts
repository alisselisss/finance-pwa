import { addMonths, type CalendarDate, toISODate } from './dates'
import { getActualPayday } from '../data/production-calendar'
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
  const fromIso = toISODate(from)
  for (let i = 0; i < monthsAhead + 1; i += 1) {
    const cursor = addMonths({ y: from.y, m: from.m, d: 1 }, i)
    const year = cursor.y
    const month = cursor.m
    for (const kind of ['advance', 'salary'] as PaydayKind[]) {
      const day = kind === 'advance' ? settings.advanceDay : settings.salaryDay
      // Дата по настройкам пользователя и фактическая дата выплаты:
      // нерабочие дни смещаются на предыдущий рабочий день.
      const scheduled = paydayDateInMonth(year, month, day)
      const date = getActualPayday(scheduled)
      const dateIso = toISODate(date)
      // Перенос может сдвинуть выплату раньше `from` — такой месяц пропускаем
      if (dateIso < fromIso) continue
      // Период оплаты определяется по плановой дате: перенос через границу
      // месяца (например, аванс 10 января, выплаченный 30 декабря)
      // не меняет оплачиваемый период
      const work = workMonthForPayday(scheduled, kind, settings.salaryDay)
      const amounts = calcPaydayAmounts(settings.grossSalary, work.year, work.month, settings.ndflBps)
      const key = periodKey(kind, work.year, work.month)
      const scheduledIso = toISODate(scheduled)
      items.push({
        date: dateIso,
        kind,
        amount: kind === 'advance' ? amounts.advance : amounts.salary,
        workPeriod: formatWorkPeriod(kind, work.year, work.month),
        periodKey: key,
        confirmed: confirmedKeys.includes(key),
        scheduledDate: scheduledIso !== dateIso ? scheduledIso : undefined,
      })
    }
  }
  return items
    .filter((item, index, list) => list.findIndex((other) => other.periodKey === item.periodKey && other.date === item.date) === index)
    .filter((item) => item.date >= fromIso)
    .sort((a, b) => a.date.localeCompare(b.date) || a.kind.localeCompare(b.kind))
    .slice(0, 12)
}
