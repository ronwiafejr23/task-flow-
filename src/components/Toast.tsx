import { CloseIcon } from './Icons'

export function Toast({ message, onClose }: { message: string | null; onClose: () => void }) {
  if (!message) return null
  return (
    <div className="toast" role="status" aria-live="polite">
      <span>{message}</span>
      <button type="button" className="icon-btn icon-btn-dark" aria-label="Dismiss" onClick={onClose}>
        <CloseIcon size={14} />
      </button>
    </div>
  )
}
