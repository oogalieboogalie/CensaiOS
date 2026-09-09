import React from 'react';
import {
  IMAGE_STUDIO_COLORS,
  IMAGE_STUDIO_TOOLS,
  STROKE_SIZES,
} from './constants.js';

export function ImageStudioToolbar({
  tool,
  setTool,
  color,
  setColor,
  strokeWidth,
  setStrokeWidth,
  textValue,
  setTextValue,
  canInsertImage,
  onInsertImage,
  onUndo,
  onRedo,
  onDelete,
  onClear,
}) {
  return (
    <div style={{ display: 'grid', gap: 8, paddingTop: 8 }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, alignItems: 'center' }}>
        {IMAGE_STUDIO_TOOLS.map(item => (
          <ToolButton key={item.id} active={tool === item.id} onClick={() => setTool(item.id)}>
            {item.label}
          </ToolButton>
        ))}
        <Divider />
        <ToolButton onClick={onUndo}>Undo</ToolButton>
        <ToolButton onClick={onRedo}>Redo</ToolButton>
        <ToolButton onClick={onDelete}>Delete</ToolButton>
        <ToolButton onClick={onClear}>Clear</ToolButton>
        <ToolButton disabled={!canInsertImage} onClick={onInsertImage}>Add image</ToolButton>
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 8, alignItems: 'center' }}>
        <span style={labelStyle}>Color</span>
        {IMAGE_STUDIO_COLORS.map(item => (
          <button
            key={item}
            type="button"
            title={item}
            onClick={() => setColor(item)}
            style={{
              width: 22,
              height: 22,
              borderRadius: 999,
              border: item === color ? '2px solid var(--accent)' : '1px solid var(--hairline)',
              background: item,
              cursor: 'pointer',
            }}
          />
        ))}
        <Divider />
        <span style={labelStyle}>Stroke</span>
        {STROKE_SIZES.map(item => (
          <button
            key={item.id}
            type="button"
            onClick={() => setStrokeWidth(item.value)}
            style={{
              all: 'unset',
              cursor: 'pointer',
              width: 24,
              height: 24,
              borderRadius: 8,
              display: 'grid',
              placeItems: 'center',
              background: strokeWidth === item.value ? 'var(--accent-soft)' : 'var(--surface-2)',
              color: strokeWidth === item.value ? 'var(--accent)' : 'var(--ink-soft)',
              font: '700 11px var(--font-mono)',
            }}
          >
            {item.label}
          </button>
        ))}
        {tool === 'text' && (
          <input
            value={textValue}
            onChange={event => setTextValue(event.target.value)}
            placeholder="Text"
            style={{ flex: '1 1 160px', minWidth: 120, background: 'var(--surface-2)', border: '1px solid var(--hairline)', color: 'var(--ink)', borderRadius: 8, padding: '6px 8px', fontSize: 12 }}
          />
        )}
      </div>
    </div>
  );
}

function ToolButton({ active, disabled, onClick, children }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      style={{
        all: 'unset',
        cursor: disabled ? 'not-allowed' : 'pointer',
        padding: '6px 9px',
        borderRadius: 8,
        background: active ? 'var(--accent)' : 'var(--surface-2)',
        color: active ? 'white' : 'var(--ink-soft)',
        opacity: disabled ? 0.45 : 1,
        font: '700 11px var(--font-mono)',
      }}
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span aria-hidden="true" style={{ width: 1, height: 22, background: 'var(--hairline)' }} />;
}

const labelStyle = {
  color: 'var(--ink-faint)',
  font: '700 10px var(--font-mono)',
  textTransform: 'uppercase',
  letterSpacing: '0.08em',
};
