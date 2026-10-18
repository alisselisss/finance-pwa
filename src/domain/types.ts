import type { Money } from './money'
import type { PaydayKind } from './salary'

export const SCHEMA_VERSION = 1 as const
export const APP_VERSION = '1.0.0'

export type SavingsMode = 'fixed' | 'variable'

export interface Settings {
  grossSalary: Money
  ndflBps: number
  advanceDay: number
  salaryDay: number
  savingsMode: SavingsMode
  fixedSavingsAmount: Money
}

export interface SavingsAccount {
  id: string
  name: string
  createdOn: string
  archived: boolean
}

export type EventType =
  | 'account_created'
  | 'account_renamed'
  | 'account_archived'
  | 'period_started'
  | 'daily_expense'
  | 'extra_income'
  | 'extra_allocation'
  | 'settings_changed'
  | 'limit_recalc'

export interface OverspendPayload {
  choice: 'go_negative' | 'recalc_limit'
  overspend: Money
  previousLimit: Money
  newLimit: Money | null
  remainingDaysAfter: number
}

export interface FinanceEvent {
  id: string
  seq: number
  type: EventType
  date: string
  description?: string
  payload: Record<string, unknown>
}

export interface OnboardingDraft {
  step: 1 | 2 | 3 | 4
  grossSalary?: Money
  ndflBps?: number
  advanceDay?: number
  salaryDay?: number
  accounts: { id: string; name: string; balance: Money }[]
  savingsMode?: SavingsMode
  fixedSavingsAmount?: Money
  lastPayday?: string
  lastPaydayKind?: PaydayKind
  lastAmount?: Money
  lastSaved?: Money
  lastSavedAccountId?: string
  startingFreeMoney?: Money
}

export interface AppState {
  schemaVersion: typeof SCHEMA_VERSION
  appVersion: string
  onboarding: {
    completed: boolean
    draft: OnboardingDraft
  }
  settings: Settings | null
  accounts: SavingsAccount[]
  events: FinanceEvent[]
  trackingStartDate: string | null
  seedFreeMoney: Money
}

export interface IncomeRemainder {
  incomeId: string
  date: string
  description: string
  total: Money
  allocated: Money
  remaining: Money
}

export interface DerivedState {
  freeMoney: Money
  dailyLimit: Money
  unusedBudget: Money
  undistributed: IncomeRemainder[]
  currentPeriod: {
    id: string
    startDate: string
    nextPayday: string
    kind: PaydayKind
    periodKey: string
    incomeAmount: Money
    savedAmount: Money
    daysTotal: number
  } | null
  remainingDays: number
  accounts: { id: string; name: string; balance: Money; archived: boolean }[]
  expensesByDate: Record<string, Money>
  confirmedPeriodKeys: string[]
  limitByDate: Record<string, Money>
}

export interface PaydayForecast {
  date: string
  kind: PaydayKind
  amount: Money
  workPeriod: string
  periodKey: string
  confirmed: boolean
}

export interface OverspendPreview {
  needed: boolean
  expense: Money
  dailyLimit: Money
  freeMoney: Money
  overspend: Money
  remainingDaysAfter: number
  newLimit: Money | null
  budgetInsufficient: boolean
  goNegativeFreeMoney: Money
}

export type ActionResult =
  | { ok: true; state: AppState; warning?: string; incomeId?: string }
  | { ok: false; error: string; overspend?: OverspendPreview }
