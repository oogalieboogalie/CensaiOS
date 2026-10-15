/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
// The Assistant: ask one of your censaiOS agents about these books, and let
// it sort the review queue. The conversation is saved on the board so a
// teammate sees the same answers.
import React from 'react';
import { getAgents } from '../../../lib/agentStore.js';
import { useWorkspaceStore } from '../../../lib/store.js';
import { sendMessageWithMeta } from '../../../lib/chat.js';
import { renderMarkdown } from '../../../lib/renderMarkdown.jsx';
import { aiCandidates, aiSortPrompt, assistantPrompt, parseAiSort } from '../../../lib/yorware/books/booksAi.js';
import { aiAnswersPatch } from '../../../lib/yorware/books/booksEdits.js';
import { readBooks } from '../../../lib/yorware/books/booksModel.js';
import { PageHead } from './BooksBits.jsx';
import { Status } from './BooksForms.jsx';

const SUGGESTIONS = [
  'How did last month compare with the month before?',
  'What are my biggest expenses this year, and anything unusual?',
  'Did my most recent social post or promotion bring in sales?',
  'Go through what needs review and tell me what you think each one is.',
  'Estimate my self-employment tax for this year so far.',
  'Which months had the most new contacts, and what happened around them?',
];
const CHAT_FIELD = 'bkChat';
const KEEP = 40;

function useAgent(win) {
  const agents = getAgents().filter((a) => a?.id);
  const [agentId, setAgentId] = React.useState(() => win.bkAgent || agents[0]?.id || '');
  return { agents, agentId, setAgentId };
}

function SortWithAi({ b, agentId }) {
  const workspaceId = useWorkspaceStore((s) => s.workspaceId);
  const [state, setState] = React.useState({});
  const [busy, setBusy] = React.useState(false);
  const batches = aiCandidates(b.books);
  const sort = async () => {
    setBusy(true);
    setState({});
    let updated = 0;
    let cleared = 0;
    try {
      for (const batch of batches) {
        const reply = await sendMessageWithMeta(agentId, [{ from: 'me', text: aiSortPrompt(b.books, batch) }], { windowId: b.win.id, workspaceId });
        const answers = parseAiSort(reply.text);
        if (!answers.length) throw new Error('The agent did not answer with categories. Try another agent, or a model that follows instructions closely.');
        const out = b.run((win) => aiAnswersPatch(win, readBooks(win), answers, undefined, batch.map((t) => t.id)));
        updated += out.updated;
        cleared += out.cleared;
      }
      setState({ ok: `Sorted ${updated} transaction${updated === 1 ? '' : 's'}; ${cleared} left the review queue. The rest have a suggestion for you to check.` });
    } catch (err) {
      setState({ error: `${updated ? `Sorted ${updated} before it stopped. ` : ''}${err?.message || err}` });
    } finally {
      setBusy(false);
    }
  };
  const n = batches.reduce((s, x) => s + x.length, 0);
  return (
    <div className="hb-yb-inline-form">
      <button type="button" className="hb-yb-btn" disabled={busy || !n || !agentId} onClick={sort}>
        {busy ? 'Sorting…' : n ? `Sort the review queue with AI (${n})` : 'Nothing unsure to sort'}
      </button>
      <Status state={state} />
    </div>
  );
}

export function AssistantPage({ b }) {
  const { agents, agentId, setAgentId } = useAgent(b.win);
  const workspaceId = useWorkspaceStore((s) => s.workspaceId);
  const messages = Array.isArray(b.win[CHAT_FIELD]) ? b.win[CHAT_FIELD] : [];
  const [input, setInput] = React.useState('');
  const [busy, setBusy] = React.useState(false);
  const [error, setError] = React.useState(null);
  const endRef = React.useRef(null);
  React.useEffect(() => { endRef.current?.scrollIntoView?.({ block: 'nearest' }); }, [messages.length, busy]);
  const agent = agents.find((a) => a.id === agentId);

  const ask = async (question) => {
    const q = question.trim();
    if (!q || busy || !agentId) return;
    setInput('');
    setError(null);
    setBusy(true);
    const mine = { role: 'user', text: q, at: Date.now() };
    const history = [...messages, mine].slice(-KEEP);
    b.run(() => ({ [CHAT_FIELD]: history, bkAgent: agentId }));
    try {
      const earlier = messages.slice(-6).map((m) => ({ from: m.role === 'user' ? 'me' : 'agent', text: m.text }));
      const prompt = assistantPrompt(b.books, b.today, q, b.win.title || 'this business');
      const reply = await sendMessageWithMeta(agentId, [...earlier, { from: 'me', text: prompt }], { windowId: b.win.id, workspaceId });
      const answer = { role: 'assistant', text: String(reply.text || '').trim() || '(No answer.)', agent: agent?.name || '', at: Date.now() };
      b.run((win) => ({ [CHAT_FIELD]: [...(Array.isArray(win[CHAT_FIELD]) ? win[CHAT_FIELD] : history), answer].slice(-KEEP) }));
    } catch (err) {
      setError(err?.message || String(err));
    } finally {
      setBusy(false);
    }
  };

  return (
    <>
      <PageHead title="Assistant" sub="Ask about income, expenses, taxes, and what happened around your posts and promotions.">
        <label className="hb-yb-inline">
          <span className="hb-yb-muted">Agent</span>
          <select value={agentId} onChange={(e) => setAgentId(e.target.value)} aria-label="Agent">
            {agents.map((a) => <option key={a.id} value={a.id}>{a.name || a.id}</option>)}
          </select>
        </label>
        {messages.length > 0 && <button type="button" className="hb-yb-danger" onClick={() => b.run(() => ({ [CHAT_FIELD]: null }))}>Clear the conversation</button>}
      </PageHead>
      <div className="hb-yb-card hb-yb-chat">
        {messages.length === 0 && (
          <div className="hb-yb-suggestions">
            {SUGGESTIONS.map((s) => <button type="button" key={s} className="hb-yb-chip" disabled={busy || !agentId} onClick={() => ask(s)}>{s}</button>)}
          </div>
        )}
        {messages.map((m, i) => (
          <div key={`${m.at}-${i}`} className="hb-yb-chat-msg" data-role={m.role}>
            {m.role === 'assistant' && m.agent && <div className="hb-yb-meta">{m.agent}</div>}
            <div className="hb-yb-chat-body">{m.role === 'assistant' ? renderMarkdown(m.text, { compact: true }) : m.text}</div>
          </div>
        ))}
        {busy && <div className="hb-yb-chat-msg" data-role="assistant"><span className="hb-yb-muted">{agent?.name || 'The agent'} is reading the books…</span></div>}
        {error && <p className="hb-yb-msg" data-tone="error" role="alert">{error}</p>}
        <div ref={endRef} />
        <form className="hb-yb-chat-input" onSubmit={(e) => { e.preventDefault(); ask(input); }}>
          <textarea value={input} rows={2} placeholder="Ask about your books…" aria-label="Question" onChange={(e) => setInput(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); ask(input); } }} />
          <button type="submit" className="hb-yb-btn" disabled={busy || !input.trim() || !agentId}>Ask</button>
        </form>
        <p className="hb-yb-muted hb-yb-small-print">Answers come from {agent?.name || 'your agent'} using its own model and your key. It sees a summary of these books with each question. Not tax advice.</p>
      </div>
      <div className="hb-yb-card">
        <h2>Sort the unsure ones</h2>
        <p className="hb-yb-muted">The agent looks at what the built-in categorizer wasn&apos;t sure about, using your own past choices as examples. Confident answers leave the review queue; the rest wait for your check.</p>
        <SortWithAi b={b} agentId={agentId} />
      </div>
    </>
  );
}
