import './workbench.css';

// The shell is not drawn here. It stays mounted behind this view, so switching
// back to the plain terminal keeps the same session.
export function WorkbenchView() {
  return (
    <div className="hb-workbench" data-terminal-view="workbench">
      <p className="hb-workbench-note">
        This is the same session as the plain terminal. Switch back and everything you typed is still there.
      </p>
    </div>
  );
}
