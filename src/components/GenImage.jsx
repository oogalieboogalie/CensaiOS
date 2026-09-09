import React from 'react';
import { GenIcon } from './Icons.jsx';
import { WindowTitle } from './Windows.jsx';

export function GenImageWindow({ win, onUpdate }) {
  const [loading, setLoading] = React.useState(win.cooked !== true);
  const [prompt, setPrompt] = React.useState(win.prompt || '');
  const [editing, setEditing] = React.useState(!win.prompt);
  const [generatedImage, setGeneratedImage] = React.useState(win.generatedImage || null);
  const [error, setError] = React.useState(null);
  const inputRef = React.useRef(null);

  React.useEffect(() => { if (editing) setTimeout(() => inputRef.current?.focus(), 30); }, [editing]);

  const submit = async () => { 
    if (!prompt.trim()) return; 
    setEditing(false); 
    setLoading(true);
    setError(null);
    onUpdate({ prompt: prompt.trim(), cooked: false, generatedImage: null }); 

    try {
      const res = await fetch('/api/image', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: prompt.trim() })
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to generate');
      
      setGeneratedImage(data.image);
      onUpdate({ cooked: true, generatedImage: data.image });
    } catch (err) {
      console.error(err);
      setError(err.message);
      onUpdate({ cooked: true });
    } finally {
      setLoading(false);
    }
  };

  const regenerate = () => { submit(); };
  
  const saveImage = React.useCallback(() => {
    if (!generatedImage) return;
    const a = document.createElement('a');
    a.href = generatedImage;
    a.download = `${win.prompt || 'generated'}_${Date.now()}.png`;
    a.click();
  }, [generatedImage, win.prompt]);

  const [dragImage, setDragImage] = React.useState(null);

  const handleDragStart = React.useCallback((e) => {
    if (!generatedImage) return;
    // Use both custom MIME and plain text fallback for better browser support
    e.dataTransfer.setData('application/x-homebase-image', generatedImage);
    e.dataTransfer.setData('text/plain', generatedImage);
    e.dataTransfer.effectAllowed = 'copy';
    setDragImage(true);
  }, [generatedImage]);

  const handleDragEnd = React.useCallback(() => {
    setDragImage(false);
  }, []);
  
  const finalPrompt = win.prompt || '';
  const seed = (finalPrompt || 'x') + ':' + (win.seedBump || 0);

  return (
    <>
      <WindowTitle accent="var(--ps-pink)" icon={<GenIcon size={14}/>} label="Image" subtitle={finalPrompt ? 'nanobanana' : 'awaiting prompt'} attachedAgentIds={win.attachedAgents} onDetach={(id) => onUpdate({ attachedAgents: (win.attachedAgents || []).filter(a => a !== id) })} />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
        <div style={{ flex: 1, position: 'relative', overflow: 'hidden', background: 'oklch(0.20 0.02 280)', margin: '6px 8px 0 8px', borderRadius: 10 }}>
          {generatedImage && !loading && <img src={generatedImage} alt={finalPrompt} draggable="true" onDragStart={handleDragStart} onDragEnd={handleDragEnd} style={{ width: '100%', height: '100%', objectFit: 'cover', display: 'block', animation: 'gen-fade 0.5s ease-out both', cursor: dragImage ? 'grabbing' : 'grab' }} />}
          {loading && <CookingOverlay />}
          {!finalPrompt && !loading && !generatedImage && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', color: 'oklch(0.7 0.04 280)', fontFamily: 'var(--font-mono)', fontSize: 11, letterSpacing: '0.12em', textTransform: 'uppercase' }}>type a prompt below</div>}
          {error && !loading && <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', padding: 20, textAlign: 'center', color: 'var(--ps-red)', fontFamily: 'var(--font-sans)', fontSize: 12 }}>Error: {error}</div>}
        </div>
        <div style={{ padding: 10, display: 'flex', gap: 6, alignItems: 'center' }}>
          {editing ? <>
            <input ref={inputRef} value={prompt} onChange={(e) => setPrompt(e.target.value)}
              onKeyDown={(e) => { if (e.key === 'Enter') submit(); if (e.key === 'Escape') { setEditing(false); setPrompt(win.prompt || ''); } }}
              placeholder="a watercolor of a small town newspaper office at dawn…"
              style={{ flex: 1, background: 'var(--surface-2)', border: '1px solid var(--hairline)', borderRadius: 10, padding: '8px 12px', font: '13px/1.4 var(--font-sans)', color: 'var(--ink)', outline: 'none' }} />
            <button onClick={submit} style={{ all: 'unset', cursor: 'pointer', padding: '7px 14px', borderRadius: 999, background: 'var(--accent)', color: 'white', fontSize: 12, fontWeight: 600 }}>Cook</button>
          </> : <>
            <button onClick={() => setEditing(true)} title="Edit prompt"
              style={{ all: 'unset', cursor: 'pointer', padding: '7px 10px', borderRadius: 8, color: 'var(--ink-soft)', background: 'var(--surface-2)', fontSize: 12, flex: 1, fontStyle: finalPrompt ? 'normal' : 'italic', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>{finalPrompt || 'no prompt yet'}</button>
            <button onClick={regenerate} disabled={loading} title="Regenerate"
              style={{ all: 'unset', cursor: loading ? 'wait' : 'pointer', width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', color: 'var(--accent-ink)', background: 'var(--accent-soft)', opacity: loading ? 0.5 : 1 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M3 12a9 9 0 0 1 15-6.7L21 8"/><path d="M21 3v5h-5"/><path d="M21 12a9 9 0 0 1-15 6.7L3 16"/><path d="M3 21v-5h5"/></svg>
            </button>
            <button onClick={saveImage} disabled={!generatedImage} title="Save image"
              style={{ all: 'unset', cursor: !generatedImage ? 'not-allowed' : 'pointer', width: 30, height: 30, borderRadius: 8, display: 'grid', placeItems: 'center', color: 'var(--accent-ink)', background: 'var(--accent-soft)', opacity: !generatedImage ? 0.5 : 1 }}>
              <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>
            </button>
          </>}
        </div>
      </div>
    </>
  );
}

function CookingOverlay() {
  return (
    <div style={{ position: 'absolute', inset: 0, display: 'grid', placeItems: 'center', background: 'linear-gradient(120deg, oklch(0.22 0.04 280), oklch(0.18 0.03 320), oklch(0.20 0.04 200))', backgroundSize: '200% 200%', animation: 'gen-shimmer 2.5s ease infinite' }}>
      <div style={{ textAlign: 'center', color: 'oklch(0.95 0.05 320)' }}>
        <div style={{ fontFamily: 'var(--font-display)', fontSize: 22, fontWeight: 600, marginBottom: 4 }}>cooking…</div>
        <div style={{ fontFamily: 'var(--font-mono)', fontSize: 10, letterSpacing: '0.16em', textTransform: 'uppercase', opacity: 0.7 }}>nanobanana · diffusion</div>
        <div style={{ marginTop: 14, display: 'flex', gap: 6, justifyContent: 'center' }}>
          {[0,1,2].map(i => <div key={i} style={{ width: 6, height: 6, borderRadius: '50%', background: 'oklch(0.85 0.18 320)', animation: `gen-bounce 1.2s ease-in-out ${i * 0.15}s infinite` }}/>)}
        </div>
      </div>
    </div>
  );
}

function ProceduralArt({ seed }) {
  const art = React.useMemo(() => buildArt(seed), [seed]);
  return (
    <svg viewBox="0 0 600 400" preserveAspectRatio="xMidYMid slice" style={{ width: '100%', height: '100%', display: 'block', animation: 'gen-fade 0.5s ease-out both' }}>
      <defs>
        <radialGradient id={`bg-${art.id}`} cx="50%" cy="50%" r="80%"><stop offset="0%" stopColor={art.bg1} /><stop offset="100%" stopColor={art.bg2} /></radialGradient>
        <filter id={`grain-${art.id}`}><feTurbulence type="fractalNoise" baseFrequency="0.85" numOctaves="2" seed={art.seed} /><feComponentTransfer><feFuncA type="linear" slope="0.18" /></feComponentTransfer><feComposite in2="SourceGraphic" operator="in" /></filter>
        <filter id={`blur-${art.id}`}><feGaussianBlur stdDeviation="22"/></filter>
      </defs>
      <rect width="600" height="400" fill={`url(#bg-${art.id})`} />
      <g filter={`url(#blur-${art.id})`} opacity="0.95">
        {art.blobs.map((b, i) => <ellipse key={i} cx={b.x} cy={b.y} rx={b.rx} ry={b.ry} fill={b.color} opacity={b.opacity} />)}
      </g>
      <rect width="600" height="400" filter={`url(#grain-${art.id})`} fill="white" />
    </svg>
  );
}

function buildArt(seed) {
  const h = hashStr(seed), rand = mulberry32(h);
  const baseHue = Math.floor(rand() * 360);
  const huePalette = [baseHue, (baseHue + 30 + Math.floor(rand() * 60)) % 360, (baseHue + 200 + Math.floor(rand() * 60)) % 360];
  const lightness = 0.45 + rand() * 0.25;
  const bg1 = `oklch(${(lightness + 0.15).toFixed(2)} ${(0.05 + rand() * 0.08).toFixed(2)} ${huePalette[0]})`;
  const bg2 = `oklch(${(lightness - 0.18).toFixed(2)} ${(0.05 + rand() * 0.08).toFixed(2)} ${huePalette[1]})`;
  const blobs = [], n = 4 + Math.floor(rand() * 4);
  for (let i = 0; i < n; i++) {
    blobs.push({ x: 50+rand()*500, y: 30+rand()*340, rx: 60+rand()*180, ry: 60+rand()*180,
      color: `oklch(${(0.55+rand()*0.3).toFixed(2)} ${(0.10+rand()*0.15).toFixed(2)} ${huePalette[i % huePalette.length]})`, opacity: 0.55+rand()*0.4 });
  }
  return { id: h.toString(36), seed: h % 1000, bg1, bg2, blobs };
}

function hashStr(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }
function mulberry32(seed) { return function() { seed = (seed + 0x6D2B79F5) >>> 0; let t = seed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
