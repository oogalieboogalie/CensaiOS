import React, { useRef, useCallback } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { ClipboardAddon } from '@xterm/addon-clipboard';
import { WebLinksAddon } from '@xterm/addon-web-links';
import '@xterm/xterm/css/xterm.css';
import { createLogger } from '../../lib/logger.js';
import {
  getTerminalSocketUrl,
  installTerminalInteractionBridge,
} from './terminalInteractions.js';
import { openTerminalSocket, stillSignedIn } from './terminalSocket.js';
import { terminalFont, whenGlowFontReady } from './terminalGlow.js';
import { logToApp } from '../../lib/appLog/browserLog.js';

const log = createLogger('terminal');

// One shell in a terminal window. A window with tabs runs one of these per
// tab: `tab.sessionId` picks the shell, and only the window's first tab runs
// the window's CLI or agent run (the others are plain shells).
export function useTerminal(hostRef, win, cwd, theme, workspaceId, tab = {}) {
  const sessionId = tab.sessionId || win.agentSessionId || win.id;
  const launchCli = tab.plain ? undefined : win.launchCli;
  const agentPrompt = tab.plain ? undefined : win.agentRun?.prompt;
  const glow = Boolean(win.terminalGlow);
  const termRef = useRef(null);
  const socketRef = useRef(null);
  const fitAddonRef = useRef(null);
  const replayingScrollbackRef = useRef(false);
  
  const agentEnabled = Boolean(win.agentEnabled);
  const attachedAgents = win.attachedAgents || [];
  const bindStateRef = useRef(null);
  bindStateRef.current = { agentEnabled, agentIds: attachedAgents };
  
  const sendBind = useCallback(() => {
    socketRef.current?.send({ type: 'bind', ...bindStateRef.current });
  }, []);

  React.useEffect(() => {
    if (!hostRef.current) return undefined;

    const term = new Terminal({
      cursorBlink: true,
      convertEol: true,
      ...terminalFont(glow, theme.fontSize, win.fontScale),
      lineHeight: 1.25,
      // eslint-disable-next-line no-restricted-syntax -- xterm needs a parseable transparent color for its canvas theme
      theme: win.opacity !== undefined ? { ...theme, background: 'rgba(0,0,0,0)' } : theme,
      allowProposedApi: true,
      rightClickSelectsWord: true,
      trimTrailingWhitespace: true,
    });
    const fitAddon = new FitAddon();
    term.loadAddon(fitAddon);
    fitAddonRef.current = fitAddon;
    const clipboardAddon = new ClipboardAddon();
    term.loadAddon(clipboardAddon);
    // Open clickable links (auth URLs, etc.) in the browser
    term.loadAddon(new WebLinksAddon((e, uri) => {
      e.preventDefault();
      window.open(uri, '_blank', 'noopener,noreferrer');
    }));
    term.open(hostRef.current);
    const cleanupInteractions = installTerminalInteractionBridge(term, hostRef.current);
    // Just opened by an Alt hotkey: type straight into the CLI, no click needed.
    if (launchCli && Date.now() - Date.parse(win.createdAt || 0) < 5000) term.focus();

    termRef.current = term;

    // Alt hotkeys open a terminal straight into a coding CLI (win.launchCli).
    const agentRun = agentPrompt ? { agent: 'opencode', prompt: agentPrompt } : { cli: launchCli || undefined };
    const socketUrl = getTerminalSocketUrl(cwd, sessionId, workspaceId, agentRun);
    log.debug('connecting', { cwd });
    const sendSize = () => link.send({ type: 'resize', cols: term.cols, rows: term.rows });
    const link = openTerminalSocket(socketUrl, {
      onOpen(isReconnect) {
        log.info('socket open', { cwd, isReconnect });
        if (!isReconnect) term.writeln('Connecting to shell…');
        sendBind();
        sendSize();
      },
      onRefused(refusal) {
        logToApp('warn', `terminal refused: ${refusal.reason || 'unknown'}`, { detail: refusal.message || '' });
        const sentences = String(refusal.message || 'censaiOS would not open this terminal.').split(/(?<=\.)\s+/);
        for (const line of sentences) term.writeln(`\x1b[33m${line}\x1b[0m`);
        term.writeln('\x1b[2mPress Enter to try again.\x1b[0m');
      },
      onMessage(event, isReconnect) {
        try {
          const message = JSON.parse(event.data);
          if (message.type === 'meta' && message.backend) {
            log.info('backend connected', { backend: message.backend });
            if (isReconnect) term.writeln(`\x1b[2mReconnected.\x1b[0m`);
            else term.writeln(message.cli ? `Starting ${message.backend}…` : `Connected — ${message.backend}.`);
            if (message.note && !isReconnect) term.writeln(`\x1b[2m${message.note}\x1b[0m`);
          }
          if (message.type === 'output') {
            if (message.replay) {
              // Same shell after a drop: redraw its screen instead of
              // printing everything twice.
              if (isReconnect) term.reset();
              replayingScrollbackRef.current = true;
              term.write(message.data, () => { replayingScrollbackRef.current = false; });
            } else {
              term.write(message.data);
            }
          }
          if (message.type === 'exit') {
            log.info('shell exited', { code: message.code ?? 0 });
            term.writeln(`\r\nProcess exited with code ${message.code ?? 0}. Press Enter to start it again.`);
          }
        } catch {
          term.write(String(event.data || ''));
        }
      },
      onDrop(attempt, delay) {
        log.info('socket closed, reconnecting', { cwd, attempt, delay });
        if (attempt === 0) term.writeln('\r\n\x1b[2mConnection lost. Reconnecting…\x1b[0m');
        if (attempt === 0 || attempt === 3) {
          // The owner-only refusal now comes from the server itself
          // (onRefused); here only "signed out" is worth saying.
          stillSignedIn().then((signedIn) => {
            if (termRef.current !== term || signedIn || attempt !== 3) return;
            term.writeln('\x1b[33mYou are signed out. Sign in again and this terminal reconnects.\x1b[0m');
          });
        }
      },
    });
    socketRef.current = link;

    const inputDisposable = term.onData((data) => {
      if (replayingScrollbackRef.current) return;
      if (data === '\r' && !link.isOpen() && (link.hasExited() || link.isWaiting())) {
        link.reconnectNow();
        return;
      }
      link.send({ type: 'input', data });
    });

    const resize = () => {
      // A hidden tab has no size; fitting it would shrink its shell to one
      // column. It fits again when it is shown.
      if (!hostRef.current || !hostRef.current.clientWidth) return;
      try {
        fitAddon.fit();
      } catch {
        return;
      }
      sendSize();
    };
    const observer = new ResizeObserver(resize);
    observer.observe(hostRef.current);
    resize();

    return () => {
      cleanupInteractions();
      observer.disconnect();
      inputDisposable.dispose();
      link.close();
      term.dispose(); // also cleans up key handlers, addons, etc.
      termRef.current = null;
      socketRef.current = null;
      fitAddonRef.current = null;
    };
  }, [cwd, win.id, sessionId, agentPrompt, launchCli, workspaceId, sendBind]);

  // Live-apply color changes (canvas theme follows, terminal settings
  // tweaks) without tearing down the shell session.
  React.useEffect(() => {
    const term = termRef.current;
    if (!term) return;
    // eslint-disable-next-line no-restricted-syntax -- xterm needs a parseable transparent color for its canvas theme
    term.options.theme = win.opacity !== undefined ? { ...theme, background: 'rgba(0,0,0,0)' } : theme;
  }, [theme, win.opacity]);

  React.useEffect(() => {
    sendBind();
  }, [agentEnabled, attachedAgents.join(','), sendBind]);

  React.useEffect(() => {
    const term = termRef.current;
    if (!term) return undefined;
    let cancelled = false;
    const apply = (fontArrived) => {
      if (cancelled || termRef.current !== term) return;
      const font = terminalFont(glow, theme.fontSize, win.fontScale);
      // Setting the same family again is ignored, so step off it first to
      // make xterm re-measure with the font that just arrived.
      if (fontArrived) term.options.fontFamily = 'monospace';
      term.options.fontFamily = font.fontFamily;
      term.options.fontSize = font.fontSize;
      term.options.fontWeightBold = font.fontWeightBold;
      if (fitAddonRef.current && hostRef.current?.clientWidth) {
        try {
          fitAddonRef.current.fit();
          socketRef.current?.send({ type: 'resize', cols: term.cols, rows: term.rows });
        } catch (err) {
          log.warn('Failed to resize terminal on font change', err);
        }
      }
    };
    // Glow: re-measure once the pixel font has arrived (and right away, so
    // the change shows even if it is still loading).
    apply(false);
    if (glow) whenGlowFontReady().then(() => apply(true));
    return () => { cancelled = true; };
  }, [win.fontScale, theme.fontSize, glow]);

  return { termRef };
}
