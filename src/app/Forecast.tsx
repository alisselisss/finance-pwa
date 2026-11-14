import { useState } from 'react'
import {
  addDays,
  compareDates,
  daysBetween,
  eachDate,
  formatDateLong,
  formatDateShort,
  parseISODate,
  toISODate,
  type CalendarDate,
} from '../domain/dates'
import { setVacationDays } from '../domain/engine'
import { buildForecast, kindLabel } from '../domain/forecast'
import { formatMoney } from '../domain/money'
import { hasCalendarData } from '../data/production-calendar'
import type { AppState, DerivedState } from '../domain/types'
import { Banner, Button, Empty, ErrorBanner, Field, IconButton, Screen, Sheet } from './components'
import { AlertIcon, ChevronRightIcon, TrashIcon, TrendIcon } from './icons'
import { navigate } from './router'

const dayNumber = new Intl.DateTimeFormat('ru-RU', { day: 'numeric' })
const monthShort = new Intl.DateTimeFormat('ru-RU', { month: 'short' })

function localDate(date: CalendarDate): Date {
  return new Date(date.y, date.m - 1, date.d)
}

function daysWord(n: number): string {
  const mod10 = n % 10
  const mod100 = n % 100
  if (mod10 === 1 && mod100 !== 11) return 'день'
  if (mod10 >= 2 && mod10 <= 4 && (mod100 < 12 || mod100 > 14)) return 'дня'
  return 'дней'
}

function groupVacationRanges(days: string[]): { start: string; end: string }[] {
  const sorted = [...days].sort()
  const ranges: { start: string; end: string }[] = []
  for (const iso of sorted) {
    const last = ranges[ranges.length - 1]
    if (last && toISODate(addDays(parseISODate(last.end)!, 1)) === iso) {
      last.end = iso
    } else {
      ranges.push({ start: iso, end: iso })
    }
  }
  return ranges
}

function formatRange(start: string, end: string): string {
  const s = parseISODate(start)!
  const e = parseISODate(end)!
  if (start === end) return formatDateLong(s)
  return `${formatDateShort(s)} – ${formatDateLong(e)}`
}

export function Forecast({
  state,
  derived,
  today,
  onChange,
}: {
  state: AppState
  derived: DerivedState
  today: string
  onChange: (next: AppState) => Promise<void>
}) {
  const settings = state.settings!
  const vacationDays = state.vacationDays ?? []
  const [vacationOpen, setVacationOpen] = useState(false)
  const items = buildForecast(
    settings,
    parseISODate(today)!,
    derived.confirmedPeriodKeys,
    8,
    vacationDays,
  )
  const uncoveredYears = [...new Set(items.map((item) => Number(item.date.slice(0, 4))))]
    .filter((year) => !hasCalendarData(year))
    .sort()
  const next = items.find((item) => !item.confirmed) ?? null
  const rest = next ? items.filter((item) => item !== next) : items
  const daysTo = next ? Math.max(daysBetween(parseISODate(today)!, parseISODate(next.date)!), 0) : 0

  return (
    <Screen title="Будущие поступления" onBack={() => navigate({ name: 'home' })}>
      <p className="muted">
        Это прогноз по производственному календарю. Суммы не попадают в бюджет, пока выплата не подтверждена.
      </p>
      <div className="stat-list">
        <button
          type="button"
          className="stat-row"
          onClick={() => setVacationOpen(true)}
          aria-label="Указать дни отпуска"
        >
          <span className="stat-label">Отпуск</span>
          <span className="stat-value">
            {vacationDays.length > 0 ? `${vacationDays.length} ${daysWord(vacationDays.length)}` : 'не указан'}
            <span className="stat-sub">
              {vacationDays.length > 0 ? 'дни без оплаты в расчёте · изменить' : 'уменьшает будущие выплаты'}
            </span>
          </span>
          <span className="stat-chevron">
            <ChevronRightIcon size={18} />
          </span>
        </button>
      </div>
      {uncoveredYears.length > 0 ? (
        <Banner tone="warn" icon={<AlertIcon size={20} />}>
          Для {uncoveredYears.join(' и ')} года нет официального производственного календаря: рабочие дни
          рассчитаны по обычной пятидневке (пн–пт), даты и суммы могут уточниться.
        </Banner>
      ) : null}
      {items.length === 0 ? (
        <Empty
          icon={<TrendIcon size={22} />}
          title="Нет расчёта"
          text="Проверьте даты выплат в настройках."
        />
      ) : (
        <>
          {next ? (
            <section className="forecast-hero" aria-label="Ближайшая выплата">
              <div className="forecast-hero-glow" aria-hidden="true" />
              <p className="forecast-eyebrow">Ближайшая выплата</p>
              <span className="forecast-hero-amount">{formatMoney(next.amount)}</span>
              <div className="forecast-hero-meta">
                <span>{kindLabel(next.kind)}</span>
                <span aria-hidden="true">·</span>
                <span>{formatDateLong(parseISODate(next.date)!)}</span>
                <span aria-hidden="true">·</span>
                <span className="chip chip-income">
                  {daysTo <= 0
                    ? 'сегодня'
                    : daysTo === 1
                      ? 'завтра'
                      : `через ${daysTo} ${daysWord(daysTo)}`}
                </span>
                {next.vacationDays ? (
                  <span className="chip">отпуск {next.vacationDays} дн.</span>
                ) : null}
              </div>
              {next.scheduledDate ? (
                <span className="row-subtitle">
                  Перенос с {formatDateShort(parseISODate(next.scheduledDate)!)}
                </span>
              ) : null}
            </section>
          ) : null}

          {rest.length > 0 ? (
            <>
              <h2 className="section-title">Дальше</h2>
              <ul className="journal">
                {rest.map((item) => (
                  <li
                    key={`${item.periodKey}-${item.date}`}
                    className={`list-row forecast-rest-row${item.confirmed ? ' is-confirmed' : ''}`}
                  >
                    <span className="date-block" aria-hidden="true">
                      <b>{dayNumber.format(localDate(parseISODate(item.date)!))}</b>
                      <i>{monthShort.format(localDate(parseISODate(item.date)!)).replace('.', '')}</i>
                    </span>
                    <span className="row-body">
                      <span className="row-title">
                        {kindLabel(item.kind)}
                        {item.confirmed ? <span className="chip chip-ok">получено</span> : null}
                        {item.vacationDays ? (
                          <span className="chip">отпуск {item.vacationDays} дн.</span>
                        ) : null}
                      </span>
                      <span className="row-subtitle">
                        {item.workPeriod}
                        {item.scheduledDate
                          ? ` · перенос с ${formatDateShort(parseISODate(item.scheduledDate)!)}`
                          : ''}
                      </span>
                    </span>
                    <span className={`row-trailing${item.confirmed ? '' : ' is-income'}`}>
                      {formatMoney(item.amount)}
                    </span>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </>
      )}

      {vacationOpen ? (
        <VacationSheet state={state} onChange={onChange} onClose={() => setVacationOpen(false)} />
      ) : null}
    </Screen>
  )
}

function VacationSheet({
  state,
  onChange,
  onClose,
}: {
  state: AppState
  onChange: (next: AppState) => Promise<void>
  onClose: () => void
}) {
  const days = state.vacationDays ?? []
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [error, setError] = useState<string | null>(null)
  const ranges = groupVacationRanges(days)

  async function apply(next: string[]) {
    await onChange(setVacationDays(state, next))
  }

  async function addRange() {
    setError(null)
    const start = parseISODate(from)
    const end = to ? parseISODate(to) : start
    if (!start) {
      setError('Укажите дату начала отпуска')
      return
    }
    if (!end) {
      setError('Укажите корректную дату окончания')
      return
    }
    if (compareDates(end, start) < 0) {
      setError('Дата окончания не может быть раньше начала')
      return
    }
    const added = eachDate(start, addDays(end, 1))
    if (added.length > 366) {
      setError('Слишком длинный период отпуска')
      return
    }
    const next = new Set(days)
    for (const date of added) next.add(toISODate(date))
    await apply([...next])
    setFrom('')
    setTo('')
  }

  return (
    <Sheet
      title="Отпуск"
      onClose={onClose}
    >
      <div className="sheet-body">
        {error ? <ErrorBanner text={error} /> : null}
        <p className="sheet-text">
          Отпускные дни уменьшают расчёт будущих выплат: оплачиваются только отработанные рабочие дни.
          Сами отпускные внесите как дополнительное поступление.
        </p>
        {ranges.length > 0 ? (
          <ul className="journal">
            {ranges.map((range) => (
              <li className="list-row" key={range.start}>
                <span className="row-body">
                  <span className="row-title">{formatRange(range.start, range.end)}</span>
                </span>
                <IconButton
                  label={`Удалить отпуск ${formatRange(range.start, range.end)}`}
                  onClick={() => {
                    const removed = new Set(
                      eachDate(
                        parseISODate(range.start)!,
                        addDays(parseISODate(range.end)!, 1),
                      ).map(toISODate),
                    )
                    void apply(days.filter((iso) => !removed.has(iso)))
                  }}
                >
                  <TrashIcon size={18} />
                </IconButton>
              </li>
            ))}
          </ul>
        ) : (
          <p className="muted">Отпуск пока не указан.</p>
        )}
        <Field label="Первый день">
          <input className="input" type="date" value={from} onChange={(event) => setFrom(event.target.value)} />
        </Field>
        <Field label="Последний день" hint="Необязательно, если один день">
          <input className="input" type="date" value={to} onChange={(event) => setTo(event.target.value)} />
        </Field>
        <div className="sheet-actions">
          <Button block variant="soft" onClick={addRange}>
            Добавить отпуск
          </Button>
        </div>
      </div>
    </Sheet>
  )
}
