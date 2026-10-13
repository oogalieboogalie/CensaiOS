import { useState, useEffect } from 'react';
import { Icon } from './Icons';
import { useWorkspaceStore } from '../lib/store.js';

export function ContextFeedWindow({ workspaceId }) {
  const activeWorkspaceId = useWorkspaceStore(state => state.workspaceId);
  const scopeId = activeWorkspaceId || workspaceId;
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [view, setView] = useState('feed'); // 'feed' | 'search'
  const scopeIsCurrent = id => {
    const currentActiveId = useWorkspaceStore.getState().workspaceId;
    return currentActiveId ? currentActiveId === id : workspaceId === id;
  };

  const fetchFeed = async () => {
    if (!scopeId) {
      setItems([]);
      setLoading(false);
      return;
    }
    const requestedScope = scopeId;
    setItems([]);
    setLoading(true);
    try {
      const res = await fetch(`/api/context/feed?workspaceId=${encodeURIComponent(requestedScope)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Context feed unavailable');
      if (scopeIsCurrent(requestedScope)) setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Failed to fetch feed', err);
      if (scopeIsCurrent(requestedScope)) setItems([]);
    } finally {
      if (scopeIsCurrent(requestedScope)) setLoading(false);
    }
  };

  const handleSearch = async (e) => {
    e.preventDefault();
    if (!search) {
      setView('feed');
      fetchFeed();
      return;
    }
    setView('search');
    setLoading(true);
    if (!scopeId) return setLoading(false);
    const requestedScope = scopeId;
    try {
      const res = await fetch(`/api/context/search?workspaceId=${encodeURIComponent(requestedScope)}&q=${encodeURIComponent(search)}`);
      const data = await res.json();
      if (!res.ok) throw new Error(data?.error || 'Context search unavailable');
      if (scopeIsCurrent(requestedScope)) setItems(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error('Search failed', err);
      if (scopeIsCurrent(requestedScope)) setItems([]);
    } finally {
      if (scopeIsCurrent(requestedScope)) setLoading(false);
    }
  };

  useEffect(() => {
    fetchFeed();
  }, [scopeId]);

  return (
    <div className="flex flex-col h-full bg-[var(--surface)] text-[var(--ink)] overflow-hidden">
      <div className="p-3 border-b border-[var(--ink-soft)] flex flex-col gap-2">
        <form onSubmit={handleSearch} className="relative">
          <input
            type="text"
            className="w-full bg-[var(--surface-soft)] border border-[var(--ink-soft)] rounded px-8 py-1.5 text-sm focus:outline-none focus:border-[var(--accent)]"
            placeholder="Search all tools..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
          />
          <div className="absolute left-2.5 top-2 text-[var(--ink-soft)]">
            <Icon.Search size={14} />
          </div>
        </form>
        <div className="flex gap-4 text-xs font-medium">
          <button
            onClick={() => { setView('feed'); setSearch(''); fetchFeed(); }}
            className={view === 'feed' ? 'text-[var(--accent)] border-b border-[var(--accent)]' : 'text-[var(--ink-soft)]'}
          >
            Priority Feed
          </button>
          <button
            className={view === 'search' ? 'text-[var(--accent)] border-b border-[var(--accent)]' : 'text-[var(--ink-soft)]'}
            disabled={!search}
          >
            Search Results
          </button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto">
        {loading ? (
          <div className="p-10 text-center text-[var(--ink-soft)] text-sm animate-pulse">Loading context...</div>
        ) : items.length === 0 ? (
          <div className="p-10 text-center text-[var(--ink-soft)] text-sm">No recent activity found.</div>
        ) : (
          <div className="divide-y divide-[var(--ink-faint)]">
            {items.map((item) => (
              <div key={item.id} className="p-3 hover:bg-[var(--surface-soft)] transition-colors cursor-pointer group">
                <div className="flex items-start gap-3">
                  <div className="mt-1 opacity-60">
                    {item.artifact_type === 'notification' && <Icon.Chat size={16} />}
                    {item.artifact_type === 'external_task' && <Icon.Check size={16} />}
                    {item.artifact_type === 'external_message' && <Icon.Chat size={16} />}
                    {item.artifact_type === 'task' && <Icon.List size={16} />}
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex justify-between items-start gap-2">
                      <h4 className="text-sm font-semibold truncate leading-tight">{item.title}</h4>
                      <span className="text-[10px] uppercase font-bold text-[var(--accent)] opacity-80 shrink-0">
                        {item.data?.provider || 'System'}
                      </span>
                    </div>
                    <p className="text-xs text-[var(--ink-soft)] line-clamp-2 mt-0.5">
                      {item.data?.text || item.data?.description || 'No additional details.'}
                    </p>
                    <div className="flex items-center gap-2 mt-2">
                      <span className="text-[10px] text-[var(--ink-faint)]">
                        {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                      </span>
                      {item.priorityScore > 0.7 && (
                        <span className="px-1.5 py-0.5 rounded-full bg-red-500/10 text-red-500 text-[9px] font-bold uppercase tracking-wider">
                          High Priority
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
