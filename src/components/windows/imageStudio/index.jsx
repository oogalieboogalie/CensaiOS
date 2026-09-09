import React from 'react';
import { GenIcon } from '../../Icons.jsx';
import { WindowTitle } from '../WindowTitle.jsx';
import { ImageStudioCanvas } from './ImageStudioCanvas.jsx';
import { ImageStudioGallery } from './ImageStudioGallery.jsx';
import { ImageStudioPrompt } from './ImageStudioPrompt.jsx';
import { ImageStudioToolbar } from './ImageStudioToolbar.jsx';
import { useImageStudio } from './useImageStudio.js';

export function ImageStudioWindow({ win, onUpdate }) {
  const studio = useImageStudio(win, onUpdate);

  return (
    <>
      <WindowTitle
        accent="var(--ps-pink)"
        icon={<GenIcon size={14} />}
        label="Image Studio"
        subtitle="draw + generate"
        attachedAgentIds={win.attachedAgents}
        onDetach={(id) => onUpdate?.({ attachedAgents: (win.attachedAgents || []).filter(agentId => agentId !== id) })}
      />
      <div style={{ flex: 1, minHeight: 0, display: 'flex', background: '#07080d', color: 'var(--ink)' }}>
        <main style={{ flex: 1, minWidth: 0, padding: 12, display: 'flex', flexDirection: 'column', gap: 0 }}>
          <ImageStudioCanvas
            state={studio.state}
            setCanvasState={studio.setCanvasState}
            tool={studio.tool}
            color={studio.color}
            strokeWidth={studio.strokeWidth}
            textValue={studio.textValue}
          />
          <ImageStudioToolbar
            tool={studio.tool}
            setTool={studio.setTool}
            color={studio.color}
            setColor={studio.setColor}
            strokeWidth={studio.strokeWidth}
            setStrokeWidth={studio.setStrokeWidth}
            textValue={studio.textValue}
            setTextValue={studio.setTextValue}
            canInsertImage={Boolean(studio.selectedImageId)}
            onInsertImage={studio.insertSelectedImage}
            onUndo={studio.undo}
            onRedo={studio.redo}
            onDelete={studio.deleteSelected}
            onClear={studio.clearCanvas}
          />
          <ImageStudioPrompt
            state={studio.state}
            updateFields={studio.updateFields}
            loading={studio.loading}
            error={studio.error}
            onGenerate={studio.generate}
          />
        </main>
        <ImageStudioGallery
          gallery={studio.gallery}
          selectedImageId={studio.selectedImageId}
          onSelect={studio.setSelectedImageId}
          onInsert={studio.insertSelectedImage}
          onDelete={studio.deleteGalleryItem}
        />
      </div>
    </>
  );
}
