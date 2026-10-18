import { daysBetween, formatDateLong, formatDateShort, parseISODate, type CalendarDate } from '../domain/dates'
import { buildForecast, kindLabel } from '../domain/forecast'
import { formatMoney } from '../domain/money'
import { hasCalendarData } from '../data/production-calendar'
import type { DerivedState, Settings } from '../domain/types'
import { Banner, Empty, Screen } from './components'
import { AlertIcon, TrendIcon } from './icons'
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

export function Forecast({
  settings,
  derived,
  today,
}: {
  settings: Settings
  derived: DerivedState
  today: string
}) {
  const items = buildForecast(settings, parseISODate(today)!, derived.confirmedPeriodKeys, 8)
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
    </Screen>
  )
}
