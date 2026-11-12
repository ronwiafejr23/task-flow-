import { useState, type CSSProperties, type FormEvent } from 'react'
import type { Label } from '../types'
import { SWATCHES } from '../types'
import { Modal } from './Modal'
import { TrashIcon } from './Icons'

interface Props {
  labels: Label[]
  onAddLabel: (name: string, color: string) => Promise<boolean>
  onRemoveLabel: (id: string) => void
  onClose: () => void
}

export function ManageModal({ labels, onAddLabel, onRemoveLabel, onClose }: Props) {
  return (
    <Modal title="Labels" onClose={onClose}>
      <div className="manage">
        <section>
          <p className="hint">Tags like Bug, Feature or Design. Add them to tasks and filter the board by them.</p>
          <ul className="manage-list">
            {labels.map((l) => (
              <li key={l.id}>
                <span className="label-tag" style={{ '--tag': l.color } as CSSProperties}>{l.name}</span>
                <span className="grow" />
                <button type="button" className="icon-btn" aria-label={`Delete label ${l.name}`} onClick={() => onRemoveLabel(l.id)}><TrashIcon size={15} /></button>
              </li>
            ))}
            {labels.length === 0 && <li className="hint">No labels yet.</li>}
          </ul>
          <AddRow placeholder="Label name, e.g. Bug" maxLength={30} onAdd={onAddLabel} />
        </section>
      </div>
    </Modal>
  )
}

function AddRow({ placeholder, maxLength, onAdd }: { placeholder: string; maxLength: number; onAdd: (name: string, color: string) => Promise<boolean> }) {
  const [name, setName] = useState('')
  const [color, setColor] = useState(SWATCHES[0])
  const submit = async (e: FormEvent) => {
    e.preventDefault()
    if (!name.trim()) return
    if (await onAdd(name, color)) setName('')
  }
  return (
    <form className="add-row" onSubmit={submit}>
      <div className="swatches" role="radiogroup" aria-label="Color">
        {SWATCHES.map((c) => (
          <button key={c} type="button" role="radio" aria-checked={color === c} aria-label={c} className={`swatch${color === c ? ' swatch-on' : ''}`} style={{ background: c }} onClick={() => setColor(c)} />
        ))}
      </div>
      <div className="add-row-input">
        <label className="grow">
          <span className="sr-only">{placeholder}</span>
          <input value={name} maxLength={maxLength} placeholder={placeholder} onChange={(e) => setName(e.target.value)} />
        </label>
        <button type="submit" className="btn btn-primary" disabled={!name.trim()}>Add</button>
      </div>
    </form>
  )
}
