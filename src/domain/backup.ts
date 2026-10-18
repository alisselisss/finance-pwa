import type { AppState, FinanceEvent, OnboardingDraft, SavingsAccount, Settings } from './types'
import { APP_VERSION, SCHEMA_VERSION } from './types'
import { isMoney } from './money'
import { parseISODate } from './dates'

export interface BackupFile {
  format: 'finance-pwa-backup'
  schemaVersion: number
  exportedAt: string
  appVersion: string
  state: AppState
}

const EVENT_TYPES = new Set([
  'account_created',
  'account_renamed',
  'account_archived',
  'period_started',
  'daily_expense',
  'extra_income',
  'extra_allocation',
  'settings_changed',
  'limit_recalc',
])

export function exportBackup(state: AppState, exportedAt = new Date().toISOString()): BackupFile {
  return {
    format: 'finance-pwa-backup',
    schemaVersion: SCHEMA_VERSION,
    exportedAt,
    appVersion: APP_VERSION,
    state: structuredClone(state),
  }
}

export function serializeBackup(state: AppState): string {
  return JSON.stringify(exportBackup(state), null, 2)
}

export function parseBackup(raw: string): { ok: true; backup: BackupFile } | { ok: false; error: string } {
  let data: unknown
  try {
    data = JSON.parse(raw)
  } catch {
    return { ok: false, error: 'Файл не является корректным JSON' }
  }
  return validateBackup(data)
}

export function validateBackup(
  data: unknown,
): { ok: true; backup: BackupFile } | { ok: false; error: string } {
  if (!data || typeof data !== 'object') return { ok: false, error: 'Некорректная структура резервной копии' }
  const file = data as Record<string, unknown>
  if (file.format !== 'finance-pwa-backup') {
    return { ok: false, error: 'Это не резервная копия финансового приложения' }
  }
  if (file.schemaVersion !== SCHEMA_VERSION) {
    return {
      ok: false,
      error: `Неподдерживаемая версия данных: ${String(file.schemaVersion)}. Ожидается ${SCHEMA_VERSION}.`,
    }
  }
  if (!file.state || typeof file.state !== 'object') {
    return { ok: false, error: 'В копии нет финансового состояния' }
  }
  const stateError = validateState(file.state)
  if (stateError) return { ok: false, error: stateError }
  return {
    ok: true,
    backup: {
      format: 'finance-pwa-backup',
      schemaVersion: SCHEMA_VERSION,
      exportedAt: typeof file.exportedAt === 'string' ? file.exportedAt : '',
      appVersion: typeof file.appVersion === 'string' ? file.appVersion : APP_VERSION,
      state: file.state as AppState,
    },
  }
}

function validateState(raw: unknown): string | null {
  if (!raw || typeof raw !== 'object') return 'Пустое состояние'
  const state = raw as AppState
  if (state.schemaVersion !== SCHEMA_VERSION) return 'Неверная версия состояния'
  if (!state.onboarding || typeof state.onboarding.completed !== 'boolean') {
    return 'Некорректные данные настройки'
  }
  const draftError = validateDraft(state.onboarding.draft)
  if (draftError) return draftError
  if (state.settings) {
    const settingsError = validateSettings(state.settings)
    if (settingsError) return settingsError
  }
  if (!Array.isArray(state.accounts)) return 'Некорректный список счетов'
  for (const account of state.accounts) {
    const accountError = validateAccount(account)
    if (accountError) return accountError
  }
  if (!Array.isArray(state.events)) return 'Некорректная история операций'
  for (const event of state.events) {
    const eventError = validateEvent(event)
    if (eventError) return eventError
  }
  if (state.trackingStartDate && !parseISODate(state.trackingStartDate)) {
    return 'Некорректная дата начала учёта'
  }
  if (state.seedFreeMoney != null && !isMoney(state.seedFreeMoney)) {
    return 'Некорректные свободные деньги'
  }
  return null
}

function validateDraft(draft: OnboardingDraft): string | null {
  if (!draft || ![1, 2, 3, 4].includes(draft.step)) return 'Некорректный шаг настройки'
  if (!Array.isArray(draft.accounts)) return 'Некорректные счета в настройке'
  return null
}

function validateSettings(settings: Settings): string | null {
  if (!isMoney(settings.grossSalary) || settings.grossSalary < 0) return 'Некорректный оклад'
  if (!Number.isInteger(settings.ndflBps)) return 'Некорректная ставка налога'
  if (!Number.isInteger(settings.advanceDay) || !Number.isInteger(settings.salaryDay)) {
    return 'Некорректные дни выплат'
  }
  if (settings.savingsMode !== 'fixed' && settings.savingsMode !== 'variable') {
    return 'Некорректный режим накоплений'
  }
  if (!isMoney(settings.fixedSavingsAmount)) return 'Некорректная сумма откладывания'
  return null
}

function validateAccount(account: SavingsAccount): string | null {
  if (!account?.id || !account.name) return 'Некорректный накопительный счёт'
  return null
}

function validateEvent(event: FinanceEvent): string | null {
  if (!event?.id || !EVENT_TYPES.has(event.type)) return 'Некорректная операция в истории'
  if (!parseISODate(event.date)) return `Некорректная дата операции: ${String(event.date)}`
  if (!Number.isInteger(event.seq)) return 'Некорректный порядок операций'
  if (!event.payload || typeof event.payload !== 'object') return 'У операции нет данных'
  return null
}
