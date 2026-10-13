import React from 'react';
import { DEFAULT_CODE_EDITOR, DEFAULT_HTML_PREVIEW } from './CanvasState.js';
import { findRegionNeighbor } from './CanvasInteractions.js';
import { RegionMenu } from './CanvasRegionMenu.jsx';
import { fitWindowSizeToRegion } from './regionWindowSize.js';

export function CanvasRegionActions({
  region,
  zoom,
  wins,
  setRegion,
  onRubberBand,
  onSpawn,
  onSpawnGroup,
  onRequestNewAgent,
  onCapture,
}) {
  if (!region) return null;

  const spawnIntoRegion = (kind, data = {}, size = {}) => {
    onSpawn(kind, data, { x: region.x, y: region.y }, fitWindowSizeToRegion(kind, region, size));
    setRegion(null);
  };

  return (
    <RegionMenu
      rect={region}
      zoom={zoom}
      neighbor={findRegionNeighbor(region, wins)}
      onFitNeighbor={(fitted) => setRegion(fitted)}
      onCancel={() => setRegion(null)}
      onPickPlan={() => { onRubberBand?.(region); setRegion(null); }}
      onPickIdea={() => spawnIntoRegion('idea')}
      onPickGroup={() => { onSpawnGroup({ x: region.x, y: region.y }, { w: region.w, h: region.h }); setRegion(null); }}
      onPickChat={(agentId) => spawnIntoRegion('chat', { agentId })}
      onPickGroupChat={() => spawnIntoRegion('groupChat')}
      onPickWorkflow={() => spawnIntoRegion('workflow')}
      onPickCodeEditor={() => spawnIntoRegion('code_editor', { title: 'Code Editor', code: DEFAULT_CODE_EDITOR })}
      onPickHtmlPreview={() => spawnIntoRegion('htmlPreview', { title: 'Shared Preview', fileName: 'preview.html', html: DEFAULT_HTML_PREVIEW })}
      onPickAgent={() => { onRequestNewAgent?.(); setRegion(null); }}
      onPickImage={() => spawnIntoRegion('genImage')}
      onPickBrowser={() => spawnIntoRegion('browser')}
      onPickFiles={() => spawnIntoRegion('files')}
      onPickCalendar={() => spawnIntoRegion('calendar')}
      onPickScheduler={() => spawnIntoRegion('scheduler')}
      onPickOperations={() => spawnIntoRegion('operationsBoard')}
      onPickMusic={() => spawnIntoRegion('music')}
      onPickStream={() => spawnIntoRegion('stream')}
      onPickExoSkeleton={() => spawnIntoRegion('exoSkeleton')}
      onPickOverseer={() => spawnIntoRegion('overseer')}
      onShare={() => onCapture((dataUrl, rect) => {
        onSpawn('chat', { agentId: 'censai', imageAttachment: dataUrl }, { x: rect.x + rect.w + 40, y: rect.y });
      })}
      onDownload={() => onCapture((dataUrl) => {
        const a = document.createElement('a');
        a.href = dataUrl;
        a.download = `censai_snapshot_${new Date().getTime()}.png`;
        a.click();
      })}
    />
  );
}
