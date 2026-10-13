/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { SAMPLES, engineLabel } from '../../../lib/games/playground/catalog.js';
import { readPicked } from './usePlayground.js';

function EngineTag({ engine }) {
  return <span className="hb-play-engine" data-engine={engine}>{engineLabel(engine)}</span>;
}

/** Bundled samples, Godot's bring-your-own row, and open from file, folder or link. */
export function Picker({ game, onCancel }) {
  const fileRef = React.useRef(null);
  const folderRef = React.useRef(null);
  const [url, setUrl] = React.useState('');

  const pick = async (input) => {
    const files = input.files;
    if (!files?.length) return;
    const list = await readPicked(files);
    const first = files[0];
    const label = first.webkitRelativePath ? first.webkitRelativePath.split('/')[0] : first.name;
    input.value = '';
    game.chooseFiles(list, label);
  };

  return (
    <div className="hb-play-picker" data-testid="playground-picker" data-no-drag>
      <div className="hb-play-head">
        <span className="hb-play-label">Samples</span>
        {onCancel && <button type="button" className="hb-play-link" onClick={onCancel}>Back to the game</button>}
      </div>
      <ul className="hb-play-list">
        {SAMPLES.map((sample) => (
          <li key={sample.id} className="hb-play-row">
            <EngineTag engine={sample.engine} />
            <span className="hb-play-row-text">
              <span className="hb-play-row-title">{sample.title}</span>
              <span className="hb-play-row-body">{sample.blurb}</span>
            </span>
            <button type="button" className="hb-btn" data-testid={`playground-sample-${sample.id}`} onClick={() => game.chooseSample(sample.id)}>Play</button>
          </li>
        ))}
        <li className="hb-play-row">
          <EngineTag engine="godot" />
          <span className="hb-play-row-text">
            <span className="hb-play-row-title">Your Godot game</span>
            <span className="hb-play-row-body">Drop its Web export folder or .zip here, or paste a link. Export with Thread Support off to play it inside the window.</span>
          </span>
          <button type="button" className="hb-btn" onClick={() => folderRef.current?.click()}>Open folder</button>
        </li>
      </ul>

      <div className="hb-play-head"><span className="hb-play-label">Open your own</span></div>
      <div className="hb-play-open">
        <button type="button" className="hb-btn" disabled={game.busy} onClick={() => fileRef.current?.click()}>File</button>
        <button type="button" className="hb-btn" disabled={game.busy} onClick={() => folderRef.current?.click()}>Folder</button>
        <form className="hb-play-url" onSubmit={(e) => { e.preventDefault(); if (url.trim()) game.chooseUrl(url); }}>
          <input className="hb-play-input" type="url" inputMode="url" placeholder="Link to a game, .love or .zip" value={url}
            aria-label="Game link" data-testid="playground-url" onChange={(e) => setUrl(e.target.value)} />
          <button type="submit" className="hb-btn" disabled={!url.trim()}>Load</button>
        </form>
      </div>
      <p className="hb-play-note">
        LÖVE .love files and folders, Three.js scenes (.js or a page), Godot and other HTML5 exports. Games run sandboxed, away from your board.
        Files you open stay on this computer; teammates see the name and open their own copy.
      </p>
      {game.error && <p className="hb-play-error" role="alert">{game.error}</p>}
      <input ref={fileRef} type="file" hidden accept=".love,.zip,.html,.htm,.js,.mjs" data-testid="playground-file" onChange={(e) => pick(e.target)} />
      <input ref={folderRef} type="file" hidden multiple webkitdirectory="" directory="" data-testid="playground-folder" onChange={(e) => pick(e.target)} />
    </div>
  );
}
