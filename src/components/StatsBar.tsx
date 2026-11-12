import { isDueThisWeek, isOverdue } from '../lib/dates'
import type { Task } from '../types'

export function StatsBar({ tasks }: { tasks: Task[] }) {
  const total = tasks.length
  const done = tasks.filter((t) => t.status === 'done').length
  const pct = total ? Math.round((done / total) * 100) : 0
  const week = tasks.filter((t) => isDueThisWeek(t.due_date, t.status === 'done')).length
  const overdue = tasks.filter((t) => isOverdue(t.due_date, t.status === 'done')).length

  return (
    <section className="stats" aria-label="Board summary">
      <div className="stat">
        <div className="stat-label">Total tasks</div>
        <div className="stat-value">{total}</div>
      </div>
      <div className="stat">
        <div className="stat-label">Completed</div>
        <div className="stat-row">
          <span className="stat-value">{done}</span>
          <span className="stat-sub">{pct}%</span>
        </div>
        <div className="progress" role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label="Completion">
          <div className="progress-fill" style={{ width: `${pct}%` }} />
        </div>
      </div>
      <div className="stat">
        <div className="stat-label">Due this week</div>
        <div className="stat-value">{week}</div>
      </div>
      <div className={`stat${overdue ? ' stat-danger' : ''}`}>
        <div className="stat-label">Overdue</div>
        <div className="stat-value">{overdue}</div>
      </div>
    </section>
  )
}
