import React from 'react';
import { api } from '../../lib/api.js';
import { useWorkspaceStore } from '../../lib/store.js';
import { guestLinkUrl } from '../../lib/workspace/shareLink.js';
import { useBoardEvent } from '../../lib/collaboration/boardEvents.js';

import {
  BUDGET_OPTIONS,
  CopyField,
  copyText,
  EXPIRY_OPTIONS,
  fieldStyle,
  ghostButton,
  hintStyle,
  JoinList,
  labelStyle,
  primaryButton,
  readTokens,
  rememberToken,
  ROLE_LABELS,
  scopeLabel,
  statusOf,
} from './GuestLinkParts.jsx';

export function GuestLinkManager({ workspaceId }) {
  const wins = useWorkspaceStore((state) => state.wins);
  const canvasGroups = useWorkspaceStore((state) => state.canvasGroups);
  const [links, setLinks] = React.useState([]);
  const [spectators, setSpectators] = React.useState(0);
  const [form, setForm] = React.useState({ role: 'comment', scopeKind: 'board', scopeId: '', expiresInHours: '', passcode: '', agentBudgetTokens: '0' });
  const [created, setCreated] = React.useState(null);
  const [message, setMessage] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [openJoins, setOpenJoins] = React.useState(null);
  const tokens = React.useMemo(() => readTokens(), [links]);

  const load = React.useCallback(async () => {
    if (!workspaceId) return;
    try {
      const result = await api.listShareLinks(workspaceId);
      setLinks(result.links || []);
      setSpectators(result.spectators || 0);
    } catch (error) {
      setMessage(error.message);
    }
  }, [workspaceId]);
  React.useEffect(() => { load(); }, [load]);
  useBoardEvent('share.links.changed', load);

  const update = (patch) => setForm((current) => ({ ...current, ...patch }));
  const liveLink = links.find((link) => link.mode === 'live' && link.active) || null;
  const normalLinks = links.filter((link) => link.mode !== 'live');

  async function createLink(event) {
    event.preventDefault();
    setBusy(true);
    setMessage('');
    try {
      const result = await api.createShareLink(workspaceId, {
        role: form.role,
        scopeKind: form.scopeKind,
        scopeId: form.scopeKind === 'board' ? null : form.scopeId,
        expiresInHours: form.expiresInHours || null,
        passcode: form.passcode || null,
        agentBudgetTokens: Number(form.agentBudgetTokens) || 0,
      });
      rememberToken(result.link.id, result.token);
      setCreated({ link: result.link, url: guestLinkUrl(result.token) });
      update({ passcode: '' });
      await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function revoke(link) {
    if (!globalThis.confirm?.('Turn off this link? Anyone using it is disconnected right away.')) return;
    try {
      const result = await api.revokeShareLink(workspaceId, link.id);
      setMessage(result.disconnected ? `Link turned off. ${result.disconnected} guest connection${result.disconnected === 1 ? '' : 's'} closed.` : 'Link turned off.');
      if (created?.link.id === link.id) setCreated(null);
      await load();
    } catch (error) {
      setMessage(error.message);
    }
  }

  async function live(action, extra = {}) {
    setBusy(true);
    setMessage('');
    try {
      const result = await api.controlLiveShow(workspaceId, { action, ...extra });
      if (action === 'start') rememberToken(result.link.id, result.token);
      await load();
    } catch (error) {
      setMessage(error.message);
    } finally {
      setBusy(false);
    }
  }

  async function togglePublic(win) {
    try {
      await api.setWindowPublic(workspaceId, win.id, !win.public);
    } catch (error) {
      setMessage(error.message);
    }
  }

  const scopeChoices = form.scopeKind === 'group'
    ? canvasGroups.map((group) => ({ id: group.id, label: group.title || group.name || `Group ${String(group.id).slice(0, 6)}` }))
    : wins.map((win) => ({ id: win.id, label: win.title || win.kind }));

  return (
    <div data-testid="guest-link-manager" style={{ display: 'grid', gap: 14 }}>
      <form onSubmit={createLink} style={{ display: 'grid', gap: 8 }}>
        <div style={labelStyle}>Share by link</div>
        <div style={hintStyle}>Anyone with the link joins with just a name. No account needed.</div>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6 }}>
          <select aria-label="Link role" data-testid="share-role" value={form.role} onChange={(event) => update({ role: event.target.value, ...(event.target.value === 'edit' ? { scopeKind: 'board' } : {}) })} style={fieldStyle}>
            {Object.entries(ROLE_LABELS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
          </select>
          <select aria-label="What to share" data-testid="share-scope" value={form.scopeKind} disabled={form.role === 'edit'} onChange={(event) => update({ scopeKind: event.target.value, scopeId: '' })} style={fieldStyle}>
            <option value="board">Whole board</option>
            <option value="group" disabled={canvasGroups.length === 0}>One group</option>
            <option value="window" disabled={wins.length === 0}>One window</option>
          </select>
          {form.scopeKind !== 'board' && (
            <select aria-label="Which one" data-testid="share-scope-id" value={form.scopeId} onChange={(event) => update({ scopeId: event.target.value })} style={{ ...fieldStyle, gridColumn: '1 / -1' }}>
              <option value="">Choose…</option>
              {scopeChoices.map((choice) => <option key={choice.id} value={choice.id}>{choice.label}</option>)}
            </select>
          )}
          <select aria-label="Expiry" value={form.expiresInHours} onChange={(event) => update({ expiresInHours: event.target.value })} style={fieldStyle}>
            {EXPIRY_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <select aria-label="Agent budget" value={form.agentBudgetTokens} disabled={form.role === 'view'} onChange={(event) => update({ agentBudgetTokens: event.target.value })} style={fieldStyle}>
            {BUDGET_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
          </select>
          <input aria-label="Passcode (optional)" type="text" autoComplete="off" placeholder="Passcode (optional)" value={form.passcode} onChange={(event) => update({ passcode: event.target.value })} style={{ ...fieldStyle, gridColumn: '1 / -1' }} />
        </div>
        {form.role === 'edit' && <div style={hintStyle}>Edit links share the whole board, including windows that are hidden from view and comment links.</div>}
        {form.role !== 'view' && Number(form.agentBudgetTokens) > 0 && <div style={hintStyle}>Guests can @mention your agents in comments. Answers use your model keys, up to this budget.</div>}
        <button type="submit" data-testid="share-create" disabled={busy || (form.scopeKind !== 'board' && !form.scopeId)} style={{ ...primaryButton, justifySelf: 'start', opacity: busy ? 0.6 : 1 }}>
          Create link
        </button>
        {created && <CopyField url={created.url} testId="share-created-url" />}
      </form>

      {normalLinks.length > 0 && (
        <div data-testid="share-link-list" style={{ display: 'grid', gap: 6 }}>
          <div style={labelStyle}>Links</div>
          {normalLinks.map((link) => {
            const token = tokens[link.id];
            return (
              <div key={link.id} data-testid="share-link-row" style={{ display: 'grid', gap: 6, padding: '8px 9px', borderRadius: 'var(--radius-md)', background: 'var(--surface-2)', fontSize: 'var(--text-xs)', opacity: link.active ? 1 : 0.6 }}>
                <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                  <span style={{ fontWeight: 650, color: 'var(--ink)' }}>{ROLE_LABELS[link.role]}</span>
                  <span style={{ color: 'var(--ink-soft)' }}>{scopeLabel(link, wins, canvasGroups)}</span>
                  {link.hasPasscode && <span style={{ color: 'var(--ink-faint)' }}>passcode</span>}
                  {link.agentBudgetTokens > 0 && <span style={{ color: 'var(--ink-faint)' }}>agents {link.agentTokensUsed.toLocaleString()} / {link.agentBudgetTokens.toLocaleString()}</span>}
                  <span style={{ marginLeft: 'auto', color: link.active ? 'var(--success)' : 'var(--ink-faint)' }}>{statusOf(link)}</span>
                </div>
                <div style={{ display: 'flex', gap: 6, alignItems: 'center', flexWrap: 'wrap', color: 'var(--ink-faint)' }}>
                  <span>{link.joinCount || 0} joined{link.connected ? ` · ${link.connected} here now` : ''}</span>
                  {link.expiresAt && link.active && <span>· until {new Date(link.expiresAt).toLocaleString(undefined, { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' })}</span>}
                  <span style={{ marginLeft: 'auto', display: 'flex', gap: 6 }}>
                    {link.active && <button type="button" disabled={!token} title={token ? 'Copy link' : 'Made on another device; create a new link to copy it here'} onClick={() => copyText(guestLinkUrl(token)).then((ok) => setMessage(ok ? 'Link copied.' : 'Copy failed.'))} style={{ ...ghostButton, opacity: token ? 1 : 0.5 }}>Copy</button>}
                    <button type="button" onClick={() => setOpenJoins(openJoins === link.id ? null : link.id)} style={ghostButton}>Who joined</button>
                    {link.active && <button type="button" data-testid="share-revoke" onClick={() => revoke(link)} style={{ ...ghostButton, color: 'var(--danger)' }}>Turn off</button>}
                  </span>
                </div>
                {openJoins === link.id && <JoinList workspaceId={workspaceId} linkId={link.id} />}
              </div>
            );
          })}
        </div>
      )}

      <div data-testid="go-live" style={{ display: 'grid', gap: 8, paddingTop: 10, borderTop: '1px solid var(--hairline)' }}>
        <div style={labelStyle}>Show and tell</div>
        {!liveLink && (
          <>
            <div style={hintStyle}>Go live makes a Watch link for an audience. They follow your camera and can react. It stops working when you end the show.</div>
            <button type="button" data-testid="go-live-start" disabled={busy} onClick={() => live('start')} style={{ ...primaryButton, justifySelf: 'start' }}>Go live</button>
          </>
        )}
        {liveLink && (
          <>
            <div style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 'var(--text-xs)' }}>
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: 'var(--radius-full)', background: 'var(--danger)' }} />
              <span style={{ fontWeight: 700, color: 'var(--ink)' }}>LIVE</span>
              <span style={{ color: 'var(--ink-soft)' }}>{spectators} watching</span>
              <button type="button" data-testid="go-live-end" onClick={() => live('end')} style={{ ...ghostButton, marginLeft: 'auto' }}>End show</button>
            </div>
            {tokens[liveLink.id] && <CopyField url={guestLinkUrl(tokens[liveLink.id])} testId="go-live-url" />}
            <label style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 'var(--text-xs)', color: 'var(--ink)' }}>
              <input type="checkbox" data-testid="go-live-stage" checked={liveLink.stage} onChange={(event) => live('stage', { linkId: liveLink.id, stage: event.target.checked })} />
              Stage: only show windows marked public
            </label>
            {liveLink.stage && (
              <div style={{ display: 'grid', gap: 4, maxHeight: 180, overflowY: 'auto' }}>
                {wins.length === 0 && <div style={hintStyle}>No windows on the board yet.</div>}
                {wins.map((win) => (
                  <label key={win.id} style={{ display: 'flex', gap: 8, alignItems: 'center', fontSize: 'var(--text-xs)', color: 'var(--ink-soft)' }}>
                    <input type="checkbox" data-testid="window-public" checked={Boolean(win.public)} onChange={() => togglePublic(win)} />
                    {win.title || win.kind}
                  </label>
                ))}
              </div>
            )}
          </>
        )}
      </div>

      {message && <div role="status" style={{ fontSize: 'var(--text-xs)', color: 'var(--accent-ink)' }}>{message}</div>}
    </div>
  );
}
