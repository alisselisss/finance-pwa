import { addDays, isWeekday, toISODate, type CalendarDate } from '../../domain/dates'
import { calendar2026 } from './2026'
import { calendar2027 } from './2027'

export interface HolidayEntry {
  /** Дата праздника в формате YYYY-MM-DD. */
  date: string
  /** Официальное название праздника. */
  name: string
}

export interface DayTransfer {
  /** День, отдающий свой выходной (например, суббота внутри праздников). */
  from: string
  /** День, получающий выходной (или становящийся рабочим — см. заметку года). */
  to: string
  note: string
}

export interface YearCalendar {
  year: number
  /** Постановление о переносе выходных — источник данных года. */
  source: string
  sourceUrl?: string
  /** Официальные праздничные даты с названиями. */
  holidays: HolidayEntry[]
  /** Дополнительные нерабочие будни (перенесённые выходные и т.п.). */
  extraNonWorking: string[]
  /** Специальные рабочие субботы. */
  workingWeekends: string[]
  /** Описание переносов выходных для справки. */
  transfers: DayTransfer[]
}

const YEARS: ReadonlyMap<number, YearCalendar> = new Map<number, YearCalendar>([
  [2026, calendar2026],
  [2027, calendar2027],
])

export function getYearCalendar(year: number): YearCalendar | null {
  return YEARS.get(year) ?? null
}

/** Есть ли подтверждённые данные производственного календаря для года. */
export function hasCalendarData(year: number): boolean {
  return YEARS.has(year)
}

/**
 * Является ли дата рабочим днём по пятидневной производственной неделе.
 *
 * Для годов без подтверждённых данных действует резервный режим:
 * рабочими считаются будни с понедельника по пятницу. Результат
 * для таких лет не является официально подтверждённым — интерфейс
 * предупреждает об этом (см. экран «Будущие поступления»).
 *
 * Порядок правил:
 * 1. дополнительный нерабочий будень → нерабочий;
 * 2. специальная рабочая суббота → рабочий;
 * 3. праздник → нерабочий;
 * 4. суббота и воскресенье → нерабочий;
 * 5. в остальных случаях — рабочий.
 */
export function isWorkingDay(date: CalendarDate): boolean {
  const year = getYearCalendar(date.y)
  if (!year) return isWeekday(date)
  const iso = toISODate(date)
  if (year.workingWeekends.includes(iso)) return true
  if (year.holidays.some((holiday) => holiday.date === iso)) return false
  if (year.extraNonWorking.includes(iso)) return false
  return isWeekday(date)
}

/** Название праздника для даты, если она праздничная (для отображения). */
export function holidayName(date: CalendarDate): string | null {
  const year = getYearCalendar(date.y)
  if (!year) return null
  return year.holidays.find((holiday) => holiday.date === toISODate(date))?.name ?? null
}

/** Предохранитель от некорректных данных: месяц сплошных нерабочих дней невозможен. */
const MAX_PAYDAY_SHIFT_DAYS = 30

/**
 * Фактическая дата выплаты: если установленная дата приходится на
 * нерабочий день, выплата смещается на предыдущий рабочий день.
 * Настройка пользователя не изменяется — вычисляется только фактическая дата.
 *
 * Корректно работает через границы месяца и года (в том числе
 * из января в декабрь предыдущего года).
 */
export function getActualPayday(scheduledDate: CalendarDate): CalendarDate {
  let cursor = scheduledDate
  for (let i = 0; i < MAX_PAYDAY_SHIFT_DAYS && !isWorkingDay(cursor); i += 1) {
    cursor = addDays(cursor, -1)
  }
  return cursor
}
