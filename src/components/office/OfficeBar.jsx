/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from '../Icons.jsx';
import { fileName, saveFile } from '../../lib/office/officeFiles.js';

/** A small toolbar button. `pressed` shows a toggled state. */
export function OfficeButton({ label, icon, pressed, onClick, title, disabled, wide, children }) {
  return (
    <button type="button" className="hb-of-btn" data-wide={wide ? 'true' : undefined}
      aria-pressed={pressed === undefined ? undefined : Boolean(pressed)} aria-label={title || label}
      title={title || label} disabled={disabled}
      onMouseDown={(e) => e.preventDefault()} onClick={onClick}>
      {icon}{children ?? (wide ? <span>{label}</span> : (!icon && label))}
    </button>
  );
}

export function OfficeSep() {
  return <span className="hb-of-sep" aria-hidden="true" />;
}

/**
 * The shared Censai Office toolbar: the app's own tools on the left, Import
 * and Export on the right. `formats` are { ext, label, hint, build } where
 * build() resolves to the file's bytes; the file downloads in the browser.
 */
export function OfficeBar({ title, formats = [], onImport, importHint, children }) {
  const [open, setOpen] = React.useState(false);
  const [busy, setBusy] = React.useState(null);
  const [error, setError] = React.useState(null);
  const menuRef = React.useRef(null);

  React.useEffect(() => {
    if (!open) return undefined;
    const close = (e) => { if (!menuRef.current?.contains(e.target)) setOpen(false); };
    window.addEventListener('pointerdown', close, true);
    return () => window.removeEventListener('pointerdown', close, true);
  }, [open]);

  const run = async (format) => {
    setOpen(false);
    setBusy(format.ext);
    setError(null);
    try {
      saveFile(await format.build(), fileName(title, format.ext), format.ext);
    } catch (err) {
      setError(`Could not make the ${format.ext.toUpperCase()} file: ${err?.message || err}`);
    } finally {
      setBusy(null);
    }
  };
  const doImport = async () => {
    setError(null);
    try {
      await onImport();
    } catch (err) {
      setError(err?.message || String(err));
    }
  };

  return (
    <>
      <div className="hb-of-bar" role="toolbar" aria-label={`${title || 'File'} tools`} data-no-drag>
        <div className="hb-of-tools">{children}</div>
        <div className="hb-of-file" ref={menuRef}>
          {onImport && <OfficeButton wide label="Import" title={importHint || 'Import a file'} icon={<Icon.ImportTray size={12} />} onClick={doImport} />}
          <button type="button" className="hb-of-btn" data-wide="true" data-primary="true" aria-haspopup="menu" aria-expanded={open}
            onClick={() => setOpen((v) => !v)} disabled={Boolean(busy)}>
            <Icon.Download size={12} /><span>{busy ? `Saving .${busy}…` : 'Export'}</span>
          </button>
          {open && (
            <div className="hb-of-menu" role="menu">
              {formats.map((f) => (
                <button key={`${f.ext}-${f.label}`} type="button" role="menuitem" className="hb-of-menu-item" onClick={() => run(f)}>
                  <span className="hb-of-menu-ext">.{f.ext}</span>
                  <span className="hb-of-menu-text"><span>{f.label}</span>{f.hint && <span className="hb-of-menu-hint">{f.hint}</span>}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      </div>
      {error && (
        <div role="alert" className="hb-of-alert">
          <span>{error}</span>
          <button type="button" className="hb-of-btn" aria-label="Dismiss" onClick={() => setError(null)}><Icon.Close size={10} /></button>
        </div>
      )}
    </>
  );
}
