export type Status = 'todo' | 'in_progress' | 'in_review' | 'done'
export type Priority = 'low' | 'normal' | 'high'
export type Source = 'manual' | 'canvas' | 'gmail'

export interface Task {
  id: string
  user_id: string
  title: string
  description: string | null
  status: Status
  priority: Priority
  due_date: string | null
  position: number
  source: Source
  external_id: string | null
  source_url: string | null
  created_at: string
  updated_at: string
}

/** One Canvas assignment or Gmail message offered for import. */
export interface ImportItem {
  source: 'canvas' | 'gmail'
  externalId: string
  title: string
  subtitle: string
  description: string
  due: string | null // yyyy-MM-dd
  url: string | null
  /** e.g. already submitted in Canvas — shown unchecked */
  done?: boolean
  priority?: Priority
}

export interface Member {
  id: string
  name: string
  color: string
}

export interface Label {
  id: string
  name: string
  color: string
}

export interface TaskAssignee {
  task_id: string
  member_id: string
}

export interface TaskLabel {
  task_id: string
  label_id: string
}

export interface Comment {
  id: string
  task_id: string
  body: string
  created_at: string
}

export interface Activity {
  id: string
  task_id: string
  action:
    | 'created'
    | 'status_changed'
    | 'title_changed'
    | 'priority_changed'
    | 'due_date_changed'
    | 'assigned'
    | 'unassigned'
  from_value: string | null
  to_value: string | null
  created_at: string
}

export interface NewTaskInput {
  title: string
  description: string
  status: Status
  priority: Priority
  due_date: string | null
  labelIds: string[]
  memberIds: string[]
}

export interface CardMeta {
  labels: Label[]
  members: Member[]
  comments: number
}

export const COLUMNS: { id: Status; title: string; dot: string }[] = [
  { id: 'todo', title: 'To Do', dot: '#8F99AD' },
  { id: 'in_progress', title: 'In Progress', dot: '#FFB020' },
  { id: 'in_review', title: 'In Review', dot: '#B78BFF' },
  { id: 'done', title: 'Done', dot: '#4ADE80' },
]

export const STATUS_LABEL: Record<Status, string> = {
  todo: 'To Do',
  in_progress: 'In Progress',
  in_review: 'In Review',
  done: 'Done',
}

export const PRIORITY_LABEL: Record<Priority, string> = {
  low: 'Low',
  normal: 'Normal',
  high: 'High',
}

export const SOURCE_LABEL: Record<Source, string> = { manual: 'Manual', canvas: 'Canvas', gmail: 'Gmail' }

export const SWATCHES = ['#4CC9F0', '#4ADE80', '#FFB020', '#FF6B9D', '#7C8CFF', '#B78BFF', '#FF7B7B', '#94A3B8']
