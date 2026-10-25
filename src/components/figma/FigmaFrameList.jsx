function groupBySection(frames) {
  const groups = [];
  for (const frame of frames) {
    const section = frame.section || '';
    const last = groups[groups.length - 1];
    if (!last || last.section !== section) groups.push({ section, frames: [frame] });
    else last.frames.push(frame);
  }
  return groups;
}

function FrameCard({ frame, selected, onToggle }) {
  return (
    <button
      type="button"
      aria-pressed={selected}
      onClick={onToggle}
      style={{
        all: 'unset', cursor: 'pointer', display: 'grid', gap: 6, padding: 6, borderRadius: 'var(--radius-lg)',
        border: `1px solid ${selected ? 'var(--accent)' : 'var(--hairline)'}`,
        background: selected ? 'var(--accent-soft)' : 'var(--surface-2)',
      }}
    >
      <div style={{ aspectRatio: '4 / 3', borderRadius: 'var(--radius-md)', overflow: 'hidden', background: 'var(--surface-3, var(--surface))', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        {frame.thumbnailUrl
          ? <img src={frame.thumbnailUrl} alt="" style={{ maxWidth: '100%', maxHeight: '100%', objectFit: 'contain' }} />
          : <span style={{ font: '11px var(--font-mono)', color: 'var(--ink-faint)' }}>{frame.width}×{frame.height}</span>}
      </div>
      <div style={{ font: '500 12px var(--font-sans)', color: 'var(--ink)', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{frame.name}</div>
      <div style={{ font: '11px var(--font-sans)', color: 'var(--ink-faint)' }}>{frame.page} · {frame.width}×{frame.height}</div>
    </button>
  );
}

// Frames in file order, with a heading for each run that sits inside a Section.
export function FigmaFrameList({ frames, selected, onToggle }) {
  const groups = groupBySection(frames);
  return (
    <div style={{ flex: 1, minHeight: 0, overflow: 'auto', display: 'flex', flexDirection: 'column', gap: 14, alignContent: 'start' }}>
      {groups.map((group) => (
        <section key={`${group.section}:${group.frames[0]?.id || ''}`} aria-label={group.section || 'Frames'}>
          {group.section ? (
            <h3 style={{ margin: '0 0 8px', font: '600 12px var(--font-sans)', color: 'var(--ink-soft)' }}>{group.section}</h3>
          ) : null}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))', gap: 10 }}>
            {group.frames.map((frame) => (
              <FrameCard key={frame.id} frame={frame} selected={selected.includes(frame.id)} onToggle={() => onToggle(frame.id)} />
            ))}
          </div>
        </section>
      ))}
    </div>
  );
}
