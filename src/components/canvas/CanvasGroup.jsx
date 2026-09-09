import React from 'react';
import { Icon } from '../Icons.jsx';
import { AgentAvatar } from '../Agents.jsx';
import { getAgentById } from '../../lib/agentStore.js';
import { CanvasGroupPresetPopover } from './CanvasGroupPresetPopover.jsx';
import { CanvasGroupResizeHandle } from './CanvasGroupResizeHandle.jsx';
import { CanvasGroupBackgroundPicker } from './CanvasGroupBackgroundPicker.jsx';
import { createLogger } from '../../lib/logger.js';

const log = createLogger('group');

export function CanvasGroup({ group, zoom, allWins, allGroups, onUpdate, onClose, onMove, onDragEnd, onLayout, onResize, onApplyBuiltInPreset, onSavePreset, onLoadPreset, onDeletePreset }) {
  const [isEditing, setIsEditing] = React.useState(false);
  const [tempLabel, setTempLabel] = React.useState(group.label);
  const [presetMenuOpen, setPresetMenuOpen] = React.useState(false);
  const [savingPreset, setSavingPreset] = React.useState(false);
  const [presetName, setPresetName] = React.useState('');
  const dragRef = React.useRef(null);
  const saveInputRef = React.useRef(null);
  React.useEffect(() => {
    if (!savingPreset) return undefined;
    const timer = setTimeout(() => saveInputRef.current?.focus(), 30);
    return () => clearTimeout(timer);
  }, [savingPreset]);
  const presets = group.presets || [];

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
    log.debug('header pointerdown', { group: group.id, button: e.button, w: group.w, h: group.h });
  };

  const onPointerMove = (e) => {
    if (!dragRef.current || dragRef.current.id !== e.pointerId) return;
    e.stopPropagation();
    const dx = (e.clientX - dragRef.current.startX) / zoom;
    const dy = (e.clientY - dragRef.current.startY) / zoom;
    if (dragRef.current.isFirstMove) log.debug('header drag start', { group: group.id, dx, dy, isResizing: dragRef.current.isResizing });
    onMove(dx, dy, dragRef.current.isFirstMove);
    dragRef.current.isFirstMove = false;
  };

  const onPointerUp = (e) => {
    if (!dragRef.current || dragRef.current.id !== e.pointerId) return;
    e.stopPropagation();
    try { e.target.releasePointerCapture(e.pointerId); } catch {}

    log.debug('header pointerup', { group: group.id, moved: !dragRef.current.isFirstMove });
    // Only fire onDragEnd if we actually moved
    if (!dragRef.current.isFirstMove && onDragEnd) {
      onDragEnd();
    }

    dragRef.current = null;
  };

  const hue = group.hue ?? 240;
  const borderColor = `oklch(0.7 0.1 ${hue})`;
  const tabBg = `oklch(0.65 0.12 ${hue})`;

  const bgStyles = {
    tint: `oklch(0.95 0.02 ${hue} / 0.03)`,
    light: 'var(--surface)',
    dark: 'var(--surface-2)',
    none: 'transparent',
  };
  const bgMode = group.bgMode || 'tint';
  const background = bgMode === 'custom' && group.bgColor
    ? group.bgColor
    : bgStyles[bgMode] || bgStyles.tint;

  return (
    <div
      data-group-id={group.id}
      style={{
        position: 'absolute',
        left: group.x, top: group.y, width: group.w, height: group.h,
        border: `${4 / zoom}px solid ${borderColor}`,
        background,
        borderRadius: 24,
        // Bump above windows while the preset popover is open so its content isn't clipped.
        zIndex: presetMenuOpen ? 100 : 4,
        pointerEvents: 'none',
        boxSizing: 'border-box'
      }}
    >
      <div
        onPointerDown={onPointerDown}
        onPointerMove={onPointerMove}
        onPointerUp={onPointerUp}
        onPointerCancel={onPointerUp}
        style={{
          position: 'absolute', top: -32, left: 24,
          display: 'flex', alignItems: 'center', gap: 12,
          pointerEvents: 'auto',
          background: tabBg,
          color: 'white',
          padding: '6px 14px',
          height: 34,
          borderRadius: '12px 12px 0 0',
          boxShadow: '0 -2px 10px oklch(0 0 0 / 0.05)',
          cursor: 'grab',
          border: `${4 / zoom}px solid ${borderColor}`,
          borderBottom: 'none',
        }}
      >
        {isEditing ? (
          <input
            autoFocus
            value={tempLabel}
            onChange={(e) => setTempLabel(e.target.value)}
            onBlur={() => { setIsEditing(false); onUpdate({ label: tempLabel || 'Group' }); }}
            onKeyDown={(e) => {
              if (e.key === 'Enter') { setIsEditing(false); onUpdate({ label: tempLabel || 'Group' }); }
              if (e.key === 'Escape') { setIsEditing(false); setTempLabel(group.label); }
            }}
            style={{ all: 'unset', font: '14px var(--font-display)', fontWeight: 600, color: 'white', borderBottom: '1px solid rgba(255,255,255,0.5)', paddingBottom: 1, minWidth: 60 }}
          />
        ) : (
          <div
            onDoubleClick={() => setIsEditing(true)}
            onContextMenu={(e) => {
              e.preventDefault();
              onUpdate({ hue: Math.floor(Math.random() * 360) });
            }}
            title="Double-click to rename. Right-click to change color."
            style={{ font: '14px var(--font-display)', fontWeight: 700, letterSpacing: '0.02em', textShadow: '0 1px 2px oklch(0 0 0 / 0.15)' }}
          >
            {group.label}
          </div>
        )}
        <div style={{ display: 'flex', alignItems: 'center', gap: 6, marginLeft: 4 }}>
          {group.attachedAgents && group.attachedAgents.length > 0 && (
            <div style={{ display: 'flex', alignItems: 'center', marginRight: 4 }}>
              {group.attachedAgents.map(aid => {
                const a = getAgentById(aid);
                return a ? <div key={aid} style={{ marginLeft: -6, borderRadius: '50%', border: `2px solid ${tabBg}` }}><AgentAvatar agent={a} size={20} /></div> : null;
              })}
            </div>
          )}
          <CanvasGroupBackgroundPicker
            color={group.bgColor}
            hue={hue}
            onChange={(bgColor) => onUpdate({ bgColor, bgMode: 'custom' })}
          />
          <button onClick={(e) => { e.stopPropagation(); setPresetMenuOpen(o => !o); setSavingPreset(false); }} title="Layout presets" style={{ all: 'unset', cursor: 'pointer', color: presetMenuOpen ? 'white' : 'rgba(255,255,255,0.7)', display: 'flex', transition: 'color 0.15s' }} onMouseEnter={e => e.currentTarget.style.color = 'white'} onMouseLeave={e => { if (!presetMenuOpen) e.currentTarget.style.color = 'rgba(255,255,255,0.7)'; }}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><path d="M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z"/></svg>
          </button>
          <button onClick={onLayout} title="Auto Layout (saves a snapshot first so you can undo)" style={{ all: 'unset', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', display: 'flex', transition: 'color 0.15s' }} onMouseEnter={e => e.currentTarget.style.color = 'white'} onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}>
            <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="3" width="7" height="7"/><rect x="14" y="3" width="7" height="7"/><rect x="14" y="14" width="7" height="7"/><rect x="3" y="14" width="7" height="7"/></svg>
          </button>
          <div style={{ width: 1, height: 12, background: 'rgba(255,255,255,0.2)' }} />
          <button onClick={onClose} title="Delete Group" style={{ all: 'unset', cursor: 'pointer', color: 'rgba(255,255,255,0.7)', display: 'flex', transition: 'color 0.15s' }} onMouseEnter={e => e.currentTarget.style.color = 'white'} onMouseLeave={e => e.currentTarget.style.color = 'rgba(255,255,255,0.7)'}>
            <Icon.Close size={14} />
          </button>
        </div>
      </div>

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
      />

      <CanvasGroupResizeHandle
        group={group}
        allWins={allWins}
        allGroups={allGroups}
        zoom={zoom}
        borderColor={borderColor}
        dragRef={dragRef}
        onResize={onResize}
      />
    </div>
  );
}
