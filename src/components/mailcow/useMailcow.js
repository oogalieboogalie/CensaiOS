import React from 'react';
import { useMailcowMutations } from './useMailcowMutations.js';
import { useVisibilityAwareInterval } from '../../lib/usePolling.js';
import { mailcowErrorText, readMailcowResult } from './mailcowResult.js';
import { logFailure } from '../../lib/appLog/browserLog.js';

const load = (path) => fetch(path).then((res) => readMailcowResult(res, { path }));

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
      logFailure('mailcow: could not load health', err, 'mailcow');
      setHealth({ configured: true, ok: false, error: err.message });
    } finally {
      setHealthLoading(false);
    }
  };

  // A teammate who isn't this computer's owner only learns whether Mailcow is
  // set up; the lists are the owner's (server/routes/mailcow.js).
  const canList = health.configured && !health.ownerOnly;

  const fetchData = React.useCallback(async () => {
    if (!canList) return;
    setLoading(true);
    setError(null);
    try {
      if (activeTab === 'domains') {
        const data = await load('/api/mailcow/domains');
        setDomains(Array.isArray(data) ? data : []);
      } else if (activeTab === 'mailboxes') {
        const [mboxesData, domainsData] = await Promise.all([load('/api/mailcow/mailboxes'), load('/api/mailcow/domains')]);
        setMailboxes(Array.isArray(mboxesData) ? mboxesData : []);
        setDomains(Array.isArray(domainsData) ? domainsData : []);
        if (Array.isArray(domainsData) && domainsData.length > 0 && !mailboxForm.domain) {
          setMailboxForm(prev => ({ ...prev, domain: domainsData[0].domain }));
        }
      } else if (activeTab === 'aliases') {
        const data = await load('/api/mailcow/aliases');
        setAliases(Array.isArray(data) ? data : []);
      } else if (activeTab === 'queue') {
        const data = await load('/api/mailcow/queue');
        setQueue(Array.isArray(data) ? data : []);
      }
    } catch (err) {
      setError(mailcowErrorText(err));
    } finally {
      setLoading(false);
    }
  }, [activeTab, canList, mailboxForm.domain]);

  React.useEffect(() => { fetchHealth(); }, []);
  React.useEffect(() => { if (canList) fetchData(); }, [canList, activeTab, fetchData]);
  useVisibilityAwareInterval(() => {
    fetchHealth();
    fetchData();
  }, canList ? 30000 : null);

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
