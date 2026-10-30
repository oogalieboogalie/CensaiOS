import React from 'react';
import { Icon } from './Icons.jsx';
import { WindowTitle } from './Windows.jsx';
import { getAgentById } from '../lib/agentStore.js';
import { renderMarkdown, CodeBlock } from '../lib/renderMarkdown.jsx';
import { fileLanguage } from './files/fileRouting.js';
import { parseOutlinks } from './doc/DocUtils.js';
import { useNoteHighlights } from './doc/useNoteHighlights.js';
import { AnnotationCard } from './doc/AnnotationCard.jsx';
import { SelectionBar, AnnotationComposer } from './doc/AnnotationUI.jsx';
import { NoteGraph } from './doc/NoteGraph.jsx';
import { useDoc } from './doc/useDoc.js';
import { FileLoadError } from './files/FileLoadError.jsx';
import { OffBoardNote } from './files/OffBoardNote.jsx';
import { SaveNote } from './files/SaveNote.jsx';
import { RelatedContext } from './doc/RelatedContext.jsx';
import { BacklinksBox } from './doc/BacklinksBox.jsx';
import { reportTyping, reportTextPreview } from '../lib/collaboration/liveText.js';
import { useSharedCaret } from '../lib/collaboration/useSharedCaret.js';
import { mergeWithLatest } from '../lib/collaboration/sharedTextEdit.js';
import { localDay } from '../lib/schedule/plainWords.js';
import { caretToRaw, pointToRaw } from './doc/docTextMap.js';
import { noteAt } from './doc/useNoteHighlights.js';
import { useWorkspaceStore } from '../lib/store.js';

export function DocWindow({ win, onUpdate, onSpawn, onSelect, wins, onAssign, workspaceId }) {
  const bodyRef = React.useRef(null);
  // The window I just made (or picked) is the active one; a teammate's new
  // Document never grabs my keyboard or opens in my editor.
  const isActive = useWorkspaceStore((s) => s.activeId === win.id);
  const {
    realContent, setRealContent,
    loading, loadError, canSave, saving, saveNote, closeSaveNote, retryLoad,
    backlinks,
    backlinksCapped,
    backlinksChecked,
    showGraph, setShowGraph,
    selRange, pendingKind, setPendingKind,
    activeAnnId, setActiveAnnId,
    placedNotes,
    selectionText,
    isEditing, setIsEditing,
    text,
    clearSelection,
    onMouseUp,
    onTextareaSelection,
    commitAnnotation,
    saveFile,
    offBoard,
  } = useDoc(win, onUpdate, onSpawn, onAssign, bodyRef, isActive);
  const textareaRef = React.useRef(null);
  useSharedCaret(textareaRef, realContent, React.useMemo(() => ({ id: win.id, field: 'text' }), [win.id]));
  const caretRef = React.useRef(null);
  const showComments = !win.maximized && win.showComments === true;

  const annotations = React.useMemo(() => win.annotations || [], [win.annotations]);
  // Rendered/Source filter: code files (or anything misdetected) opened as
  // docs can flip to raw source instead of markdown-mangled text. Persisted
  // per window so each file remembers its view.
  const sourceView = win.sourceView === true;
  const sourceLang = fileLanguage(win.fileName || '') || 'text';
  const copySource = React.useCallback((codeText) => {
    navigator.clipboard?.writeText(codeText)?.catch?.(() => {});
  }, []);
  useNoteHighlights(win.id, bodyRef, text, placedNotes, activeAnnId, !loading && !isEditing && !sourceView && !showGraph);
  // A click opens the editor with the caret where you clicked; it lands at the
  // end when the click missed the words.
  React.useEffect(() => {
    const box = textareaRef.current;
    if (!isEditing || !box || caretRef.current == null) return;
    box.focus();
    box.setSelectionRange(caretRef.current, caretRef.current);
    caretRef.current = null;
  }, [isEditing]);
  const startEditing = (at) => {
    caretRef.current = at;
    setIsEditing(true);
    onUpdate({ isEditing: true });
  };
  // One plain click edits. Dragging over words still makes a comment, a click
  // on a link or button does what it did before, and a click on painted
  // (commented) words opens the comments with that one picked out.
  const onBodyMouseUp = (e) => {
    const sel = window.getSelection();
    if ((sel && !sel.isCollapsed) || e.target.closest('a, button, [data-wiki-link], [data-md-decor]')) return onMouseUp(e);
    const at = pointToRaw(bodyRef.current, text, e.clientX, e.clientY) ?? caretToRaw(bodyRef.current, text);
    const hit = noteAt(placedNotes, at);
    if (hit) {
      setActiveAnnId(hit.id);
      if (!showComments && !win.maximized) onUpdate({ showComments: true });
      return;
    }
    if (win.isGithub || loadError) return onMouseUp(e);
    startEditing(at ?? text.length);
  };

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
          { id: 'edit', label: isEditing ? 'View' : 'Edit', pressed: isEditing, disabled: Boolean(loadError) && !isEditing, title: loadError && !isEditing ? 'Editing stays off until the file loads' : undefined, onSelect: () => {
            const nextEdit = !isEditing;
            setIsEditing(nextEdit);
            onUpdate({ isEditing: nextEdit });
          } },
          { id: 'comments', label: annotations.length ? `Comments ${annotations.length}` : 'Comments', pressed: showComments, title: showComments ? 'Hide comments' : 'Show comments', onSelect: () => onUpdate({ showComments: !showComments }) },
          win.filePath && { id: 'save', label: saving ? 'Saving…' : 'Save', title: canSave ? 'Save file' : 'Save stays off until the file loads', disabled: saving || !canSave, onSelect: () => { if (canSave && !saving) saveFile(); } },
        ]}
        menu={[
          !win.isGithub && { id: 'source', label: sourceView ? 'Show rendered markdown' : 'Show raw source', onSelect: () => onUpdate({ sourceView: !sourceView }) },
          { id: 'graph', label: showGraph ? 'Hide note graph' : 'Show note graph', onSelect: () => setShowGraph(!showGraph) },
          { id: 'calendar', label: 'Schedule a review', onSelect: () => {
            const calWin = wins?.find(w => w.kind === 'calendar');
            const prefill = {
              title: `Review: ${win.fileName}`,
              description: `Review document ${win.fileName} on Censai canvas.\n\nhb://doc/${win.fileName}`,
              date: localDay(), // today on this computer's clock, not London's
              startTime: '09:00',
              endTime: '10:00'
            };
            onSpawn('calendar', { data: { prefill } });
            if (calWin) onSelect?.(calWin.id);
          } },
        ]}
      />
      <FileLoadError message={loadError} onRetry={retryLoad} />
      <OffBoardNote show={offBoard && !loadError} />
      <SaveNote note={saveNote} onClose={closeSaveNote} />
      <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: showComments ? '1fr 200px' : '1fr', overflow: 'hidden' }}>
        {showGraph ? (
          <NoteGraph
            current={{ name: win.fileName, path: win.filePath }}
            backlinks={backlinks}
            outlinks={parseOutlinks(realContent || text)}
            onNodeClick={(node) => onSpawn?.('doc', { fileName: node.name, filePath: node.path, isGithub: win.isGithub, githubRepo: win.githubRepo })}
          />
        ) : (
          <div ref={bodyRef} onMouseUp={isEditing ? undefined : onBodyMouseUp} data-doc-body
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
                  autoFocus={isActive}
                  placeholder={loadError ? '' : 'Start typing…'}
                  aria-label="Document text"
                  ref={textareaRef}
                  value={realContent}
                  readOnly={Boolean(loadError) || Boolean(win.typingActor && !win.typingActor.shared)}
                  onChange={(e) => {
                    // A file only this computer's owner may read keeps its words on this screen.
                    if (offBoard) return setRealContent(e.target.value);
                    const next = mergeWithLatest(win.id, 'text', realContent, e.target.value, e.target.selectionEnd);
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
            ) : !text.trim() ? (
              !loadError && <div style={{ color: 'var(--ink-faint)' }}>Click anywhere to start writing</div>
            ) : sourceView ? (
              <CodeBlock code={text} lang={sourceLang} onCopyCode={copySource} />
            ) : (
              // One render for the whole text; notes are painted over it (useNoteHighlights).
              renderMarkdown(text)
            )}
          </div>
        )}
        {showComments && (
          <div data-doc-comments style={{ borderLeft: '1px dashed var(--hairline)', background: 'var(--surface-2)', overflowY: 'auto', padding: 10, display: 'flex', flexDirection: 'column', gap: 8 }}>
            <BacklinksBox win={win} backlinks={backlinks} capped={backlinksCapped} checked={backlinksChecked} onSpawn={onSpawn} />
            <div style={{ fontFamily: 'var(--font-label)', fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', letterSpacing: 'var(--label-tracking)', textTransform: 'var(--label-case)', padding: '0 6px 4px' }}>Comments</div>
            {annotations.length === 0 && <div style={{ fontFamily: 'var(--font-mono)', fontSize: 'var(--text-xs)', color: 'var(--ink-faint)', padding: 6 }}>select words<br/>to add a comment</div>}
            {placedNotes.map(a => <AnnotationCard key={a.id} ann={a} isActive={activeAnnId === a.id} onClick={() => setActiveAnnId(a.id)} onRemove={() => onUpdate({ annotations: annotations.filter(x => x.id !== a.id) })} />)}
            <RelatedContext workspaceId={workspaceId} query={win.fileName} />
          </div>
        )}
      </div>
      {selRange && !pendingKind && <SelectionBar x={selRange.x} y={selRange.y} onPick={(k) => setPendingKind(k)} />}
      {selRange && pendingKind && <AnnotationComposer x={selRange.x} y={selRange.y} kind={pendingKind} quote={selectionText || text.slice(selRange.start, selRange.end)} onCommit={(body, agentId) => { commitAnnotation(pendingKind, body, agentId); onUpdate({ showComments: true }); }} onCancel={() => { clearSelection(); }} />}
    </div>
  );
}
