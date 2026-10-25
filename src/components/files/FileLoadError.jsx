/** The load error, kept out of the file buffer so Save cannot write it. */
export function FileLoadError({ message }) {
  if (!message) return null;
  return (
    <div role="alert" data-testid="file-load-error" style={{
      padding: '4px 12px',
      background: 'color-mix(in oklab, var(--danger) 12%, transparent)',
      color: 'var(--danger)',
      fontSize: 'var(--text-xs)',
      fontFamily: 'var(--font-sans)',
    }}>
      {message}
    </div>
  );
}
