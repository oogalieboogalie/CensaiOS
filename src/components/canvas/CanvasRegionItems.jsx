import React from 'react';
import { Icon, ImageIcon } from '../Icons.jsx';

export function buildRegionMenuItems({ onPickPlan, onPickIdea, onPickGroupChat, onPickFiles, onPickCodeEditor, onPickHtmlPreview, onPickWorkflow, onPickImage, onPickBrowser, onPickCalendar, onPickOperations, onPickScheduler, onPickGroup, onPickMusic, onPickStream, onPickExoSkeleton, onPickOverseer, onPickAgent, onShare, onDownload, setChatPickerOpen }) {
  return [
    { id: 'plan',    icon: <Icon.List size={14}/>,       label: 'Plan',     onClick: onPickPlan },
    { id: 'idea',    icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M9 18h6"/><path d="M10 22h4"/><path d="M15.09 14c.18-.98.65-1.74 1.41-2.5A4.65 4.65 0 0 0 18 8 6 6 0 0 0 6 8c0 1 .23 2.23 1.5 3.5A4.61 4.61 0 0 1 8.91 14"/></svg>, label: 'Idea Pad', onClick: onPickIdea },
    { id: 'chat',    icon: <Icon.Chat size={14}/>,       label: 'Chat',     onClick: () => setChatPickerOpen(v => !v) },
    { id: 'group-chat', icon: <Icon.Group size={14}/>,   label: 'Group Chat', onClick: onPickGroupChat },
    { id: 'files',   icon: <Icon.Files size={14}/>,      label: 'Files',    onClick: onPickFiles },
    { id: 'code-editor', icon: <Icon.Code size={14}/>,    label: 'Code Editor', onClick: onPickCodeEditor },
    { id: 'html-preview', icon: <Icon.Eye size={14}/>,    label: 'Shared Preview', onClick: onPickHtmlPreview },
    { id: 'workflow',icon: <Icon.NewWorkflow size={14}/>, label: 'Workflow', onClick: onPickWorkflow },
    { id: 'image',   icon: <ImageIcon size={14}/>,       label: 'Image',    onClick: onPickImage },
    { id: 'browser', icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><path d="M12 2a15.3 15.3 0 0 1 4 10 15.3 15.3 0 0 1-4 10 15.3 15.3 0 0 1-4-10 15.3 15.3 0 0 1 4-10z"/><path d="M2 12h20"/></svg>, label: 'Browser', onClick: onPickBrowser },
    { id: 'calendar',icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><rect x="3" y="4" width="18" height="18" rx="2" ry="2"></rect><line x1="16" y1="2" x2="16" y2="6"></line><line x1="8" y1="2" x2="8" y2="6"></line><line x1="3" y1="10" x2="21" y2="10"></line></svg>, label: 'Calendar', onClick: onPickCalendar },
    { id: 'operations', icon: <Icon.Tools size={14} />, label: 'Live Operations', onClick: onPickOperations },
    { id: 'scheduler',icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><circle cx="12" cy="12" r="10"/><polyline points="12 6 12 12 16 14"/></svg>, label: 'Agent Scheduler', onClick: onPickScheduler },
    { id: 'canvas-group', icon: <Icon.Folder size={14}/>, label: 'Canvas Group', onClick: onPickGroup },
    { id: 'music',   icon: <Icon.Music size={14}/>,      label: 'Music',    onClick: onPickMusic },
    { id: 'stream',  icon: <Icon.Video size={14}/>,      label: 'Stream',   onClick: onPickStream },
    { id: 'exo',     icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><polygon points="12 2 2 7 12 12 22 7 12 2"></polygon><polyline points="2 17 12 22 22 17"></polyline><polyline points="2 12 12 17 22 12"></polyline></svg>, label: 'Exo-Skeleton', onClick: onPickExoSkeleton },
    { id: 'overseer', icon: <Icon.Tools size={14}/>,     label: 'Overseer Watcher', onClick: onPickOverseer },
    { id: 'sep1',    sep: true },
    { id: 'agent',   icon: <Icon.NewAgent size={14}/>,   label: 'New Agent', onClick: onPickAgent, accent: true },
    { id: 'share',   icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M4 12v8a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-8"/><polyline points="16 6 12 2 8 6"/><line x1="12" y1="2" x2="12" y2="15"/></svg>, label: 'Share', onClick: onShare, accent: true },
    { id: 'download',icon: <svg width="14" height="14" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2"><path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/><polyline points="7 10 12 15 17 10"/><line x1="12" y1="15" x2="12" y2="3"/></svg>, label: 'Save Image', onClick: onDownload, accent: true },
  ];
}
