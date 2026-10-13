/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { Icon } from './Icons.jsx';
import { WindowTitle } from './Windows.jsx';
import { WHATSAPP_WEB_URL } from './WebviewShellWindow.jsx';

// WhatsApp Web refuses to load inside another page, and the desktop app's CSP
// blocks frames entirely, so an iframe here only ever showed a broken page.
// What does work: WhatsApp Web in its own window (a native window in the
// desktop app, a popup in the browser) and WhatsApp's official click-to-chat
// links, which open a chat with a message already typed.

const field = { width: '100%', boxSizing: 'border-box', padding: '7px 9px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--hairline)', background: 'var(--surface-2)', color: 'var(--ink)', fontSize: 'var(--text-sm)', fontFamily: 'inherit' };
const btn = { all: 'unset', cursor: 'pointer', padding: '7px 12px', borderRadius: 'var(--radius-lg)', fontSize: 'var(--text-sm)', fontWeight: 600, textAlign: 'center', border: '1px solid var(--hairline)', color: 'var(--ink)' };
// eslint-disable-next-line no-restricted-syntax -- WhatsApp brand green
const greenBtn = { ...btn, background: '#25D366', color: '#073b1f', border: '1px solid transparent' };

/** Digits only, as wa.me expects (country code first, no +, spaces or dashes). */
export function normalizePhone(value) {
  return String(value || '').replace(/[^\d]/g, '');
}

export function clickToChatUrl(phone, text) {
  const digits = normalizePhone(phone);
  const base = digits ? `https://wa.me/${digits}` : 'https://wa.me/';
  return text ? `${base}?text=${encodeURIComponent(text)}` : base;
}

async function openNative(url, label) {
  const Ctor = typeof window !== 'undefined' ? window.__TAURI__?.webviewWindow?.WebviewWindow : null;
  if (!Ctor) return false;
  try {
    // eslint-disable-next-line no-new
    new Ctor(label, { url, title: 'WhatsApp', width: 1000, height: 760 });
    return true;
  } catch {
    return false;
  }
}

export async function openWhatsApp(url, { label = 'whatsapp-web' } = {}) {
  if (await openNative(url, label)) return 'native';
  const popup = window.open(url, label, 'popup=yes,width=1000,height=760');
  return popup ? 'popup' : 'blocked';
}

export function WhatsAppWindow({ win = {}, onUpdate }) {
  const contacts = Array.isArray(win.contacts) ? win.contacts : [];
  const [phone, setPhone] = React.useState(win.lastPhone || '');
  const [name, setName] = React.useState('');
  const [message, setMessage] = React.useState(win.draft || '');
  const [notice, setNotice] = React.useState('');

  const report = (result) => setNotice(result === 'blocked'
    ? 'Your browser blocked the popup. Allow popups for this site and try again.'
    : '');

  const send = async () => {
    const digits = normalizePhone(phone);
    if (!digits) { setNotice('Enter a phone number with its country code, e.g. 15551234567.'); return; }
    onUpdate?.({ lastPhone: digits, draft: '' });
    report(await openWhatsApp(clickToChatUrl(digits, message.trim()), { label: `whatsapp-chat-${digits}` }));
    setMessage('');
  };

  const saveContact = () => {
    const digits = normalizePhone(phone);
    if (!digits) return;
    const next = [...contacts.filter(c => c.phone !== digits), { name: name.trim() || digits, phone: digits }];
    onUpdate?.({ contacts: next });
    setName('');
  };

  return (
    <>
      <WindowTitle icon={<Icon.Chat size={14} />} label={win.title || 'WhatsApp'} subtitle="click to chat" attachedAgentIds={win.attachedAgents} onDetach={(id) => onUpdate?.({ attachedAgents: (win.attachedAgents || []).filter(a => a !== id) })} />
      <div style={{ flex: 1, minHeight: 0, overflowY: 'auto', padding: 14, display: 'grid', gap: 12, alignContent: 'start', background: 'var(--surface)', color: 'var(--ink)' }}>
        <button type="button" onClick={async () => report(await openWhatsApp(WHATSAPP_WEB_URL))} style={greenBtn}>
          Open WhatsApp Web
        </button>
        <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', lineHeight: 1.5, marginTop: -4 }}>
          Opens in its own window. WhatsApp doesn't allow its web app inside other pages, so it can't sit on the canvas.
        </div>

        <div style={{ display: 'grid', gap: 8, padding: 12, borderRadius: 'var(--radius-lg)', border: '1px solid var(--hairline)', background: 'var(--surface-2)' }}>
          <div style={{ fontFamily: 'var(--font-label)', fontSize: 'var(--text-xs)', letterSpacing: 'var(--label-tracking)', textTransform: 'var(--label-case)', color: 'var(--ink-faint)' }}>Quick message</div>
          <input aria-label="Phone number" value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="Phone with country code, e.g. 15551234567" style={field} />
          <textarea aria-label="Message" value={message} onChange={(e) => { setMessage(e.target.value); }} onBlur={() => onUpdate?.({ draft: message })} rows={3} placeholder="Type a message" style={{ ...field, resize: 'vertical' }} />
          <div style={{ display: 'flex', gap: 8 }}>
            <button type="button" onClick={send} style={{ ...greenBtn, flex: 1 }}>Send in WhatsApp</button>
            <button type="button" onClick={saveContact} style={btn}>Save contact</button>
          </div>
          <input aria-label="Contact name" value={name} onChange={(e) => setName(e.target.value)} placeholder="Name for this contact (optional)" style={field} />
          <div style={{ fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', lineHeight: 1.4 }}>Opens the chat with your message typed in; you press send in WhatsApp.</div>
        </div>

        {notice && <div role="status" style={{ fontSize: 'var(--text-xs)', color: 'var(--ps-red)' }}>{notice}</div>}

        {contacts.length > 0 && (
          <div style={{ display: 'grid', gap: 6 }}>
            <div style={{ fontFamily: 'var(--font-label)', fontSize: 'var(--text-xs)', letterSpacing: 'var(--label-tracking)', textTransform: 'var(--label-case)', color: 'var(--ink-faint)' }}>Contacts</div>
            {contacts.map(c => (
              <div key={c.phone} style={{ display: 'flex', alignItems: 'center', gap: 8, padding: '6px 10px', borderRadius: 'var(--radius-lg)', border: '1px solid var(--hairline)' }}>
                <button type="button" onClick={() => setPhone(c.phone)} style={{ all: 'unset', cursor: 'pointer', flex: 1, fontSize: 'var(--text-sm)' }}>
                  <b>{c.name}</b> <span style={{ color: 'var(--ink-faint)' }}>+{c.phone}</span>
                </button>
                <button type="button" aria-label={`Remove ${c.name}`} onClick={() => onUpdate?.({ contacts: contacts.filter(x => x.phone !== c.phone) })} style={{ all: 'unset', cursor: 'pointer', color: 'var(--ink-faint)' }}>
                  <Icon.Close size={10} />
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
    </>
  );
}
