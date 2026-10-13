import React from 'react';

/**
 * A drop-in replacement for setInterval that:
 * 1. Pauses when the tab is hidden (document.visibilityState === 'hidden')
 * 2. Pauses when the window/component is 'inactive' (based on prop)
 * 3. Restarts immediately when visibility returns
 */
export function useVisibilityAwareInterval(callback, delay, { inactive = false } = {}) {
  const savedCallback = React.useRef(callback);
  const [isVisible, setIsVisible] = React.useState(document.visibilityState === 'visible');

  React.useEffect(() => {
    savedCallback.current = callback;
  }, [callback]);

  React.useEffect(() => {
    const handleVisibilityChange = () => {
      const visible = document.visibilityState === 'visible';
      setIsVisible(visible);
      if (visible && !inactive) {
        // Trigger an immediate poll when coming back to life
        savedCallback.current?.();
      }
    };
    document.addEventListener('visibilitychange', handleVisibilityChange);
    return () => document.removeEventListener('visibilitychange', handleVisibilityChange);
  }, [inactive]);

  React.useEffect(() => {
    if (delay === null || inactive || !isVisible) return;

    const id = setInterval(() => savedCallback.current(), delay);
    return () => clearInterval(id);
  }, [delay, inactive, isVisible]);
}
