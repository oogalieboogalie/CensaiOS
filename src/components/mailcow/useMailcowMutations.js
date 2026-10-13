export function useMailcowMutations({
  domainForm, setDomainForm,
  mailboxForm, setMailboxForm,
  aliasForm, setAliasForm,
  setShowAddForm, setMutating,
  fetchHealth, fetchData,
}) {
  const handleAddDomain = async (e) => {
    e.preventDefault();
    if (!domainForm.domain.trim()) return;
    setMutating(true);
    try {
      const res = await fetch('/api/mailcow/domains', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          domain: domainForm.domain.trim(),
          max_mailboxes: String(domainForm.maxMailboxes),
          max_quota: String(domainForm.maxQuota),
          active: '1',
        }),
      });
      const result = await res.json();
      const hasError = Array.isArray(result)
        ? result.some(r => r.type === 'error')
        : result?.type === 'error' || result?.error;
      if (hasError) {
        const msg = Array.isArray(result) ? result.map(r => r.msg).join('; ') : (result.error || JSON.stringify(result));
        throw new Error(msg);
      }
      setDomainForm({ domain: '', maxMailboxes: 10, maxQuota: 10240 });
      setShowAddForm(false);
      fetchHealth();
      fetchData();
    } catch (err) {
      alert(`Failed to add domain: ${err.message}`);
    } finally {
      setMutating(false);
    }
  };

  const handleDeleteDomain = async (domainName) => {
    if (!confirm(`Are you absolutely sure you want to delete ${domainName}? This will delete all associated mailboxes and aliases permanentely!`)) return;
    setMutating(true);
    try {
      const res = await fetch('/api/mailcow/domains', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [domainName] }),
      });
      const result = await res.json();
      const hasError = Array.isArray(result) ? result.some(r => r.type === 'error') : result?.type === 'error';
      if (hasError) throw new Error(Array.isArray(result) ? result.map(r => r.msg).join('; ') : JSON.stringify(result));
      fetchHealth();
      fetchData();
    } catch (err) {
      alert(`Failed to delete domain: ${err.message}`);
    } finally {
      setMutating(false);
    }
  };

  const handleAddMailbox = async (e) => {
    e.preventDefault();
    const { local_part, domain, name, password, quota } = mailboxForm;
    if (!local_part.trim() || !domain || !name.trim() || !password) return;
    setMutating(true);
    try {
      const res = await fetch('/api/mailcow/mailboxes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ local_part: local_part.trim(), domain, name: name.trim(), password, quota: String(quota), active: '1' }),
      });
      const result = await res.json();
      const hasError = Array.isArray(result) ? result.some(r => r.type === 'error') : result?.type === 'error';
      if (hasError) throw new Error(Array.isArray(result) ? result.map(r => r.msg).join('; ') : JSON.stringify(result));
      setMailboxForm(prev => ({ ...prev, local_part: '', name: '', password: '' }));
      setShowAddForm(false);
      fetchHealth();
      fetchData();
    } catch (err) {
      alert(`Failed to create mailbox: ${err.message}`);
    } finally {
      setMutating(false);
    }
  };

  const handleDeleteMailbox = async (address) => {
    if (!confirm(`Are you sure you want to delete mailbox ${address}? All emails inside will be permanently deleted.`)) return;
    setMutating(true);
    try {
      const res = await fetch('/api/mailcow/mailboxes', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [address] }),
      });
      const result = await res.json();
      const hasError = Array.isArray(result) ? result.some(r => r.type === 'error') : result?.type === 'error';
      if (hasError) throw new Error(Array.isArray(result) ? result.map(r => r.msg).join('; ') : JSON.stringify(result));
      fetchHealth();
      fetchData();
    } catch (err) {
      alert(`Failed to delete mailbox: ${err.message}`);
    } finally {
      setMutating(false);
    }
  };

  const handleAddAlias = async (e) => {
    e.preventDefault();
    const { address, goto } = aliasForm;
    if (!address.trim() || !goto.trim()) return;
    setMutating(true);
    try {
      const res = await fetch('/api/mailcow/aliases', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ address: address.trim(), goto: goto.trim(), active: '1' }),
      });
      const result = await res.json();
      const hasError = Array.isArray(result) ? result.some(r => r.type === 'error') : result?.type === 'error';
      if (hasError) throw new Error(Array.isArray(result) ? result.map(r => r.msg).join('; ') : JSON.stringify(result));
      setAliasForm({ address: '', goto: '' });
      setShowAddForm(false);
      fetchData();
    } catch (err) {
      alert(`Failed to create alias: ${err.message}`);
    } finally {
      setMutating(false);
    }
  };

  const handleDeleteAlias = async (aliasId) => {
    if (!confirm('Are you sure you want to delete this alias?')) return;
    setMutating(true);
    try {
      const res = await fetch('/api/mailcow/aliases', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items: [String(aliasId)] }),
      });
      const result = await res.json();
      const hasError = Array.isArray(result) ? result.some(r => r.type === 'error') : result?.type === 'error';
      if (hasError) throw new Error(Array.isArray(result) ? result.map(r => r.msg).join('; ') : JSON.stringify(result));
      fetchData();
    } catch (err) {
      alert(`Failed to delete alias: ${err.message}`);
    } finally {
      setMutating(false);
    }
  };

  const handleFlushQueue = async () => {
    setMutating(true);
    try {
      const res = await fetch('/api/mailcow/queue/flush', { method: 'POST' });
      if (!res.ok) throw new Error('Queue flush failed');
      alert('Mail queue flushed successfully.');
      fetchData();
    } catch (err) {
      alert(`Failed to flush queue: ${err.message}`);
    } finally {
      setMutating(false);
    }
  };

  return {
    handleAddDomain, handleDeleteDomain, handleAddMailbox, handleDeleteMailbox,
    handleAddAlias, handleDeleteAlias, handleFlushQueue,
  };
}
