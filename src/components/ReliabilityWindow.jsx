import React, { useState, useEffect, useRef } from 'react';
import { motion } from 'framer-motion';
import { useWorkspaceStore } from '../lib/store.js';
import { useProjectScan } from './reliability/useProjectScan.js';

export function ReliabilityWindow() {
  const [scans, setScans] = useState([]);
  const [loading, setLoading] = useState(true);
  const [reviewId, setReviewId] = useState(null);
  const cardRefs = useRef(new Map());
  const workspaceId = useWorkspaceStore((s) => s.workspaceId);

  const fetchScans = () => {
    setLoading(true);
    const qs = workspaceId ? `?workspaceId=${encodeURIComponent(workspaceId)}` : '';
    fetch(`/api/reliability/scans${qs}`)
      .then(res => res.json())
      .then(data => {
        setScans(Array.isArray(data) ? data : []);
        setLoading(false);
      })
      .catch(err => {
        console.error('Failed to fetch scans:', err);
        setLoading(false);
      });
  };

  useEffect(() => {
    fetchScans();
  }, [workspaceId]);

  const scan = useProjectScan({ workspaceId, onDone: fetchScans });

  // Review jumps to the file's full scan card above and highlights it.
  const review = (id) => {
    setReviewId(id);
    cardRefs.current.get(id)?.scrollIntoView({ behavior: 'smooth', block: 'center' });
  };

  const getScoreColor = (score) => {
    if (score >= 80) return 'text-green-500';
    if (score >= 50) return 'text-yellow-500';
    return 'text-red-500';
  };

  return (
    <div className="flex flex-col h-full bg-surface text-ink font-sans p-6 overflow-auto">
      <div className="flex justify-between items-center mb-6">
        <h1 className="text-2xl font-bold">AI Code Reliability Dashboard</h1>
        <div className="flex gap-2">
          <button
            onClick={scan.run}
            disabled={scan.running}
            className="px-4 py-2 bg-accent text-accent-contrast rounded hover:opacity-90 transition-opacity disabled:opacity-60"
          >
            {scan.running ? 'Scanning…' : 'Run a scan'}
          </button>
          <button
            onClick={fetchScans}
            className="px-4 py-2 border border-surface-soft rounded hover:bg-surface-soft/50 transition-colors"
          >
            Refresh
          </button>
        </div>
      </div>
      {scan.message && <p role="status" className="-mt-4 mb-4 text-sm text-ink-soft">{scan.message}</p>}

      {loading ? (
        <div className="flex justify-center items-center h-64">
          <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-accent"></div>
        </div>
      ) : (
        <div className="grid grid-cols-1 gap-4">
          {scans.length === 0 ? (
            <div className="text-center py-12 text-ink-soft">{'No scans found yet. Press Run a scan to check the open project\'s code.'}</div>
          ) : (
            scans.map(scan => (
              <motion.div
                key={scan.id}
                ref={(el) => { if (el) cardRefs.current.set(scan.id, el); else cardRefs.current.delete(scan.id); }}
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                className={`p-4 rounded-lg border bg-surface-soft/30 hover:bg-surface-soft/50 transition-colors ${reviewId === scan.id ? 'border-accent ring-2 ring-accent' : 'border-surface-soft'}`}
              >
                <div className="flex justify-between items-start">
                  <div>
                    <h3 className="font-mono text-sm mb-1">{scan.file_path}</h3>
                    <p className="text-xs text-ink-soft">
                      Scan ID: {scan.id} • {new Date(scan.created_at).toLocaleString()}
                    </p>
                  </div>
                  <div className={`text-2xl font-bold ${getScoreColor(scan.score)}`}>
                    {scan.score}
                  </div>
                </div>

                <div className="mt-4 grid grid-cols-2 md:grid-cols-4 gap-2">
                  {Object.entries(scan.heuristics || {}).map(([key, val]) => (
                    <div key={key} className="text-xs p-2 rounded bg-surface border border-surface-soft">
                      <div className="text-ink-soft uppercase text-[10px]">{key.replace(/_/g, ' ')}</div>
                      <div className="font-medium mt-1">
                        {typeof val === 'boolean' ? (val ? '⚠️ Yes' : '✅ No') : val}
                      </div>
                    </div>
                  ))}
                </div>
              </motion.div>
            ))
          )}
        </div>
      )}

      <div className="mt-8 p-4 rounded-lg bg-accent/5 border border-accent/20">
        <h2 className="text-lg font-semibold mb-2">Smart Review Queue</h2>
        <p className="text-sm text-ink-soft mb-4">
          Files below the confidence threshold (80) require manual human review before promotion to production.
        </p>
        <div className="space-y-2">
          {scans.filter(s => s.score < 80).map(s => (
            <div key={s.id} className="flex items-center justify-between p-2 rounded bg-red-500/10 border border-red-500/20">
              <span className="text-xs font-mono">{s.file_path}</span>
              <button onClick={() => review(s.id)} className="text-xs bg-red-500 text-white px-2 py-1 rounded">Review</button>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
