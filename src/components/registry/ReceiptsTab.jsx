/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
// src/components/registry/ReceiptsTab.jsx
// Agent Registry tab: one signed receipt per help request between agents.
// Each receipt says who asked, who answered, which agent, when, what it
// cost, and holds fingerprints of the question and answer (not the words).
// The server checks every signature again before listing it.

import React from 'react';
import { Icon } from '../Icons.jsx';
import {
  channelText, formatDuration, formatPrice, formatTokens, roleText, shortHash, shortInstall,
} from '../../lib/agentNetwork/receiptText.js';

const REFRESH_MS = 5000;

function when(value) {
  const d = value ? new Date(value) : null;
  return d && !Number.isNaN(d.getTime()) ? d.toLocaleString([], { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit', second: '2-digit' }) : '—';
}

function party(side, here) {
  const name = side?.label || side?.agent || side?.card || 'Unknown';
  if (!side?.install || side.install === here) return name;
  if (side.install === 'outside') return name;
  return `${name} (${shortInstall(side.install)})`;
}

function Seal({ ok, children, testId }) {
  return (
    <span className="an-receipt-seal" data-ok={ok ? 'true' : 'false'} data-testid={testId}>
      {ok ? <Icon.Check size={11} /> : <Icon.Alert size={11} />}{children}
    </span>
  );
}

function ReceiptRow({ item, here, open, onToggle }) {
  const body = item.receipt.body;
  const counter = item.counterReceipt?.body;
  return (
    <div role="button" tabIndex={0} className="an-receipt-row" aria-expanded={open} onClick={onToggle} data-testid="registry-receipt"
      onKeyDown={(event) => { if (event.key === 'Enter' || event.key === ' ') { event.preventDefault(); onToggle(); } }}>
      <div className="an-receipt-route">
        <strong>{party(body.asker, here)}</strong>
        <Icon.ArrowRight size={12} />
        <strong>{party(body.helper, here)}</strong>
        <span className={`an-pill an-pill--${body.outcome === 'completed' ? 'good' : 'bad'}`} style={{ marginLeft: 'auto' }}>
          {body.outcome === 'completed' ? 'Answered' : 'Failed'}
        </span>
      </div>
      <div className="an-receipt-meta">
        {[when(body.finishedAt), formatDuration(body.durationMs), formatTokens((body.cost?.tokensIn || 0) + (body.cost?.tokensOut || 0)), formatPrice(body.cost?.price)].filter(Boolean).join(' · ')}
      </div>
      <div style={{ display: 'flex', flexWrap: 'wrap', gap: 10 }}>
        <Seal ok={item.verified} testId="registry-receipt-seal">{item.verified ? 'Signed by this censaiOS' : `Signature problem: ${item.problem}`}</Seal>
        {counter && <Seal ok={item.counterVerified} testId="registry-receipt-counter">{item.counterVerified ? `Their copy signed by ${shortInstall(counter.signer?.install)}` : 'Their copy does not check out'}</Seal>}
        {body.asker?.verified === true && <Seal ok testId="registry-receipt-asker">Asker proved who they are</Seal>}
        <span className="an-receipt-seal">{roleText(body.role)}, {channelText(body.channel)}</span>
      </div>
      {open && (
        <dl className="an-receipt-detail" data-testid="registry-receipt-detail">
          <dt>Receipt</dt><dd>{body.id}</dd>
          <dt>Request</dt><dd>{body.request}</dd>
          <dt>Agent card</dt><dd>{body.helper?.card || '—'}</dd>
          <dt>Started</dt><dd>{when(body.startedAt)}</dd>
          <dt>Finished</dt><dd>{when(body.finishedAt)}</dd>
          <dt>Tokens</dt><dd>{body.cost?.tokensIn || 0} in, {body.cost?.tokensOut || 0} out</dd>
          <dt>Question fingerprint</dt><dd title={body.promptSha256}>{shortHash(body.promptSha256)}</dd>
          <dt>Answer fingerprint</dt><dd title={body.answerSha256 || ''}>{shortHash(body.answerSha256)}</dd>
          <dt>Signed by</dt><dd>{body.signer?.install}</dd>
          <dt>Signature</dt><dd title={item.receipt.signature}>{shortHash(item.receipt.signature)}</dd>
          <pre className="an-receipt-json">{JSON.stringify(counter ? { receipt: item.receipt, theirReceipt: item.counterReceipt } : item.receipt, null, 2)}</pre>
        </dl>
      )}
    </div>
  );
}

export function ReceiptsTab({ client, enabled = true }) {
  const [data, setData] = React.useState(null);
  const [error, setError] = React.useState('');
  const [openId, setOpenId] = React.useState(null);

  React.useEffect(() => {
    if (!enabled) return undefined;
    let alive = true;
    const load = () => client.listReceipts()
      .then((result) => { if (alive) { setData(result); setError(''); } })
      .catch((e) => { if (alive) setError(e.message || 'Receipts could not load.'); });
    load();
    const timer = setInterval(load, REFRESH_MS);
    return () => { alive = false; clearInterval(timer); };
  }, [client, enabled]);

  if (!enabled) return <div role="status" style={{ padding: 18, color: 'var(--ink-soft)' }}>Open a workspace to see receipts.</div>;
  const receipts = data?.receipts || [];
  const here = data?.install?.id;
  return (
    <div className="an-receipts" data-testid="registry-receipts">
      <div className="an-sub">
        Every time one agent asks another for help, both sides keep a signed receipt: who asked, who answered, when,
        and what it cost. It holds a fingerprint of the question and answer, never the words.
        {here && <> This censaiOS signs as <code title={data.install.publicKey}>{shortInstall(here)}</code>.</>}
      </div>
      {error && <div role="alert" style={{ color: 'var(--ps-red)', fontSize: 'var(--text-sm)' }}>{error}</div>}
      {data && !receipts.length && <div className="an-empty" data-testid="registry-receipts-empty">No receipts yet. Ask an agent for help and its receipt shows up here.</div>}
      {receipts.map((item) => (
        <ReceiptRow key={item.id} item={item} here={here} open={openId === item.id}
          onToggle={() => setOpenId(openId === item.id ? null : item.id)} />
      ))}
    </div>
  );
}
