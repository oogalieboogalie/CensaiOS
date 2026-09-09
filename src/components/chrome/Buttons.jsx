import React from 'react';

export function ToolBtn({ onClick, label, icon, accent }) {
  const [hover, setHover] = React.useState(false);
  return (
    <button 
      onClick={onClick} 
      title={label} 
      onMouseEnter={() => setHover(true)} 
      onMouseLeave={() => setHover(false)}
      style={{ 
        all: 'unset', cursor: 'pointer', display: 'flex', alignItems: 'center', gap: 6, 
        padding: '4px 8px', borderRadius: 8, color: hover ? accent : 'var(--ink-soft)', 
        background: hover ? 'var(--surface-2)' : 'transparent', transition: 'color 0.15s, background 0.15s' 
      }}
    >
      {icon}
    </button>
  );
}

export function PSButton({ color, title, onClick, children }) {
  return (
    <button 
      onClick={onClick} 
      title={title} 
      style={{ 
        all: 'unset', cursor: 'pointer', width: 18, height: 18, borderRadius: '50%', 
        background: color, display: 'grid', placeItems: 'center', color: 'oklch(0.18 0.06 30)', 
        boxShadow: 'inset 0 -1px 0 oklch(0 0 0 / 0.15), 0 1px 2px oklch(0 0 0 / 0.15)' 
      }}
    >
      <span style={{ opacity: 0, transition: 'opacity 0.15s' }} className="ps-glyph">{children}</span>
    </button>
  );
}

export function MenuItem({ label, onClick }) {
  return (
    <div 
      onClick={onClick} 
      style={{ padding: '7px 10px', borderRadius: 6, fontSize: 12.5, color: 'var(--ink)', cursor: 'pointer' }}
      onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-2)'}
      onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
    >
      {label}
    </div>
  );
}

export function MenuSep() {
  return <div style={{ height: 1, margin: '4px 8px', background: 'var(--hairline)' }} />;
}
