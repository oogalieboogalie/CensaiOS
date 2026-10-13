// Turns a sheet range into chart series. The first column holds labels when
// it is text; the first row holds series names when it is text. Pure.
import { addr, parseRange } from './cellRef.js';

const isText = (v) => typeof v === 'string' && v.trim() !== '';

export function chartData(rangeText, valueAt) {
  const range = parseRange(rangeText);
  if (!range) return { labels: [], series: [] };
  const grid = [];
  for (let r = range.r1; r <= Math.min(range.r2, range.r1 + 200); r += 1) {
    const row = [];
    for (let c = range.c1; c <= Math.min(range.c2, range.c1 + 12); c += 1) row.push(valueAt(addr(c, r)));
    grid.push(row);
  }
  const width = grid[0]?.length || 0;
  const headerRow = grid[0]?.slice(1).some(isText) || (width === 1 && isText(grid[0]?.[0]));
  const labelCol = width > 1 && grid.slice(headerRow ? 1 : 0).some((row) => isText(row[0]));
  const body = headerRow ? grid.slice(1) : grid;
  const firstSeries = labelCol ? 1 : 0;
  const labels = body.map((row, i) => (labelCol ? String(row[0] ?? '') : String(i + 1)));
  const series = [];
  for (let c = firstSeries; c < width; c += 1) {
    const values = body.map((row) => (typeof row[c] === 'number' ? row[c] : 0));
    if (!body.some((row) => typeof row[c] === 'number')) continue;
    series.push({ name: headerRow ? String(grid[0][c] ?? `Series ${c + 1}`) : `Series ${series.length + 1}`, values });
  }
  return { labels, series };
}
