import React from 'react';

/*
 * The pieces every Settings tab is built from, so the tabs look and answer
 * the same way. The look lives in src/styles/settings.css.
 *
 *   SettingsPage     one tab's scrolling page, with an optional first line
 *   SettingsSection  a card: a title, one line of help, its rows
 *   SettingsGroup    a part of a card with its own small heading
 *   SettingsRows     a list of rows divided by lines
 *   SettingsRow      label and help on the left, one control on the right
 *   SettingsSwitch   the one on/off switch
 *   SettingsButton   plain, primary (amber) or danger
 *   SettingsNote     what happened: saved, working, or what went wrong
 *   SettingsSlider   a labelled slider that shows its value
 *   SettingsChoice   a choice of a few words
 *   useSaveNote      runs a save and says "Saved." or what failed
 */

const join = (...names) => names.filter(Boolean).join(' ');

export function SettingsPage({ intro, children, ...rest }) {
  return (
    <div className="hb-set-page" {...rest}>
      {intro ? <p className="hb-set-intro">{intro}</p> : null}
      {children}
    </div>
  );
}

export function SettingsSection({ title, badge, hint, actions, children, className, ...rest }) {
  return (
    <section className={join('hb-set-section', className)} {...rest}>
      {title || hint || actions ? (
        <div className="hb-set-head">
          <div className="hb-set-head-text">
            {title ? <h3 className="hb-set-title">{title}{badge}</h3> : null}
            {hint ? <p className="hb-set-hint">{hint}</p> : null}
          </div>
          {actions ? <div className="hb-set-actions">{actions}</div> : null}
        </div>
      ) : null}
      {children}
    </section>
  );
}

export function SettingsGroup({ title, hint, actions, children, ...rest }) {
  return (
    <div className="hb-set-group" {...rest}>
      {title || actions ? (
        <div className="hb-set-head">
          <div className="hb-set-head-text">
            {title ? <h4 className="hb-set-subtitle">{title}</h4> : null}
            {hint ? <p className="hb-set-hint">{hint}</p> : null}
          </div>
          {actions ? <div className="hb-set-actions">{actions}</div> : null}
        </div>
      ) : hint ? <p className="hb-set-hint">{hint}</p> : null}
      {children}
    </div>
  );
}

export function SettingsRows({ children, ...rest }) {
  return <div className="hb-set-rows" {...rest}>{children}</div>;
}

/** A row. With `htmlFor` the label points at the control, so clicking it works. */
export function SettingsRow({ label, hint, htmlFor, children, stack = false, ...rest }) {
  const Label = htmlFor ? 'label' : 'span';
  return (
    <div className={join('hb-set-row', stack && 'hb-set-row--stack')} {...rest}>
      <span className="hb-set-row-text">
        <Label className="hb-set-label" htmlFor={htmlFor}>{label}</Label>
        {hint ? <span className="hb-set-hint">{hint}</span> : null}
      </span>
      {children ? <span className="hb-set-row-control">{children}</span> : null}
    </div>
  );
}

export function SettingsSwitch({ checked, onChange, label, disabled = false, ...rest }) {
  return (
    <input
      type="checkbox"
      role="switch"
      className="hb-set-switch"
      aria-label={label}
      checked={Boolean(checked)}
      disabled={disabled}
      onChange={(event) => onChange?.(event.target.checked)}
      {...rest}
    />
  );
}

/** A row whose control is a switch. */
export function SwitchRow({ label, hint, checked, onChange, disabled, switchLabel, ...rest }) {
  return (
    <SettingsRow label={label} hint={hint} {...rest}>
      <SettingsSwitch label={switchLabel || label} checked={checked} onChange={onChange} disabled={disabled} />
    </SettingsRow>
  );
}

export function SettingsButton({ variant, small = false, wide = false, className, type = 'button', ...rest }) {
  return (
    <button
      type={type}
      className={join('hb-set-btn', variant && `hb-set-btn--${variant}`, small && 'hb-set-btn--small', wide && 'hb-set-btn--wide', className)}
      {...rest}
    />
  );
}

/**
 * `note` is { tone: 'ok' | 'error' | 'warn' | 'info', text }. Errors are read out at once,
 * saved and warnings politely; a plain info line is just text.
 */
export function SettingsNote({ note, tone, children, ...rest }) {
  const text = note?.text ?? children;
  if (!text) return null;
  const kind = note?.tone || tone || 'info';
  return (
    <p role={kind === 'error' ? 'alert' : kind === 'info' ? undefined : 'status'} className={join('hb-set-note', kind !== 'ok' && kind !== 'info' && `hb-set-note--${kind}`)} {...rest}>
      {text}
    </p>
  );
}

export function SettingsSlider({ label, value, min, max, step, onChange, format = (v) => v, hint, ...rest }) {
  return (
    <label className="hb-set-slider" {...rest}>
      <span className="hb-set-slider-head">
        <span className="hb-set-label">{label}</span>
        <span className="hb-set-value">{format(value)}</span>
      </span>
      <input type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} />
      {hint ? <span className="hb-set-hint">{hint}</span> : null}
    </label>
  );
}

/** `options` is { id: { label } }. */
export function SettingsChoice({ label, value, options, onChange }) {
  return (
    <div role="radiogroup" aria-label={label} className="hb-set-seg">
      {Object.entries(options).map(([id, opt]) => (
        <button key={id} type="button" role="radio" aria-checked={value === id} className="hb-set-seg-opt" onClick={() => onChange(id)}>
          {opt.label}
        </button>
      ))}
    </div>
  );
}

/**
 * Runs a save and keeps one note for the section: "Saved." for a moment
 * after it works, or the reason when it fails (kept until the next try).
 */
export function useSaveNote() {
  const [note, setNote] = React.useState(null);
  const [busy, setBusy] = React.useState(false);
  const timer = React.useRef(null);
  React.useEffect(() => () => clearTimeout(timer.current), []);
  const run = React.useCallback(async (work, done = 'Saved.') => {
    clearTimeout(timer.current);
    setBusy(true);
    setNote(null);
    try {
      const result = await work();
      const text = typeof done === 'function' ? done(result) : done;
      if (text) {
        setNote({ tone: 'ok', text });
        timer.current = setTimeout(() => setNote(null), 2500);
      }
      return result;
    } catch (error) {
      setNote({ tone: 'error', text: error?.message || 'That did not save. Try again.' });
      return undefined;
    } finally {
      setBusy(false);
    }
  }, []);
  return { note, setNote, busy, run };
}

/**
 * The note for a section whose own state already says `saving` and `error`:
 * "Saving..." while it saves, "Saved." for a moment after, or the error.
 */
export function useSavedNote(saving, error) {
  const [saved, setSaved] = React.useState(false);
  const was = React.useRef(saving);
  React.useEffect(() => {
    const finished = was.current && !saving;
    was.current = saving;
    if (!finished || error) return undefined;
    setSaved(true);
    const timer = setTimeout(() => setSaved(false), 2500);
    return () => clearTimeout(timer);
  }, [saving, error]);
  if (error) return { tone: 'error', text: error };
  if (saving) return { tone: 'info', text: 'Saving...' };
  return saved ? { tone: 'ok', text: 'Saved.' } : null;
}

export const OWNER_ONLY = "Only the board's owner or an admin can change this.";
