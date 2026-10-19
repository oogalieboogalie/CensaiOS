import React from 'react';
import { Icon } from './Icons.jsx';
import { WindowTitle } from './Windows.jsx';
import { claimKeyboard, releaseKeyboard } from '../lib/keyboardClaim.js';
import { useMusic, MusicEmbed, EjectIcon, PauseIcon, PlayIcon, SpeakerIcon } from './music/index.js';
import { formatTime, seedFromString, skinFor, SOURCE_TAGS, VISUALIZER_LABELS } from './music/musicSkins.js';
import { estimateKbps } from './music/musicLibrary.js';
import { MusicVisualizer } from './music/MusicVisualizer.jsx';
import { LibraryScreen, AddPanel } from './music/MusicLibrary.jsx';
import {
  ClickWheel, DeviceKey, DeviceScreen, DeviceShell, LcdLine, Marquee, ProgressBar, VolumeOverlay, useElementHeight,
} from './music/MusicDevice.jsx';

// Below this device height the click wheel folds into a row of keys.
const COMPACT_HEIGHT = 360;

const isTyping = (el) => el && (el.tagName === 'INPUT' || el.tagName === 'TEXTAREA' || el.isContentEditable);

export function MusicWindow({ win, onUpdate }) {
  const music = useMusic({ win, onUpdate });
  const [tab, setTab] = React.useState(music.mode === 'local' ? 'usb' : 'stations');
  const fileRef = React.useRef(null);
  const deviceRef = React.useRef(null);
  const height = useElementHeight(deviceRef);
  const compact = height > 0 && height < COMPACT_HEIGHT;
  const library = music.view === 'library';
  const skin = skinFor(library ? (tab === 'usb' ? 'local' : 'generic') : music.source);
  const playing = Boolean(music.mode) && !music.paused;

  const addFiles = (files) => {
    const added = music.usb.addFiles(files);
    if (added.length > 0) { setTab('usb'); music.playUsb(added[0].id); }
  };

  const claimId = `music:${win.id || 'window'}`;
  React.useEffect(() => () => releaseKeyboard(claimId), [claimId]);
  const onKeyDown = (e) => {
    if (isTyping(e.target)) return;
    const keys = {
      ' ': () => music.togglePlayback(),
      ArrowLeft: () => (e.shiftKey ? music.seekBy(-10) : music.prev()),
      ArrowRight: () => (e.shiftKey ? music.seekBy(10) : music.next()),
      ArrowUp: () => music.nudgeVolume(5),
      ArrowDown: () => music.nudgeVolume(-5),
      m: () => music.toggleMute(),
      v: () => music.cycleVisualizer(),
      Escape: () => { releaseKeyboard(claimId); e.currentTarget.blur(); },
    };
    const run = keys[e.key];
    if (!run) return;
    e.preventDefault();
    e.stopPropagation();
    run();
  };

  return (
    <>
      <WindowTitle
        icon={<Icon.Music size={14} />}
        label="Music Player"
        subtitle={music.mode ? (music.mode === 'local' ? 'USB' : 'Now Playing') : 'Select a track'}
      />
      <div className="hb-music">
        <DeviceShell
          ref={deviceRef}
          skin={skin}
          source={library ? 'library' : music.source}
          playing={playing}
          onFiles={addFiles}
          tabIndex={0}
          aria-label="Music player. Space plays or pauses, arrows change track and volume."
          onFocus={() => claimKeyboard(claimId)}
          onBlur={(e) => { if (!e.currentTarget.contains(e.relatedTarget)) releaseKeyboard(claimId); }}
          onKeyDown={onKeyDown}
        >
          <DeviceScreen className={library ? 'hb-music-screen-list' : ''} style={{ minHeight: compact ? 120 : 150 }}>
            {library ? <LibraryScreen music={music} tab={tab} setTab={setTab} /> : <StatusRow music={music} />}
            {/* One stage in one place, so MENU and back never reload the stream. */}
            <Stage music={music} compact={compact} offscreen={library} />
            {!library && <Readout music={music} />}
            <VolumeOverlay volume={music.volume} muted={music.muted} shownAt={music.volumeShownAt} />
          </DeviceScreen>

          {library
            ? <AddPanel music={music} tab={tab} onPickFiles={() => fileRef.current?.click()} />
            : <Controls music={music} compact={compact} />}
          <input
            ref={fileRef}
            type="file"
            accept="audio/*,.mp3,.m4a,.wav,.ogg,.flac"
            multiple
            hidden
            data-music-file-input="true"
            onChange={(e) => { addFiles(e.target.files); e.target.value = ''; }}
          />
        </DeviceShell>
      </div>
    </>
  );
}

const showsEmbed = (music) => music.mode === 'stream' && !music.direct && music.stream.embedVisible;

function StatusRow({ music }) {
  const { progress, source, usbTrack } = music;
  const playing = !music.paused;
  const kbps = usbTrack ? estimateKbps(usbTrack.size, progress.duration) : 0;
  return (
    <div className="hb-music-status">
      {playing ? <PlayIcon size={8} /> : <PauseIcon size={8} />}
      <LcdLine size="xs">{playing ? 'PLAYING' : 'PAUSED'}</LcdLine>
      <LcdLine size="xs" dim>· {SOURCE_TAGS[source] || 'MP3'}{kbps ? ` · ${kbps}KBPS` : ''}</LcdLine>
      <span className="hb-music-spacer" />
      <LcdLine size="xxs" dim>{showsEmbed(music) ? 'SCREEN' : VISUALIZER_LABELS[music.visMode]}</LcdLine>
    </div>
  );
}

function Stage({ music, compact, offscreen }) {
  const { stream, source, usbTrack } = music;
  const playing = Boolean(music.mode) && !music.paused;
  const seed = React.useMemo(() => seedFromString(usbTrack?.id || music.streamSrc), [usbTrack?.id, music.streamSrc]);
  const showEmbed = !offscreen && showsEmbed(music);
  const hint = stageHint(music, showEmbed);
  return (
    <div className="hb-music-stage" data-offscreen={offscreen ? 'true' : undefined} style={{ minHeight: compact ? 36 : 70 }}>
      {music.mode === 'stream' && !music.direct && (
        <MusicEmbed ref={stream.frameRef} src={music.streamSrc} title={music.title} visible={showEmbed} onLoad={stream.handleFrameLoad} />
      )}
      {!offscreen && !showEmbed && (
        <MusicVisualizer mode={music.visMode} skin={skinFor(source)} playing={playing} seed={seed} signal={music.signal} onClick={music.cycleVisualizer} />
      )}
      {!offscreen && hint && <LcdLine size="xxs" className="hb-music-hint">{hint}</LcdLine>}
    </div>
  );
}

function stageHint(music, showEmbed) {
  if (music.linkProblem) return "CAN'T PLAY THIS LINK";
  if (music.direct && music.mode === 'stream' && !music.paused && !music.signal) return 'VISUALIZER IS GUESSING FOR THIS SITE';
  if (music.stream.kind === 'spotify' && music.mode === 'stream' && music.paused && !showEmbed) return 'Press SCREEN for Spotify controls';
  return null;
}

function Readout({ music }) {
  const { progress, title } = music;
  return (
    <div className="hb-music-readout">
      <Marquee text={title} />
      <ProgressBar position={progress.position} duration={progress.duration} onSeek={music.controllable ? music.seekTo : null} />
      <div className="hb-music-times">
        <LcdLine size="xs">{formatTime(progress.position)}</LcdLine>
        <LcdLine size="xs" dim>
          {progress.duration ? `-${formatTime(progress.duration - progress.position)}` : 'LIVE'}
        </LcdLine>
      </div>
    </div>
  );
}

function Controls({ music, compact }) {
  const { paused, controllable } = music;
  return (
    <>
      {!compact && (
        <ClickWheel
          paused={paused}
          disabled={!controllable}
          canStep={music.canStep}
          onMenu={() => music.setView('library')}
          onPrev={music.prev}
          onNext={music.next}
          onVis={music.cycleVisualizer}
          onToggle={music.togglePlayback}
          onVolume={music.nudgeVolume}
        />
      )}
      <div className="hb-music-keys">
        {compact && (
          <>
            <DeviceKey title="Library" onClick={() => music.setView('library')}>MENU</DeviceKey>
            <DeviceKey title={paused ? 'Play' : 'Pause'} onClick={music.togglePlayback} disabled={!controllable} active>
              {paused ? <PlayIcon size={10} /> : <PauseIcon size={10} />}
            </DeviceKey>
          </>
        )}
        {music.mode === 'stream' && !music.direct && (
          <DeviceKey title="Show the source player on the screen" active={music.stream.embedVisible} onClick={() => music.stream.setEmbedVisible(v => !v)}>
            SCREEN
          </DeviceKey>
        )}
        <DeviceKey title={music.muted ? 'Unmute (just for you)' : 'Mute (just for you)'} active={music.muted} onClick={music.toggleMute}>
          <SpeakerIcon size={11} muted={music.muted} />
        </DeviceKey>
        <DeviceKey title="Eject" onClick={music.eject}><EjectIcon /></DeviceKey>
      </div>
    </>
  );
}
