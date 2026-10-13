import express from 'express';
import path from 'path';
import { playgroundHeaders } from './playgroundAssets.js';
import { doorClosedPage } from '../webOs/closedPage.js';

export function setupProductionServing(app, __dirname) {
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, 'dist');
    // Game playground runtimes load from a sandboxed (opaque-origin) frame.
    app.use(playgroundHeaders);
    // Open anywhere is off: another computer gets a page saying how to turn it on.
    app.use(doorClosedPage);
    app.use(express.static(distPath));

    // SPA fallback
    app.get(/.*/, (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}
