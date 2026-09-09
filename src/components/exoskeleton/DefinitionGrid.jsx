import React from 'react';

export function DefinitionGrid({ title, description, items, equipped, onToggle, eyebrow }) {
  return (
    <section style={{ display: 'flex', flexDirection: 'column', gap: 10 }}>
      <div>
        {eyebrow && <div style={{ color: 'var(--accent)', fontSize: 9, fontWeight: 800, letterSpacing: 1, textTransform: 'uppercase', marginBottom: 3 }}>{eyebrow}</div>}
        <h3 style={{ fontSize: 13, fontWeight: 750, color: 'var(--ink)', margin: 0 }}>{title}</h3>
        <p style={{ fontSize: 10, color: 'var(--ink-soft)', lineHeight: 1.45, margin: '3px 0 0' }}>{description}</p>
      </div>
      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(205px, 1fr))', gap: 9 }}>
        {items.map((item) => {
          const active = equipped.includes(item.id);
          return (
            <button
              type="button"
              aria-pressed={active}
              key={item.id}
              onClick={() => onToggle(item.id)}
              style={{
                appearance: 'none', textAlign: 'left', padding: '11px 12px', borderRadius: 9,
                background: active ? 'var(--accent-soft)' : 'var(--surface)',
                border: `1px solid ${active ? 'var(--accent)' : 'var(--hairline)'}`,
                boxShadow: active ? '0 0 0 1px var(--accent-soft)' : 'var(--shadow-card)',
                color: 'var(--ink)', cursor: 'pointer', display: 'grid', gap: 5,
              }}
            >
              <span style={{ display: 'flex', justifyContent: 'space-between', gap: 8, alignItems: 'center' }}>
                <span style={{ fontSize: 11, fontWeight: 750 }}>{item.name}</span>
                <span style={{ color: active ? 'var(--accent)' : 'var(--ink-faint)', fontSize: 9, fontWeight: 800 }}>{active ? 'Equipped' : 'Available'}</span>
              </span>
              <span style={{ fontSize: 10, color: 'var(--ink-soft)', lineHeight: 1.35 }}>{item.description}</span>
              {item.category && <span style={{ fontSize: 9, color: 'var(--ink-faint)', textTransform: 'uppercase', letterSpacing: 0.6 }}>{item.category}</span>}
            </button>
          );
        })}
      </div>
    </section>
  );
}
