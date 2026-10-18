import { daysInMonth, type CalendarDate, clampMonthDay, eachDate, addDays } from './dates'
import { isWorkingDay } from '../data/production-calendar'
import { roundDiv, type Money } from './money'

export const DEFAULT_NDFL_BPS = 1300

export function netFromGross(gross: Money, ndflBps: number = DEFAULT_NDFL_BPS): Money {
  if (gross < 0) throw new Error('Оклад не может быть отрицательным')
  if (ndflBps < 0 || ndflBps > 10000) throw new Error('Некорректная ставка НДФЛ')
  return roundDiv(gross * (10000 - ndflBps), 10000)
}

export function countWorkingDays(start: CalendarDate, endInclusive: CalendarDate): number {
  return eachDate(start, addDays(endInclusive, 1)).filter(isWorkingDay).length
}

export function workingDaysInMonth(year: number, month: number): {
  firstHalf: number
  secondHalf: number
  total: number
} {
  const dim = daysInMonth(year, month)
  const firstHalf = countWorkingDays({ y: year, m: month, d: 1 }, { y: year, m: month, d: 15 })
  const secondHalf = countWorkingDays({ y: year, m: month, d: 16 }, { y: year, m: month, d: dim })
  return { firstHalf, secondHalf, total: firstHalf + secondHalf }
}

export type PaydayKind = 'advance' | 'salary'

export function calcPaydayAmounts(
  gross: Money,
  year: number,
  month: number,
  ndflBps: number = DEFAULT_NDFL_BPS,
): {
  net: Money
  dayCost: Money
  advance: Money
  salary: Money
  workingDays: ReturnType<typeof workingDaysInMonth>
} {
  const net = netFromGross(gross, ndflBps)
  const workingDays = workingDaysInMonth(year, month)
  if (workingDays.total === 0) {
    return { net, dayCost: 0, advance: 0, salary: net, workingDays }
  }
  const dayCost = roundDiv(net, workingDays.total)
  const advance = roundDiv(net * workingDays.firstHalf, workingDays.total)
  const salary = net - advance
  return { net, dayCost, advance, salary, workingDays }
}

export function paydayDateInMonth(
  year: number,
  month: number,
  dayOfMonth: number,
): CalendarDate {
  return clampMonthDay(year, month, dayOfMonth)
}

export function nextOccurrenceOfDay(
  after: CalendarDate,
  dayOfMonth: number,
  options: { inclusive?: boolean } = {},
): CalendarDate {
  const inclusive = options.inclusive ?? false
  const thisMonth = paydayDateInMonth(after.y, after.m, dayOfMonth)
  const thisValue = thisMonth.y * 10000 + thisMonth.m * 100 + thisMonth.d
  const afterValue = after.y * 10000 + after.m * 100 + after.d
  if (inclusive ? thisValue >= afterValue : thisValue > afterValue) return thisMonth
  const nextMonth = after.m === 12 ? 1 : after.m + 1
  const nextYear = after.m === 12 ? after.y + 1 : after.y
  return paydayDateInMonth(nextYear, nextMonth, dayOfMonth)
}

export function workMonthForPayday(
  date: CalendarDate,
  kind: PaydayKind,
  salaryDay: number,
): { year: number; month: number } {
  if (kind === 'advance') {
    return { year: date.y, month: date.m }
  }
  if (salaryDay <= 15) {
    if (date.m === 1) return { year: date.y - 1, month: 12 }
    return { year: date.y, month: date.m - 1 }
  }
  return { year: date.y, month: date.m }
}

export function formatWorkPeriod(kind: PaydayKind, year: number, month: number): string {
  const dim = daysInMonth(year, month)
  const monthName = new Intl.DateTimeFormat('ru-RU', { month: 'long', year: 'numeric' }).format(
    new Date(year, month - 1, 1),
  )
  if (kind === 'advance') {
    return `1–15 ${monthName}`
  }
  return `16–${dim} ${monthName}`
}

export function kindLabel(kind: PaydayKind): string {
  return kind === 'advance' ? 'Аванс' : 'Зарплата'
}
