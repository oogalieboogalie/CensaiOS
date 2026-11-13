import { useState } from 'react';
import './projectButtons.css';

export function ProjectButtons({ buttons = [], onRun }) {
  const [pending, setPending] = useState(null);
  const [shown, setShown] = useState(false);
  const held = buttons.find((button) => button.id === pending);

  const ask = (button) => {
    setPending(button.id);
    setShown(false);
  };
  const close = () => {
    setPending(null);
    setShown(false);
  };

  return (
    <section className="hb-jobs" aria-label="Things this project can do" onPointerDown={(event) => event.stopPropagation()}>
      <h2>Things this project can do</h2>
      {buttons.length === 0 && <p>This folder does not say what it can do yet.</p>}
      {buttons.map((button) => (
        <button key={button.id} type="button" className="hb-job" onClick={() => ask(button)}>
          <b>{button.label}</b>
          <span>{button.command}</span>
        </button>
      ))}
      {held && (
        <div className="hb-job-ask">
          <p>Nothing runs until you say so.</p>
          <code>{held.command}</code>
          {held.notice && <p>That runs {held.notice}.</p>}
          <div>
            {!shown && (
              <button type="button" className="hb-job-go" onClick={() => setShown(true)}>Show me first</button>
            )}
            {shown && (
              <button type="button" className="hb-job-go" onClick={() => { close(); onRun?.(held.command); }}>Run it</button>
            )}
            <button type="button" onClick={close}>Never mind</button>
          </div>
        </div>
      )}
    </section>
  );
}
