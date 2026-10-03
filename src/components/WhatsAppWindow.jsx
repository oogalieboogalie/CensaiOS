/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { WebviewShellWindow, WHATSAPP_WEB_URL } from './WebviewShellWindow.jsx';

// Canonical `webview`-mode example: WhatsApp Web inside the shared webview
// shell, pre-filled. Single account for v0.1; Business API is out of scope.
export function WhatsAppWindow({ win, onUpdate }) {
  return (
    <WebviewShellWindow
      win={{ url: WHATSAPP_WEB_URL, title: 'WhatsApp', ...(win || {}) }}
      onUpdate={onUpdate}
      defaultUrl={WHATSAPP_WEB_URL}
      title="WhatsApp"
    />
  );
}
