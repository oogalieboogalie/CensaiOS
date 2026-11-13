import { useEffect } from 'react';
import { AppContent } from './app/AppContent.jsx';
import { bindAppActivity } from './lib/appUpdate/activity.js';
import { appUpdateApi } from './lib/appUpdate/api.js';
import { GuestApp } from './app/GuestApp.jsx';
import { ClassApp } from './app/ClassApp.jsx';
import { classJoinToken, guestJoinToken } from './lib/workspace/shareLink.js';
import { PairApp } from './app/PairApp.jsx';
import { pairCodeFromUrl } from './lib/webOs.js';
import { InviteApp } from './app/InviteApp.jsx';
import { inviteCodeFromUrl } from './lib/invites/index.js';

export default function App() {
  // A key or a click, throttled. Background polls are not someone using the app.
  useEffect(() => bindAppActivity(window, () => appUpdateApi.activity()), []);
  // A share link (`?join=<token>`) opens the board as a guest, with no
  // account and none of the owner's app shell. A class link (`?class=`)
  // does the same for a student's seat in a live lesson.
  const joinToken = guestJoinToken();
  if (joinToken) return <GuestApp token={joinToken} />;
  const classToken = classJoinToken();
  if (classToken) return <ClassApp token={classToken} />;
  // An "Add a computer" link (`?pair=<code>`) signs this computer in once.
  const pairCode = pairCodeFromUrl();
  if (pairCode) return <PairApp code={pairCode} />;
  // An "Invite to this board" link (`?invite=<code>`) makes the person's
  // own account and opens that board.
  const inviteCode = inviteCodeFromUrl();
  if (inviteCode) return <InviteApp code={inviteCode} />;
  return <AppContent />;
}
