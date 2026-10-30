// Notes-workspace windows: Obsidian-like vault, and the Finder (the files of
// the window's project, Finder-style). Used by the Notes Workspace ready-made
// board. Pure data.

// A new vault starts with an empty list of notes, so two people adding the
// first notes at the same moment both keep theirs (the list then merges one
// note at a time; a vault without one is written whole by the first add).
export const NEW_VAULT_PROPS = Object.freeze({ title: 'Vault notes', notes: Object.freeze([]) });

export const NOTES_WINDOW_MANIFESTS = [
  {
    kind: 'vaultNotes',
    canvasType: 'vaultNotes',
    label: 'Vault notes',
    componentName: 'VaultNotesWindow',
    componentPath: 'src/components/windows/vaultNotes/index.jsx',
    defaultSize: { w: 980, h: 700 },
    header: { title: 'Notes', icon: 'Files' },
    lab: { title: 'Vault notes', props: {} },
    moduleMenu: {
      show: true,
      status: 'ready',
      order: 48,
      icon: 'Files',
      label: 'Vault notes',
      hint: 'Obsidian-style notes: your own vault, with example notes to copy',
    },
    launcher: {
      show: true,
      order: 48,
      icon: 'Files',
      label: 'Vault notes',
      hint: 'Your own Obsidian-style note vault',
      props: NEW_VAULT_PROPS,
    },
  },
  {
    kind: 'finderFiles',
    canvasType: 'finderFiles',
    label: 'Finder',
    componentName: 'FinderFilesWindow',
    componentPath: 'src/components/windows/finderFiles/index.jsx',
    defaultSize: { w: 920, h: 620 },
    header: { title: 'Finder', icon: 'Folder' },
    lab: { title: 'Finder', props: {} },
    moduleMenu: {
      show: true,
      status: 'ready',
      order: 49,
      icon: 'Folder',
      label: 'Finder',
      hint: "The open project's files, Finder-style: double-click opens one",
    },
    launcher: {
      show: true,
      order: 49,
      icon: 'Folder',
      label: 'Finder',
      hint: "The open project's files, Finder-style",
    },
  },
];
