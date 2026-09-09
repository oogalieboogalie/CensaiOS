import React from 'react';

export function ImageStudioGallery({
  gallery,
  selectedImageId,
  onSelect,
  onInsert,
  onDelete,
}) {
  return (
    <aside style={{ width: 280, borderLeft: '1px solid var(--hairline)', padding: 12, display: 'flex', flexDirection: 'column', gap: 10, minHeight: 0 }}>
      <div>
        <div style={{ font: '800 12px var(--font-mono)', color: 'var(--ink)', textTransform: 'uppercase', letterSpacing: '0.08em' }}>Gallery</div>
        <div style={{ color: 'var(--ink-faint)', fontSize: 12 }}>Generated and saved images</div>
      </div>
      {gallery.length === 0 ? (
        <div style={{ flex: 1, display: 'grid', placeItems: 'center', textAlign: 'center', color: 'var(--ink-faint)', border: '1px dashed var(--hairline)', borderRadius: 8, padding: 16 }}>
          Images will appear here
        </div>
      ) : (
        <div style={{ overflow: 'auto', display: 'grid', gap: 10, paddingRight: 2 }}>
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

  return (
    <article
      onClick={onSelect}
      style={{
        border: selected ? '1px solid var(--accent)' : '1px solid var(--hairline)',
        borderRadius: 8,
        overflow: 'hidden',
        background: 'var(--surface-2)',
        cursor: 'pointer',
      }}
    >
      <img src={item.thumbnailSrc || item.src} alt={item.prompt || 'Generated image'} style={{ width: '100%', aspectRatio: '4 / 3', objectFit: 'cover', display: 'block', background: '#050608' }} />
      <div style={{ padding: 8, display: 'grid', gap: 6 }}>
        <div style={{ color: 'var(--ink)', fontSize: 12, lineHeight: 1.25, overflow: 'hidden', display: '-webkit-box', WebkitLineClamp: 2, WebkitBoxOrient: 'vertical' }}>
          {item.prompt || 'Untitled image'}
        </div>
        <div style={{ display: 'flex', gap: 6 }}>
          <SmallButton onClick={(event) => { event.stopPropagation(); onInsert(); }}>Insert</SmallButton>
          <SmallButton onClick={download}>Download</SmallButton>
          <SmallButton danger onClick={(event) => { event.stopPropagation(); onDelete(); }}>Delete</SmallButton>
        </div>
      </div>
    </article>
  );
}

function SmallButton({ danger, onClick, children }) {
  return (
    <button
      type="button"
      onClick={onClick}
      style={{
        all: 'unset',
        cursor: 'pointer',
        borderRadius: 6,
        padding: '5px 7px',
        background: danger ? 'color-mix(in oklab, var(--ps-red) 15%, transparent)' : 'var(--surface)',
        color: danger ? 'var(--ps-red)' : 'var(--ink-soft)',
        font: '700 10px var(--font-mono)',
      }}
    >
      {children}
    </button>
  );
}
