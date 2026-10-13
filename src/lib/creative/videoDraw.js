// Draw one frame of a Censai Video edit: the video track (a clip or a
// picture, letterboxed), then any titles on top. Used by the preview and by
// export, so the file matches what you watched.
import { activeClip, activeClips, containRect, titleAlpha } from './videoModel.js';
import { TITLE_TEXT } from './creativeColors.js';

export const TITLE_FONT = 'Inter, "Helvetica Neue", Arial, sans-serif';

function drawMissing(ctx, w, h, name) {
  ctx.fillStyle = 'rgba(255,255,255,0.06)';
  ctx.fillRect(w * 0.2, h * 0.38, w * 0.6, h * 0.24);
  ctx.fillStyle = 'rgba(255,255,255,0.7)';
  ctx.font = `500 ${Math.round(h / 30)}px ${TITLE_FONT}`;
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(`${name}: the file is on the computer that added it`, w / 2, h / 2);
}

export function drawTitle(ctx, doc, c, t) {
  const size = c.size || 72;
  const lines = String(c.text || '').split('\n');
  const lineH = size * 1.2;
  const block = lines.length * lineH;
  const y0 = c.pos === 'top' ? doc.h * 0.12 : c.pos === 'lower' ? doc.h * 0.82 - block : (doc.h - block) / 2;
  ctx.save();
  ctx.globalAlpha = titleAlpha(c, t);
  ctx.font = `700 ${size}px ${TITLE_FONT}`;
  ctx.textAlign = c.pos === 'lower' ? 'left' : 'center';
  ctx.textBaseline = 'top';
  const x = c.pos === 'lower' ? doc.w * 0.07 : doc.w / 2;
  if (c.pos === 'lower') {
    const w = Math.max(...lines.map((l) => ctx.measureText(l).width));
    ctx.fillStyle = 'rgba(0,0,0,0.55)';
    ctx.fillRect(x - size * 0.4, y0 - size * 0.25, w + size * 0.8, block + size * 0.3);
  } else {
    ctx.shadowColor = 'rgba(0,0,0,0.5)';
    ctx.shadowBlur = size / 6;
  }
  ctx.fillStyle = c.color || TITLE_TEXT;
  lines.forEach((l, i) => ctx.fillText(l, x, y0 + i * lineH));
  ctx.restore();
}

/** `media.element(id)` → a <video>; `media.image(src)` → a loaded Image. */
export function drawFrame(ctx, doc, t, media) {
  ctx.save();
  ctx.fillStyle = doc.bg;
  ctx.fillRect(0, 0, doc.w, doc.h);
  const id = activeClip(doc, 'v', t);
  const c = id && doc.clips[id];
  if (c?.media?.kind === 'image') {
    const img = media.image(c.media.src);
    if (img?.complete && img.naturalWidth) {
      const r = containRect(img.naturalWidth, img.naturalHeight, doc.w, doc.h);
      ctx.drawImage(img, r.x, r.y, r.w, r.h);
    }
  } else if (c?.media) {
    const el = media.element(c.media.id);
    if (!el) drawMissing(ctx, doc.w, doc.h, c.media.name);
    else if (el.readyState >= 2) {
      const r = containRect(el.videoWidth, el.videoHeight, doc.w, doc.h);
      ctx.drawImage(el, r.x, r.y, r.w, r.h);
    }
  }
  for (const tid of activeClips(doc, 't', t)) drawTitle(ctx, doc, doc.clips[tid], t);
  ctx.restore();
}
