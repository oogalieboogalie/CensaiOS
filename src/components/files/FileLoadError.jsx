/** The load error, kept out of the file buffer so Save cannot write it. */
export function FileLoadError({ message, onRetry }) {
  if (!message) return null;
  return (
    <div role="alert" data-testid="file-load-error" style={{
      display: 'flex',
      alignItems: 'center',
      gap: 'var(--space-2)',
      padding: '4px 12px',
      background: 'color-mix(in oklab, var(--danger) 12%, transparent)',
      color: 'var(--danger)',
      fontSize: 'var(--text-xs)',
      fontFamily: 'var(--font-sans)',
    }}>
      <span style={{ flex: 1, minWidth: 0 }}>{message}</span>
      {onRetry && (
        <button type="button" className="hb-btn" onClick={onRetry}
          style={{ minHeight: 22, padding: '0 var(--space-2)', fontSize: 'var(--text-xs)', flexShrink: 0 }}>
          Try again
        </button>
      )}
    </div>
  );
}
