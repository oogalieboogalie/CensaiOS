import React from 'react';
import { Icon } from '../../Icons.jsx';
import { pathInside, samePath } from '../../../lib/windowProject.js';

function Place({ label, active, onGo }) {
  return (
    <li>
      <button type="button" className="hb-finder-nav-item" data-active={active ? 'true' : 'false'} title={label} onClick={onGo}>
        <Icon.Folder size={13} />
        <span>{label}</span>
      </button>
    </li>
  );
}

/** The project's top folder, and the folders in it, one click away. */
export function FinderSidebar({ project, folders, folder, onGo }) {
  return (
    <aside className="hb-finder-sidebar" aria-label="Finder sidebar">
      <div className="hb-finder-section">
        <div className="hb-finder-section-label">Project</div>
        <ul>
          <Place label={project.name} active={samePath(folder, project.path)} onGo={() => onGo(project.path)} />
        </ul>
      </div>
      {folders.length > 0 && (
        <div className="hb-finder-section">
          <div className="hb-finder-section-label">Folders</div>
          <ul>
            {folders.map((item) => (
              <Place key={item.path} label={item.name} active={pathInside(folder, item.path)} onGo={() => onGo(item.path)} />
            ))}
          </ul>
        </div>
      )}
    </aside>
  );
}
