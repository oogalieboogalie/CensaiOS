function copyToClipboard(text) {
  if (navigator.clipboard && navigator.clipboard.writeText) {
    return navigator.clipboard.writeText(text);
  }
  try {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    textArea.style.top = '0';
    textArea.style.left = '0';
    textArea.style.position = 'fixed';
    textArea.style.opacity = '0';
    document.body.appendChild(textArea);
    textArea.focus();
    textArea.select();
    const successful = document.execCommand('copy');
    document.body.removeChild(textArea);
    if (successful) return Promise.resolve();
    return Promise.reject(new Error('execCommand copy failed'));
  } catch (err) {
    return Promise.reject(err);
  }
}

function cleanCopiedText(text) {
  if (!text) return '';
  const trimmed = text.trim();
  const urlCandidate = trimmed.replace(/\s+/g, '');
  if (/^https?:\/\/\S+$/i.test(urlCandidate)) {
    return urlCandidate;
  }
  return text
    .split(/\r?\n/)
    .map((line) => line.trimEnd())
    .join('\n');
}

function patchScreenRect(hostEl) {
  const screenEl = hostEl.querySelector('.xterm-screen');
  if (!screenEl) return () => {};

  const original = screenEl.getBoundingClientRect.bind(screenEl);
  screenEl.getBoundingClientRect = function patchedRect() {
    const rect = original();
    const scaleX = screenEl.offsetWidth ? rect.width / screenEl.offsetWidth : 1;
    const scaleY = screenEl.offsetHeight ? rect.height / screenEl.offsetHeight : 1;
    if (scaleX === 1 && scaleY === 1) return rect;
    return new DOMRect(rect.x, rect.y, rect.width / scaleX, rect.height / scaleY);
  };

  return () => {
    screenEl.getBoundingClientRect = original;
  };
}

function handleScaledMouseEvent(hostEl, event) {
  const rect = hostEl.getBoundingClientRect();
  const scaleX = hostEl.offsetWidth ? rect.width / hostEl.offsetWidth : 1;
  const scaleY = hostEl.offsetHeight ? rect.height / hostEl.offsetHeight : 1;
  if (Math.abs(scaleX - 1) < 0.001 && Math.abs(scaleY - 1) < 0.001) return;

  const logicalX = rect.left + (event.clientX - rect.left) / scaleX;
  const logicalY = rect.top + (event.clientY - rect.top) / scaleY;

  try {
    Object.defineProperty(event, 'clientX', { get: () => logicalX, configurable: true });
    Object.defineProperty(event, 'clientY', { get: () => logicalY, configurable: true });
    Object.defineProperty(event, 'pageX', { get: () => window.scrollX + logicalX, configurable: true });
    Object.defineProperty(event, 'pageY', { get: () => window.scrollY + logicalY, configurable: true });
  } catch {
    // Ignore browsers that do not allow redefining event coordinates.
  }
}

export function installTerminalInteractionBridge(term, hostEl) {
  const restoreScreenRect = patchScreenRect(hostEl);
  const mouseEvents = [
    'mousedown', 'mousemove', 'mouseup', 'click', 'dblclick',
    'contextmenu', 'pointerdown', 'pointermove', 'pointerup',
  ];
  const onMouseEvent = (event) => handleScaledMouseEvent(hostEl, event);

  mouseEvents.forEach((type) => {
    hostEl.addEventListener(type, onMouseEvent, { capture: true });
  });

  term.attachCustomKeyEventHandler((event) => {
    if (event.type !== 'keydown') return true;

    const lowerKey = event.key.toLowerCase();
    const isCopy = (event.ctrlKey || event.metaKey) && lowerKey === 'c';
    const isPaste = (event.ctrlKey || event.metaKey) && lowerKey === 'v';

    if (isCopy || (event.ctrlKey && event.shiftKey && event.key === 'C')) {
      const selection = term.getSelection();
      if (selection) {
        copyToClipboard(cleanCopiedText(selection)).catch(() => {});
        return false;
      }
    }

    if (isPaste || (event.ctrlKey && event.shiftKey && event.key === 'V')) {
      navigator.clipboard.readText()
        .then((text) => term.paste(text))
        .catch(() => {});
      return false;
    }

    return true;
  });

  term.onSelectionChange(() => {
    const selection = term.getSelection();
    if (selection) {
      copyToClipboard(cleanCopiedText(selection)).catch(() => {});
    }
  });

  return () => {
    restoreScreenRect();
    mouseEvents.forEach((type) => {
      hostEl.removeEventListener(type, onMouseEvent, { capture: true });
    });
  };
}

export function getTerminalSocketUrl(cwd, sessionId, workspaceId, extra = {}) {
  const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
  const params = new URLSearchParams();
  if (cwd) params.set('cwd', cwd);
  if (sessionId) params.set('sessionId', sessionId);
  if (workspaceId) params.set('workspaceId', workspaceId);
  if (extra.agent) params.set('agent', extra.agent);
  if (extra.prompt) params.set('prompt', extra.prompt);
  return `${protocol}//${window.location.host}/api/terminal?${params.toString()}`;
}
