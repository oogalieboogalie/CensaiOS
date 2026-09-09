import domtoimage from 'dom-to-image-more';

export function useCanvasCapture({ ref, region, setRegion, pan, zoom }) {
  return async (callback) => {
    if (!region || !ref.current) return;
    try {
      const snapRect = { ...region };
      setRegion(null);
      await new Promise(r => setTimeout(r, 50));

      const canvasRect = ref.current.getBoundingClientRect();
      const screenX = snapRect.x * zoom + pan.x + canvasRect.left;
      const screenY = snapRect.y * zoom + pan.y + canvasRect.top;
      const screenW = snapRect.w * zoom;
      const screenH = snapRect.h * zoom;
      const dataUrlFull = await domtoimage.toPng(ref.current);
      const img = new Image();
      img.src = dataUrlFull;
      await new Promise(r => { img.onload = r; });

      const canvas = document.createElement('canvas');
      canvas.width = screenW;
      canvas.height = screenH;
      const ctx = canvas.getContext('2d');
      ctx.drawImage(img, screenX, screenY, screenW, screenH, 0, 0, screenW, screenH);
      callback(canvas.toDataURL('image/png'), snapRect);
    } catch (e) {
      console.error('Capture failed', e);
    }
  };
}
