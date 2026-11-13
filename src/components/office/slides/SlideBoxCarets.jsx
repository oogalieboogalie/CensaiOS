import React from 'react';
import { useTeammateCarets } from '../../../lib/collaboration/useTextCarets.js';
import { TeammatesHere } from '../docs/TeammatesHere.jsx';
import { slideKey } from '../../../lib/office/slideModel.js';

/** Where the words of a slide's text box sit in the window's shared fields. */
export const slideBoxField = (slideId, index) => `${slideKey(slideId)}/blocks/${index}/text`;

// A slide text box you are not typing in: each teammate typing in it gets a
// small name tag in their colour at the box's top right corner. Double-click
// into the box and their cursor shows right at the letter (SlideBoxText.jsx).
export function SlideBoxCarets({ windowId, field }) {
  const carets = useTeammateCarets(windowId, field, Boolean(windowId && field));
  return <TeammatesHere carets={carets} />;
}
