import React from 'react';
import { Icon } from './Icons.jsx';
import { WindowTitle } from './Windows.jsx';
import { getAgentById } from '../lib/agentStore.js';
import { renderMarkdown, CodeBlock } from '../lib/renderMarkdown.jsx';
import { fileLanguage } from './files/fileRouting.js';
import { ANNOTATION_COLORS } from './doc/DocData.js';
import { splitByAnnotations, parseOutlinks } from './doc/DocUtils.js';
import { AnnotationCard } from './doc/AnnotationCard.jsx';
import { SelectionBar, AnnotationComposer } from './doc/AnnotationUI.jsx';
import { NoteGraph } from './doc/NoteGraph.jsx';
import { useDoc } from './doc/useDoc.js';
import { RelatedContext } from './doc/RelatedContext.jsx';
import { reportTyping, reportTextPreview } from '../lib/collaboration/liveText.js';
import { useSharedCaret } from '../lib/collaboration/useSharedCaret.js';
import { mergeWithLatest } from '../lib/collaboration/sharedTextEdit.js';

export function DocWindow({ win, onUpdate, onSpawn, onSelect, wins, onAssign, workspaceId }) {
  const bodyRef = React.useRef(null);
  const {
    realContent, setRealContent,
    loading, saving,
    backlinks,
    showGraph, setShowGraph,
    selRange, pendingKind, setPendingKind,
    activeAnnId, setActiveAnnId,
    selectionText,
    isEditing, setIsEditing,
    text,
    clearSelection,
    onMouseUp,
    onTextareaSelection,
    commitAnnotation,
    saveFile
  } = useDoc(win, onUpdate, onSpawn, onAssign, bodyRef);
  const textareaRef = React.useRef(null);
  useSharedCaret(textareaRef, realContent);

  const annotations = win.annotations || [];
  const segments = splitByAnnotations(text, annotations);
  // Rendered/Source filter: code files (or anything misdetected) opened as
  // docs can flip to raw source instead of markdown-mangled text. Persisted
  // per window so each file remembers its view.
  const sourceView = win.sourceView === true;
  const sourceLang = fileLanguage(win.fileName || '') || 'text';
  const copySource = React.useCallback((codeText) => {
    navigator.clipboard?.writeText(codeText)?.catch?.(() => {});
  }, []);

  if (loading) {
    return <div style={{ flex: 1, display: 'grid', placeItems: 'center', fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--ink-faint)' }}>Loading document...</div>;
  }

  return (
    <div data-win-root style={{ flex: 1, display: 'flex', flexDirection: 'column', minHeight: 0, position: 'relative', userSelect: 'text', WebkitUserSelect: 'text' }}>
      <WindowTitle
        icon={<Icon.Files size={14} />}
        label={win.fileName || 'Untitled'}
        subtitle={win.isGithub ? `github${win.githubRepo ? ` · ${win.githubRepo}` : ''}` : (sourceView ? sourceLang : 'markdown')}
        attachedAgentIds={win.attachedAgents}
        onDetach={(id) => onUpdate({ attachedAgents: (win.attachedAgents || []).filter(a => a !== id) })}
        actions={win.isGithub ? [] : [
          { id: 'edit', label: isEditing ? 'View' : 'Edit', pressed: isEditing, onSelect: () => {
            const nextEdit = !isEditing;
            setIsEditing(nextEdit);
            onUpdate({ isEditing: nextEdit });
          } },
          win.filePath && { id: 'save', label: saving ? 'Saving…' : 'Save', title: 'Save file', onSelect: () => { if (!saving) saveFile(); } },
        ]}
        menu={[
          !win.isGithub && { id: 'source', label: sourceView ? 'Show rendered markdown' : 'Show raw source', onSelect: () => onUpdate({ sourceView: !sourceView }) },
          { id: 'graph', label: showGraph ? 'Hide note graph' : 'Show note graph', onSelect: () => setShowGraph(!showGraph) },
          { id: 'calendar', label: 'Schedule a review', onSelect: () => {
            const calWin = wins?.find(w => w.kind === 'calendar');
            const prefill = {
              title: `Review: ${win.fileName}`,
              description: `Review document ${win.fileName} on Censai canvas.\n\nhb://doc/${win.fileName}`,
              date: new Date().toISOString().split('T')[0],
              startTime: '09:00',
              endTime: '10:00'
            };
            onSpawn('calendar', { data: { prefill } });
            if (calWin) onSelect?.(calWin.id);
          } },
        ]}
      />
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: win.maximized ? '1fr' : '1fr 200px', overflow: 'hidden' }}>
        {showGraph ? (
          <NoteGraph
            current={{ name: win.fileName, path: win.filePath }}
            backlinks={backlinks}
            outlinks={parseOutlinks(realContent || text)}
            onNodeClick={(node) => onSpawn?.('doc', { fileName: node.name, filePath: node.path, isGithub: win.isGithub, githubRepo: win.githubRepo })}
          />
        ) : (
          <div ref={bodyRef} onMouseUp={isEditing ? undefined : onMouseUp} data-doc-body
            onDoubleClick={isEditing ? undefined : () => {
              setIsEditing(true);
              onUpdate({ isEditing: true });
            }}
            style={{
              overflowY: 'auto',
              padding: win.maximized ? '40px 10%' : '18px 24px 32px',
              fontFamily: isEditing ? 'var(--font-mono)' : 'var(--font-sans)',
              fontSize: win.maximized ? 'var(--text-lg)' : 'var(--text-md)',
              lineHeight: win.maximized ? 1.8 : 1.62,
              color: 'var(--ink)',
              whiteSpace: 'pre-wrap',
              cursor: isEditing ? 'auto' : 'text',
              userSelect: 'text',
              WebkitUserSelect: 'text',
              maxWidth: win.maximized ? 900 : 'none',
              margin: win.maximized ? '0 auto' : '0'
            }}>
            {isEditing ? (
              <>
                {win.typingActor && !win.typingActor.shared && (
                  <div style={{ marginBottom: 8, padding: '6px 10px', borderRadius: 'var(--radius-lg)', background: 'var(--accent-soft)', color: 'var(--accent-ink)', fontSize: 'var(--text-xs)', fontFamily: 'var(--font-sans)' }}>
                    {win.typingActor.label} — read-only while they type, so your saves never collide.
                  </div>
                )}
                <textarea
                  autoFocus
                  ref={textareaRef}
                  value={realContent}
                  readOnly={Boolean(win.typingActor && !win.typingActor.shared)}
                  onChange={(e) => {
                    const next = mergeWithLatest(win.id, 'text', realContent, e.target.value);
                    setRealContent(next);
                    onUpdate({ text: next });
                    reportTyping(win.id);
                    reportTextPreview(win.id, next);
                  }}
                onBlur={() => {
                  setIsEditing(false);
                  onUpdate({ isEditing: false });
                }}
                onMouseUp={onTextareaSelection}
                onKeyUp={onTextareaSelection}
                onSelect={onTextareaSelection}
                style={{ width: '100%', height: '100%', resize: 'none', border: 'none', outline: 'none', background: 'transparent', color: 'inherit', font: 'inherit' }}
              />
              </>
            ) : sourceView ? (
              <CodeBlock code={text} lang={sourceLang} onCopyCode={copySource} />
            ) : (
              segments.map((seg, i) => {
                if (!seg.ann) return <span key={i}>{renderMarkdown(seg.text)}</span>;
                const c = ANNOTATION_COLORS[seg.ann.kind];
                return <span key={i} onClick={() => setActiveAnnId(seg.ann.id)} style={{ background: c.bg, color: c.ink, boxShadow: `inset 0 -1px 0 ${c.ring}` + (activeAnnId === seg.ann.id ? `, 0 0 0 2px ${c.ring}` : ''), borderRadius: 'var(--radius-xs)', padding: '0 1px', cursor: 'pointer' }}>{renderMarkdown(seg.text)}</span>;
              })
            )}
          </div>
        )}
        {!win.maximized && (
          <div style={{ borderLeft: '1px dashed var(--hairline)', background: 'var(--surface-2)', overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            {backlinks.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 4, marginBottom: 12 }}>
                <div style={{ fontFamily: 'var(--font-label)', fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', letterSpacing: 'var(--label-tracking)', textTransform: 'var(--label-case)', padding: '0 6px 4px' }}>Backlinks</div>
                {backlinks.map((bl, i) => (
                  <div key={i}
                    onClick={() => onSpawn?.('doc', { fileName: bl.name, filePath: bl.path })}
                    style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius-md)', padding: '6px 8px', fontSize: 'var(--text-xs)', color: 'var(--ink-soft)', cursor: 'pointer', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--accent-ink)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--hairline)'}
                  >
                    <Icon.Files size={10} style={{ marginRight: 6, verticalAlign: 'middle' }} />
                    {bl.name}
                  </div>
                ))}
              </div>
            )}
            <div style={{ fontFamily: 'var(--font-label)', fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', letterSpacing: 'var(--label-tracking)', textTransform: 'var(--label-case)', padding: '0 6px 4px' }}>Annotations</div>
            {annotations.length === 0 && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', padding: 6 }}>highlight text<br/>to add a note</div>}
            {annotations.map(a => <AnnotationCard key={a.id} ann={a} isActive={activeAnnId === a.id} onClick={() => setActiveAnnId(a.id)} onRemove={() => onUpdate({ annotations: annotations.filter(x => x.id !== a.id) })} />)}
            <RelatedContext workspaceId={workspaceId} query={win.fileName} />
          </div>
        )}
      </div>
      {selRange && !pendingKind && <SelectionBar x={selRange.x} y={selRange.y} onPick={(k) => setPendingKind(k)} />}
      {selRange && pendingKind && <AnnotationComposer x={selRange.x} y={selRange.y} kind={pendingKind} quote={selectionText || text.slice(selRange.start, selRange.end)} onCommit={(body, agentId) => commitAnnotation(pendingKind, body, agentId)} onCancel={() => { clearSelection(); }} />}
    </div>
  );
}
