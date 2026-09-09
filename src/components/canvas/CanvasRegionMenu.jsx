import React from 'react';
import { AgentAvatar } from '../Agents.jsx';
import { getAgents } from '../../lib/agentStore.js';
import { CanvasFitPrompt } from './CanvasFitPrompt.jsx';
import { buildRegionMenuItems } from './CanvasRegionItems.jsx';
import { buildFavoriteRailItems, getFavoriteableItems, getRailOffsets, SidebarFavoritesPopover } from './CanvasRegionFavorites.jsx';
import { useWorkspaceStore } from '../../lib/store.js';
import { useEscapeDismiss } from '../../lib/useEscapeDismiss.js';

export function RegionMenu({ rect, zoom, neighbor, onFitNeighbor, onCancel, onPickIdea, onPickPlan, onPickGroup, onPickChat, onPickGroupChat, onPickWorkflow, onPickCodeEditor, onPickHtmlPreview, onPickAgent, onPickImage, onPickBrowser, onPickFiles, onPickCalendar, onPickOperations, onPickScheduler, onPickMusic, onPickStream, onPickExoSkeleton, onPickOverseer, onShare, onDownload }) {
  const [hovered, setHovered] = React.useState(null);
  const [chatPickerOpen, setChatPickerOpen] = React.useState(false);
  const [customizeOpen, setCustomizeOpen] = React.useState(false);
  const [fitDismissed, setFitDismissed] = React.useState(false);
  useEscapeDismiss(true, onCancel);

  const { sidebarFavorites = [], setSidebarFavorites } = useWorkspaceStore();

  const railWidth = 36 / zoom;
  const btnSize = 30 / zoom;
  const gap = 2 / zoom;
  const pad = 3 / zoom;
  const railX = rect.x - railWidth - (4 / zoom);
  const agents = getAgents();
  const showFitPrompt = neighbor && !fitDismissed;

  const allItems = buildRegionMenuItems({
    onPickPlan,
    onPickIdea,
    onPickGroupChat,
    onPickFiles,
    onPickCodeEditor,
    onPickHtmlPreview,
    onPickWorkflow,
    onPickImage,
    onPickBrowser,
    onPickCalendar,
    onPickOperations,
    onPickScheduler,
    onPickGroup,
    onPickMusic,
    onPickStream,
    onPickExoSkeleton,
    onPickOverseer,
    onPickAgent,
    onShare,
    onDownload,
    setChatPickerOpen: (val) => {
      setChatPickerOpen(val);
      if (val) setCustomizeOpen(false);
    }
  });

  const favoriteableItems = getFavoriteableItems(allItems);
  const railItems = buildFavoriteRailItems({
    allItems,
    favoriteableItems,
    sidebarFavorites,
    onCustomize: () => {
      setCustomizeOpen(v => !v);
      setChatPickerOpen(false);
    }
  });
  const offsets = getRailOffsets({ railItems, pad, btnSize, gap, zoom });

  return <>
    {/* dismiss backdrop */}
    <div data-canvas-context-surface onClick={onCancel} style={{ position: 'absolute', left: -10000, top: -10000, width: 100000, height: 100000, zIndex: 60 }} />
    {/* region highlight */}
    <div style={{ position: 'absolute', left: rect.x, top: rect.y, width: rect.w, height: rect.h, border: `${1.5 / zoom}px solid oklch(var(--accent-l) calc(var(--accent-c) * 0.8) var(--accent-h))`, background: 'oklch(var(--accent-l) calc(var(--accent-c) * 0.8) var(--accent-h) / 0.06)', borderRadius: 12 / zoom, pointerEvents: 'none', zIndex: 61 }} />
    <CanvasFitPrompt
      rect={rect}
      zoom={zoom}
      neighbor={showFitPrompt ? neighbor : null}
      onFit={(fitted) => { setFitDismissed(true); onFitNeighbor?.(fitted); }}
      onDismiss={() => setFitDismissed(true)}
    />    {/* vertical icon rail — outer wrapper has overflow:visible for tooltips */}
    <div data-canvas-ui onClick={e => e.stopPropagation()} style={{
      position: 'absolute',
      left: railX,
      top: rect.y,
      width: railWidth,
      zIndex: 63,
    }}>
      {/* scrollable inner rail */}
      <div style={{
        width: railWidth,
        maxHeight: rect.h,
        overflowY: 'auto',
        background: 'var(--surface)',
        border: `${1 / zoom}px solid var(--hairline)`,
        borderRadius: 10 / zoom,
        padding: pad,
        display: 'flex',
        flexDirection: 'column',
        gap: gap,
        boxShadow: `0 ${4 / zoom}px ${16 / zoom}px oklch(0 0 0 / 0.12)`,
        scrollbarWidth: 'none',
        overscrollBehavior: 'contain',
      }}>
        {railItems.map(item => {
          if (item.sep) return <div key={item.id} style={{ height: 1 / zoom, background: 'var(--hairline)', margin: `${1 / zoom}px ${4 / zoom}px`, flexShrink: 0 }} />;
          const isHovered = hovered === item.id;
          return (
            <button key={item.id} onClick={item.onClick} aria-label={item.label}
               onMouseEnter={() => setHovered(item.id)}
               onMouseLeave={() => setHovered(null)}
               style={{
                 all: 'unset', cursor: 'pointer',
                 width: btnSize, height: btnSize,
                 borderRadius: 6 / zoom,
                 display: 'grid', placeItems: 'center',
                 color: item.accent ? 'var(--accent-ink)' : 'var(--ink-soft)',
                 background: isHovered ? 'var(--accent-soft)' : 'transparent',
                 transition: 'background 0.12s, color 0.12s',
                 flexShrink: 0,
               }}>
              <span style={{ transform: `scale(${1 / zoom})`, display: 'flex' }}>{item.icon}</span>
            </button>
          );
        })}
      </div>
      {/* tooltip — rendered outside the scrollable container so it's never clipped */}
      {hovered && (() => {
        const item = railItems.find(i => i.id === hovered);
        if (!item || item.sep) return null;
        const itemY = offsets[hovered] + btnSize / 2;
        return (
          <div style={{
            position: 'absolute',
            right: railWidth + (8 / zoom),
            top: itemY,
            transform: `translateY(-50%) scale(${1 / zoom})`,
            transformOrigin: 'right center',
            whiteSpace: 'nowrap',
            padding: '4px 10px',
            borderRadius: 6,
            background: 'var(--ink)',
            color: 'var(--surface)',
            fontFamily: 'var(--font-mono)',
            fontSize: 11,
            fontWeight: 500,
            letterSpacing: '0.04em',
            boxShadow: '0 2px 8px oklch(0 0 0 / 0.2)',
            pointerEvents: 'none',
            zIndex: 10,
          }}>
            {item.label}
          </div>
        );
      })()}
      {chatPickerOpen && offsets['chat'] !== undefined && (
        <div
          onClick={(e) => e.stopPropagation()}
          onPointerDown={(e) => e.stopPropagation()}
          style={{
            position: 'absolute',
            left: railWidth + (8 / zoom),
            top: offsets['chat'],
            transform: `scale(${1 / zoom})`,
            transformOrigin: 'top left',
            width: 230,
            maxHeight: 320,
            overflowY: 'auto',
            overscrollBehavior: 'contain',
            background: 'var(--surface)',
            border: '1px solid var(--hairline)',
            borderRadius: 12,
            boxShadow: 'var(--shadow-pop)',
            padding: 6,
            zIndex: 12,
          }}
        >
          <div style={{ padding: '5px 8px 7px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)', letterSpacing: '0.12em', textTransform: 'uppercase' }}>
            Chat With
          </div>
          {agents.map(agent => (
            <button
              key={agent.id}
              onClick={() => onPickChat(agent.id)}
              style={{
                all: 'unset',
                width: '100%',
                boxSizing: 'border-box',
                cursor: 'pointer',
                display: 'flex',
                alignItems: 'center',
                gap: 9,
                padding: '7px 8px',
                borderRadius: 8,
                color: 'var(--ink)',
              }}
              onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-2)'}
              onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
            >
              <AgentAvatar agent={agent} size={24} />
              <span style={{ display: 'flex', flexDirection: 'column', minWidth: 0 }}>
                <span style={{ fontSize: 12.5, fontWeight: 650, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{agent.name}</span>
                <span style={{ fontSize: 10.5, color: 'var(--ink-faint)', whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>{agent.role}</span>
              </span>
            </button>
          ))}
        </div>
      )}
      {customizeOpen && offsets['customize'] !== undefined && (
        <SidebarFavoritesPopover
          favoriteableItems={favoriteableItems}
          sidebarFavorites={sidebarFavorites}
          setSidebarFavorites={setSidebarFavorites}
          railWidth={railWidth}
          top={offsets['customize']}
          zoom={zoom}
        />
      )}
    </div>
  </>;
}
