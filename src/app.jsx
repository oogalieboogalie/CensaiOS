import { AppContent } from './app/AppContent.jsx';
import { GuestApp } from './app/GuestApp.jsx';
import { guestJoinToken } from './lib/workspace/shareLink.js';

export default function App() {
  // A share link (`?join=<token>`) opens the board as a guest, with no
  // account and none of the owner's app shell.
  const joinToken = guestJoinToken();
  if (joinToken) return <GuestApp token={joinToken} />;
  return <AppContent />;
}
