import React from 'react';
import { WindowTitle } from '../../Windows.jsx';
import { Icon } from '../../Icons.jsx';
import { ConfirmationsView } from './view.jsx';
import './confirmations.css';

async function defaultLoad() {
  const res = await fetch('/api/confirmations', { credentials: 'same-origin' });
  if (!res.ok) throw Object.assign(new Error('load'), { status: res.status });
  const body = await res.json();
  return Array.isArray(body.items) ? body.items : [];
}

async function defaultMark(id) {
  const res = await fetch(`/api/confirmations/${encodeURIComponent(id)}/done`, {
    method: 'POST',
    credentials: 'same-origin',
  });
  if (!res.ok) throw new Error('mark');
}

function loadError(err) {
  if (err?.status === 401) return 'Sign in to see what is waiting.';
  if (err?.status === 403) return "Only this computer's owner can open this list.";
  return 'The list did not load. Try again.';
}

export function ConfirmationsWindow({ load = defaultLoad, mark = defaultMark }) {
  const generation = React.useRef(0);
  const [state, setState] = React.useState({ status: 'loading', items: [], notice: '' });
  const [pendingId, setPendingId] = React.useState('');
  const [itemNotice, setItemNotice] = React.useState('');

  const refresh = React.useCallback(() => {
    const mine = generation.current + 1;
    generation.current = mine;
    setState((prev) => ({ ...prev, status: 'loading', notice: '' }));
    setItemNotice('');
    load().then(
      (items) => {
        if (generation.current === mine) setState({ status: 'ready', items, notice: '' });
      },
      (err) => {
        if (generation.current === mine) setState({ status: 'error', items: [], notice: loadError(err) });
      },
    );
  }, [load]);

  React.useEffect(() => {
    refresh();
    return () => { generation.current += 1; };
  }, [refresh]);

  async function onDone(id) {
    setPendingId(id);
    setItemNotice('');
    try {
      await mark(id);
      setState((prev) => ({ ...prev, items: prev.items.filter((item) => item.id !== id) }));
    } catch {
      setItemNotice('That did not save. Try again.');
    } finally {
      setPendingId('');
    }
  }

  return (
    <>
      <WindowTitle icon={<Icon.List size={14} />} label="Needs you" />
      <ConfirmationsView
        status={state.status}
        items={state.items}
        notice={state.status === 'error' ? state.notice : itemNotice}
        pendingId={pendingId}
        onRetry={refresh}
        onDone={onDone}
      />
    </>
  );
}
