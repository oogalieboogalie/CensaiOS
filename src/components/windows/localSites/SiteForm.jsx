/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { DAYS } from '../../../lib/localSites/presets.js';

function Field({ label, hint, children }) {
  return (
    <label className="hb-ls-field">
      <span>{label}</span>
      {children}
      {hint && <small>{hint}</small>}
    </label>
  );
}

function Text({ ls, name, label, hint, area, rows = 3, placeholder }) {
  const value = ls.site[name] ?? '';
  const onChange = (e) => ls.set(name, e.target.value);
  return (
    <Field label={label} hint={hint}>
      {area
        ? <textarea className="hb-ls-input" rows={rows} value={value} onChange={onChange} placeholder={placeholder} />
        : <input className="hb-ls-input" value={value} onChange={onChange} placeholder={placeholder} />}
    </Field>
  );
}

function Photos({ ls }) {
  return (
    <div className="hb-ls-photos">
      {ls.preset.photoCaptions.map((caption, i) => (
        <div key={caption} className="hb-ls-photo">
          <label title={`Pick a picture: ${caption}`}>
            <img src={ls.previewPhotos[i]} alt="" />
            <input type="file" accept="image/*" onChange={(e) => { ls.pickPhoto(i, e.target.files?.[0]); e.target.value = ''; }} />
          </label>
          <span>{caption}</span>
          {ls.uploads[i] && <button type="button" className="hb-ls-link" onClick={() => ls.clearPhoto(i)}>Remove</button>}
        </div>
      ))}
    </div>
  );
}

/** Everything the owner fills in, in the order a visitor reads the page. */
export function SiteForm({ ls }) {
  return (
    <div className="hb-ls-form">
      <h3>The business</h3>
      <Text ls={ls} name="name" label="Business name" />
      <Text ls={ls} name="tagline" label="One line about it" area rows={2} />
      <Text ls={ls} name="about" label="About" area rows={4} />

      <h3>{ls.preset.itemsTitle}</h3>
      <Text ls={ls} name="items" label={ls.preset.itemsLabel} area rows={6} />
      <Text ls={ls} name="extra" label={`${ls.preset.extraTitle} (one per line)`} area rows={4} />

      <h3>Pictures</h3>
      <p className="hb-ls-help">Click a square to use your own picture. Pictures are added to the download; they are not kept on the board.</p>
      <Photos ls={ls} />

      <h3>Hours</h3>
      <div className="hb-ls-hours">
        {DAYS.map((day, i) => (
          <label key={day}>
            <span>{day}</span>
            <input className="hb-ls-input" value={ls.site.hours[i] || ''} onChange={(e) => ls.setHour(i, e.target.value)} />
          </label>
        ))}
      </div>

      <h3>How to reach them</h3>
      <Text ls={ls} name="phone" label="Phone" />
      <Text ls={ls} name="email" label="Email" />
      <Text ls={ls} name="address" label="Street address" hint="Used for the map and the directions button." />
      <Text ls={ls} name="googleLink" label="Google reviews link" placeholder="https://g.page/..." hint="From their free Google Business Profile." />
      <Text ls={ls} name="facebook" label="Facebook page" placeholder="https://facebook.com/..." />
      <Text ls={ls} name="instagram" label="Instagram" placeholder="https://instagram.com/..." />

      <h3>Contact form</h3>
      <Text ls={ls} name="formKey" label="Form key (optional)" placeholder="from web3forms.com"
        hint="With a free key from web3forms.com the form emails the owner by itself. Without one it opens the visitor's email app." />
      <Text ls={ls} name="credit" label="Website by (optional)" hint="Shown small at the bottom of the page." />
    </div>
  );
}
