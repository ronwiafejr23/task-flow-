import { initials } from '../lib/dates'
import type { Member } from '../types'

export function Avatar({ member, size = 24, stacked = false }: { member: Member; size?: number; stacked?: boolean }) {
  return (
    <span
      className={`avatar${stacked ? ' stacked' : ''}`}
      style={{ width: size, height: size, background: member.color, fontSize: Math.round(size * 0.4) }}
      title={member.name}
    >
      {initials(member.name)}
    </span>
  )
}

export function AvatarStack({ members, size = 24, max = 3 }: { members: Member[]; size?: number; max?: number }) {
  const shown = members.slice(0, max)
  const extra = members.length - shown.length
  return (
    <span className="avatar-stack" aria-label={members.map((m) => m.name).join(', ')}>
      {shown.map((m, i) => (
        <Avatar key={m.id} member={m} size={size} stacked={i > 0} />
      ))}
      {extra > 0 && (
        <span className="avatar stacked more" style={{ width: size, height: size, fontSize: Math.round(size * 0.4) }}>
          +{extra}
        </span>
      )}
    </span>
  )
}
