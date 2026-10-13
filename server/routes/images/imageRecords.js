import crypto from 'crypto';

export function buildImagePrompt({ prompt, additionalInstructions, canvasState, canvasImage }) {
  return [
    String(prompt || '').trim(),
    additionalInstructions ? `Additional instructions: ${String(additionalInstructions).trim()}` : null,
    summarizeCanvasState(canvasState),
    canvasImage ? 'Use the provided drawing preview as composition guidance.' : null,
  ].filter(Boolean).join('\n\n');
}

export function imageRecordFromResponse({
  response,
  prompt,
  additionalInstructions = '',
  model,
  sourceWindowId = null,
}) {
  const image = extractImage(response);
  if (!image?.data) throw new Error('No image returned by provider');

  const now = new Date().toISOString();
  const src = image.data.startsWith('data:')
    ? image.data
    : `data:${image.mimeType || 'image/png'};base64,${image.data}`;

  return {
    id: crypto.randomUUID(),
    src,
    thumbnailSrc: src,
    prompt,
    additionalInstructions,
    model,
    sourceWindowId,
    createdAt: now,
    updatedAt: now,
  };
}

export function extractImage(response) {
  const generated = response?.generatedImages?.[0]?.image;
  if (generated?.imageBytes) {
    return {
      data: generated.imageBytes,
      mimeType: generated.mimeType || generated.mime_type || 'image/png',
    };
  }

  for (const candidate of response?.candidates || []) {
    for (const part of candidate?.content?.parts || []) {
      if (part?.inlineData?.data) {
        return {
          data: part.inlineData.data,
          mimeType: part.inlineData.mimeType || 'image/png',
        };
      }
    }
  }

  return null;
}

function summarizeCanvasState(canvasState) {
  const objects = Array.isArray(canvasState?.objects) ? canvasState.objects : [];
  if (!objects.length) return null;
  const counts = objects.reduce((acc, object) => {
    const type = object?.type || 'object';
    acc[type] = (acc[type] || 0) + 1;
    return acc;
  }, {});
  const summary = Object.entries(counts).map(([type, count]) => `${count} ${type}`).join(', ');
  return `Canvas sketch contains: ${summary}. Use it as rough composition guidance.`;
}
