// Local Sites window state: the site's answers live on the window (so they
// stay with the board), pictures the owner picks stay in memory until the
// window closes (too big for the board's saved state).
import React from 'react';
import { sitePreset, startSite } from '../../../lib/localSites/presets.js';
import { siteHtml } from '../../../lib/localSites/siteHtml.js';
import { siteCss } from '../../../lib/localSites/siteCss.js';
import { placeholderSvg, readSiteJson, siteFolderName, siteZip } from '../../../lib/localSites/siteFiles.js';

const MAX_PHOTO = 8 * 1024 * 1024;
// What the owner typed about themselves carries over when the kind of shop changes.
const KEEP = ['phone', 'email', 'address', 'googleLink', 'facebook', 'instagram', 'formKey', 'credit'];

function svgUrl(presetId, caption) {
  return `data:image/svg+xml;charset=utf-8,${encodeURIComponent(placeholderSvg(presetId, caption))}`;
}

// The preview frame has no origin of its own, so pictures go in as data URLs.
function dataUrl(file) {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(file);
  });
}

function download(bytes, name) {
  const url = URL.createObjectURL(new Blob([bytes], { type: 'application/zip' }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

export function useLocalSite({ win = {}, onUpdate }) {
  const site = React.useMemo(() => ({ ...startSite(win.site?.preset), ...(win.site || {}) }), [win.site]);
  const [uploads, setUploads] = React.useState({});
  const [error, setError] = React.useState('');
  const [note, setNote] = React.useState('');

  const save = React.useCallback((next) => onUpdate?.({ site: next }), [onUpdate]);
  const set = (key, value) => save({ ...site, [key]: value });
  const setHour = (i, value) => save({ ...site, hours: site.hours.map((h, j) => (j === i ? value : h)) });

  const pickPreset = (id) => {
    if (id === site.preset) return;
    const fresh = startSite(id);
    for (const key of KEEP) if (site[key] && site[key] !== startSite(site.preset)[key]) fresh[key] = site[key];
    setUploads({});
    save(fresh);
  };

  const pickPhoto = async (slot, file) => {
    setError('');
    if (!file) return;
    if (!/^image\//.test(file.type)) { setError('That file is not a picture.'); return; }
    if (file.size > MAX_PHOTO) { setError('That picture is over 8 MB. Pick a smaller one.'); return; }
    const bytes = new Uint8Array(await file.arrayBuffer());
    const ext = (file.name.split('.').pop() || 'jpg').toLowerCase().replace(/[^a-z0-9]/g, '').slice(0, 5) || 'jpg';
    const url = await dataUrl(file);
    setUploads((u) => ({ ...u, [slot]: { bytes, ext, url } }));
  };
  const clearPhoto = (slot) => setUploads((u) => { const next = { ...u }; delete next[slot]; return next; });

  const preset = sitePreset(site.preset);
  const previewPhotos = React.useMemo(
    () => preset.photoCaptions.map((caption, i) => uploads[i]?.url || svgUrl(preset.id, caption)),
    [preset, uploads],
  );
  const preview = React.useMemo(
    () => siteHtml(site, { css: siteCss(site.preset), photos: previewPhotos }),
    [site, previewPhotos],
  );

  const downloadSite = () => {
    setError('');
    const name = `${siteFolderName(site.name)}.zip`;
    download(siteZip(site, uploads), name);
    setNote(`Saved ${name}. Unzip it and drop the folder on Cloudflare Pages; the READ ME inside says how.`);
  };

  const openSaved = async (file) => {
    setError('');
    if (!file) return;
    try {
      save(readSiteJson(await file.text()));
      setUploads({});
      setNote('Opened your saved site.');
    } catch (err) {
      setError(err instanceof SyntaxError ? 'That file is not a saved Local Sites site.' : err.message);
    }
  };

  return { site, preset, set, setHour, pickPreset, uploads, pickPhoto, clearPhoto, previewPhotos, preview, downloadSite, openSaved, error, note };
}
