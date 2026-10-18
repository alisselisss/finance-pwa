import { parseISODate, formatDateLong } from '../domain/dates'
import { buildForecast, kindLabel } from '../domain/forecast'
import { formatMoney } from '../domain/money'
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
  return (
    <Screen title="Будущие поступления" onBack={() => navigate({ name: 'home' })}>
      <p className="muted">Это прогноз. Суммы не попадают в бюджет, пока выплата не подтверждена.</p>
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
