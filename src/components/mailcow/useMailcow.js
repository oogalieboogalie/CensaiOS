import React from 'react';
import { useMailcowMutations } from './useMailcowMutations.js';
import { useVisibilityAwareInterval } from '../../lib/usePolling.js';

export function useMailcow() {
  const [activeTab, setActiveTab] = React.useState('domains');
  const [health, setHealth] = React.useState({ configured: false, ok: false, domainCount: 0, mailboxCount: 0 });
  const [healthLoading, setHealthLoading] = React.useState(true);
  const [domains, setDomains] = React.useState([]);
  const [mailboxes, setMailboxes] = React.useState([]);
  const [aliases, setAliases] = React.useState([]);
  const [queue, setQueue] = React.useState([]);
  const [loading, setLoading] = React.useState(false);
  const [mutating, setMutating] = React.useState(false);
  const [error, setError] = React.useState(null);
  const [showAddForm, setShowAddForm] = React.useState(false);
  const [domainForm, setDomainForm] = React.useState({ domain: '', maxMailboxes: 10, maxQuota: 10240 });
  const [mailboxForm, setMailboxForm] = React.useState({ local_part: '', domain: '', name: '', password: '', quota: 2048 });
  const [aliasForm, setAliasForm] = React.useState({ address: '', goto: '' });
  const [searchQuery, setSearchQuery] = React.useState('');

  const fetchHealth = async () => {
    try {
      const res = await fetch('/api/mailcow/health');
      if (!res.ok) throw new Error(`Health check returned status ${res.status}`);
      setHealth(await res.json());
    } catch (err) {
      console.error('Mailcow health fetch failed:', err);
      setHealth({ configured: true, ok: false, error: err.message });
    } finally {
      setHealthLoading(false);
    }
  };

  const fetchData = React.useCallback(async () => {
    if (!health.configured) return;
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'domains') {
        const res = await fetch('/api/mailcow/domains');
        if (!res.ok) throw new Error(`Failed to load domains: ${res.statusText}`);
        const data = await res.json();
        setDomains(Array.isArray(data) ? data : []);
      } else if (activeTab === 'mailboxes') {
        const [resMbox, resDom] = await Promise.all([fetch('/api/mailcow/mailboxes'), fetch('/api/mailcow/domains')]);
        if (!resMbox.ok || !resDom.ok) throw new Error('Failed to load mailboxes or domains');
        const mboxesData = await resMbox.json();
        const domainsData = await resDom.json();
        setMailboxes(Array.isArray(mboxesData) ? mboxesData : []);
        setDomains(Array.isArray(domainsData) ? domainsData : []);
        if (domainsData.length > 0 && !mailboxForm.domain) {
          setMailboxForm(prev => ({ ...prev, domain: domainsData[0].domain }));
        }
      } else if (activeTab === 'aliases') {
        const res = await fetch('/api/mailcow/aliases');
        if (!res.ok) throw new Error(`Failed to load aliases: ${res.statusText}`);
        const data = await res.json();
        setAliases(Array.isArray(data) ? data : []);
      } else if (activeTab === 'queue') {
        const res = await fetch('/api/mailcow/queue');
        if (!res.ok) throw new Error(`Failed to load mail queue: ${res.statusText}`);
        const data = await res.json();
        setQueue(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, [activeTab, health.configured, mailboxForm.domain]);

  React.useEffect(() => { fetchHealth(); }, []);
  React.useEffect(() => { if (health.configured) fetchData(); }, [health.configured, activeTab, fetchData]);
  useVisibilityAwareInterval(() => {
    fetchHealth();
    fetchData();
  }, health.configured ? 30000 : null);

  const mutations = useMailcowMutations({
    domainForm, setDomainForm, mailboxForm, setMailboxForm,
    aliasForm, setAliasForm, setShowAddForm, setMutating, fetchHealth, fetchData,
  });

  return {
    activeTab, setActiveTab, health, healthLoading, domains, mailboxes, aliases, queue,
    loading, mutating, error, showAddForm, setShowAddForm, domainForm, setDomainForm,
    mailboxForm, setMailboxForm, aliasForm, setAliasForm, searchQuery, setSearchQuery,
    fetchHealth, fetchData, ...mutations,
  };
}
