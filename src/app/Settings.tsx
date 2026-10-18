import { useRef, useState } from 'react'
import { formatDateLong, parseISODate, todayLocal, toISODate } from '../domain/dates'
import { updateSettings } from '../domain/engine'
import { parseBackup, serializeBackup } from '../domain/backup'
import { formatMoney, parseMoneyInput } from '../domain/money'
import { netFromGross } from '../domain/salary'
import { APP_VERSION, SCHEMA_VERSION } from '../domain/types'
import type { AppState, DerivedState, SavingsMode, Settings } from '../domain/types'
import { Button, ErrorBanner, Field, MoneyField, Screen } from './components'
import { navigate } from './router'

function moneyText(value: number | undefined): string {
  if (value == null) return ''
  return formatMoney(value, { withCurrency: false, hideZeroKopecks: true }).replace('−', '-')
}

export function SettingsScreen({
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
  const [error, setError] = useState<string | null>(null)
  const [info, setInfo] = useState<string | null>(null)
  const [gross, setGross] = useState(moneyText(settings.grossSalary))
  const [advanceDay, setAdvanceDay] = useState(String(settings.advanceDay))
  const [salaryDay, setSalaryDay] = useState(String(settings.salaryDay))
  const [ndflPercent, setNdflPercent] = useState(String(settings.ndflBps / 100))
  const [mode, setMode] = useState<SavingsMode>(settings.savingsMode)
  const [fixed, setFixed] = useState(moneyText(settings.fixedSavingsAmount))
  const fileRef = useRef<HTMLInputElement>(null)

  const netPreview = (() => {
    const parsed = parseMoneyInput(gross)
    const percent = Number(ndflPercent.replace(',', '.'))
    if (parsed == null || parsed <= 0 || !Number.isFinite(percent)) return null
    return netFromGross(parsed, Math.round(percent * 100))
  })()

  async function save() {
    setError(null)
    setInfo(null)
    const grossSalary = parseMoneyInput(gross)
    const advance = Number(advanceDay)
    const salary = Number(salaryDay)
    const percent = Number(ndflPercent.replace(',', '.'))
    const fixedAmount = parseMoneyInput(fixed || '0')
    if (!grossSalary || grossSalary <= 0) {
      setError('Укажите месячный оклад до налога')
      return
    }
    if (!Number.isInteger(advance) || !Number.isInteger(salary) || advance < 1 || advance > 31 || salary < 1 || salary > 31) {
      setError('Дни выплат — целые числа от 1 до 31')
      return
    }
    if (!Number.isFinite(percent) || percent < 0 || percent > 50) {
      setError('Ставка НДФЛ — от 0 до 50 процентов')
      return
    }
    if (fixedAmount == null || fixedAmount < 0) {
      setError('Укажите неотрицательную сумму откладывания')
      return
    }
    const patch: Partial<Settings> = {
      grossSalary,
      advanceDay: advance,
      salaryDay: salary,
      ndflBps: Math.round(percent * 100),
      savingsMode: mode,
      fixedSavingsAmount: mode === 'fixed' ? fixedAmount : 0,
    }
    let result = updateSettings(state, patch, today, false)
    if (!result.ok && result.error.endsWith('Подтвердить?')) {
      const accepted = window.confirm(`${result.error.replace(' Подтвердить?', '')}\n\nПрименить изменение?`)
      if (!accepted) return
      result = updateSettings(state, patch, today, true)
    }
    if (!result.ok) {
      setError(result.error)
      return
    }
    await onChange(result.state)
    setInfo('Настройки сохранены. Прогноз будущих выплат обновлён.')
  }

  function exportBackupFile() {
    setError(null)
    const json = serializeBackup(state)
    const stamp = toISODate(todayLocal())
    const blob = new Blob([json], { type: 'application/json' })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement('a')
    anchor.href = url
    anchor.download = `finance-backup-${stamp}.json`
    anchor.click()
    URL.revokeObjectURL(url)
    setInfo('Резервная копия сохранена в файл.')
  }

  async function importBackupFile(file: File) {
    setError(null)
    setInfo(null)
    const raw = await file.text()
    const parsed = parseBackup(raw)
    if (!parsed.ok) {
      setError(`Импорт не выполнен: ${parsed.error}`)
      return
    }
    const incoming = parsed.backup.state
    const eventsCount = incoming.events.length
    const confirmed = window.confirm(
      `Резервная копия от ${parsed.backup.exportedAt.slice(0, 10)}: ${eventsCount} операций, ` +
        `оклад ${formatMoney(incoming.settings?.grossSalary ?? 0)}.\n\n` +
        'Текущие данные будут полностью заменены. Продолжить?',
    )
    if (!confirmed) return
    await onChange(incoming)
    setInfo('Данные восстановлены из резервной копии.')
    navigate({ name: 'home' })
  }

  return (
    <Screen title="Настройки" onBack={() => navigate({ name: 'home' })}>
      {error ? <ErrorBanner text={error} /> : null}
      {info ? <p className="banner banner-ok">{info}</p> : null}

      <h2 className="section-title">Зарплата</h2>
      <div className="stack">
        <MoneyField label="Месячный оклад до налога" value={parseMoneyInput(gross) ?? undefined} onChange={(v) => setGross(v == null ? '' : moneyText(v))} hint="По умолчанию НДФЛ 13%" />
        {netPreview != null ? (
          <p className="hint-card">
            На руки после налога: <strong>{formatMoney(netPreview)}</strong>
          </p>
        ) : null}
        <Field label="Ставка НДФЛ, %">
          <input className="input" inputMode="decimal" value={ndflPercent} onChange={(e) => setNdflPercent(e.target.value)} />
        </Field>
        <div className="row">
          <Field label="День аванса">
            <input className="input" inputMode="numeric" value={advanceDay} onChange={(e) => setAdvanceDay(e.target.value)} />
          </Field>
          <Field label="День зарплаты">
            <input className="input" inputMode="numeric" value={salaryDay} onChange={(e) => setSalaryDay(e.target.value)} />
          </Field>
        </div>
        <p className="muted">
          Оклад и даты влияют только на прогноз будущих выплат. Уже подтверждённые поступления не меняются.
        </p>
      </div>

      <h2 className="section-title">Накопления</h2>
      <div className="stack">
        <label className="choice">
          <input type="radio" name="mode" checked={mode === 'fixed'} onChange={() => setMode('fixed')} />
          <span>
            <strong>Постоянная сумма</strong>
            <em>Откладывать одну и ту же сумму с каждой выплаты</em>
          </span>
        </label>
        {mode === 'fixed' ? (
          <MoneyField label="Сумма к откладыванию с каждой выплаты" value={parseMoneyInput(fixed || '0') ?? 0} onChange={(v) => setFixed(moneyText(v ?? 0))} />
        ) : null}
        <label className="choice">
          <input type="radio" name="mode" checked={mode === 'variable'} onChange={() => setMode('variable')} />
          <span>
            <strong>Переменная сумма</strong>
            <em>Спрашивать сумму и счёт при каждом поступлении</em>
          </span>
        </label>
        <Button
          variant="secondary"
          block
          onClick={() => navigate({ name: 'savings' })}
        >
          Управлять накопительными счетами
        </Button>
      </div>

      <h2 className="section-title">Данные</h2>
      <div className="stack">
        <p className="muted">
          Все данные хранятся только на этом устройстве. Регулярно создавайте резервную копию.
        </p>
        <Button variant="secondary" block onClick={exportBackupFile}>
          Экспортировать резервную копию
        </Button>
        <input
          ref={fileRef}
          type="file"
          accept="application/json,.json"
          className="visually-hidden"
          onChange={(event) => {
            const file = event.target.files?.[0]
            if (file) void importBackupFile(file)
            event.target.value = ''
          }}
        />
        <Button
          variant="secondary"
          block
          onClick={() => fileRef.current?.click()}
        >
          Импортировать резервную копию
        </Button>
      </div>

      <h2 className="section-title">О приложении</h2>
      <div className="stack">
        <p className="muted">
          Версия {APP_VERSION} · формат данных {SCHEMA_VERSION}
        </p>
        <p className="muted">
          Учёт ведётся с{' '}
          {(() => {
            const start = state.trackingStartDate ? parseISODate(state.trackingStartDate) : null
            return start ? formatDateLong(start) : '—'
          })()}
          . Дневной лимит: {formatMoney(derived.dailyLimit)}
        </p>
      </div>

      <div className="stack save-row">
        <Button block onClick={save}>
          Сохранить настройки
        </Button>
      </div>
    </Screen>
  )
}
