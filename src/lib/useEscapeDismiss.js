import React from 'react';

// Shared inverse for transient UI. Any menu, popover, or dialog using this
// hook has a deterministic keyboard escape in addition to its visible close.
export function useEscapeDismiss(active, onDismiss) {
  const dismissRef = React.useRef(onDismiss);
  dismissRef.current = onDismiss;

  React.useEffect(() => {
    if (!active) return undefined;
    const onKeyDown = (event) => {
      if (event.key !== 'Escape') return;
      event.preventDefault();
      dismissRef.current?.();
    };
    document.addEventListener('keydown', onKeyDown);
    return () => document.removeEventListener('keydown', onKeyDown);
  }, [active]);
}

export function useOutsideDismiss(active, refs, onDismiss) {
  const dismissRef = React.useRef(onDismiss);
  dismissRef.current = onDismiss;
  const refsRef = React.useRef([]);
  refsRef.current = Array.isArray(refs) ? refs : [refs];

  React.useEffect(() => {
    if (!active) return undefined;
    const onPointerDown = (event) => {
      if (refsRef.current.some((ref) => ref?.current?.contains(event.target))) return;
      dismissRef.current?.();
    };
    document.addEventListener('mousedown', onPointerDown);
    return () => document.removeEventListener('mousedown', onPointerDown);
  }, [active]);
}
