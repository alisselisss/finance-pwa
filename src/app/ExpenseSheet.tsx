import { useState } from 'react'
import { recordExpense } from '../domain/engine'
import { formatDateShort, parseISODate } from '../domain/dates'
import { formatMoney, parseMoneyInput } from '../domain/money'
import type { AppState, OverspendPreview } from '../domain/types'
import { AlertIcon } from './icons'
import { Banner, Button, Field, Sheet } from './components'

/**
 * Запись и правка расходов за сегодня и за прошлые дни.
 * Используется с главного экрана и с центральной кнопки навигации.
 */
export function ExpenseSheet({
  state,
  today,
  dailyLimit,
  expensesByDate,
  trackingStartDate,
  onClose,
  onChange,
}: {
  state: AppState
  today: string
  dailyLimit: number
  expensesByDate: Record<string, number>
  trackingStartDate: string | null
  onClose: () => void
  onChange: (next: AppState) => Promise<void>
}) {
  const [dateIso, setDateIso] = useState(today)
  const initial = expensesByDate[dateIso]
  const editing = initial != null
  const [raw, setRaw] = useState('')
  const [preview, setPreview] = useState<OverspendPreview | null>(null)
  const [error, setError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)

  function switchDate(next: string) {
    setDateIso(next)
    setRaw('')
    setPreview(null)
    setError(null)
  }

  /**
   * Шит может править уже записанные дни, поэтому предупреждение движка
   * о пересчёте не показываем — частый кейс добавления трат применяется
   * сразу. Диалог перерасхода остаётся.
   */
  async function submit(amount: number, choice?: 'go_negative' | 'recalc_limit') {
    setBusy(true)
    setError(null)
    const result = recordExpense(state, dateIso, amount, choice, today)
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
    await onChange(result.state)
    setBusy(false)
    onClose()
  }

  function start(mode: 'add' | 'replace') {
    const amount = parseMoneyInput(raw)
    if (amount == null || amount < 0) {
      setError('Укажите сумму расходов — число в рублях')
      return
    }
    void submit(mode === 'add' && initial != null ? initial + amount : amount)
  }

  const title =
    dateIso === today ? 'Расходы за сегодня' : `Расходы за ${formatDateShort(parseISODate(dateIso)!)}`

  return (
    <Sheet title={title} onClose={onClose}>
      <div className="sheet-body">
        {error ? <Banner tone="error">{error}</Banner> : null}
        {!preview ? (
          <>
            <Field
              label={editing ? 'Сколько потратили ещё' : 'Сколько потратили за день'}
              hint={
                editing
                  ? `Записано за этот день: ${formatMoney(initial)} · лимит ${formatMoney(dailyLimit)}`
                  : `Лимит на день: ${formatMoney(dailyLimit)}`
              }
            >
              <input
                className="input input-amount"
                inputMode="decimal"
                placeholder="0"
                value={raw}
                onChange={(event) => setRaw(event.target.value)}
                autoFocus
              />
            </Field>
            <Field label="День" hint={dateIso === today ? 'Сегодня' : 'Прошлый день'}>
              <input
                className="input"
                type="date"
                value={dateIso}
                min={trackingStartDate ?? today}
                max={today}
                onChange={(event) => switchDate(event.target.value)}
              />
            </Field>
            <div className="sheet-actions">
              <Button block size="lg" disabled={busy} onClick={() => start(editing ? 'add' : 'replace')}>
                {editing ? 'Добавить к расходам' : 'Сохранить'}
              </Button>
              {editing ? (
                <Button variant="ghost" block disabled={busy} onClick={() => start('replace')}>
                  Заменить сумму за день
                </Button>
              ) : null}
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
