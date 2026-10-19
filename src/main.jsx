// Must run first: on the try-it board it answers /api calls in the browser.
import './lib/demo/installDemo.js';
import React from 'react';
import ReactDOM from 'react-dom/client';
import './index.css';
import { ThemeProvider } from './components/Theme.jsx';
import { ErrorBoundary } from './components/ErrorBoundary.jsx';
import App from './app.jsx';
import { createLogger } from './lib/logger.js';
import { installBoardErrorCapture } from './lib/inbox/boardErrors.js';
import { DEMO } from './lib/demo/demoMode.js';
import { registerOfflineScreen, watchInstallOffer } from './lib/webOs.js';
import { isTeleprompterPage, TeleprompterPage } from './components/teleprompter/TeleprompterPage.jsx';
import { installSelfFixReporter } from './lib/selfFix/reporter.js';
import { installBrowserLog } from './lib/appLog/browserLog.js';
import { installStaleBuildReload } from './lib/appUpdate/staleBuild.js';
import { installRandomUuid } from './lib/ids/newId.js';

const log = createLogger('boot');

// Plain-http addresses (the laptop reaching the PC) have no crypto.randomUUID.
installRandomUuid();
// Count this browser's errors for the Inbox window.
installBoardErrorCapture();
// A window opened before an update reloads into the new build.
installStaleBuildReload();

// Catch-all so nothing fails silently in the browser console.
window.addEventListener('error', (e) => {
  log.error('uncaught error', { message: e.message, source: e.filename, line: e.lineno, col: e.colno });
});
window.addEventListener('unhandledrejection', (e) => {
  log.error('unhandled promise rejection', { reason: e.reason?.message || String(e.reason) });
});

log.info('app booting', { mode: import.meta.env?.MODE, dev: !!import.meta.env?.DEV });

// Prepend Express backend API URL for relative requests when the Tauri webview
// serves the bundled dist itself (tauri.localhost / tauri:). When the desktop
// app wraps a running server (e.g. the Docker site on :3002) relative requests
// already reach that server, so leave them alone.
const servedByTauri = window.location.protocol === 'tauri:' || window.location.hostname === 'tauri.localhost';
if ((window.__TAURI_INTERNALS__ || window.__TAURI__) && servedByTauri) {
  const originalFetch = window.fetch;
  window.fetch = function (input, init) {
    if (typeof input === 'string' && input.startsWith('/')) {
      input = 'http://localhost:3001' + input;
    }
    if (!init) init = {};
    init.credentials = 'include';
    return originalFetch(input, init);
  };
}

// Open anywhere: keep the browser's install offer, and show a censaiOS screen
// when the computer running it can't be reached.
// The try-it board has no computer behind it, so it skips both.
if (!DEMO) {
  // The board's errors and warnings go into censaiOS's log file. First, so
  // its own sends stay out of self-fix's list of recent steps.
  installBrowserLog();
  // Self-fix: errors go quietly to this computer's censaiOS as reports.
  installSelfFixReporter();
  watchInstallOffer();
  registerOfflineScreen();
}

// The Teleprompter pop-out (/?teleprompter=1) is the reader alone.
const Root = isTeleprompterPage() ? TeleprompterPage : App;

ReactDOM.createRoot(document.getElementById('app')).render(
  <ErrorBoundary>
    <ThemeProvider>
      <Root />
    </ThemeProvider>
  </ErrorBoundary>
);
