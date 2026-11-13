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
    <div className="hb-is-tools">
      <div className="hb-is-row">
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
      <div className="hb-is-row">
        <span className="hb-is-label">Color</span>
        {IMAGE_STUDIO_COLORS.map(item => (
          <button
            key={item}
            type="button"
            title={item}
            aria-label={`Color ${item}`}
            aria-pressed={item === color}
            onClick={() => setColor(item)}
            className="hb-is-swatch"
            style={{ background: item }}
          />
        ))}
        <Divider />
        <span className="hb-is-label">Stroke</span>
        {STROKE_SIZES.map(item => (
          <ToolButton key={item.id} active={strokeWidth === item.value} onClick={() => setStrokeWidth(item.value)}>
            {item.label}
          </ToolButton>
        ))}
        {tool === 'text' && (
          <input
            value={textValue}
            onChange={event => setTextValue(event.target.value)}
            placeholder="Text"
            className="hb-is-input hb-is-input-text"
          />
        )}
      </div>
    </div>
  );
}

// Tools and stroke sizes share one raised key; the chosen one is filled.
function ToolButton({ active, disabled, onClick, children }) {
  return (
    <button
      type="button"
      disabled={disabled}
      onClick={onClick}
      aria-pressed={active === undefined ? undefined : active}
      className="hb-is-key"
    >
      {children}
    </button>
  );
}

function Divider() {
  return <span aria-hidden="true" className="hb-is-divider" />;
}
