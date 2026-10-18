import type { ReactNode, SVGProps } from 'react'

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Svg({ size = 24, children, ...rest }: IconProps & { children: ReactNode }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={1.8}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      {...rest}
    >
      {children}
    </svg>
  )
}

export function HomeIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M3 11.2 12 3.5l9 7.7" />
      <path d="M5.5 9.8V20a1 1 0 0 0 1 1H10v-5.5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1V21h3.5a1 1 0 0 0 1-1V9.8" />
    </Svg>
  )
}

export function WalletIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 7.5A2.5 2.5 0 0 1 6.5 5H18a1 1 0 0 1 1 1v1.5" />
      <path d="M3.5 8h17a.5.5 0 0 1 .5.5v10a1.5 1.5 0 0 1-1.5 1.5h-15A1.5 1.5 0 0 1 3 18.5v-10A.5.5 0 0 1 3.5 8Z" />
      <circle cx="16.5" cy="14" r="1.15" fill="currentColor" stroke="none" />
    </Svg>
  )
}

export function HistoryIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 7.5V12l3 1.8" />
    </Svg>
  )
}

export function SettingsIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12.22 2.5h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73v.18a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73v-.18a2 2 0 0 0-2-2Z" />
      <circle cx="12" cy="12" r="3" />
    </Svg>
  )
}

export function PlusIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M12 5v14M5 12h14" />
    </Svg>
  )
}

export function SunIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2.5v2M12 19.5v2M4.6 4.6l1.4 1.4M18 18l1.4 1.4M2.5 12h2M19.5 12h2M4.6 19.4 6 18M18 6l1.4-1.4" />
    </Svg>
  )
}

export function MoonIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M20.9 13.1A8.5 8.5 0 1 1 10.9 3.1a7 7 0 0 0 10 10Z" />
    </Svg>
  )
}

export function MonitorIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="2.5" y="4" width="19" height="13" rx="2" />
      <path d="M8.5 21h7M12 17v4" />
    </Svg>
  )
}

export function ArrowLeftIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M19 12H5M11.5 18.5 5 12l6.5-6.5" />
    </Svg>
  )
}

export function ChevronRightIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M9.5 18 15.5 12 9.5 6" />
    </Svg>
  )
}

export function CloseIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M18 6 6 18M6 6l12 12" />
    </Svg>
  )
}

export function CalendarIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="3.5" y="5" width="17" height="15.5" rx="2.5" />
      <path d="M16 3v4M8 3v4M3.5 10.5h17" />
    </Svg>
  )
}

export function CoinsIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="9" cy="9" r="5.5" />
      <path d="M15.2 6a5.5 5.5 0 0 1 0 12H9" />
      <path d="M7 9h4M9 7v4" transform="translate(0.5 -0.5)" />
    </Svg>
  )
}

export function BanknoteIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <rect x="2.5" y="6.5" width="19" height="11" rx="2" />
      <circle cx="12" cy="12" r="2.2" />
      <path d="M6.2 12h.01M17.8 12h.01" />
    </Svg>
  )
}

export function ReceiptIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M5 2.5h14a.5.5 0 0 1 .5.5v18l-2.3-1.4-2.3 1.4-2.4-1.4-2.4 1.4L7.7 20.5 5.5 22h-.5l-.5-.5V3a.5.5 0 0 1 .5-.5Z" />
      <path d="M9 7.5h6M9 11.5h6M9 15.5h3.5" />
    </Svg>
  )
}

export function RefreshIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M20.5 12a8.5 8.5 0 1 1-2.5-6" />
      <path d="M20.5 3.5V8H16" />
    </Svg>
  )
}

export function CheckIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M20 6.5 9.5 17 4 11.5" />
    </Svg>
  )
}

export function PencilIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M16.8 3.7a2.1 2.1 0 0 1 3 3L7.5 19 3 20.5 4.5 16Z" />
    </Svg>
  )
}

export function TrashIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M4 6.5h16M9.5 6.5v-2a1.5 1.5 0 0 1 1.5-1.5h2a1.5 1.5 0 0 1 1.5 1.5v2" />
      <path d="M18.5 6.5 18 19a2 2 0 0 1-2 2H8a2 2 0 0 1-2-2l-.5-12.5" />
      <path d="M10 11v5.5M14 11v5.5" />
    </Svg>
  )
}

export function DownloadIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M20.5 15v4a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-4" />
      <path d="M7 10.5 12 15.5l5-5M12 15.5v-12" />
    </Svg>
  )
}

export function UploadIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M20.5 15v4a2 2 0 0 1-2 2h-13a2 2 0 0 1-2-2v-4" />
      <path d="M7 8 12 3l5 5M12 3v12" />
    </Svg>
  )
}

export function TrendIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M22 7.5 14 15.5l-4-4-8 8" />
      <path d="M16 7.5h6v6" />
    </Svg>
  )
}

export function AlertIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z" />
      <path d="M12 9v4.5M12 17.2h.01" />
    </Svg>
  )
}

export function InfoIcon(p: IconProps) {
  return (
    <Svg {...p}>
      <circle cx="12" cy="12" r="8.5" />
      <path d="M12 11v5M12 8h.01" />
    </Svg>
  )
}
