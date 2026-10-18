import React from 'react';
import { CENSAI_TOUR } from '../../lib/censai/tour.js';

// "Show me around": Censai walks through the board one short card at a
// time. Back / Next / Done, and a step may fire an event (open the Add menu)
// so the person sees the thing being explained.
export function CensaiTour({ onDone }) {
  const [index, setIndex] = React.useState(0);
  const step = CENSAI_TOUR[index];
  const last = index === CENSAI_TOUR.length - 1;

  return (
    <section className="hb-censai-tour" data-testid="censai-tour" data-tour-step={step.id} aria-live="polite">
      <span className="hb-censai-tour-count">{index + 1} of {CENSAI_TOUR.length}</span>
      <h3 className="hb-censai-tour-title">{step.title}</h3>
      <p className="hb-censai-tour-body">{step.body}</p>
      {step.action && (
        <button
          type="button"
          className="hb-censai-link"
          onClick={() => window.dispatchEvent(new CustomEvent(step.action.event))}
        >
          {step.action.label}
        </button>
      )}
      <div className="hb-censai-tour-nav">
        <button type="button" className="hb-censai-ghost" onClick={onDone}>
          {last ? 'Close' : 'Skip'}
        </button>
        <span style={{ flex: 1 }} />
        {index > 0 && (
          <button type="button" className="hb-censai-ghost" onClick={() => setIndex(index - 1)}>Back</button>
        )}
        <button
          type="button"
          className="hb-censai-primary"
          onClick={() => (last ? onDone() : setIndex(index + 1))}
        >
          {last ? 'Done' : 'Next'}
        </button>
      </div>
    </section>
  );
}
