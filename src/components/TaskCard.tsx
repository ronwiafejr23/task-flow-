import type { CSSProperties, HTMLAttributes, Ref } from 'react'
import { dueInfo } from '../lib/dates'
import type { CardMeta, Task } from '../types'
import { PRIORITY_LABEL, SOURCE_LABEL } from '../types'
import { AvatarStack } from './Avatar'
import { CalendarIcon, CheckIcon, ClockIcon, CommentIcon, PriorityIcon } from './Icons'

interface Props extends HTMLAttributes<HTMLDivElement> {
  task: Task
  meta: CardMeta
  overlay?: boolean
  ghost?: boolean
  cardRef?: Ref<HTMLDivElement>
  style?: CSSProperties
}

/** Presentational card — used in columns and in the drag overlay. */
export function TaskCard({ task, meta, overlay, ghost, cardRef, style, className, ...rest }: Props) {
  const done = task.status === 'done'
  const due = dueInfo(task.due_date, done)

  return (
    <div
      ref={cardRef}
      style={style}
      className={['card', overlay && 'card-overlay', ghost && 'card-ghost', className].filter(Boolean).join(' ')}
      {...rest}
    >
      {(meta.labels.length > 0 || task.source !== 'manual') && (
        <div className="card-labels">
          {task.source !== 'manual' && <span className={`source-badge source-${task.source}`}>{SOURCE_LABEL[task.source]}</span>}
          {meta.labels.map((l) => (
            <span key={l.id} className="label-tag" style={{ '--tag': l.color } as CSSProperties}>
              {l.name}
            </span>
          ))}
        </div>
      )}

      {done ? (
        <div className="card-title done">
          <span className="done-check"><CheckIcon size={15} /></span>
          <span>{task.title}</span>
        </div>
      ) : (
        <div className="card-title">{task.title}</div>
      )}

      <div className="card-meta">
        <span className={`prio prio-${task.priority}`}>
          <PriorityIcon level={task.priority} /> {PRIORITY_LABEL[task.priority]}
        </span>
        {due.kind === 'overdue' && <span className="due due-overdue"><ClockIcon size={12} />{due.label}</span>}
        {due.kind === 'soon' && <span className="due due-soon"><ClockIcon size={12} />{due.label}</span>}
        {due.kind === 'later' && <span className="due due-later"><CalendarIcon size={12} />{due.label}</span>}
        <span className="spacer" />
        {meta.comments > 0 && (
          <span className="comment-count" aria-label={`${meta.comments} comments`}>
            <CommentIcon size={13} />{meta.comments}
          </span>
        )}
        {meta.members.length > 0 && <AvatarStack members={meta.members} size={24} />}
      </div>
    </div>
  )
}
