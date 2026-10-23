import React, { useEffect, useState } from 'react';
import { DIcon } from './dockerIcons.jsx';
import { IconButton, SkeletonRows } from './DockerUi.jsx';
import { dockerApi, formatBytes } from './dockerApi.js';
import './dockerImage.css';

/**
 * Opened from an image row: what the image is made of. When it was made,
 * for which system, how big, which containers use it, and its layers
 * newest first, each with the build step that made it and its size.
 */
export function ImageDetail({ imageRef, onClose }) {
  const [detail, setDetail] = useState(null);
  const [error, setError] = useState(null);
  useEffect(() => {
    let live = true;
    setDetail(null);
    setError(null);
    dockerApi.imageHistory(imageRef)
      .then((d) => { if (live) setDetail(d); })
      .catch((e) => { if (live) setError(e.message || 'Could not read the image'); });
    return () => { live = false; };
  }, [imageRef]);

  return (
    <section className="dk-image" aria-label={`What ${imageRef} is made of`}>
      <div className="dk-image-head">
        <span className="dk-image-title"><DIcon.Layers size={12} /> What <span className="dk-mono">{imageRef}</span> is made of</span>
        <IconButton icon={<DIcon.Close />} label="Close" onClick={onClose} />
      </div>
      {error && <div className="dk-inline-error">{error}</div>}
      {!error && !detail && <SkeletonRows count={3} />}
      {detail && (
        <>
          <dl className="dk-facts">
            <dt>Made</dt><dd>{detail.created ? new Date(detail.created).toLocaleString() : 'unknown'}</dd>
            <dt>For</dt><dd>{[detail.os, detail.arch].filter(Boolean).join(' / ') || 'unknown'}</dd>
            <dt>Size</dt><dd>{formatBytes(detail.size)} in {detail.layers.length} layer{detail.layers.length === 1 ? '' : 's'}</dd>
            <dt>Used by</dt><dd>{detail.inUseBy.length ? detail.inUseBy.join(', ') : 'no containers'}</dd>
          </dl>
          <div className="dk-section-title">Layers, newest first</div>
          <ol className="dk-layers">
            {detail.layers.map((l, i) => (
              <li key={`${l.id}-${i}`} className={l.size ? '' : 'is-empty'}>
                <span className="dk-mono dk-layer-step" title={l.step}>{l.step || '(no step recorded)'}</span>
                <span className="dk-num dk-layer-size">{l.size ? formatBytes(l.size) : '0 B'}</span>
                <span className="dk-muted dk-layer-when">{l.createdSince}</span>
              </li>
            ))}
          </ol>
        </>
      )}
    </section>
  );
}
