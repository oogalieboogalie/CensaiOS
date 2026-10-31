import React from 'react';
import { GenIcon } from '../../Icons.jsx';

export function ImageStudioGallery({
  gallery,
  selectedImageId,
  onSelect,
  onInsert,
  onDelete,
}) {
  return (
    <aside className="hb-is-side">
      <div>
        <div className="hb-is-side-title">Gallery</div>
        <div className="hb-is-side-sub">Generated and saved images</div>
      </div>
      {gallery.length === 0 ? (
        <div className="hb-empty">
          <span className="hb-empty-icon" aria-hidden="true"><GenIcon size={20} /></span>
          <div className="hb-empty-title">No images yet</div>
          <div className="hb-empty-text">Describe a picture below and press Generate. It will show up here.</div>
        </div>
      ) : (
        <div className="hb-is-list">
          {gallery.map(item => (
            <GalleryCard
              key={item.id}
              item={item}
              selected={item.id === selectedImageId}
              onSelect={() => onSelect(item.id)}
              onInsert={onInsert}
              onDelete={() => onDelete(item.id)}
            />
          ))}
        </div>
      )}
    </aside>
  );
}

function GalleryCard({ item, selected, onSelect, onInsert, onDelete }) {
  const download = (event) => {
    event.stopPropagation();
    const a = document.createElement('a');
    a.href = item.src;
    a.download = `${item.prompt || 'image'}-${item.id}.png`;
    a.click();
  };

  const insertThisCard = (event) => {
    event.stopPropagation();
    onSelect();
    onInsert(item.id);
  };

  return (
    <article
      onClick={onSelect}
      style={{
        border: selected ? '1px solid var(--accent-line)' : '1px solid var(--hairline)',
        borderRadius: 'var(--radius-lg)',
        overflow: 'hidden',
        background: 'var(--surface-2)',
        cursor: 'pointer',
      }}
    >
      <img src={item.thumbnailSrc || item.src} alt={item.prompt || 'Generated image'} style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', display: 'block', background: 'var(--surface-sunken)' }} />
      <div style={{ padding: 8, display: 'grid', gap: 6 }}>
        <div style={{ color: 'var(--ink)', fontSize: 'var(--text-sm)', lineHeight: 1.25, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {item.prompt || 'Untitled image'}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <SmallButton onClick={insertThisCard}>Insert</SmallButton>
          <SmallButton onClick={download}>Download</SmallButton>
          <SmallButton danger onClick={(event) => { event.stopPropagation(); onDelete(); }}>Delete</SmallButton>
        </div>
      </div>
    </article>
  );
}

function SmallButton({ danger, onClick, children }) {
  return (
    <button type="button" onClick={onClick} className="hb-is-key" data-tone={danger ? 'danger' : undefined}>
      {children}
    </button>
  );
}
