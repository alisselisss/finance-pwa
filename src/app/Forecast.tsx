import { formatDateLong, formatDateShort, parseISODate } from '../domain/dates'
import { buildForecast, kindLabel } from '../domain/forecast'
import { formatMoney } from '../domain/money'
import { hasCalendarData } from '../data/production-calendar'
import type { DerivedState, Settings } from '../domain/types'
import { Empty, Screen } from './components'
import { navigate } from './router'

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
  return (
    <Screen title="Будущие поступления" onBack={() => navigate({ name: 'home' })}>
      <p className="muted">Это прогноз. Суммы не попадают в бюджет, пока выплата не подтверждена.</p>
      {uncoveredYears.length > 0 ? (
        <p className="banner">
          Для {uncoveredYears.join(' и ')} года нет официального производственного календаря:
          рабочие дни рассчитаны по обычной пятидневке (пн–пт), даты и суммы могут уточниться.
        </p>
      ) : null}
      {items.length === 0 ? (
        <Empty title="Нет расчёта" text="Проверьте даты выплат в настройках." />
      ) : (
        <ul className="journal">
          {items.map((item) => (
            <li key={`${item.periodKey}-${item.date}`}>
              <div>
                <strong>
                  {kindLabel(item.kind)}
                  {item.confirmed ? ' · получено' : ''}
                </strong>
                <div className="muted">
                  {formatDateLong(parseISODate(item.date)!)} · {item.workPeriod}
                  {item.scheduledDate
                    ? ` · перенос с ${formatDateShort(parseISODate(item.scheduledDate)!)}`
                    : ''}
                </div>
              </div>
              <span>{formatMoney(item.amount)}</span>
            </li>
          ))}
        </ul>
      )}
    </Screen>
  )
}
