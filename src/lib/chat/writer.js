// Who wrote a person's message in a chat. On a shared board everyone writes
// in the same chat window, so a message someone sends keeps their account id
// and name: everyone's copy of the chat then shows a teammate's message under
// their name, and Grok on each person's own sign-in is handed it as theirs
// (src/lib/chat/grokSignin.js, server/grokSignin/chatThreads.js).
import { getSelf } from '../modules/presenceRoster.js';

/** What a message this person sends keeps about who wrote it: nothing while the board has not said who they are. */
export function writtenBy(self = getSelf()) {
  return self?.id ? { by: { id: self.id, name: self.label || '' } } : {};
}

/**
 * A teammate's name on their message, or '' for this person's own message,
 * Grok's answers, and messages from before chats kept who wrote them.
 */
export function teammateName(message, self = getSelf()) {
  const by = message?.from === 'me' ? message.by : null;
  if (!self?.id || !by?.id || by.id === self.id) return '';
  return String(by.name || '').replace(/\s+/g, ' ').trim().slice(0, 40) || 'A teammate';
}
