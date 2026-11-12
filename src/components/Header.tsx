import { ImportIcon, LogoIcon, PlusIcon, SparkIcon, TagIcon } from './Icons'

interface Props {
  onNewTask: () => void
  onManage: () => void
  onImport: () => void
  onAssistant: () => void
}

export function Header({ onNewTask, onManage, onImport, onAssistant }: Props) {
  return (
    <header className="header">
      <div className="brand">
        <span className="logo"><LogoIcon size={16} /></span>
        <span className="brand-name">Taskflow</span>
        <span className="muted-slash">/</span>
        <span className="board-name">Mission Control</span>
        <span className="pill">Ron Wiafe Jr</span>
      </div>
      <div className="header-actions">
        <button type="button" className="btn btn-ghost" onClick={onAssistant}>
          <SparkIcon size={15} /> Assistant
        </button>
        <button type="button" className="btn btn-ghost" onClick={onImport}>
          <ImportIcon size={15} /> Import
        </button>
        <button type="button" className="btn btn-ghost" onClick={onManage}>
          <TagIcon size={15} /> Labels
        </button>
        <button type="button" className="btn btn-primary" onClick={onNewTask}>
          <PlusIcon size={15} /> New task
        </button>
      </div>
    </header>
  )
}
