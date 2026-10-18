import { useRef, useState } from 'react'
import { formatDateLong, parseISODate, todayLocal, toISODate } from '../domain/dates'
import { updateSettings } from '../domain/engine'
import { parseBackup, serializeBackup } from '../domain/backup'
import { formatMoney, parseMoneyInput } from '../domain/money'
import { netFromGross } from '../domain/salary'
import { APP_VERSION, SCHEMA_VERSION } from '../domain/types'
import type { AppState, DerivedState, SavingsMode, Settings } from '../domain/types'
import {
  Banner,
  Button,
  Card,
  ConfirmDialog,
  ErrorBanner,
  Field,
  MoneyField,
  Screen,
  SegmentedControl,
} from './components'
import { DownloadIcon, MonitorIcon, MoonIcon, SunIcon, UploadIcon } from './icons'
import { navigate } from './router'
import type { ThemePreference, useTheme } from './theme'

type Theme = ReturnType<typeof useTheme>

function moneyText(value: number | undefined): string {
  if (value == null) return ''
  return formatMoney(value, { withCurrency: false, hideZeroKopecks: true }).replace('−', '-')
}

export function SettingsScreen({
  state,
  derived,
  today,
  onChange,
  theme,
}: {
  state: AppState
  derived: DerivedState
  today: string
  onChange: (next: AppState) => Promise<void>
  theme: Theme
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
  const [recalcConfirm, setRecalcConfirm] = useState<Partial<Settings> | null>(null)
  const [importConfirm, setImportConfirm] = useState<{ raw: string; summary: string; incoming: AppState } | null>(null)
  const fileRef = useRef<HTMLInputElement>(null)

  const netPreview = (() => {
    const parsed = parseMoneyInput(gross)
    const percent = Number(ndflPercent.replace(',', '.'))
    if (parsed == null || parsed <= 0 || !Number.isFinite(percent)) return null
    return netFromGross(parsed, Math.round(percent * 100))
  })()

  function buildPatch(): Partial<Settings> | string {
    const grossSalary = parseMoneyInput(gross)
    const advance = Number(advanceDay)
    const salary = Number(salaryDay)
    const percent = Number(ndflPercent.replace(',', '.'))
    const fixedAmount = parseMoneyInput(fixed || '0')
    if (!grossSalary || grossSalary <= 0) return 'Укажите месячный оклад до налога'
    if (!Number.isInteger(advance) || !Number.isInteger(salary) || advance < 1 || advance > 31 || salary < 1 || salary > 31) {
      return 'Дни выплат — целые числа от 1 до 31'
    }
    if (!Number.isFinite(percent) || percent < 0 || percent > 50) {
      return 'Ставка НДФЛ — от 0 до 50 процентов'
    }
    if (fixedAmount == null || fixedAmount < 0) {
      return 'Укажите неотрицательную сумму откладывания'
    }
    return {
      grossSalary,
      advanceDay: advance,
      salaryDay: salary,
      ndflBps: Math.round(percent * 100),
      savingsMode: mode,
      fixedSavingsAmount: mode === 'fixed' ? fixedAmount : 0,
    }
  }

  async function save(patch: Partial<Settings>, confirmed: boolean) {
    setError(null)
    setInfo(null)
    const result = updateSettings(state, patch, today, confirmed)
    if (!result.ok && result.error.endsWith('Подтвердить?')) {
      setRecalcConfirm(patch)
      return
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
    const summary =
      `Резервная копия от ${parsed.backup.exportedAt.slice(0, 10)}: ${incoming.events.length} операций, ` +
      `оклад ${formatMoney(incoming.settings?.grossSalary ?? 0)}.`
    setImportConfirm({ raw, summary, incoming })
  }

  return (
    <Screen title="Настройки">
      {error ? <ErrorBanner text={error} /> : null}
      {info ? <Banner tone="ok">{info}</Banner> : null}

      <Card title="Оформление">
        <SegmentedControl<ThemePreference>
          ariaLabel="Тема оформления"
          value={theme.pref}
          onChange={(value) => theme.setPref(value)}
          options={[
            { value: 'system', label: 'Системная', icon: <MonitorIcon size={16} /> },
            { value: 'light', label: 'Светлая', icon: <SunIcon size={16} /> },
            { value: 'dark', label: 'Тёмная', icon: <MoonIcon size={16} /> },
          ]}
        />
      </Card>

      <Card title="Зарплата" hint="Оклад и даты влияют только на прогноз выплат. Подтверждённые поступления не меняются.">
        <MoneyField
          label="Месячный оклад до налога"
          value={parseMoneyInput(gross) ?? undefined}
          onChange={(v) => setGross(v == null ? '' : moneyText(v))}
          hint="По умолчанию НДФЛ 13%"
        />
        {netPreview != null ? (
          <p className="hint-card">
            На руки после налога: <strong>{formatMoney(netPreview)}</strong>
          </p>
        ) : null}
        <Field label="Ставка НДФЛ, %">
          <input
            className="input"
            inputMode="decimal"
            value={ndflPercent}
            onChange={(event) => setNdflPercent(event.target.value)}
          />
        </Field>
        <div className="row">
          <Field label="День аванса">
            <input
              className="input"
              inputMode="numeric"
              value={advanceDay}
              onChange={(event) => setAdvanceDay(event.target.value)}
            />
          </Field>
          <Field label="День зарплаты">
            <input
              className="input"
              inputMode="numeric"
              value={salaryDay}
              onChange={(event) => setSalaryDay(event.target.value)}
            />
          </Field>
        </div>
      </Card>

      <Card title="Накопления">
        <label className="choice">
          <input type="radio" name="mode" checked={mode === 'fixed'} onChange={() => setMode('fixed')} />
          <span>
            <strong>Постоянная сумма</strong>
            <em>Откладывать одну и ту же сумму с каждой выплаты</em>
          </span>
        </label>
        {mode === 'fixed' ? (
          <MoneyField
            label="Сумма к откладыванию с каждой выплаты"
            value={parseMoneyInput(fixed || '0') ?? 0}
            onChange={(v) => setFixed(moneyText(v ?? 0))}
          />
        ) : null}
        <label className="choice">
          <input type="radio" name="mode" checked={mode === 'variable'} onChange={() => setMode('variable')} />
          <span>
            <strong>Переменная сумма</strong>
            <em>Спрашивать сумму и счёт при каждом поступлении</em>
          </span>
        </label>
        <Button variant="secondary" block onClick={() => navigate({ name: 'savings' })}>
          Управлять накопительными счетами
        </Button>
      </Card>

      <Card title="Данные" hint="Все данные хранятся только на этом устройстве. Регулярно создавайте резервную копию.">
        <Button variant="secondary" block icon={<DownloadIcon size={18} />} onClick={exportBackupFile}>
          Экспортировать копию
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
        <Button variant="secondary" block icon={<UploadIcon size={18} />} onClick={() => fileRef.current?.click()}>
          Импортировать копию
        </Button>
      </Card>

      <Card title="О приложении">
        <div className="settings-row">
          <span className="settings-row-hint">Версия</span>
          <span className="settings-row-title">
            {APP_VERSION} · формат данных {SCHEMA_VERSION}
          </span>
        </div>
        <div className="settings-row">
          <span className="settings-row-hint">Учёт ведётся с</span>
          <span className="settings-row-title">
            {(() => {
              const start = state.trackingStartDate ? parseISODate(state.trackingStartDate) : null
              return start ? formatDateLong(start) : '—'
            })()}
          </span>
        </div>
        <div className="settings-row">
          <span className="settings-row-hint">Текущий дневной лимит</span>
          <span className="settings-row-title">{formatMoney(derived.dailyLimit)}</span>
        </div>
      </Card>

      <Button block size="lg" onClick={() => {
        const patch = buildPatch()
        if (typeof patch === 'string') {
          setError(patch)
          return
        }
        void save(patch, false)
      }}>
        Сохранить настройки
      </Button>

      {recalcConfirm ? (
        <ConfirmDialog
          title="Изменение пересчитает лимит"
          text="Новые даты или оклад меняют график будущих выплат, поэтому дневной лимит текущего периода нужно пересчитать по оставшимся дням. Применить изменение?"
          confirmLabel="Применить"
          onResolve={async (ok) => {
            const patch = recalcConfirm
            setRecalcConfirm(null)
            if (ok && patch) await save(patch, true)
          }}
        />
      ) : null}

      {importConfirm ? (
        <ConfirmDialog
          title="Восстановить из копии?"
          text={`${importConfirm.summary} Текущие данные будут полностью заменены.`}
          confirmLabel="Восстановить"
          tone="danger"
          onResolve={async (ok) => {
            const pendingImport = importConfirm
            setImportConfirm(null)
            if (!ok || !pendingImport) return
            await onChange(pendingImport.incoming)
            setInfo('Данные восстановлены из резервной копии.')
            navigate({ name: 'home' })
          }}
        />
      ) : null}
    </Screen>
  )
}
