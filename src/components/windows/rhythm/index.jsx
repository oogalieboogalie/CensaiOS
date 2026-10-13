/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { WindowTitle } from '../WindowTitle.jsx';
import { Icon } from '../../Icons.jsx';
import { SONGS, songById } from '../../../lib/games/rhythm/songs.js';
import { DIFFICULTIES } from '../../../lib/games/rhythm/sequence.js';
import { leaderboard } from '../../../lib/games/rhythm/progress.js';
import { windowMeta } from './meta.js';
import { KEY_LABELS, useRhythm } from './useRhythm.js';

export { windowMeta };

function Leaderboard({ rows, field, title }) {
  return (
    <div className="hb-game-board" data-testid="rhythm-board">
      <div className="hb-game-board-head">{title}</div>
      {rows.length === 0
        ? <div className="hb-game-muted">No scores yet. Set the first one.</div>
        : (
          <ol>
            {rows.map((row, i) => (
              <li key={row.field} data-self={row.field === field ? 'true' : undefined}>
                <span className="hb-game-rank">{i + 1}</span>
                <span className="hb-game-board-name">{row.name}</span>
                <span className="hb-rhythm-grade">{row.grade}</span>
                <span className="hb-game-num">{row.score.toLocaleString('en-US')}</span>
              </li>
            ))}
          </ol>
        )}
    </div>
  );
}

function OnStage({ rows }) {
  if (!rows.length) return null;
  return (
    <div className="hb-game-board" data-testid="rhythm-live">
      <div className="hb-game-board-head">Playing now</div>
      <ol>
        {rows.map((row) => (
          <li key={row.field}>
            <span className="hb-game-dot" />
            <span className="hb-game-board-name">{row.name}</span>
            <span className="hb-game-muted">{row.combo > 1 ? `${row.combo}×` : ''}</span>
            <span className="hb-game-num">{row.score.toLocaleString('en-US')}</span>
          </li>
        ))}
      </ol>
    </div>
  );
}

function Menu({ game }) {
  const fileRef = React.useRef(null);
  return (
    <div className="hb-rhythm-menu" data-no-drag>
      <div className="hb-game-board-head">Song</div>
      <div className="hb-rhythm-songs" role="radiogroup" aria-label="Song">
        {SONGS.map((s) => (
          <button key={s.id} type="button" role="radio" aria-checked={game.songId === s.id} className="hb-rhythm-song"
            onClick={() => game.setSongId(s.id)} data-testid={`rhythm-song-${s.id}`}>
            <span className="hb-rhythm-song-title">{s.title}</span>
            <span className="hb-game-muted">{s.mood} · {s.bpm} bpm</span>
          </button>
        ))}
        <button type="button" role="radio" aria-checked={game.songId === 'custom'} className="hb-rhythm-song"
          onClick={() => (game.custom ? game.setSongId('custom') : fileRef.current?.click())} data-testid="rhythm-song-custom">
          <span className="hb-rhythm-song-title">{game.custom ? game.custom.name : 'Your own track'}</span>
          <span className="hb-game-muted">{game.custom ? 'Charted from your file' : 'Pick an audio file and it gets charted'}</span>
        </button>
        <input ref={fileRef} type="file" accept="audio/*" hidden data-testid="rhythm-file"
          onChange={(e) => { game.loadFile(e.target.files?.[0]); e.target.value = ''; }} />
        {game.custom && <button type="button" className="hb-game-link" onClick={() => fileRef.current?.click()}>Choose another file</button>}
        {game.customNote && <div className="hb-game-muted" role="status">{game.customNote}</div>}
      </div>
      <div className="hb-game-board-head">Difficulty</div>
      <div className="hb-rhythm-diffs" role="radiogroup" aria-label="Difficulty">
        {DIFFICULTIES.map((d) => (
          <button key={d.id} type="button" role="radio" aria-checked={game.difficulty === d.id} className="hb-rhythm-diff"
            onClick={() => game.setDifficulty(d.id)}>{d.label}</button>
        ))}
      </div>
      {game.canPlay
        ? (
          <div className="hb-rhythm-go">
            <button type="button" className="hb-btn" data-primary="true" onClick={() => game.start()} data-testid="rhythm-play"
              disabled={game.songId === 'custom' && !game.custom}>Play</button>
            <button type="button" className="hb-btn" onClick={game.playTogether} disabled={game.songId === 'custom'}
              title={game.songId === 'custom' ? 'Everyone needs the same song. Pick a built-in one.' : 'Start a countdown for everyone on the board'}
              data-testid="rhythm-together">Play together</button>
          </div>
        )
        : <p className="hb-game-muted">You can watch the scores. Ask for an edit link to play.</p>}
      <label className="hb-game-volume">Volume
        <input type="range" min="0" max="1" step="0.05" value={game.volume} onChange={(e) => game.setVolume(Number(e.target.value))} />
      </label>
      <div className="hb-game-keys">
        <span>{KEY_LABELS.map((k) => <span key={k} className="hb-kbd">{k}</span>)} hit the notes</span>
        <span><span className="hb-kbd">Esc</span> stop</span>
      </div>
    </div>
  );
}

function Results({ result, onAgain, onMenu, rows, field }) {
  return (
    <div className="hb-game-scrim" data-testid="rhythm-results">
      <div className="hb-game-card" data-no-drag onClick={(e) => e.stopPropagation()}>
        <div className="hb-rhythm-result-head">
          <div>
            <div className="hb-game-title">{result.title}</div>
            <div className="hb-game-muted">{result.accuracy}% accuracy · best combo {result.maxCombo}</div>
          </div>
          <div className="hb-rhythm-big-grade" data-testid="rhythm-grade">{result.grade}</div>
        </div>
        <div className="hb-rhythm-score hb-game-num" data-testid="rhythm-score">{result.score.toLocaleString('en-US')}</div>
        <div className="hb-rhythm-counts">
          <span><strong className="hb-game-num">{result.counts.perfect}</strong> perfect</span>
          <span><strong className="hb-game-num">{result.counts.great}</strong> great</span>
          <span><strong className="hb-game-num">{result.counts.ok}</strong> ok</span>
          <span><strong className="hb-game-num">{result.counts.miss}</strong> missed</span>
        </div>
        <button type="button" className="hb-btn" data-primary="true" onClick={onAgain} autoFocus>Play again</button>
        <button type="button" className="hb-btn" onClick={onMenu}>Pick another song</button>
        <Leaderboard rows={rows} field={field} title="Best on this board" />
      </div>
    </div>
  );
}

/**
 * Rhythm Run: notes slide down four lanes and you hit D, F, J and K as they
 * cross the line. Three built-in songs play on the window's own synth, or
 * any audio file gets charted on the spot. Scores and live runs show for
 * everyone on the board, and "Play together" starts one countdown for all.
 */
export function RhythmRunWindow({ win = {}, onUpdate }) {
  const game = useRhythm({ win, onUpdate });
  const { hud, phase } = game;
  const rows = leaderboard(game.players, phase === 'results' && game.result ? game.result.key : game.scoreKey);
  const subtitle = game.live.length ? `${game.live.length + (phase === 'playing' ? 1 : 0)} playing` : (phase === 'playing' ? game.songTitle : 'Games');
  return (
    <>
      <WindowTitle
        icon={<Icon.Music size={14} />}
        label={win.title || windowMeta.label}
        subtitle={subtitle}
        actions={[phase === 'playing' && { id: 'stop', label: null, title: 'Stop (Esc)', icon: <Icon.Stop size={14} />, onSelect: game.stop }]}
      />
      <div ref={game.containerRef} className="hb-rhythm" tabIndex={-1} data-testid="rhythm-run" data-phase={phase}>
        <div className="hb-rhythm-stage">
          <canvas ref={game.canvasRef} className="hb-game-canvas" aria-label="Note highway" />
          {phase === 'playing' && (
            <>
              <div className="hb-rhythm-hud" data-testid="rhythm-hud">
                <span className="hb-game-num hb-rhythm-hud-score">{hud.score.toLocaleString('en-US')}</span>
                <span className="hb-rhythm-mult" data-mult={hud.mult}>{hud.mult}×</span>
                <span className="hb-game-muted hb-game-num">{hud.combo > 1 ? `${hud.combo} combo` : ''}</span>
              </div>
              <div className="hb-rhythm-progress"><span style={{ width: `${hud.progress * 100}%` }} /></div>
              {hud.countdown > 0 && <div className="hb-rhythm-count" aria-live="polite">{hud.countdown}</div>}
              {hud.last && <div className="hb-rhythm-judge" data-kind={hud.last.kind} key={hud.last.at}>{hud.last.kind === 'miss' ? 'Miss' : hud.last.label}</div>}
              <div className="hb-rhythm-pads" aria-label="Lanes">
                {KEY_LABELS.map((k, lane) => (
                  <button key={k} type="button" className="hb-rhythm-pad" data-lane={lane}
                    onPointerDown={(e) => { e.preventDefault(); game.pressLane(lane, true); }}
                    onPointerUp={() => game.pressLane(lane, false)} onPointerLeave={() => game.pressLane(lane, false)}>{k}</button>
                ))}
              </div>
            </>
          )}
          {phase === 'menu' && game.pendingMatch && (
            <div className="hb-rhythm-invite" role="status" data-testid="rhythm-invite">
              <span>{game.pendingMatch.by || 'Someone'} is starting {songById(game.pendingMatch.song)?.title || 'a song'} ({DIFFICULTIES.find((d) => d.id === game.pendingMatch.difficulty)?.label}) for everyone in {game.secondsToMatch}s.</span>
              {game.canPlay && <button type="button" className="hb-btn" data-primary="true" onClick={game.joinMatch} data-testid="rhythm-join">Join</button>}
            </div>
          )}
          {phase === 'results' && game.result && (
            <Results result={game.result} rows={rows} field={game.field}
              onAgain={() => game.start()} onMenu={() => game.setPhase('menu')} />
          )}
        </div>
        <aside className="hb-rhythm-side">
          {phase === 'playing'
            ? (
              <div className="hb-rhythm-now">
                <div className="hb-game-title">{game.songTitle}</div>
                <div className="hb-game-muted">{DIFFICULTIES.find((d) => d.id === game.difficulty)?.label}</div>
              </div>
            )
            : <Menu game={game} />}
          <OnStage rows={game.live} />
          {phase !== 'results' && <Leaderboard rows={rows} field={game.field} title={`Best: ${game.songTitle} · ${DIFFICULTIES.find((d) => d.id === game.difficulty)?.label}`} />}
        </aside>
      </div>
    </>
  );
}
