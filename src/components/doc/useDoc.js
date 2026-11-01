import React from 'react';
import { getAgentById } from '../../lib/agentStore.js';
import { selectionToRaw, caretToRaw } from './docTextMap.js';
import { noteAt } from './useNoteHighlights.js';
import { anchorNotes, noteWords } from './anchorNotes.js';
import { FILE_CONTENTS } from './DocData.js';
import { newId } from '../../lib/ids/newId.js';
import { useDocFileLoad } from './useDocFileLoad.js';
import { logFailure } from '../../lib/appLog/browserLog.js';
import { authorName } from '../../lib/collaboration/signedInName.js';

/** A brand-new, empty Document (no file, nothing written yet) opens ready to type for the person who made it. */
export const startsBlank = (win) => !win.filePath && !win.isGithub && !(win.text || win.content || FILE_CONTENTS[win.fileName]);

export function useDoc(win, onUpdate, onSpawn, onAssign, bodyRef, openBlank = false) {
  // A Document with no file has its words from the first look, so nothing flashes empty.
  const [realContent, setRealContent] = React.useState(() => (win.filePath ? '' : win.text || win.content || FILE_CONTENTS[win.fileName] || ''));
  const { loading, loadError, canSave, retryLoad, rememberSaved } = useDocFileLoad(win, setRealContent);
  const [saving, setSaving] = React.useState(false);
  const [backlinks, setBacklinks] = React.useState([]);
  const [backlinksCapped, setBacklinksCapped] = React.useState(false);
  const [backlinksChecked, setBacklinksChecked] = React.useState(false);
  const [showGraph, setShowGraph] = React.useState(false);
  const [selRange, setSelRange] = React.useState(null);
  const [pendingKind, setPendingKind] = React.useState(null);
  const [activeAnnId, setActiveAnnId] = React.useState(null);
  const [selectionText, setSelectionText] = React.useState('');
  const [isEditing, setIsEditing] = React.useState(win.isEditing ?? (openBlank && startsBlank(win)));

  const annotations = win.annotations || [];
  const text = win.filePath ? (loading ? 'Loading file contents...' : realContent) : realContent;
  // Where each comment's words sit now (text typed above them moves them).
  // While a file loads, or after it failed to, its words are not here to look for.
  const placedNotes = React.useMemo(
    () => (loading || loadError ? win.annotations || [] : anchorNotes(text, win.annotations || [])),
    [text, win.annotations, loading, loadError],
  );

  React.useEffect(() => {
    if (win.isEditing !== undefined && win.isEditing !== isEditing) {
      setIsEditing(win.isEditing);
    }
  }, [win.isEditing]);

  React.useEffect(() => {
    // Shared edits flow in through win.text even mid-typing; DocWindow keeps
    // the caret in place (useSharedCaret) and the shared doc merges the text.
    if (!win.filePath) {
      setRealContent(win.text || win.content || FILE_CONTENTS[win.fileName] || '');
    }
  }, [win.filePath, win.text, win.content, win.fileName]);

  React.useEffect(() => {
    if (!win.filePath) return;
    // Asked even when the text comes from the cache, so a reopened note still lists its backlinks.
    setBacklinksChecked(false);
    if (win.isGithub) return;
    fetch(`/api/files/backlinks?path=${encodeURIComponent(win.filePath)}`)
      .then(res => { if (!res.ok) throw new Error(`HTTP ${res.status}`); return res.json(); })
      .then(data => { setBacklinks(data.results || []); setBacklinksCapped(Boolean(data.capped)); setBacklinksChecked(true); })
      .catch(err => logFailure('backlinks not loaded', err, 'doc'));
  }, [win.filePath, win.isGithub]);

  const clearSelection = () => {
    setSelRange(null);
    setPendingKind(null);
    setSelectionText('');
  };

  const setSelectionFromRange = (range, x, y, selectedText) => {
    setSelRange({ ...range, x, y });
    setSelectionText(selectedText);
    setPendingKind(null);
  };

  const handleWikiLinkClick = async (linkText) => {
    const fileName = linkText.includes('.') ? linkText : `${linkText}.md`;
    try {
      let bestMatch = null;
      if (win.isGithub) {
        const treeRes = await fetch(`/api/github/tree?repo=${encodeURIComponent(win.githubRepo)}`);
        const treeData = await treeRes.json();
        const findInTree = (node) => {
          if (node.name.toLowerCase() === fileName.toLowerCase()) return node;
          if (node.children) {
            for (const child of node.children) {
              const found = findInTree(child);
              if (found) return found;
            }
          }
          return null;
        };
        bestMatch = findInTree(treeData);
      } else {
        const searchRes = await fetch(`/api/files/search?q=${encodeURIComponent(fileName)}`);
        const searchData = await searchRes.json();
        if (searchData.results && searchData.results.length > 0) {
          bestMatch = searchData.results.find(f => f.name.toLowerCase() === fileName.toLowerCase()) || searchData.results[0];
        }
      }

      if (bestMatch) {
        onSpawn?.('doc', {
          fileName: bestMatch.name,
          filePath: bestMatch.path,
          isGithub: win.isGithub,
          githubRepo: win.githubRepo
        });
      } else if (win.filePath && !win.isGithub) {
        const dir = win.filePath.split(/[\\/]/).slice(0, -1).join('/');
        const newPath = dir ? `${dir}/${fileName}` : fileName;
        if (confirm(`File "${fileName}" not found. Create it at ${newPath}?`)) {
          await fetch('/api/files/content', {
            method: 'PUT',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ path: newPath, content: `# ${linkText}\n\n` })
          });
          onSpawn?.('doc', { fileName, filePath: newPath });
        }
      } else {
        alert(`File "${fileName}" not found in project.`);
      }
    } catch (err) {
      logFailure('wiki link not opened', err, 'doc', 'error');
    }
  };

  const onMouseUp = (e) => {
    // Places are in the file's own text, so marks like ** or [[ ]] before the words do not shift a note.
    const range = selectionToRaw(bodyRef.current, text);
    const sel = window.getSelection();
    if (!range || sel.isCollapsed) {
      const wikiLink = e.target.closest('[data-wiki-link]');
      if (wikiLink) handleWikiLinkClick(wikiLink.getAttribute('data-wiki-link'));
      const hit = noteAt(placedNotes, caretToRaw(bodyRef.current, text));
      if (hit) setActiveAnnId(hit.id);
      clearSelection();
      return;
    }
    const r = sel.getRangeAt(0).getBoundingClientRect();
    const winRect = bodyRef.current.closest('[data-win-root]')?.getBoundingClientRect() || { left: 0, top: 0 };
    setSelectionFromRange(range, r.right - winRect.left, r.top - winRect.top, sel.toString().trim() || text.slice(range.start, range.end));
  };

  const onTextareaSelection = (e) => {
    const start = e.currentTarget.selectionStart ?? 0;
    const end = e.currentTarget.selectionEnd ?? 0;
    if (start === end) {
      clearSelection();
      return;
    }
    const winRect = e.currentTarget.closest('[data-win-root]')?.getBoundingClientRect() || { left: 0, top: 0 };
    const bodyRect = bodyRef.current?.getBoundingClientRect() || { left: winRect.left, top: winRect.top, right: winRect.left + 320 };
    const x = Math.min(bodyRect.right - winRect.left, bodyRect.left - winRect.left + 220);
    const y = Math.max(0, bodyRect.top - winRect.top + 10);
    setSelectionFromRange({ start, end }, x, y, realContent.slice(start, end));
  };

  const commitAnnotation = (kind, body, agentId) => {
    if (!selRange) return;
    const ann = { id: newId(), kind, start: selRange.start, end: selRange.end, quote: selectionText || text.slice(selRange.start, selRange.end), ...noteWords(text, selRange.start, selRange.end), body: body || '', agentId: agentId || null, author: agentId ? getAgentById(agentId)?.name : authorName(), ts: Date.now() };
    onUpdate({ annotations: [...annotations, ann] });
    clearSelection();
    if (kind === 'ask' && agentId && onSpawn) {
      const promptText = `Re: "${ann.quote}"\n\n${body || ''}`;
      onSpawn('chat', { agentId, msgs: [{ from: 'me', text: promptText }], autoSend: true });
    }
    if (kind === 'assign' && agentId && onAssign) {
      onAssign({ text: body || ann.quote.slice(0, 60), assignee: agentId, quoted: ann.quote, source: win.filePath || win.fileName });
    }
  };

  const saveFile = async () => {
    if (!canSave) return;
    setSaving(true);
    try {
      const res = await fetch('/api/files/content', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: win.filePath, content: realContent })
      });
      if (res?.ok) rememberSaved(realContent);
    } catch (e) {
      logFailure('file not saved', e, 'doc', 'error');
    }
    setSaving(false);
  };

  return {
    realContent, setRealContent,
    loading, loadError, canSave, saving, retryLoad,
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
    handleWikiLinkClick
  };
}
