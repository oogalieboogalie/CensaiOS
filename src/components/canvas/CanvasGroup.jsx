import React from 'react';
import { Icon } from '../Icons.jsx';
import { AgentAvatar } from '../Agents.jsx';
import { getAgentById } from '../../lib/agentStore.js';
import { CanvasGroupPresetPopover } from './CanvasGroupPresetPopover.jsx';
import { CanvasGroupResizeHandle } from './CanvasGroupResizeHandle.jsx';
import { CanvasGroupSeams } from './CanvasGroupSeams.jsx';
import { CanvasGroupTabs } from './CanvasGroupTabs.jsx';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('group');

/**
 * A group's chrome, drawn above its windows: the floating label (name, F-key
 * slot, layout menu) that shows on hover, the draggable seams between tiles,
 * tab strips for stacked slots and the outer resize corner. The group itself
 * has no frame; its tiles and the shadow under them (CanvasGroupCard) are
 * what you see.
 */
export function CanvasGroup({ group, zoom, allWins, allGroups, visible = true, tiled = false, onUpdate, onClose, onMove, onDragEnd, onLayout, onResize, onApplyBuiltInPreset, onSavePreset, onLoadPreset, onDeletePreset, onSetDefaultPreset, onSetSeam, onShowTab, onUndockTab, hotkeySlot }) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [tempLabel, setTempLabel] = React.useState(group.label);
  const [presetMenuOpen, setPresetMenuOpen] = React.useState(false);
  const [savingPreset, setSavingPreset] = React.useState(false);
  const [presetName, setPresetName] = React.useState('');
  const [dragging, setDragging] = React.useState(false);
  const dragRef = React.useRef(null);
  const saveInputRef = React.useRef(null);
  React.useEffect(() => {
    if (!savingPreset) return undefined;
    const timer = setTimeout(() => saveInputRef.current?.focus(), 30);
    return () => clearTimeout(timer);
  }, [savingPreset]);
  const presets = group.presets || [];
  const showLabel = visible || isEditing || presetMenuOpen || dragging;

  const onPointerDown = (e) => {
    const hitButton = e.target.closest('button');
    if (e.target.tagName === 'INPUT' || hitButton) {
      log.info('header button clicked', { group: group.id, button: e.button, control: hitButton?.title || 'input' });
      return;
    }
    if (document.activeElement && typeof document.activeElement.blur === 'function') {
      const tag = document.activeElement.tagName;
      if (['INPUT', 'TEXTAREA'].includes(tag) || document.activeElement.contentEditable === 'true') {
        document.activeElement.blur();
      }
    }
    e.stopPropagation();
    try { e.target.setPointerCapture(e.pointerId); } catch {}
    dragRef.current = { id: e.pointerId, startX: e.clientX, startY: e.clientY, isFirstMove: true };
    setDragging(true);
  };

  const onPointerMove = (e) => {
    if (!dragRef.current || dragRef.current.id !== e.pointerId) return;
    e.stopPropagation();
    const dx = (e.clientX - dragRef.current.startX) / zoom;
    const dy = (e.clientY - dragRef.current.startY) / zoom;
    onMove?.(dx, dy, dragRef.current.isFirstMove);
    dragRef.current.isFirstMove = false;
  };

  const onPointerUp = (e) => {
    if (!dragRef.current || dragRef.current.id !== e.pointerId) return;
    e.stopPropagation();
    try { e.target.releasePointerCapture(e.pointerId); } catch {}
    if (!dragRef.current.isFirstMove && onDragEnd) onDragEnd();
    dragRef.current = null;
    setDragging(false);
  };

  const hue = group.hue ?? 240;
  const dot = `oklch(0.68 0.09 ${hue})`;
  const iconButton = {
    all: 'unset', cursor: 'pointer', color: 'var(--ink-faint)', display: 'flex',
    alignItems: 'center', justifyContent: 'center', width: 20, height: 20, borderRadius: 'var(--radius-sm)',
  };
  const hoverOn = (e) => { e.currentTarget.style.color = 'var(--ink)'; e.currentTarget.style.background = 'var(--surface-2)'; };
  const hoverOff = (e) => { e.currentTarget.style.color = 'var(--ink-faint)'; e.currentTarget.style.background = 'transparent'; };

  return (
    <div
      data-group-id={group.id}
      data-group-tiled={tiled ? 'true' : 'false'}
      style={{
        position: 'absolute',
        left: group.x, top: group.y, width: group.w, height: group.h,
        // Above the windows while the preset popover is open so it isn't clipped.
        zIndex: presetMenuOpen ? 100 : 4,
        pointerEvents: 'none',
        boxSizing: 'border-box',
      }}
    >
      {/* Floating label: sits just above the group's top-left corner. */}
      <div
        data-group-label
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        title="Drag to move the group. Double-click the name to rename."
        style={{
          position: 'absolute', left: 0, bottom: '100%',
          transform: `translateY(-6px) scale(${1 / zoom})`, transformOrigin: 'bottom left',
          display: 'flex', alignItems: 'center', gap: 6,
          height: 28, padding: '0 4px 0 10px',
          pointerEvents: showLabel ? 'auto' : 'none',
          opacity: showLabel ? 1 : 0,
          transition: 'opacity var(--dur-base) var(--ease-standard)',
          background: 'var(--surface)',
          color: 'var(--ink)',
          border: '1px solid var(--hairline)',
          borderRadius: 'var(--radius-md)',
          boxShadow: 'var(--shadow-card)',
          cursor: dragging ? 'grabbing' : 'grab',
          whiteSpace: 'nowrap',
          fontFamily: 'var(--font-sans)',
        }}
      >
        <span aria-hidden="true" style={{ width: 6, height: 6, borderRadius: 'var(--radius-full)', background: dot, flex: 'none' }} />
        {isEditing ? (
          <input
            autoFocus
            value={tempLabel}
            aria-label="Group name"
            onChange={(e) => setTempLabel(e.target.value)}
            onBlur={() => { setIsEditing(false); onUpdate?.({ label: tempLabel || 'Group' }); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { setIsEditing(false); onUpdate?.({ label: tempLabel || 'Group' }); }
              if (e.key === 'Escape') { setIsEditing(false); setTempLabel(group.label); }
            }}
            style={{ all: 'unset', fontSize: 'var(--text-xs)', fontWeight: 600, color: 'var(--ink)', borderBottom: '1px solid var(--accent)', minWidth: 60 }}
          />
        ) : (
          <span onDoubleClick={() => setIsEditing(true)} style={{ fontSize: 'var(--text-xs)', fontWeight: 600 }}>
            {group.label}
          </span>
        )}
        {hotkeySlot && (
          <span title={`Control group ${hotkeySlot}: Ctrl/Alt+${hotkeySlot} to assign, F${hotkeySlot} to focus`} style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-sm)', padding: '0 4px', lineHeight: 1.5 }}>
            F{hotkeySlot}
          </span>
        )}
        {group.attachedAgents && group.attachedAgents.length > 0 && (
          <span style={{ display: 'flex', alignItems: 'center', paddingLeft: 6 }}>
            {group.attachedAgents.map(aid => {
              const a = getAgentById(aid);
              return a ? <span key={aid} style={{ marginLeft: -6, borderRadius: 'var(--radius-full)', border: '2px solid var(--surface)', display: 'flex' }}><AgentAvatar agent={a} size={18} /></span> : null;
            })}
          </span>
        )}
        <span aria-hidden="true" style={{ width: 1, height: 14, background: 'var(--hairline)', margin: '0 2px' }} />
        <button aria-label="Layout presets" title="Layouts" onClick={(e) => { e.stopPropagation(); setPresetMenuOpen(o => !o); setSavingPreset(false); }} style={iconButton} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M12 3v18M12 12h9"/></svg>
        </button>
        <button aria-label="Auto layout" onClick={onLayout} title="Auto layout (saves a snapshot first so you can undo)" style={iconButton} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
          <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
        </button>
        <button aria-label="Ungroup" onClick={onClose} title="Ungroup (windows stay where they are)" style={iconButton} onMouseEnter={hoverOn} onMouseLeave={hoverOff}>
          <Icon.Close size={14} />
        </button>
      </div>

      {tiled && group.root && (
        <>
          <CanvasGroupSeams group={group} zoom={zoom} onSetSeam={onSetSeam} />
          <CanvasGroupTabs group={group} zoom={zoom} allWins={allWins} onShowTab={onShowTab} onUndockTab={onUndockTab} />
        </>
      )}

      <CanvasGroupPresetPopover
        presetMenuOpen={presetMenuOpen}
        setPresetMenuOpen={setPresetMenuOpen}
        setSavingPreset={setSavingPreset}
        setPresetName={setPresetName}
        allWins={allWins}
        group={group}
        zoom={zoom}
        onApplyBuiltInPreset={onApplyBuiltInPreset}
        savingPreset={savingPreset}
        saveInputRef={saveInputRef}
        presetName={presetName}
        onSavePreset={onSavePreset}
        presets={presets}
        onLoadPreset={onLoadPreset}
        onDeletePreset={onDeletePreset}
        onSetDefaultPreset={onSetDefaultPreset}
      />

      {showLabel && (
        <CanvasGroupResizeHandle
          group={group}
          allWins={allWins}
          allGroups={allGroups}
          zoom={zoom}
          borderColor="var(--ink-faint)"
          dragRef={dragRef}
          onResize={onResize}
        />
      )}
    </div>
  );
}

/** The one shadow under a tiled group's windows, so the tiles read as one card. */
export function CanvasGroupCard({ group }) {
  return (
    <div
      aria-hidden="true"
      data-group-card={group.id}
      style={{
        position: 'absolute', left: group.x, top: group.y, width: group.w, height: group.h,
        borderRadius: 'var(--window-radius, var(--radius-window))',
        boxShadow: 'var(--window-shadow, var(--shadow-card))',
        pointerEvents: 'none',
      }}
    />
  );
}
