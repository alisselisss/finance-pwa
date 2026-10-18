/** Денежные суммы хранятся в копейках целым числом. */

export type Money = number

export function isMoney(value: unknown): value is Money {
  return typeof value === 'number' && Number.isInteger(value) && Number.isSafeInteger(value)
}

export function roundDiv(amount: Money, divisor: number): Money {
  if (!Number.isInteger(divisor) || divisor <= 0) {
    throw new Error('Делитель должен быть положительным целым числом')
  }
  if (amount >= 0) {
    return Math.floor((amount + Math.floor(divisor / 2)) / divisor)
  }
  return -Math.floor((-amount + Math.floor(divisor / 2)) / divisor)
}

export function splitEvenly(
  amount: Money,
  parts: number,
): { perPart: Money; remainder: Money } {
  if (!Number.isInteger(parts) || parts <= 0) {
    throw new Error('Число частей должно быть положительным целым')
  }
  const perPart = amount >= 0 ? Math.trunc(amount / parts) : -Math.trunc((-amount) / parts)
  const remainder = amount - perPart * parts
  return { perPart, remainder }
}

export function parseMoneyInput(raw: string): Money | null {
  const trimmed = raw.trim().replace(/\u00a0/g, '').replace(/\s/g, '')
  if (!trimmed) return null
  const normalized = trimmed.replace(',', '.')
  if (!/^-?\d+(\.\d{1,2})?$/.test(normalized)) return null
  const negative = normalized.startsWith('-')
  const unsigned = negative ? normalized.slice(1) : normalized
  const [rubles, frac = ''] = unsigned.split('.')
  const kopecks = Number(rubles) * 100 + Number(frac.padEnd(2, '0'))
  if (!Number.isSafeInteger(kopecks)) return null
  return negative ? -kopecks : kopecks
}

export function formatMoney(
  amount: Money,
  options: { withCurrency?: boolean; hideZeroKopecks?: boolean } = {},
): string {
  const { withCurrency = true, hideZeroKopecks = true } = options
  const sign = amount < 0 ? '−' : ''
  const abs = Math.abs(amount)
  const rubles = Math.trunc(abs / 100)
  const kopecks = abs % 100
  const grouped = new Intl.NumberFormat('ru-RU').format(rubles)
  const showKopecks = !hideZeroKopecks || kopecks !== 0
  const body = showKopecks
    ? `${grouped},${String(kopecks).padStart(2, '0')}`
    : grouped
  return withCurrency ? `${sign}${body}\u00a0₽` : `${sign}${body}`
}

export const ZERO: Money = 0
