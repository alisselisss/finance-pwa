import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react'
import { formatMoney, parseMoneyInput, type Money } from '../domain/money'
import type { AppRoute } from './router'
import { navigate } from './router'
import {
  ArrowLeftIcon,
  CheckIcon,
  ChevronRightIcon,
  CloseIcon,
  HistoryIcon,
  HomeIcon,
  MoonIcon,
  PlusIcon,
  SettingsIcon,
  SunIcon,
  WalletIcon,
} from './icons'

/* ---------- Денежные значения ---------- */

export function Amount({
  value,
  size = 'md',
  tone = 'default',
}: {
  value: Money
  size?: 'sm' | 'md' | 'lg' | 'xl'
  tone?: 'default' | 'good' | 'bad' | 'muted' | 'accent'
}) {
  return (
    <span className={`amount amount-${size} amount-${tone}`}>{formatMoney(value)}</span>
  )
}

/* ---------- Кнопки ---------- */

export function Button({
  children,
  onClick,
  type = 'button',
  variant = 'primary',
  size = 'md',
  disabled,
  block,
  icon,
}: {
  children: ReactNode
  onClick?: () => void
  type?: 'button' | 'submit'
  variant?: 'primary' | 'secondary' | 'soft' | 'ghost' | 'danger'
  size?: 'sm' | 'md' | 'lg'
  disabled?: boolean
  block?: boolean
  icon?: ReactNode
}) {
  return (
    <button
      type={type}
      className={`btn btn-${variant}${size === 'sm' ? ' btn-sm' : ''}${size === 'lg' ? ' btn-lg' : ''}${block ? ' btn-block' : ''}`}
      onClick={onClick}
      disabled={disabled}
    >
      {icon}
      {children}
    </button>
  )
}

export function IconButton({
  label,
  onClick,
  children,
  variant = 'default',
  className = '',
}: {
  label: string
  onClick?: () => void
  children: ReactNode
  variant?: 'default' | 'surface'
  className?: string
}) {
  return (
    <button
      type="button"
      className={`icon-btn icon-btn-${variant} ${className}`}
      onClick={onClick}
      aria-label={label}
      title={label}
    >
      {children}
    </button>
  )
}

/* ---------- Шапки экранов ---------- */

export function Screen({
  title,
  onBack,
  trailing,
  children,
}: {
  title: string
  onBack?: () => void
  trailing?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="screen">
      <header className="screen-header">
        {onBack ? (
          <IconButton label="Назад" onClick={onBack} className="screen-back">
            <ArrowLeftIcon size={20} />
          </IconButton>
        ) : (
          <span className="screen-header-side" />
        )}
        <h1>{title}</h1>
        <span className="screen-header-side">{trailing}</span>
      </header>
      {children}
    </section>
  )
}

/* ---------- Нижняя навигация ---------- */

export function TabBar({
  active,
  onAdd,
}: {
  active: AppRoute['name']
  onAdd: () => void
}) {
  return (
    <nav className="tabbar" aria-label="Основные разделы">
      <TabItem
        label="Главная"
        active={active === 'home'}
        onClick={() => navigate({ name: 'home' })}
        icon={<HomeIcon size={22} />}
      />
      <TabItem
        label="Накопления"
        active={active === 'savings'}
        onClick={() => navigate({ name: 'savings' })}
        icon={<WalletIcon size={22} />}
      />
      <button type="button" className="tab-fab" onClick={onAdd} aria-label="Записать расходы">
        <PlusIcon size={30} />
      </button>
      <TabItem
        label="История"
        active={active === 'history'}
        onClick={() => navigate({ name: 'history' })}
        icon={<HistoryIcon size={22} />}
      />
      <TabItem
        label="Настройки"
        active={active === 'settings'}
        onClick={() => navigate({ name: 'settings' })}
        icon={<SettingsIcon size={22} />}
      />
    </nav>
  )
}

function TabItem({
  label,
  active,
  onClick,
  icon,
}: {
  label: string
  active: boolean
  onClick: () => void
  icon: ReactNode
}) {
  return (
    <button
      type="button"
      className={`tab-item${active ? ' is-active' : ''}`}
      onClick={onClick}
      aria-current={active ? 'page' : undefined}
    >
      <span className="tab-icon">{icon}</span>
      <span className="tab-label">{label}</span>
    </button>
  )
}

/* ---------- Тема ---------- */

export function ThemeToggle({ effective, onToggle }: { effective: 'light' | 'dark'; onToggle: () => void }) {
  return (
    <IconButton label={effective === 'dark' ? 'Светлая тема' : 'Тёмная тема'} onClick={onToggle}>
      {effective === 'dark' ? <SunIcon size={20} /> : <MoonIcon size={20} />}
    </IconButton>
  )
}

export function SegmentedControl<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
}: {
  options: { value: T; label: string; icon?: ReactNode }[]
  value: T
  onChange: (value: T) => void
  ariaLabel: string
}) {
  return (
    <div className="segmented" role="radiogroup" aria-label={ariaLabel}>
      {options.map((option) => {
        const selected = option.value === value
        return (
          <button
            key={option.value}
            type="button"
            role="radio"
            aria-checked={selected}
            className={`segmented-item${selected ? ' is-selected' : ''}`}
            onClick={() => onChange(option.value)}
          >
            {option.icon}
            {option.label}
          </button>
        )
      })}
    </div>
  )
}

export function Checkmark() {
  return (
    <span className="checkmark">
      <CheckIcon size={14} />
    </span>
  )
}

/* ---------- Карточки ---------- */

export function Card({
  title,
  hint,
  actions,
  children,
}: {
  title?: ReactNode
  hint?: ReactNode
  actions?: ReactNode
  children: ReactNode
}) {
  return (
    <section className="card">
      {title || actions ? (
        <header className="card-head">
          <div>
            <h2 className="card-title">{title}</h2>
            {hint ? <p className="card-hint">{hint}</p> : null}
          </div>
          {actions}
        </header>
      ) : null}
      {children}
    </section>
  )
}

/* ---------- Баннеры ---------- */

export function Banner({
  tone = 'info',
  icon,
  children,
  action,
}: {
  tone?: 'info' | 'ok' | 'warn' | 'error'
  icon?: ReactNode
  children: ReactNode
  action?: ReactNode
}) {
  return (
    <div className={`banner banner-${tone}`} role={tone === 'error' ? 'alert' : undefined}>
      <div className="banner-body">
        {icon ? <span className="banner-icon">{icon}</span> : null}
        <div className="banner-text">{children}</div>
      </div>
      {action ? <div className="banner-action">{action}</div> : null}
    </div>
  )
}

export function ErrorBanner({ text }: { text: string }) {
  return (
    <Banner tone="error">{text}</Banner>
  )
}

/* ---------- Поля ввода ---------- */

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

/* ---------- Списки ---------- */

export function ListRow({
  leading,
  title,
  subtitle,
  trailing,
  onClick,
  chevron,
  ariaLabel,
  income,
}: {
  leading?: ReactNode
  title: ReactNode
  subtitle?: ReactNode
  trailing?: ReactNode
  onClick?: () => void
  chevron?: boolean
  ariaLabel?: string
  /** Поступление/пополнение: зелёный маркер и зелёная сумма */
  income?: boolean
}) {
  const body = (
    <>
      {leading ? <span className={`row-leading${income ? ' is-income' : ''}`}>{leading}</span> : null}
      <span className="row-body">
        <span className="row-title">{title}</span>
        {subtitle ? <span className="row-subtitle">{subtitle}</span> : null}
      </span>
      {trailing ? <span className={`row-trailing${income ? ' is-income' : ''}`}>{trailing}</span> : null}
      {chevron ? (
        <span className="row-chevron">
          <ChevronRightIcon size={18} />
        </span>
      ) : null}
    </>
  )
  if (onClick) {
    return (
      <li className="list-row">
        <button type="button" className="list-row-btn" onClick={onClick} aria-label={ariaLabel}>
          {body}
        </button>
      </li>
    )
  }
  return <li className="list-row">{body}</li>
}

const AVATAR_HUES = [268, 18, 205, 42, 330, 160]

export function Avatar({ name, id }: { name: string; id: string }) {
  let hash = 0
  for (const char of id) hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  const hue = AVATAR_HUES[hash % AVATAR_HUES.length]
  return (
    <span
      className="avatar"
      style={{
        background: `color-mix(in srgb, hsl(${hue} 55% 42%) 16%, var(--surface))`,
        color: `hsl(${hue} 45% calc(38% + var(--avatar-luma, 0) * 34%))`,
      }}
      aria-hidden="true"
    >
      {name.trim().charAt(0).toUpperCase() || '?'}
    </span>
  )
}

/* ---------- Индикатор прогресса ---------- */

export function ProgressBar({ value, max }: { value: number; max: number }) {
  const ratio = max > 0 ? Math.min(value / max, 1) : value > 0 ? 1 : 0
  const over = value > max
  return (
    <div
      className={`progress-track${over ? ' is-over' : ''}`}
      role="progressbar"
      aria-valuemin={0}
      aria-valuemax={max}
      aria-valuenow={value}
    >
      <span className="progress-fill" style={{ width: `${ratio * 100}%` }} />
    </div>
  )
}

/* ---------- Пустые состояния ---------- */

export function Empty({ icon, title, text, action }: { icon?: ReactNode; title: string; text: string; action?: ReactNode }) {
  return (
    <div className="empty">
      {icon ? <span className="empty-icon">{icon}</span> : null}
      <strong>{title}</strong>
      <p>{text}</p>
      {action}
    </div>
  )
}

/* ---------- Шиты (модальные окна) ---------- */

export function Sheet({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  const ref = useRef<HTMLDivElement>(null)

  useEffect(() => {
    const previousOverflow = document.body.style.overflow
    document.body.style.overflow = 'hidden'
    ref.current?.focus()
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onClose()
    }
    window.addEventListener('keydown', onKey)
    return () => {
      document.body.style.overflow = previousOverflow
      window.removeEventListener('keydown', onKey)
    }
  }, [onClose])

  return (
    <div className="sheet-backdrop" role="presentation" onClick={onClose}>
      <div
        className="sheet"
        role="dialog"
        aria-modal="true"
        aria-labelledby="sheet-title"
        onClick={(event) => event.stopPropagation()}
        ref={ref}
        tabIndex={-1}
      >
        <div className="sheet-grab" aria-hidden="true" />
        <div className="sheet-head">
          <h2 id="sheet-title">{title}</h2>
          <IconButton label="Закрыть" onClick={onClose}>
            <CloseIcon size={20} />
          </IconButton>
        </div>
        {children}
      </div>
    </div>
  )
}

export function ConfirmDialog({
  title,
  text,
  confirmLabel = 'Продолжить',
  cancelLabel = 'Отмена',
  tone = 'primary',
  onResolve,
}: {
  title: string
  text: string
  confirmLabel?: string
  cancelLabel?: string
  tone?: 'primary' | 'danger'
  onResolve: (ok: boolean) => void
}) {
  return (
    <Sheet title={title} onClose={() => onResolve(false)}>
      <div className="sheet-body">
        <p className="sheet-text">{text}</p>
        <div className="stack">
          <Button variant={tone === 'danger' ? 'danger' : 'primary'} block onClick={() => onResolve(true)}>
            {confirmLabel}
          </Button>
          <Button variant="ghost" block onClick={() => onResolve(false)}>
            {cancelLabel}
          </Button>
        </div>
      </div>
    </Sheet>
  )
}

export function PromptDialog({
  title,
  label,
  initial = '',
  onResolve,
}: {
  title: string
  label: string
  initial?: string
  onResolve: (value: string | null) => void
}) {
  const [value, setValue] = useState(initial)
  return (
    <Sheet title={title} onClose={() => onResolve(null)}>
      <form
        className="sheet-body"
        onSubmit={(event) => {
          event.preventDefault()
          onResolve(value)
        }}
      >
        <Field label={label}>
          <input
            className="input"
            value={value}
            onChange={(event) => setValue(event.target.value)}
            autoFocus
          />
        </Field>
        <div className="stack">
          <Button type="submit" block disabled={!value.trim()}>
            Сохранить
          </Button>
          <Button variant="ghost" block onClick={() => onResolve(null)}>
            Отмена
          </Button>
        </div>
      </form>
    </Sheet>
  )
}

/* ---------- Прочее ---------- */

export function preventSubmit(handler: () => void) {
  return (event: FormEvent) => {
    event.preventDefault()
    handler()
  }
}
