import React from 'react';
import { guessLinkKind, logTriedKind } from './linkAudio.js';
import { tryLinkKind } from './tryLinkKind.js';

// When the address guess is unknown, the Music window plays the link in its
// own audio element. The kind is whatever the answer (or the element) shows.
// A link that will not play gives up, and the window falls back to the frame.

export function useTriedLink(src) {
  const srcRef = React.useRef(src);
  const foundRef = React.useRef(null);
  if (srcRef.current !== src) foundRef.current = null;
  srcRef.current = src;

  const [found, setFound] = React.useState(null);
  const [foundFor, setFoundFor] = React.useState('');
  const [giveUpFor, setGiveUpFor] = React.useState('');
  const giveUpRef = React.useRef('');

  const accept = React.useCallback((kind) => {
    const current = srcRef.current;
    if (guessLinkKind(current) !== 'unknown' || giveUpRef.current === current || foundRef.current) return;
    if (kind !== 'radio' && kind !== 'song') return;
    foundRef.current = kind;
    logTriedKind(current, kind);
    setFound(kind);
    setFoundFor(current);
  }, []);

  const fail = React.useCallback(() => {
    const current = srcRef.current;
    if (guessLinkKind(current) !== 'unknown' || giveUpRef.current === current) return;
    giveUpRef.current = current;
    setGiveUpFor(current);
  }, []);

  React.useEffect(() => {
    if (guessLinkKind(src) !== 'unknown') return undefined;
    let gone = false;
    tryLinkKind(src).then((result) => {
      if (gone || srcRef.current !== src) return;
      if (result === 'page') { fail(); return; }
      if (result === 'radio' || result === 'song') accept(result);
    });
    return () => { gone = true; };
  }, [src, accept, fail]);

  const guess = guessLinkKind(src);
  const givenUp = giveUpFor === src;
  const foundKind = !givenUp && foundFor === src ? found : null;
  return {
    direct: guess === 'song' || guess === 'radio' || (guess === 'unknown' && !givenUp),
    kind: foundKind,
    noteHeard: accept,
    fail,
  };
}
