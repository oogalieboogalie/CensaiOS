import express from 'express';
import path from 'path';

export function setupProductionServing(app, __dirname) {
  if (process.env.NODE_ENV === 'production') {
    const distPath = path.join(__dirname, 'dist');
    app.use(express.static(distPath));

    // SPA fallback
    app.get(/.*/, (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }
}
