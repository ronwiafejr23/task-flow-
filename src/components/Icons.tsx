type P = { size?: number }
const base = (size = 16) => ({
  width: size,
  height: size,
  viewBox: '0 0 24 24',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 2.2,
  strokeLinecap: 'round' as const,
  strokeLinejoin: 'round' as const,
  'aria-hidden': true,
})

export const PlusIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M12 5v14M5 12h14" /></svg>
)
export const SearchIcon = ({ size }: P) => (
  <svg {...base(size)}><circle cx="11" cy="11" r="7" /><path d="m20 20-3.5-3.5" /></svg>
)
export const CloseIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M6 6l12 12M18 6 6 18" /></svg>
)
export const ClockIcon = ({ size }: P) => (
  <svg {...base(size)}><circle cx="12" cy="12" r="9" /><path d="M12 7v5l3 2" /></svg>
)
export const CalendarIcon = ({ size }: P) => (
  <svg {...base(size)}><rect x="4" y="5" width="16" height="15" rx="2" /><path d="M4 10h16M9 3v4M15 3v4" /></svg>
)
export const CommentIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M21 12a8 8 0 0 1-11.6 7.1L4 20l1-4.6A8 8 0 1 1 21 12Z" /></svg>
)
export const CheckIcon = ({ size }: P) => (
  <svg {...base(size)} strokeWidth={2.6}><path d="m5 12 5 5 9-10" /></svg>
)
export const UsersIcon = ({ size }: P) => (
  <svg {...base(size)}><circle cx="9" cy="8" r="3.5" /><path d="M2.5 20a6.5 6.5 0 0 1 13 0" /><path d="M16 4.5a3.5 3.5 0 0 1 0 7M18 14.5a6.5 6.5 0 0 1 3.5 5.5" /></svg>
)
export const SparkIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M12 3l1.8 5.2L19 10l-5.2 1.8L12 17l-1.8-5.2L5 10l5.2-1.8L12 3Z" /><path d="M19 16v4M17 18h4" /></svg>
)
export const BellIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M6 16V11a6 6 0 0 1 12 0v5l2 2H4l2-2Z" /><path d="M10 21h4" /></svg>
)
export const TagIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M3 12V4a1 1 0 0 1 1-1h8l9 9-9 9-9-9Z" /><circle cx="8" cy="8" r="1.5" /></svg>
)
export const TrashIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M4 7h16M10 11v6M14 11v6M6 7l1 13h10l1-13M9 7V4h6v3" /></svg>
)
export const ImportIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M12 4v11M7 11l5 5 5-5M5 20h14" /></svg>
)
export const ExternalIcon = ({ size }: P) => (
  <svg {...base(size)}><path d="M14 5h5v5M19 5l-8 8M11 6H6a1 1 0 0 0-1 1v11a1 1 0 0 0 1 1h11a1 1 0 0 0 1-1v-5" /></svg>
)
export const LogoIcon = ({ size = 28 }: P) => (
  <svg width={size} height={size} viewBox="0 0 32 32" fill="none" aria-hidden="true">
    <defs>
      <linearGradient id="logo-ring" x1="2" y1="16" x2="30" y2="16" gradientUnits="userSpaceOnUse">
        <stop offset="0" stopColor="#3b82f6" />
        <stop offset="0.45" stopColor="#a855f7" />
        <stop offset="0.62" stopColor="#ede9fe" />
        <stop offset="1" stopColor="#7c3aed" />
      </linearGradient>
    </defs>
    <g transform="rotate(-14 16 16)">
      {/* back half of the ring, the dark core with its glow, then the front half */}
      <path d="M2 16a14 4.4 0 0 1 28 0" stroke="url(#logo-ring)" strokeWidth="1.8" opacity="0.6" />
      <circle cx="16" cy="16" r="7.6" fill="#000" stroke="#c4b5fd" strokeWidth="1.6" />
      <path d="M2 16a14 4.4 0 0 0 28 0" stroke="url(#logo-ring)" strokeWidth="2.2" strokeLinecap="round" />
    </g>
  </svg>
)

export function PriorityIcon({ level, size = 12 }: { level: 'low' | 'normal' | 'high'; size?: number }) {
  const d = level === 'high' ? 'M6 20V10M12 20V6M18 20V3' : level === 'normal' ? 'M6 20V12M12 20V7' : 'M6 20v-5'
  return <svg {...base(size)} strokeWidth={2.6}><path d={d} /></svg>
}
