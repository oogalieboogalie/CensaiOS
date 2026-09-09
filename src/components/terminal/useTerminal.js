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

const log = createLogger('terminal');

export function useTerminal(hostRef, win, cwd, theme, workspaceId) {
  const termRef = useRef(null);
  const socketRef = useRef(null);
  const fitAddonRef = useRef(null);
  const replayingScrollbackRef = useRef(false);
  
  const agentEnabled = Boolean(win.agentEnabled);
  const attachedAgents = win.attachedAgents || [];
  const bindStateRef = useRef(null);
  bindStateRef.current = { agentEnabled, agentIds: attachedAgents };
  
  const sendBind = useCallback(() => {
    const s = socketRef.current;
    if (s && s.readyState === 1) s.send(JSON.stringify({ type: 'bind', ...bindStateRef.current }));
  }, []);

  React.useEffect(() => {
    if (!hostRef.current) return undefined;

    const term = new Terminal({
      cursorBlink: true,
      convertEol: true,
      fontFamily: '"JetBrains Mono", ui-monospace, "SF Mono", Menlo, monospace',
      fontSize: Math.round((theme.fontSize || 13) * (win.fontScale || 1.0)),
      lineHeight: 1.25,
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

    termRef.current = term;

    const agentRun = win.agentRun?.prompt ? { agent: 'opencode', prompt: win.agentRun.prompt } : {};
    const socketUrl = getTerminalSocketUrl(cwd, win.agentSessionId || win.id, workspaceId, agentRun);
    const socket = new WebSocket(socketUrl);
    socketRef.current = socket;
    log.debug('connecting', { cwd });

    socket.addEventListener('open', () => {
      log.info('socket open', { cwd });
      term.writeln('Connecting to shell…');
      sendBind();
    });
    socket.addEventListener('message', (event) => {
      try {
        const message = JSON.parse(event.data);
        if (message.type === 'meta' && message.backend) {
          log.info('backend connected', { backend: message.backend });
          term.writeln(`Connected — ${message.backend}.`);
        }
        if (message.type === 'output') {
          if (message.replay) {
            replayingScrollbackRef.current = true;
            term.write(message.data, () => { replayingScrollbackRef.current = false; });
          } else {
            term.write(message.data);
          }
        }
        if (message.type === 'exit') {
          log.info('shell exited', { code: message.code ?? 0 });
          term.writeln(`\r\nProcess exited with code ${message.code ?? 0}.`);
        }
      } catch {
        term.write(String(event.data || ''));
      }
    });
    socket.addEventListener('close', () => {
      log.info('socket closed', { cwd });
      term.writeln('\r\nTerminal disconnected.');
    });
    socket.addEventListener('error', () => {
      log.error('socket error', { cwd, url: socketUrl });
      term.writeln('\r\nTerminal connection failed.');
    });

    const inputDisposable = term.onData((data) => {
      if (replayingScrollbackRef.current) return;
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'input', data }));
      }
    });

    const resize = () => {
      if (!hostRef.current) return;
      try {
        fitAddon.fit();
      } catch {
        return;
      }
      if (socket.readyState === WebSocket.OPEN) {
        socket.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
      }
    };
    const observer = new ResizeObserver(resize);
    observer.observe(hostRef.current);
    resize();

    return () => {
      cleanupInteractions();
      observer.disconnect();
      inputDisposable.dispose();
      socket.close();
      term.dispose(); // also cleans up key handlers, addons, etc.
      termRef.current = null;
      socketRef.current = null;
      fitAddonRef.current = null;
    };
  }, [cwd, theme, win.id, win.agentSessionId, win.agentRun?.prompt, workspaceId, sendBind]);

  React.useEffect(() => {
    sendBind();
  }, [agentEnabled, attachedAgents.join(','), sendBind]);

  React.useEffect(() => {
    const term = termRef.current;
    if (term) {
      const baseSize = theme.fontSize || 13;
      const scale = win.fontScale || 1.0;
      term.options.fontSize = Math.round(baseSize * scale);
      if (fitAddonRef.current) {
        try {
          fitAddonRef.current.fit();
          const socket = socketRef.current;
          if (socket && socket.readyState === 1) {
            socket.send(JSON.stringify({ type: 'resize', cols: term.cols, rows: term.rows }));
          }
        } catch (err) {
          log.warn('Failed to resize terminal on font scale change', err);
        }
      }
    }
  }, [win.fontScale, theme.fontSize]);

  return { termRef };
}
