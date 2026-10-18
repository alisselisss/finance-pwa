import { useState } from 'react'
import { recordExpense } from '../domain/engine'
import { formatMoney, parseMoneyInput } from '../domain/money'
import type { AppState, OverspendPreview } from '../domain/types'
import { AlertIcon } from './icons'
import { Banner, Button, Field, Sheet } from './components'

/**
 * Запись расходов за сегодня. Используется и с главного экрана,
 * и с центральной кнопки в нижней навигации.
 */
export function ExpenseSheet({
  state,
  today,
  dailyLimit,
  initial,
  onClose,
  onChange,
}: {
  state: AppState
  today: string
  dailyLimit: number
  initial?: number
  onClose: () => void
  onChange: (next: AppState) => Promise<void>
}) {
  const [raw, setRaw] = useState(
    initial == null ? '' : formatMoney(initial, { withCurrency: false, hideZeroKopecks: true }),
  )
  const [preview, setPreview] = useState<OverspendPreview | null>(null)
  const [warning, setWarning] = useState<{ text: string; amount: number; choice?: 'go_negative' | 'recalc_limit' } | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  async function submit(amount: number, choice?: 'go_negative' | 'recalc_limit') {
    setBusy(true)
    setError(null)
    const result = recordExpense(state, today, amount, choice, today)
    if (!result.ok) {
      if (result.overspend) {
        setPreview(result.overspend)
        setBusy(false)
        return
      }
      setError(result.error)
      setBusy(false)
      return
    }
    if (result.warning && !warning) {
      setWarning({ text: result.warning, amount, choice })
      setBusy(false)
      return
    }
    await onChange(result.state)
    setBusy(false)
    onClose()
  }

  function start() {
    const amount = parseMoneyInput(raw)
    if (amount == null || amount < 0) {
      setError('Укажите сумму расходов — число в рублях')
      return
    }
    void submit(amount)
  }

  return (
    <Sheet title="Расходы за сегодня" onClose={onClose}>
      <div className="sheet-body">
        {error ? <Banner tone="error">{error}</Banner> : null}
        {warning ? (
          <>
            <Banner tone="warn" icon={<AlertIcon size={20} />}>
              {warning.text}
            </Banner>
            <div className="sheet-actions">
              <Button
                block
                disabled={busy}
                onClick={() => void submit(warning.amount, warning.choice)}
              >
                Продолжить
              </Button>
              <Button variant="ghost" block disabled={busy} onClick={onClose}>
                Отмена
              </Button>
            </div>
          </>
        ) : !preview ? (
          <>
            <Field label="Сколько потратили за день" hint={`Лимит на сегодня: ${formatMoney(dailyLimit)}`}>
              <input
                className="input input-amount"
                inputMode="decimal"
                placeholder="0"
                value={raw}
                onChange={(event) => setRaw(event.target.value)}
                autoFocus
              />
            </Field>
            <div className="sheet-actions">
              <Button block size="lg" disabled={busy} onClick={start}>
                Сохранить
              </Button>
            </div>
          </>
        ) : (
          <OverspendOptions
            preview={preview}
            disabled={busy}
            onChoose={(choice) => void submit(preview.expense, choice)}
          />
        )}
      </div>
    </Sheet>
  )
}

export function OverspendOptions({
  preview,
  disabled,
  onChoose,
}: {
  preview: OverspendPreview
  disabled?: boolean
  onChoose: (choice: 'go_negative' | 'recalc_limit') => void
}) {
  return (
    <>
      <Banner tone="warn" icon={<AlertIcon size={20} />}>
        Перерасход сверх лимита и свободных денег: <strong>{formatMoney(preview.overspend)}</strong>.
        Дней до выплаты после сегодня: {preview.remainingDaysAfter}. Текущий лимит:{' '}
        {formatMoney(preview.dailyLimit)}.
      </Banner>
      <div className="stack">
        <div className="choice-card">
          <strong>Уйти в минус</strong>
          <p>Свободные деньги станут {formatMoney(preview.goNegativeFreeMoney)}. Лимит не изменится.</p>
          <Button block disabled={disabled} onClick={() => onChoose('go_negative')}>
            Уйти в минус
          </Button>
        </div>
        <div className="choice-card">
          <strong>Пересчитать дневной лимит</strong>
          {preview.budgetInsufficient || preview.newLimit == null ? (
            <p>Оставшегося бюджета недостаточно для неотрицательного лимита. Фиктивные деньги не создаём.</p>
          ) : (
            <>
              <p>Свободные деньги обнулятся. Новый лимит: {formatMoney(preview.newLimit)}.</p>
              <Button block variant="secondary" disabled={disabled} onClick={() => onChoose('recalc_limit')}>
                Пересчитать лимит
              </Button>
            </>
          )}
        </div>
      </div>
    </>
  )
}
