/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { cubeFaces, sceneBox, sceneCubes } from '../../../lib/games/blocks/iso.js';
import { tallest } from '../../../lib/games/blocks/yard.js';
import { SAMPLES } from '../../../lib/games/blocks/samples.js';

function Preview({ sample }) {
  const cubes = React.useMemo(() => sceneCubes(sample.stacks, sample.size), [sample]);
  return (
    <svg className="hb-blocks-sample-art" viewBox={sceneBox(sample.size, tallest(sample.stacks))} aria-hidden="true">
      {cubes.map((c) => {
        const f = cubeFaces(c.x, c.y, c.z);
        return (
          <g key={`${c.x}-${c.y}-${c.z}`} data-block={c.id}>
            {c.faces.left && <polygon points={f.left} className="hb-blocks-face" data-face="left" />}
            {c.faces.right && <polygon points={f.right} className="hb-blocks-face" data-face="right" />}
            {c.top && <polygon points={f.top} className="hb-blocks-face" data-face="top" />}
          </g>
        );
      })}
    </svg>
  );
}

/** A few sample builds to look at when you are out of ideas. */
export function Inspiration() {
  return (
    <details className="hb-blocks-ideas" data-testid="blocks-ideas">
      <summary>Need an idea?</summary>
      <div className="hb-blocks-samples">
        {SAMPLES.map((s) => (
          <figure key={s.id} className="hb-blocks-sample" data-testid={`blocks-sample-${s.id}`}>
            <Preview sample={s} />
            <figcaption><strong>{s.name}</strong><span className="hb-game-muted">{s.blurb}</span></figcaption>
          </figure>
        ))}
      </div>
    </details>
  );
}
