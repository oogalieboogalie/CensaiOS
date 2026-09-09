import React from 'react';

const CARD_WIDTH = 320;
const CARD_HEIGHT = 180;
const GAP = 14;
const EDGE = 16;
const TOP_SAFE = 64;

function windowElement(id) {
  if (!id) return null;
  return [...document.querySelectorAll('[data-win-id]')]
    .find((node) => node.dataset.winId === id) || null;
}

export function getMissionTarget(step, firstId, secondId) {
  if (step === 0) return document.querySelector('[data-mission="module-menu"]');
  if (step === 1) {
    return windowElement(secondId || firstId)
      || document.querySelector('[data-mission="module-menu"]');
  }
  if (step === 2) {
    return document.querySelector('[data-testid="sidebar-favorites-popover"]')
      || document.querySelector('[aria-label="Customize Sidebar"]');
  }
  return document.querySelector('[data-mission="todo-input"]')
    || document.querySelector('[data-mission="module-menu"]');
}

function sameRect(a, b) {
  return a && b
    && Math.abs(a.left - b.left) < 0.5
    && Math.abs(a.top - b.top) < 0.5
    && Math.abs(a.width - b.width) < 0.5
    && Math.abs(a.height - b.height) < 0.5;
}

export function useMissionTargetRect(step, firstId, secondId, active) {
  const [rect, setRect] = React.useState(null);
  React.useEffect(() => {
    if (!active) { setRect(null); return undefined; }
    let frame;
    const schedule = globalThis.requestAnimationFrame || ((fn) => setTimeout(fn, 16));
    const cancel = globalThis.cancelAnimationFrame || clearTimeout;
    const update = () => {
      const next = getMissionTarget(step, firstId, secondId)?.getBoundingClientRect?.();
      const normalized = next && next.width > 0 && next.height > 0
        ? { left: next.left, top: next.top, width: next.width, height: next.height }
        : null;
      setRect((current) => (sameRect(current, normalized) ? current : normalized));
      frame = schedule(update);
    };
    update();
    return () => cancel(frame);
  }, [active, firstId, secondId, step]);
  return rect;
}

function fits(candidate, viewport) {
  return candidate.left >= EDGE
    && candidate.top >= TOP_SAFE
    && candidate.left + CARD_WIDTH <= viewport.width - EDGE
    && candidate.top + CARD_HEIGHT <= viewport.height - EDGE;
}

export function getMissionCardPosition(rect, viewport = { width: innerWidth, height: innerHeight }) {
  if (!rect) return { right: EDGE, top: TOP_SAFE };
  const centerX = rect.left + rect.width / 2;
  const centerY = rect.top + rect.height / 2;
  const candidates = [
    { left: rect.left + rect.width + GAP, top: centerY - CARD_HEIGHT / 2 },
    { left: rect.left - CARD_WIDTH - GAP, top: centerY - CARD_HEIGHT / 2 },
    { left: centerX - CARD_WIDTH / 2, top: rect.top + rect.height + GAP },
    { left: centerX - CARD_WIDTH / 2, top: rect.top - CARD_HEIGHT - GAP },
  ];
  const fitting = candidates.find((candidate) => fits(candidate, viewport));
  if (fitting) return fitting;
  return {
    left: Math.max(EDGE, Math.min(viewport.width - CARD_WIDTH - EDGE, candidates[0].left)),
    top: Math.max(TOP_SAFE, Math.min(viewport.height - CARD_HEIGHT - EDGE, candidates[0].top)),
  };
}

export function getMissionCopy(step, secondId) {
  if (step === 0) return ['Open your first module', 'Use Modules in the top-left and choose any window.'];
  if (step === 1 && !secondId) return ['Build a pair', 'Open Modules again and add a second window.'];
  if (step === 1) return ['Put them side by side', 'Drag the new window beside the first. This only counts after a real move.'];
  if (step === 2 && document.querySelector('[data-testid="sidebar-favorites-popover"]')) return ['Choose quick favorites', 'Turn on at least two windows you want in this rail.'];
  if (step === 2 && document.querySelector('[aria-label="Customize Sidebar"]')) return ['Customize quick access', 'Click the gear, then turn on at least two favorite windows.'];
  if (step === 2) return ['Reveal quick access', 'Drag a rectangle on an empty part of the canvas. A quick-action rail will appear beside it.'];
  if (document.querySelector('[data-mission="todo-input"]')) return ['Leave yourself a win', 'Type one useful task in the to-do box and press Enter.'];
  return ['Make a to-do', 'Open Modules → To-do List, then add one useful task.'];
}
