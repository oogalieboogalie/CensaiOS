import React from 'react';
import { getAgentById } from '../../lib/agentStore.js';
import { getSelectionOffsets } from './DocUtils.js';
import { FILE_CONTENTS } from './DocData.js';

const fileContentCache = new Map();

export function useDoc(win, onUpdate, onSpawn, onAssign, bodyRef) {
  const [realContent, setRealContent] = React.useState('');
  const [loading, setLoading] = React.useState(false);
  const [saving, setSaving] = React.useState(false);
  const [backlinks, setBacklinks] = React.useState([]);
  const [showGraph, setShowGraph] = React.useState(false);
  const [selRange, setSelRange] = React.useState(null);
  const [pendingKind, setPendingKind] = React.useState(null);
  const [activeAnnId, setActiveAnnId] = React.useState(null);
  const [selectionText, setSelectionText] = React.useState('');
  const [isEditing, setIsEditing] = React.useState(win.isEditing || false);

  const annotations = win.annotations || [];
  const text = win.filePath ? (loading ? 'Loading file contents...' : realContent) : realContent;

  React.useEffect(() => {
    if (win.isEditing !== undefined && win.isEditing !== isEditing) {
      setIsEditing(win.isEditing);
    }
  }, [win.isEditing]);

  React.useEffect(() => {
    // Remote live previews flow through win.text — never clobber the local draft.
    if (!win.filePath && !isEditing) {
      setRealContent(win.text || win.content || FILE_CONTENTS[win.fileName] || '');
    }
  }, [win.filePath, win.text, win.content, win.fileName, isEditing]);

  React.useEffect(() => {
    if (win.filePath) {
      const url = win.isGithub 
        ? `/api/github/file?repo=${encodeURIComponent(win.githubRepo)}&path=${encodeURIComponent(win.filePath)}`
        : `/api/files/content?path=${encodeURIComponent(win.filePath)}`;

      if (fileContentCache.has(url)) {
        setRealContent(fileContentCache.get(url));
        setLoading(false);
        return;
      }

      setLoading(true);
      fetch(url)
        .then(res => res.json())
        .then(data => {
          if (data.error) throw new Error(data.error);
          fileContentCache.set(url, data.content);
          setRealContent(data.content);
          setLoading(false);
        })
        .catch(err => {
          setRealContent(`Failed to load file: ${err.message}`);
          setLoading(false);
        });

      if (!win.isGithub) {
        fetch(`/api/files/backlinks?path=${encodeURIComponent(win.filePath)}`)
          .then(res => res.json())
          .then(data => setBacklinks(data.results || []))
          .catch(err => console.warn('Failed to fetch backlinks', err));
      }
    }
  }, [win.filePath, win.isGithub, win.githubRepo]);

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
      console.error('Failed to handle wiki link:', err);
    }
  };

  const onMouseUp = (e) => {
    const range = getSelectionOffsets(bodyRef.current);
    const sel = window.getSelection();
    if (!range || sel.isCollapsed) {
      const wikiLink = e.target.closest('[data-wiki-link]');
      if (wikiLink) handleWikiLinkClick(wikiLink.getAttribute('data-wiki-link'));
      clearSelection();
      return;
    }
    const r = sel.getRangeAt(0).getBoundingClientRect();
    const winRect = bodyRef.current.closest('[data-win-root]')?.getBoundingClientRect() || { left: 0, top: 0 };
    setSelectionFromRange(range, r.right - winRect.left, r.top - winRect.top, text.slice(range.start, range.end));
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
    const ann = { id: crypto.randomUUID(), kind, start: selRange.start, end: selRange.end, quote: selectionText || text.slice(selRange.start, selRange.end), body: body || '', agentId: agentId || null, author: agentId ? getAgentById(agentId)?.name : 'You', ts: Date.now() };
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
    if (!win.filePath || win.isGithub) return;
    setSaving(true);
    try {
      await fetch('/api/files/content', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ path: win.filePath, content: realContent })
      });
    } catch (e) {
      console.error('Failed to save file:', e);
    }
    setSaving(false);
  };

  return {
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
    saveFile,
    handleWikiLinkClick
  };
}
