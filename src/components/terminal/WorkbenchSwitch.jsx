import { PLAIN_VIEW, WORKBENCH_VIEW, terminalView } from './workbenchMode.js';
import './workbench.css';

const VIEWS = [
  { id: WORKBENCH_VIEW, label: 'Workbench' },
  { id: PLAIN_VIEW, label: 'Plain terminal' },
];

// The header switch. Choosing a view only changes what you see. The shell
// stays mounted either way.
export function WorkbenchSwitch({ win, onUpdate }) {
  const view = terminalView(win);
  const choose = (next) => {
    if (next !== view) onUpdate?.({ terminalView: next });
  };
  return (
    <div
      className="hb-workbench-switch"
      role="group"
      aria-label="View"
      onPointerDown={(event) => event.stopPropagation()}
    >
      {VIEWS.map((item) => (
        <button
          key={item.id}
          type="button"
          aria-pressed={view === item.id}
          onClick={() => choose(item.id)}
        >
          {item.label}
        </button>
      ))}
    </div>
  );
}
