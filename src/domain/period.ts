import { addDays, compareDates, daysBetween, parseISODate, toISODate, type CalendarDate } from './dates'
import type { Settings } from './types'
import { nextOccurrenceOfDay, type PaydayKind } from './salary'

export function periodKey(kind: PaydayKind, year: number, month: number): string {
  return `${year}-${String(month).padStart(2, '0')}-${kind}`
}

export function nextPayday(
  after: CalendarDate,
  settings: Settings,
  lastKind: PaydayKind,
): { date: CalendarDate; kind: PaydayKind } {
  const kind: PaydayKind = lastKind === 'advance' ? 'salary' : 'advance'
  const day = kind === 'advance' ? settings.advanceDay : settings.salaryDay
  return { date: nextOccurrenceOfDay(after, day), kind }
}

export function upcomingPayday(
  from: CalendarDate,
  settings: Settings,
): { date: CalendarDate; kind: PaydayKind } {
  const advance = nextOccurrenceOfDay(from, settings.advanceDay, { inclusive: true })
  const salary = nextOccurrenceOfDay(from, settings.salaryDay, { inclusive: true })
  if (compareDates(advance, salary) <= 0) {
    return { date: advance, kind: 'advance' }
  }
  return { date: salary, kind: 'salary' }
}

export function budgetDayCount(start: CalendarDate, nextPaydayDate: CalendarDate): number {
  return daysBetween(start, nextPaydayDate)
}

export function remainingCalendarDays(
  from: CalendarDate,
  nextPaydayDate: CalendarDate,
): number {
  const n = daysBetween(from, nextPaydayDate)
  return Math.max(0, n)
}

export function remainingDaysAfter(
  date: CalendarDate,
  nextPaydayDate: CalendarDate,
): number {
  return remainingCalendarDays(addDays(date, 1), nextPaydayDate)
}

export function requireDate(iso: string): CalendarDate {
  const parsed = parseISODate(iso)
  if (!parsed) throw new Error(`Некорректная дата: ${iso}`)
  return parsed
}

export function iso(date: CalendarDate): string {
  return toISODate(date)
}

export function inferPaydayKind(date: CalendarDate, settings: Settings): PaydayKind | null {
  const advance = paydayMatches(date, settings.advanceDay)
  const salary = paydayMatches(date, settings.salaryDay)
  if (advance && !salary) return 'advance'
  if (salary && !advance) return 'salary'
  if (advance && salary) return settings.advanceDay <= settings.salaryDay ? 'advance' : 'salary'
  return null
}

function paydayMatches(date: CalendarDate, dayOfMonth: number): boolean {
  const dim = new Date(Date.UTC(date.y, date.m, 0)).getUTCDate()
  const clamped = Math.min(dayOfMonth, dim)
  return date.d === clamped
}
