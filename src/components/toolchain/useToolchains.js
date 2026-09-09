import { useState, useEffect, useRef, useCallback } from 'react';
import { useVisibilityAwareInterval } from '../../lib/usePolling.js';

const API = '/api/sandbox';

/**
 * Data layer for the Toolchain Settings window: server config, sandbox
 * detection, quick-install, and the save→rebuild→poll loop.
 */
export function useToolchains() {
  const [tools, setTools]             = useState([]);
  const [bakedIn, setBakedIn]         = useState(new Set());   // IDs toggled to bake into image
  const [statuses, setStatuses]       = useState({});          // id → status string
  const [versions, setVersions]       = useState({});          // id → version string
  const [installLog, setInstallLog]   = useState({});          // id → log string
  const [sandboxUp, setSandboxUp]     = useState(null);        // null=unknown, bool
  const [fetchError, setFetchError]   = useState(null);
  const [loading, setLoading]         = useState(true);
  const [isDirty, setIsDirty]         = useState(false);
  const [isSaving, setIsSaving]       = useState(false);
  const [saveError, setSaveError]     = useState(null);
  // Rebuild state
  const [rebuildStatus, setRebuildStatus] = useState('idle');
  const [rebuildLog, setRebuildLog]       = useState([]);
  const [rebuildError, setRebuildError]   = useState(null);

  const logEndRef  = useRef(null);

  // ── Load config from server ──────────────────────────────────────────────
  const fetchConfig = useCallback(async () => {
    setLoading(true);
    setFetchError(null);
    try {
      const res = await fetch(`${API}/toolchains`);
      if (!res.ok) throw new Error(`Server returned ${res.status} — restart the server.`);
      const data = await res.json();
      setTools(data.tools || []);
      setBakedIn(new Set((data.tools || []).filter(t => t.enabled).map(t => t.id)));
      setRebuildStatus(data.rebuildStatus || 'idle');
      // Init all statuses to unknown
      const s = {};
      (data.tools || []).forEach(t => { s[t.id] = 'unknown'; });
      setStatuses(s);
    } catch (err) {
      setFetchError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => { fetchConfig(); }, [fetchConfig]);

  // ── Detect which CLIs are installed in the running sandbox ───────────────
  const detectAll = useCallback(async () => {
    setStatuses(prev => Object.fromEntries(Object.keys(prev).map(id => [id, 'checking'])));
    try {
      const res = await fetch(`${API}/toolchains/detect`, { method: 'POST' });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const data = await res.json();
      setSandboxUp(data.sandboxRunning);
      if (data.results) {
        const s = {};
        const v = {};
        for (const [id, r] of Object.entries(data.results)) {
          s[id] = r.installed ? 'installed' : 'missing';
          v[id] = r.version || null;
        }
        setStatuses(s);
        setVersions(v);
      }
    } catch {
      setStatuses(prev => Object.fromEntries(Object.keys(prev).map(id => [id, 'unknown'])));
    }
  }, []);

  // Auto-detect once tools are loaded
  useEffect(() => {
    if (tools.length > 0) detectAll();
  }, [tools.length]); // eslint-disable-line

  // ── Poll rebuild while running ───────────────────────────────────────────
  const pollRebuild = useCallback(async () => {
    try {
      const res = await fetch(`${API}/rebuild-status`);
      if (!res.ok) return;
      const data = await res.json();
      setRebuildStatus(data.status);
      setRebuildLog(data.log || []);
      setRebuildError(data.error || null);
      if (data.status === 'done') {
        detectAll();
      }
    } catch { /* ignore */ }
  }, [detectAll]);

  useVisibilityAwareInterval(pollRebuild, rebuildStatus === 'running' ? 1500 : null);

  useEffect(() => {
    logEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [rebuildLog]);

  // ── Quick-install into running sandbox (session only) ────────────────────
  async function quickInstall(id) {
    setStatuses(prev => ({ ...prev, [id]: 'installing' }));
    setInstallLog(prev => ({ ...prev, [id]: '' }));
    try {
      const res = await fetch(`${API}/toolchains/install`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id }),
      });
      const data = await res.json();
      if (data.ok) {
        setStatuses(prev => ({ ...prev, [id]: 'installed' }));
        setInstallLog(prev => ({ ...prev, [id]: data.note }));
      } else {
        setStatuses(prev => ({ ...prev, [id]: 'error' }));
        setInstallLog(prev => ({ ...prev, [id]: data.error || data.stderr || 'Install failed.' }));
      }
    } catch (err) {
      setStatuses(prev => ({ ...prev, [id]: 'error' }));
      setInstallLog(prev => ({ ...prev, [id]: err.message }));
    }
  }

  // ── Save bake-in selection → triggers rebuild ────────────────────────────
  async function handleSave() {
    setIsSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`${API}/toolchains`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: [...bakedIn], apiKeys: {} }),
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}));
        throw new Error(err.error || `HTTP ${res.status}`);
      }
      setIsDirty(false);
      setRebuildStatus('running');
      setRebuildLog([]);
      setRebuildError(null);
    } catch (err) {
      setSaveError(err.message);
    } finally {
      setIsSaving(false);
    }
  }

  function toggleBake(id) {
    setBakedIn(prev => {
      const next = new Set(prev);
      next.has(id) ? next.delete(id) : next.add(id);
      return next;
    });
    setIsDirty(true);
  }

  return {
    tools, bakedIn, statuses, versions, installLog, sandboxUp,
    fetchError, loading, isDirty, isSaving, saveError,
    rebuildStatus, setRebuildStatus, rebuildLog, rebuildError, logEndRef,
    fetchConfig, detectAll, quickInstall, handleSave, toggleBake,
  };
}
