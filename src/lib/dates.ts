import { differenceInCalendarDays, format, formatDistanceToNow, parseISO } from 'date-fns'

export type DueKind = 'overdue' | 'soon' | 'later' | 'none'

export function dueInfo(due: string | null, done: boolean): { kind: DueKind; label: string } {
  if (!due) return { kind: 'none', label: '' }
  const date = parseISO(due)
  const pretty = format(date, 'MMM d')
  if (done) return { kind: 'later', label: pretty }
  const diff = differenceInCalendarDays(date, new Date())
  if (diff < 0) return { kind: 'overdue', label: `Overdue · ${pretty}` }
  if (diff === 0) return { kind: 'soon', label: 'Due today' }
  if (diff === 1) return { kind: 'soon', label: 'Tomorrow' }
  if (diff <= 2) return { kind: 'soon', label: pretty }
  return { kind: 'later', label: pretty }
}

export function isOverdue(due: string | null, done: boolean) {
  return dueInfo(due, done).kind === 'overdue'
}

export function isDueThisWeek(due: string | null, done: boolean) {
  if (!due || done) return false
  const diff = differenceInCalendarDays(parseISO(due), new Date())
  return diff >= 0 && diff <= 7
}

export function timeAgo(iso: string) {
  return formatDistanceToNow(parseISO(iso), { addSuffix: true })
}

export function longDate(due: string) {
  return format(parseISO(due), 'EEE, MMM d')
}

export function initials(name: string) {
  const parts = name.trim().split(/\s+/)
  return ((parts[0]?.[0] ?? '') + (parts.length > 1 ? parts[parts.length - 1][0] : '')).toUpperCase()
}
