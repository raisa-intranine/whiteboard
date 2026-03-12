import { useEffect } from 'react'
import './Confirmdialog.css'

const ConfirmDialog = ({ visible, title, message, confirmLabel = 'Confirm', cancelLabel = 'Cancel', onConfirm, onCancel, danger = true }) => {
  useEffect(() => {
    if (!visible) return
    const handler = (e) => { if (e.key === 'Escape') onCancel() }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [visible, onCancel])

  if (!visible) return null

  return (
    <div className="cd-toast-container">
      <div className="cd-toast">
        <div className="cd-toast-content">
          <div className={`cd-toast-icon ${danger ? 'danger' : 'info'}`}>
            {danger ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="8" x2="12" y2="12"/>
                <line x1="12" y1="16" x2="12.01" y2="16"/>
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round">
                <circle cx="12" cy="12" r="10"/>
                <line x1="12" y1="16" x2="12" y2="12"/>
                <line x1="12" y1="8" x2="12.01" y2="8"/>
              </svg>
            )}
          </div>
          <div className="cd-toast-text">
            <h3 className="cd-toast-title">{title}</h3>
            <p className="cd-toast-message">{message}</p>
          </div>
        </div>
        <div className="cd-toast-actions">
          <button className="cd-toast-btn cd-toast-btn--cancel" onClick={onCancel}>
            {cancelLabel}
          </button>
          <button className={`cd-toast-btn ${danger ? 'cd-toast-btn--danger' : 'cd-toast-btn--confirm'}`} onClick={onConfirm} autoFocus>
            {confirmLabel}
          </button>
        </div>
      </div>
    </div>
  )
}

export default ConfirmDialog