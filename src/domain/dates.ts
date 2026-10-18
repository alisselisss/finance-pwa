/** Календарные даты в локальной зоне, без времени. */

export type CalendarDate = { y: number; m: number; d: number }

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/

export function parseISODate(value: string): CalendarDate | null {
  const match = ISO_DATE.exec(value)
  if (!match) return null
  const y = Number(match[1])
  const m = Number(match[2])
  const d = Number(match[3])
  if (!isValidDate(y, m, d)) return null
  return { y, m, d }
}

export function toISODate(date: CalendarDate): string {
  return `${String(date.y).padStart(4, '0')}-${String(date.m).padStart(2, '0')}-${String(date.d).padStart(2, '0')}`
}

export function isValidDate(y: number, m: number, d: number): boolean {
  if (!Number.isInteger(y) || !Number.isInteger(m) || !Number.isInteger(d)) return false
  if (m < 1 || m > 12 || d < 1) return false
  return d <= daysInMonth(y, m)
}

export function isLeapYear(y: number): boolean {
  return (y % 4 === 0 && y % 100 !== 0) || y % 400 === 0
}

export function daysInMonth(y: number, m: number): number {
  return [31, isLeapYear(y) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][m - 1]
}

export function clampMonthDay(y: number, m: number, day: number): CalendarDate {
  return { y, m, d: Math.min(day, daysInMonth(y, m)) }
}

export function addDays(date: CalendarDate, days: number): CalendarDate {
  const utc = Date.UTC(date.y, date.m - 1, date.d + days)
  const as = new Date(utc)
  return { y: as.getUTCFullYear(), m: as.getUTCMonth() + 1, d: as.getUTCDate() }
}

export function addMonths(date: CalendarDate, months: number): CalendarDate {
  const m0 = date.m - 1 + months
  const y = date.y + Math.floor(m0 / 12)
  const m = ((m0 % 12) + 12) % 12
  return clampMonthDay(y, m + 1, date.d)
}

export function compareDates(a: CalendarDate, b: CalendarDate): number {
  if (a.y !== b.y) return a.y - b.y
  if (a.m !== b.m) return a.m - b.m
  return a.d - b.d
}

export function datesEqual(a: CalendarDate, b: CalendarDate): boolean {
  return compareDates(a, b) === 0
}

/** Число календарных дней от start включительно до end исключительно. */
export function daysBetween(start: CalendarDate, end: CalendarDate): number {
  const ms = Date.UTC(end.y, end.m - 1, end.d) - Date.UTC(start.y, start.m - 1, start.d)
  return Math.round(ms / 86_400_000)
}

export function weekday(date: CalendarDate): number {
  return new Date(Date.UTC(date.y, date.m - 1, date.d)).getUTCDay()
}

export function isWeekday(date: CalendarDate): boolean {
  const day = weekday(date)
  return day >= 1 && day <= 5
}

export function todayLocal(): CalendarDate {
  const now = new Date()
  return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate() }
}

export function formatDateLong(date: CalendarDate): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'long',
    year: 'numeric',
  }).format(new Date(date.y, date.m - 1, date.d))
}

export function formatDateShort(date: CalendarDate): string {
  return new Intl.DateTimeFormat('ru-RU', {
    day: 'numeric',
    month: 'short',
  }).format(new Date(date.y, date.m - 1, date.d))
}

export function eachDate(start: CalendarDate, endExclusive: CalendarDate): CalendarDate[] {
  const result: CalendarDate[] = []
  let cursor = start
  while (compareDates(cursor, endExclusive) < 0) {
    result.push(cursor)
    cursor = addDays(cursor, 1)
  }
  return result
}
