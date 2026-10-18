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

    // A built file that is not here (a window still on an older build asking
    // for its old chunks) is a 404, never the page: the page would load as
    // a script and leave the board blank instead of reloading.
    app.get(/^\/assets\//, (_req, res) => {
      res.status(404).type('text/plain').send('Not found');
    });

    // SPA fallback
    app.get(/.*/, (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}
