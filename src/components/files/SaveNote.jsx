/**
 * What the window's last Save did: saved (for a moment), or not saved and why,
 * until a save works or Close is pressed (a teammate's Save never works).
 */
export function SaveNote({ note, onClose }) {
  if (!note) return null;
  const failed = note.kind === 'error';
  return (
    <div role={failed ? 'alert' : 'status'} data-testid="file-save-note" style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-2)',
      padding: '4px 12px',
      background: failed ? 'color-mix(in oklab, var(--danger) 12%, transparent)' : 'var(--accent-soft)',
      color: failed ? 'var(--danger)' : 'var(--accent-ink)',
      fontSize: 'var(--text-xs)',
      fontFamily: 'var(--font-sans)',
    }}>
      <span style={{ flex: 1, minWidth: 0 }}>{note.text}</span>
      {failed && onClose && (
        <button type="button" className="hb-btn" onClick={onClose}
          style={{ minHeight: 22, padding: '0 var(--space-2)', fontSize: 'var(--text-xs)', flexShrink: 0 }}>
          Close
        </button>
      )}
    </div>
  );
}
