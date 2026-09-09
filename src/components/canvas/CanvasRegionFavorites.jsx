import React from 'react';
import { Icon } from '../Icons.jsx';

export function getFavoriteableItems(items) {
  const sep1Index = items.findIndex(item => item.id === 'sep1');
  const moduleItems = sep1Index === -1 ? items : items.slice(0, sep1Index);
  return moduleItems.filter(item => item && !item.sep);
}

export function buildFavoriteRailItems({ allItems, favoriteableItems, sidebarFavorites, onCustomize }) {
  const favoritedModules = favoriteableItems.filter(item => sidebarFavorites.includes(item.id));
  const railItems = [
    {
      id: 'customize',
      icon: <Icon.Gear size={14} />,
      label: 'Customize Sidebar',
      onClick: onCustomize,
      accent: true,
    },
    { id: 'sep_customize', sep: true },
    ...favoritedModules,
  ];

  if (favoritedModules.length > 0) railItems.push({ id: 'sep_actions', sep: true });
  railItems.push(
    allItems.find(item => item.id === 'share'),
    allItems.find(item => item.id === 'download')
  );
  return railItems.filter(Boolean);
}

export function getRailOffsets({ railItems, pad, btnSize, gap, zoom }) {
  let currentOffset = pad;
  const offsets = {};
  for (const item of railItems) {
    if (!item) continue;
    if (item.sep) currentOffset += (3 / zoom);
    else {
      offsets[item.id] = currentOffset;
      currentOffset += btnSize + gap;
    }
  }
  return offsets;
}

export function SidebarFavoritesPopover({ favoriteableItems, sidebarFavorites, setSidebarFavorites, railWidth, top, zoom }) {
  return (
    <div
      data-testid="sidebar-favorites-popover"
      onClick={(e) => e.stopPropagation()}
      onPointerDown={(e) => e.stopPropagation()}
      style={{
        position: 'absolute',
        left: railWidth + (8 / zoom),
        top,
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
        padding: '8px 6px',
        zIndex: 12,
        display: 'flex',
        flexDirection: 'column',
        gap: 2,
      }}
    >
      <div style={{ padding: '3px 8px 6px', fontFamily: 'var(--font-mono)', fontSize: 10, color: 'var(--ink-faint)', letterSpacing: '0.12em', textTransform: 'uppercase', borderBottom: '1px solid var(--hairline)', marginBottom: 4 }}>
        Sidebar Favorites
      </div>
      {favoriteableItems.map(item => {
        const isFav = sidebarFavorites.includes(item.id);
        return (
          <button
            key={item.id}
            onClick={() => {
              const nextFavs = isFav ? sidebarFavorites.filter(id => id !== item.id) : [...sidebarFavorites, item.id];
              setSidebarFavorites(nextFavs);
            }}
            style={{
              all: 'unset',
              width: '100%',
              boxSizing: 'border-box',
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '6px 8px',
              borderRadius: 8,
              color: 'var(--ink)',
              transition: 'background 0.15s',
            }}
            onMouseEnter={(e) => e.currentTarget.style.background = 'var(--surface-2)'}
            onMouseLeave={(e) => e.currentTarget.style.background = 'transparent'}
          >
            <div style={{ display: 'flex', alignItems: 'center', gap: 8 }}>
              <span style={{ color: isFav ? 'var(--accent)' : 'var(--ink-faint)', display: 'inline-flex' }}>{item.icon}</span>
              <span style={{ fontSize: 12, fontWeight: isFav ? 600 : 500 }}>{item.label}</span>
            </div>
            <div style={{
              width: 14,
              height: 14,
              borderRadius: 4,
              border: isFav ? '1.5px solid var(--accent)' : '1.5px solid var(--ink-faint)',
              background: isFav ? 'var(--accent)' : 'transparent',
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'center',
              transition: 'all 0.15s',
            }}>
              {isFav && <Icon.Check size={10} stroke={2.5} style={{ color: 'var(--accent-ink)' }} />}
            </div>
          </button>
        );
      })}
    </div>
  );
}
