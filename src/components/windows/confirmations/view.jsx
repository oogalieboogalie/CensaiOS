function githubUrl(url) {
  try {
    const parsed = new URL(String(url || ''));
    if (parsed.protocol === 'https:' && parsed.hostname === 'github.com') return parsed.href;
  } catch {
    /* not a pull-request link */
  }
  return '';
}

function Item({ item, pending, onDone }) {
  const href = githubUrl(item.url);
  return (
    <li className="cf-item">
      <h2 className="cf-title">{item.title}</h2>
      {item.detail ? <p className="cf-detail">{item.detail}</p> : null}
      {href ? (
        <a
          className="cf-link"
          href={href}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(event) => {
            event.preventDefault();
            const opened = window.open(href, '_blank', 'noopener,noreferrer');
            try { if (opened) opened.opener = null; } catch { /* the new window is already sealed */ }
          }}
        >
          {item.number ? `Open pull request ${item.number}` : 'Open the pull request'}
        </a>
      ) : null}
      <button
        type="button"
        className="cf-btn"
        disabled={pending}
        onClick={() => onDone?.(item.id)}
      >
        {item.actionLabel || 'Mark done'}
      </button>
    </li>
  );
}

export function ConfirmationsView({
  status,
  items = [],
  notice = '',
  pendingId = '',
  onRetry,
  onDone,
}) {
  return (
    <section className="cf" data-testid="confirmations" aria-busy={status === 'loading' ? 'true' : 'false'}>
      {status === 'loading' && <p className="cf-status">Loading the list.</p>}
      {status === 'error' && (
        <div role="alert">
          <p className="cf-status">{notice || 'The list did not load. Try again.'}</p>
          <button type="button" className="cf-btn" onClick={onRetry}>Try again</button>
        </div>
      )}
      {status === 'ready' && items.length === 0 && (
        <p className="cf-status">Nothing waiting for you.</p>
      )}
      {status === 'ready' && items.length > 0 && (
        <>
          <p className="cf-lead">These are the only things waiting on you.</p>
          {notice ? <p className="cf-status" role="alert">{notice}</p> : null}
          <ul className="cf-list">
            {items.map((item) => (
              <Item key={item.id} item={item} pending={pendingId === item.id} onDone={onDone} />
            ))}
          </ul>
        </>
      )}
    </section>
  );
}
