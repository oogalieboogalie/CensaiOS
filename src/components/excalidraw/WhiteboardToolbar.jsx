import React from 'react';
import { Icon } from '../Icons.jsx';
import { COLORS, STROKE_WIDTHS, btnStyle } from './helpers.js';

export function WhiteboardToolbar({
  activeMode,
  setActiveMode,
  setSelectedId,
  color,
  setColor,
  strokeWidth,
  setStrokeWidth,
  selectedId,
  sendToBack,
  bringToFront,
  handleDeleteSelected,
  elements,
  queueSave,
}) {
  return (
    <div style={{
      position: 'absolute',
      top: 8,
      left: '50%',
      transform: 'translateX(-50%)',
      zIndex: 10,
      display: 'flex',
      gap: 6,
      padding: '4px 8px',
      borderRadius: 8,
      background: 'color-mix(in oklab, var(--surface-2) 90%, transparent)',
      backdropFilter: 'blur(8px)',
      border: '1px solid var(--hairline)',
      boxShadow: '0 4px 12px rgba(0, 0, 0, 0.1)',
    }}>
      {/* Mode Selectors */}
      <button 
        title="Pencil Tool"
        onClick={() => { setActiveMode('pencil'); setSelectedId(null); }}
        style={{ ...btnStyle, background: activeMode === 'pencil' ? 'var(--accent)' : 'transparent', color: activeMode === 'pencil' ? '#fff' : 'var(--ink-soft)' }}
      >
        <Icon.Edit size={14} />
      </button>
      
      <button 
        title="Rectangle Tool"
        onClick={() => { setActiveMode('rect'); setSelectedId(null); }}
        style={{ ...btnStyle, background: activeMode === 'rect' ? 'var(--accent)' : 'transparent', color: activeMode === 'rect' ? '#fff' : 'var(--ink-soft)' }}
      >
        <span style={{ display: 'inline-block', width: 12, height: 10, border: '1.5px solid currentColor', borderRadius: 1 }} />
      </button>

      <button 
        title="Circle Tool"
        onClick={() => { setActiveMode('circle'); setSelectedId(null); }}
        style={{ ...btnStyle, background: activeMode === 'circle' ? 'var(--accent)' : 'transparent', color: activeMode === 'circle' ? '#fff' : 'var(--ink-soft)' }}
      >
        <span style={{ display: 'inline-block', width: 12, height: 12, border: '1.5px solid currentColor', borderRadius: '50%' }} />
      </button>

      <button 
        title="Arrow Tool"
        onClick={() => { setActiveMode('arrow'); setSelectedId(null); }}
        style={{ ...btnStyle, background: activeMode === 'arrow' ? 'var(--accent)' : 'transparent', color: activeMode === 'arrow' ? '#fff' : 'var(--ink-soft)' }}
      >
        <span style={{ fontSize: 13, fontWeight: 'bold', transform: 'rotate(-45deg)', display: 'inline-block' }}>→</span>
      </button>

      <button 
        title="Text Tool"
        onClick={() => { setActiveMode('text'); setSelectedId(null); }}
        style={{ ...btnStyle, background: activeMode === 'text' ? 'var(--accent)' : 'transparent', color: activeMode === 'text' ? '#fff' : 'var(--ink-soft)' }}
      >
        <span style={{ fontSize: 12, fontWeight: 'bold', fontFamily: 'monospace' }}>T</span>
      </button>

      <button 
        title="Select & Move Tool"
        onClick={() => setActiveMode('select')}
        style={{ ...btnStyle, background: activeMode === 'select' ? 'var(--accent)' : 'transparent', color: activeMode === 'select' ? '#fff' : 'var(--ink-soft)' }}
      >
        <span style={{ fontSize: 13, fontWeight: 'bold' }}>⬈</span>
      </button>

      <div style={{ width: 1, background: 'var(--hairline)', margin: '0 4px' }} />

      {/* Color Pickers */}
      <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
        {COLORS.map(c => (
          <button
            key={c.value}
            onClick={() => {
              setColor(c.value);
              if (selectedId) {
                queueSave(elements.map(el => el.id === selectedId ? { ...el, color: c.value } : el));
              }
            }}
            style={{
              width: 14,
              height: 14,
              borderRadius: '50%',
              background: c.value.startsWith('var') ? `oklch(var(--accent-l) calc(var(--accent-c) * 1) var(--accent-h))` : c.value,
              border: color === c.value ? '2px solid var(--ink)' : '1px solid var(--hairline)',
              cursor: 'pointer',
              padding: 0,
            }}
            title={c.label}
          />
        ))}
      </div>

      <div style={{ width: 1, background: 'var(--hairline)', margin: '0 4px' }} />

      {/* Stroke Width Toggle */}
      <div style={{ display: 'flex', gap: 3, alignItems: 'center' }}>
        {STROKE_WIDTHS.map(sw => (
          <button
            key={sw.value}
            onClick={() => {
              setStrokeWidth(sw.value);
              if (selectedId) {
                queueSave(elements.map(el => el.id === selectedId ? { ...el, strokeWidth: sw.value } : el));
              }
            }}
            style={{
              padding: '2px 4px',
              fontSize: 8,
              fontWeight: strokeWidth === sw.value ? 'bold' : 'normal',
              borderRadius: 4,
              background: strokeWidth === sw.value ? 'var(--surface-3)' : 'transparent',
              color: 'var(--ink-soft)',
              border: 'none',
              cursor: 'pointer',
            }}
          >
            {sw.label}
          </button>
        ))}
      </div>

      {selectedId && (
        <>
          <div style={{ width: 1, background: 'var(--hairline)', margin: '0 4px' }} />
          {/* Layer Actions */}
          <button title="Send to Back" onClick={sendToBack} style={btnStyle}><Icon.Down size={12} /></button>
          <button title="Bring to Front" onClick={bringToFront} style={btnStyle}><Icon.Up size={12} /></button>
          <button title="Delete Selected" onClick={handleDeleteSelected} style={{ ...btnStyle, color: '#f43f5e' }}>✖</button>
        </>
      )}
    </div>
  );
}
