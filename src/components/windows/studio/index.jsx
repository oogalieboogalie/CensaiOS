/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { WindowTitle } from '../WindowTitle.jsx';
import { Icon } from '../../Icons.jsx';
import { windowMeta } from './meta.js';
import { useStudio } from './useStudio.js';
import { useStudioAudio } from './useStudioAudio.js';
import { useTick } from './ticker.js';
import { Transport } from './Transport.jsx';
import { Timeline } from './Timeline.jsx';
import { Mixer } from './Mixer.jsx';
import { FxPanel } from './FxPanel.jsx';
import { PianoRoll } from './PianoRoll.jsx';
import { useStudioActions } from './useStudioActions.js';
import { useStudioAssist } from './useStudioAssist.js';
import { useHumTrack } from './useHumTrack.js';
import { AssistBar } from './AssistBar.jsx';

export { windowMeta };

/**
 * Studio: a multitrack music workstation on the canvas. Audio and synth
 * tracks, a piano roll, a mixer, insert effects per track and on the master,
 * a key and scale, humming a tune into a track, a box that asks the person's
 * own model to change a track, and export to WAV or a project file. The song
 * is shared on the window record; each person plays it back on their own speakers.
 */
export function StudioWindow({ win = {}, onUpdate }) {
  const studio = useStudio({ win, onUpdate });
  const { project } = studio;
  const audio = useStudioAudio(project);
  const playing = useTick(audio.ticker, s => s.playing);
  const [zoom, setZoom] = React.useState(28);
  const [selection, setSelection] = React.useState({ trackId: project.tracks[0]?.id || 'master', clipId: null });
  const [tab, setTab] = React.useState('mixer');
  const [editing, setEditing] = React.useState(null); // { trackId, clipId }
  const actions = useStudioActions({ studio, audio, selection, setSelection, setTab, setEditing });

  const editTrack = editing && project.tracks.find(t => t.id === editing.trackId);
  const editClip = editTrack?.clips.find(c => c.id === editing.clipId);
  const panelTrack = selection.trackId === 'master' || project.tracks.some(t => t.id === selection.trackId) ? selection.trackId : 'master';
  const beat = React.useCallback(() => audio.ticker.get().beat, [audio.ticker]);
  const assist = useStudioAssist({ studio, trackId: panelTrack, beat });
  const hum = useHumTrack({ studio, audio, beat, flash: actions.flash, onDone: t => t && setSelection({ trackId: t.id, clipId: null }) });
  const target = project.tracks.find(t => t.id === panelTrack) || { name: 'Master', kind: 'master', color: 'master' };

  const header = [
    { id: 'wav', label: actions.exporting ? `Rendering ${Math.round(actions.exporting * 100)}%` : 'Export WAV', icon: <Icon.Download size={14} />, onSelect: actions.exportMix },
  ];
  const menu = [
    { id: 'json', label: 'Save project file', onSelect: actions.saveProject },
    { id: 'open', label: 'Open project file', onSelect: actions.openProject },
    { id: 'audio', label: 'Add audio files', onSelect: actions.pickAudio },
    { id: 'stems', label: 'Add stems (a track each)', onSelect: actions.pickStems },
    { id: 'new', label: 'Start a new song', onSelect: actions.newSong },
  ];

  return (
    <>
      <WindowTitle icon={<Icon.Music size={14} />} label={win.title || windowMeta.label} subtitle={`${project.title} · ${project.bpm} BPM`} actions={header} menu={menu} />
      <div className="hb-studio" tabIndex={-1} onKeyDown={actions.onKeyDown} onFocus={actions.onFocus} onBlur={actions.onBlur} data-testid="studio">
        <Transport project={project} ticker={audio.ticker} playing={playing} recording={actions.recording}
          onPlay={actions.play} onStop={actions.stop} onRecord={actions.toggleRecord} canRecord={actions.canRecord}
          edit={studio.edit} setZoom={setZoom} />
        {(audio.error || actions.notice || audio.missing.length > 0) && (
          <div className="hb-studio-notice" role="status">
            {audio.error || actions.notice || `${audio.missing.length} audio ${audio.missing.length === 1 ? 'file is' : 'files are'} on another computer. Synth tracks play here; those clips stay silent until you open the project file.`}
          </div>
        )}
        <Timeline studio={studio} audio={audio} zoom={zoom} selection={selection} setSelection={setSelection}
          onOpenClip={(track, clip) => { if (clip.kind === 'midi') { setEditing({ trackId: track.id, clipId: clip.id }); setTab('editor'); } }}
          onDropFiles={actions.addFiles} hum={hum} />
        <AssistBar assist={assist} target={target} />
        <div className="hb-studio-panel">
          <div className="hb-studio-tabs" role="tablist">
            {[['mixer', 'Mixer'], ['fx', 'Effects'], ['editor', 'Piano roll']].map(([id, label]) => (
              <button key={id} type="button" role="tab" className="hb-studio-tab" aria-selected={tab === id} onClick={() => setTab(id)} data-testid={`studio-tab-${id}`}>{label}</button>
            ))}
          </div>
          <div className="hb-studio-panel-body">
            {tab === 'mixer' && <Mixer studio={studio} ticker={audio.ticker} selection={selection} setSelection={setSelection} />}
            {tab === 'fx' && <FxPanel studio={studio} trackId={panelTrack} ticker={audio.ticker} sampleRate={audio.sampleRate()} />}
            {tab === 'editor' && (editClip
              ? <PianoRoll studio={studio} track={editTrack} clip={editClip} onClose={() => setEditing(null)} />
              : <div className="hb-studio-empty">Double-click a synth clip to edit its notes.</div>)}
          </div>
        </div>
      </div>
    </>
  );
}
