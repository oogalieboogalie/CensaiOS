import React, { useState, useEffect } from 'react';

/**
 * Provenance Explorer Window
 * Allows engineers to trace AI-generated code back to the original prompt and model.
 * Correlates production runtime events with code provenance.
 */
export function ProvenanceExplorerWindow({ workspaceId = 'local' }) {
  const [provenanceList, setProvenanceList] = useState([]);
  const [selectedArt, setSelectedArt] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  useEffect(() => {
    fetchProvenance();
  }, [workspaceId]);

  async function fetchProvenance() {
    setLoading(true);
    try {
      // In a real implementation, we'd have a specific API for listing provenance
      // For this demo, we'll assume a generic artifact fetcher or similar.
      const res = await fetch(`/api/artifacts?workspace_id=${workspaceId}&artifact_type=ai_provenance`);
      if (!res.ok) throw new Error('Failed to fetch provenance');
      const data = await res.json();
      setProvenanceList(Array.isArray(data) ? data : []);
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }

  return (
    <div className="flex h-full flex-col bg-surface overflow-hidden text-ink">
      <div className="flex border-b border-accent-soft p-2 bg-surface-alt items-center justify-between">
        <h2 className="text-sm font-bold uppercase tracking-wider opacity-70">Provenance Explorer</h2>
        <button
          onClick={fetchProvenance}
          className="text-xs px-2 py-1 bg-accent text-white rounded hover:bg-accent-soft transition-colors"
        >
          Refresh
        </button>
      </div>

      <div className="flex flex-1 overflow-hidden">
        {/* Sidebar: List of provenance records */}
        <div className="w-1/3 border-r border-accent-soft overflow-y-auto bg-surface-alt">
          {loading && <div className="p-4 text-xs italic opacity-50 text-center">Loading...</div>}
          {error && <div className="p-4 text-xs text-red-500 font-mono">{error}</div>}
          {!loading && provenanceList.length === 0 && (
            <div className="p-4 text-xs italic opacity-50 text-center">No AI provenance records found.</div>
          )}
          {provenanceList.map(art => (
            <div
              key={art.id}
              onClick={() => setSelectedArt(art)}
              className={`p-3 border-b border-accent-soft cursor-pointer transition-colors ${selectedArt?.id === art.id ? 'bg-accent/10 border-l-4 border-l-accent' : 'hover:bg-accent/5'}`}
            >
              <div className="text-sm font-medium truncate">{art.data.file_path}</div>
              <div className="text-[10px] opacity-60 mt-1">
                {art.data.model} • {new Date(art.created_at).toLocaleString()}
              </div>
            </div>
          ))}
        </div>

        {/* Detail View */}
        <div className="flex-1 overflow-y-auto p-4 bg-surface font-mono">
          {selectedArt ? (
            <div className="space-y-6">
              <section>
                <h3 className="text-xs font-bold text-accent uppercase mb-2">Original Prompt</h3>
                <div className="bg-surface-alt p-3 rounded text-xs leading-relaxed border border-accent-soft whitespace-pre-wrap max-h-48 overflow-y-auto">
                  {selectedArt.metadata.full_prompt || selectedArt.data.prompt_preview}
                </div>
              </section>

              <section>
                <h3 className="text-xs font-bold text-accent uppercase mb-2">Generated Code</h3>
                <div className="bg-ink text-white p-3 rounded text-xs border border-accent-soft whitespace-pre-wrap overflow-x-auto">
                  {selectedArt.data.code_snippet}
                </div>
              </section>

              <section>
                <h3 className="text-xs font-bold text-accent uppercase mb-2">Metadata</h3>
                <div className="grid grid-cols-2 gap-2 text-[10px] opacity-80 bg-surface-alt p-2 rounded border border-accent-soft">
                  <div>Model: <span className="text-ink">{selectedArt.data.model}</span></div>
                  <div>Agent: <span className="text-ink">{selectedArt.owner_id}</span></div>
                  <div>Created: <span className="text-ink">{new Date(selectedArt.created_at).toISOString()}</span></div>
                  <div>ID: <span className="text-ink">{selectedArt.id}</span></div>
                </div>
              </section>
            </div>
          ) : (
            <div className="h-full flex items-center justify-center opacity-30 italic text-sm">
              Select a record to view lineage
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
