import { addDays, differenceInCalendarDays, format, parseISO } from 'date-fns'
import type { Task } from '../types'

// The assistant is rule-based: it runs entirely in the browser, with no AI
// service or API key. It ranks tasks by urgency and reads dates out of
// plain-English reminders.

// ---------- "remind me to …" parsing ----------

const WEEKDAYS = ['sunday', 'monday', 'tuesday', 'wednesday', 'thursday', 'friday', 'saturday']
const MONTHS = ['jan', 'feb', 'mar', 'apr', 'may', 'jun', 'jul', 'aug', 'sep', 'oct', 'nov', 'dec']
const WORD_NUMBERS: Record<string, number> = { a: 1, an: 1, one: 1, two: 2, three: 3, four: 4, five: 5, six: 6, seven: 7 }
const LEAD = '(?:(?:on|by|due|before|for|this|next|until)\\s+)*'

export interface ParsedReminder {
  title: string
  due: string | null // yyyy-MM-dd
}

/** "remind me to email my professor Friday" → { title: "Email my professor", due: "<that Friday>" } */
export function parseReminder(input: string, now: Date = new Date()): ParsedReminder {
  const state: { text: string; due: Date | null } = {
    text: input
      .trim()
      .replace(/^(?:please\s+)?(?:remind me (?:to|about|that)?|remember to|don'?t forget to|i (?:need|have) to|todo:?)\s*/i, ''),
    due: null,
  }

  // Try one pattern; if it matches, remember the date and cut the phrase out of the title.
  const take = (pattern: string, toDate: (match: RegExpMatchArray) => Date | null) => {
    if (state.due) return
    const match = state.text.match(new RegExp(pattern, 'i'))
    if (!match || match.index === undefined) return
    const date = toDate(match)
    if (!date) return
    state.due = date
    state.text = `${state.text.slice(0, match.index)} ${state.text.slice(match.index + match[0].length)}`
  }

  const withYear = (month: number, day: number, year?: number) => {
    if (month < 0 || month > 11 || day < 1 || day > 31) return null
    const date = new Date(year ?? now.getFullYear(), month, day)
    if (date.getMonth() !== month) return null
    // "Jan 5" said in November means next January
    if (year === undefined && differenceInCalendarDays(date, now) < 0) date.setFullYear(date.getFullYear() + 1)
    return date
  }

  // 11/20 or 11/20/2026
  take(`\\b${LEAD}(\\d{1,2})/(\\d{1,2})(?:/(\\d{2,4}))?\\b`, (m) => {
    const year = m[3] ? (m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3])) : undefined
    return withYear(Number(m[1]) - 1, Number(m[2]), year)
  })
  // Nov 20, November 20th
  take(
    `\\b${LEAD}(jan(?:uary)?|feb(?:ruary)?|mar(?:ch)?|apr(?:il)?|may|june?|july?|aug(?:ust)?|sep(?:t(?:ember)?)?|oct(?:ober)?|nov(?:ember)?|dec(?:ember)?)\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?\\b`,
    (m) => withYear(MONTHS.indexOf(m[1].slice(0, 3).toLowerCase()), Number(m[2])),
  )
  // in 3 days, in two weeks
  take(`\\bin\\s+(\\d+|a|an|one|two|three|four|five|six|seven)\\s+(day|week)s?\\b`, (m) => {
    const count = WORD_NUMBERS[m[1].toLowerCase()] ?? Number(m[1])
    return addDays(now, count * (m[2].toLowerCase() === 'week' ? 7 : 1))
  })
  take(`\\b${LEAD}(?:the\\s+)?day after tomorrow\\b`, () => addDays(now, 2))
  take(`\\b${LEAD}(?:tomorrow|tmrw)\\b`, () => addDays(now, 1))
  take(`\\b${LEAD}(?:today|tonight)\\b`, () => now)
  take(`\\bnext week\\b`, () => addDays(now, 7))
  // Friday, by Friday, next Friday
  take(`\\b${LEAD}(sunday|monday|tuesday|wednesday|thursday|friday|saturday)\\b`, (m) => {
    const target = WEEKDAYS.indexOf(m[1].toLowerCase())
    const ahead = (target - now.getDay() + 7) % 7 || 7 // always a future day
    return addDays(now, ahead)
  })

  const cleaned = state.text
    .replace(/\s+/g, ' ')
    .replace(/\s+(?:on|by|due|before|for|at|until)$/i, '')
    .replace(/^[\s,.:;-]+|[\s,.:;-]+$/g, '')
  const title = cleaned ? cleaned[0].toUpperCase() + cleaned.slice(1) : ''

  return { title, due: state.due ? format(state.due, 'yyyy-MM-dd') : null }
}

// ---------- what to do first ----------

export interface FocusItem {
  task: Task
  reason: string
  urgent: boolean
}

function daysUntil(task: Task): number | null {
  return task.due_date ? differenceInCalendarDays(parseISO(task.due_date), new Date()) : null
}

/** Open tasks ranked by urgency: overdue first, then closest due date, then priority. */
export function focusList(tasks: Task[], limit = 5): FocusItem[] {
  return tasks
    .filter((t) => t.status !== 'done')
    .map((task) => {
      const days = daysUntil(task)
      let score = 0
      if (days !== null) score += days < 0 ? 100 + Math.min(-days, 30) : Math.max(0, 60 - days * 6)
      score += task.priority === 'high' ? 25 : task.priority === 'normal' ? 10 : 0
      score += task.status === 'in_progress' ? 8 : task.status === 'in_review' ? 4 : 0

      let reason = task.priority === 'high' ? 'High priority' : task.status === 'in_progress' ? 'Already in progress' : 'No due date'
      if (days !== null) {
        if (days < 0) reason = `Overdue by ${-days} day${days === -1 ? '' : 's'}`
        else if (days === 0) reason = 'Due today'
        else if (days === 1) reason = 'Due tomorrow'
        else reason = `Due ${format(parseISO(task.due_date as string), 'EEE, MMM d')}`
      }
      return { task, reason, urgent: days !== null && days <= 1, score }
    })
    .sort((a, b) => b.score - a.score || a.task.position - b.task.position)
    .slice(0, limit)
    .map(({ task, reason, urgent }) => ({ task, reason, urgent }))
}

// ---------- due alerts ----------

export interface DueSummary {
  overdue: number
  today: number
  tomorrow: number
  text: string
}

export function dueSummary(tasks: Task[]): DueSummary {
  let overdue = 0
  let today = 0
  let tomorrow = 0
  for (const task of tasks) {
    if (task.status === 'done') continue
    const days = daysUntil(task)
    if (days === null) continue
    if (days < 0) overdue++
    else if (days === 0) today++
    else if (days === 1) tomorrow++
  }
  const parts = [overdue && `${overdue} overdue`, today && `${today} due today`, tomorrow && `${tomorrow} due tomorrow`].filter(Boolean)
  return { overdue, today, tomorrow, text: parts.length ? parts.join(' · ') : "Nothing due today or tomorrow. You're on track." }
}

const NOTIFIED_KEY = 'taskflow.notifiedOn'

export const notificationsSupported = () => typeof window !== 'undefined' && 'Notification' in window

/** One browser notification per day, only if there is something due. */
export function notifyDueOnce(summary: DueSummary) {
  if (!notificationsSupported() || Notification.permission !== 'granted') return
  if (summary.overdue + summary.today + summary.tomorrow === 0) return
  const todayKey = format(new Date(), 'yyyy-MM-dd')
  try {
    if (localStorage.getItem(NOTIFIED_KEY) === todayKey) return
    localStorage.setItem(NOTIFIED_KEY, todayKey)
  } catch {
    return // can't remember that we notified, so don't risk repeating it
  }
  new Notification('Taskflow', { body: summary.text })
}
