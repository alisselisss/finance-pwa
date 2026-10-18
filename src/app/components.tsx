import { useId, type FormEvent, type ReactNode } from 'react'
import { formatMoney, parseMoneyInput, type Money } from '../domain/money'

export function Amount({
  value,
  size = 'md',
  tone = 'default',
}: {
  value: Money
  size?: 'sm' | 'md' | 'xl'
  tone?: 'default' | 'good' | 'bad' | 'muted'
}) {
  return (
    <span className={`amount amount-${size} amount-${tone} ${value < 0 ? 'is-negative' : ''}`}>
      {formatMoney(value)}
    </span>
  )
}

export function Button({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  disabled,
  block,
}: {
  children: ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  variant?: 'primary' | 'secondary' | 'ghost' | 'danger'
  disabled?: boolean
  block?: boolean
}) {
  return (
    <button
      type={type}
      className={`btn btn-${variant}${block ? ' btn-block' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {children}
    </button>
  )
}

export function Modal({
  title,
  children,
  onClose,
}: {
  title: string
  children: ReactNode
  onClose: () => void
}) {
  return (
    <div className="modal-backdrop" role="presentation" onClick={onClose}>
      <div
        className="modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="modal-head">
          <h2 id="modal-title">{title}</h2>
          <button type="button" className="icon-btn" onClick={onClose} aria-label="Закрыть">
            ×
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function Field({
  label,
  hint,
  error,
  children,
}: {
  label: string
  hint?: string
  error?: string
  children: ReactNode
}) {
  return (
    <label className="field">
      <span className="field-label">{label}</span>
      {children}
      {hint ? <span className="field-hint">{hint}</span> : null}
      {error ? <span className="field-error">{error}</span> : null}
    </label>
  )
}

export function MoneyField({
  label,
  value,
  onChange,
  hint,
  allowEmpty = true,
}: {
  label: string
  value: Money | undefined
  onChange: (value: Money | undefined) => void
  hint?: string
  allowEmpty?: boolean
}) {
  const id = useId()
  const display =
    value == null
      ? ''
      : formatMoney(value, { withCurrency: false, hideZeroKopecks: false }).replace('−', '-')
  return (
    <Field label={label} hint={hint}>
      <input
        id={id}
        inputMode="decimal"
        className="input"
        placeholder="0,00"
        defaultValue={display}
        onBlur={(event) => {
          const raw = event.target.value
          if (!raw.trim()) {
            onChange(allowEmpty ? undefined : 0)
            return
          }
          const parsed = parseMoneyInput(raw.replace('−', '-'))
          if (parsed == null) {
            event.target.value = display
            return
          }
          onChange(parsed)
          event.target.value = formatMoney(parsed, {
            withCurrency: false,
            hideZeroKopecks: false,
          }).replace('−', '-')
        }}
      />
    </Field>
  )
}

export function Screen({
  title,
  onBack,
  children,
}: {
  title: string
  onBack?: () => void
  children: ReactNode
}) {
  return (
    <section className="screen">
      <header className="screen-header">
        {onBack ? (
          <button type="button" className="text-btn" onClick={onBack}>
            Назад
          </button>
        ) : (
          <span />
        )}
        <h1>{title}</h1>
        <span />
      </header>
      {children}
    </section>
  )
}

export function ErrorBanner({ text }: { text: string }) {
  return (
    <p className="banner banner-error" role="alert">
      {text}
    </p>
  )
}

export function Empty({ title, text }: { title: string; text: string }) {
  return (
    <div className="empty">
      <strong>{title}</strong>
      <p>{text}</p>
    </div>
  )
}

export function preventSubmit(handler: () => void) {
  return (event: FormEvent) => {
    event.preventDefault()
    handler()
  }
}
