/* eslint-disable no-unused-vars -- JSX references are not detected by the legacy lint config. */
import React from 'react';
import { fairHousingSegments } from '../../lib/realEstate/fairHousing.js';

/** Text with fair-housing hits underlined (danger = rewrite, warning = review). */
export function FairHousingText({ text, flags }) {
  return (
    <div className="re-copy">
      {fairHousingSegments(text, flags).map((segment, index) => (segment.flag
        ? <mark key={index} className={`re-mark ${segment.flag.severity}`} title={`${segment.flag.reason} ${segment.flag.suggestion}`}>{segment.text}</mark>
        : <React.Fragment key={index}>{segment.text}</React.Fragment>))}
    </div>
  );
}

/** The list of hits with why and what to write instead. */
export function FairHousingFlags({ flags = [], emptyText = 'No risky words found.' }) {
  if (!flags.length) return <div className="re-row"><span className="re-pill ok">Fair housing</span><span className="re-muted">{emptyText}</span></div>;
  return (
    <div>
      {flags.map((flag, index) => (
        <div key={`${flag.index}-${index}`} className="re-flag">
          <span className={`re-pill ${flag.severity === 'risk' ? 'risk' : 'warn'}`}>{flag.severity === 'risk' ? 'Rewrite' : 'Review'}</span>
          <span><strong>“{flag.term}”</strong> <span className="re-muted">{flag.reason}</span></span>
          <span />
          <span className="re-faint">{flag.suggestion}</span>
        </div>
      ))}
    </div>
  );
}
