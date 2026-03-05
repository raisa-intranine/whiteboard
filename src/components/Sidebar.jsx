import './Sidebar.css'

const BACKGROUNDS = [
  { name: 'White',      color: '#ffffff' },
  { name: 'Light Gray', color: '#f5f5f5' },
  { name: 'Beige',      color: '#fef7e6' },
  { name: 'Sky Blue',   color: '#e8f4f8' },
  { name: 'Mint',       color: '#e8f5e9' },
  { name: 'Lavender',   color: '#f3e8fd' },
]

const THEMES = [
  {
    id: 'light',
    label: 'Light',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <circle cx="12" cy="12" r="5" />
        <line x1="12" y1="1"     x2="12" y2="3"     />
        <line x1="12" y1="21"    x2="12" y2="23"    />
        <line x1="4.22" y1="4.22"  x2="5.64"  y2="5.64"  />
        <line x1="18.36" y1="18.36" x2="19.78" y2="19.78" />
        <line x1="1"    y1="12"    x2="3"     y2="12"    />
        <line x1="21"   y1="12"    x2="23"    y2="12"    />
        <line x1="4.22" y1="19.78" x2="5.64"  y2="18.36" />
        <line x1="18.36" y1="5.64" x2="19.78" y2="4.22"  />
      </svg>
    ),
  },
  {
    id: 'dark',
    label: 'Dark',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
      </svg>
    ),
  },
  {
    id: 'auto',
    label: 'System',
    icon: (
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round">
        <rect x="2" y="3" width="20" height="14" rx="2" />
        <line x1="8"  y1="21" x2="16" y2="21" />
        <line x1="12" y1="17" x2="12" y2="21" />
      </svg>
    ),
  },
]

const Sidebar = ({ theme, setTheme, canvasBackground, setCanvasBackground, canvas, isOpen }) => {
  const handleBackgroundChange = (color) => {
    setCanvasBackground(color)
    if (canvas) {
      canvas.backgroundColor = color
      canvas.renderAll()
    }
  }

  return (
    <div className={`sidebar ${theme} ${isOpen ? 'open' : ''}`}>

      <div className="sidebar-header">
        <div className="sidebar-header__icon">
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round">
            <circle cx="12" cy="12" r="3" />
            <path d="M12 1v4M12 19v4M4.22 4.22l2.83 2.83M16.95 16.95l2.83 2.83M1 12h4M19 12h4M4.22 19.78l2.83-2.83M16.95 7.05l2.83-2.83" />
          </svg>
        </div>
        <span className="sidebar-header__title">Settings</span>
      </div>

      <div className="sidebar-body">

        <div className="sidebar-section">
          <h3>Appearance</h3>
          <div className="theme-options">
            {THEMES.map(t => (
              <button
                key={t.id}
                className={`theme-btn ${theme === t.id ? 'active' : ''}`}
                onClick={() => setTheme(t.id)}
                aria-pressed={theme === t.id}
                aria-label={`${t.label} theme`}
              >
                {t.icon}
                {t.label}
              </button>
            ))}
          </div>
        </div>

        <div className="sidebar-section">
          <h3>Canvas background</h3>
          <div className="background-options">
            {BACKGROUNDS.map(bg => (
              <button
                key={bg.color}
                className={`bg-option ${canvasBackground === bg.color ? 'active' : ''}`}
                onClick={() => handleBackgroundChange(bg.color)}
                aria-pressed={canvasBackground === bg.color}
                aria-label={`${bg.name} background`}
              >
                <div className="bg-preview" style={{ backgroundColor: bg.color }} />
                <span>{bg.name}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="sidebar-section">
          <h3>Shortcuts</h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '5px' }}>
            {[
              { label: 'Delete selected',  keys: ['Del'] },
              { label: 'Copy',             keys: ['⌘', 'C'] },
              { label: 'Paste',            keys: ['⌘', 'V'] },
              { label: 'Undo',             keys: ['⌘', 'Z'] },
            ].map(sc => (
              <div key={sc.label} className="sidebar-shortcut">
                <span className="sidebar-shortcut__label">{sc.label}</span>
                <span className="sidebar-shortcut__key">
                  {sc.keys.map(k => <kbd key={k} className="kbd">{k}</kbd>)}
                </span>
              </div>
            ))}
          </div>
        </div>

      </div>

      <div className="sidebar-footer">
        <svg width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="var(--sb-text-label)" strokeWidth="2" strokeLinecap="round">
          <circle cx="12" cy="12" r="10" />
          <line x1="12" y1="8" x2="12" y2="12" />
          <line x1="12" y1="16" x2="12.01" y2="16" />
        </svg>
        <p className="sidebar-footer__text">Changes apply to the canvas immediately.</p>
      </div>

    </div>
  )
}

export default Sidebar