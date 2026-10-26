// Notes-workspace windows: Obsidian-like vault and Finder-like file browser.
// Used by the Notes Workspace ready-made board. Pure data.

export const NOTES_WINDOW_MANIFESTS = [
  {
    kind: 'vaultNotes',
    canvasType: 'vaultNotes',
    label: 'Vault notes',
    componentName: 'VaultNotesWindow',
    componentPath: 'src/components/windows/vaultNotes/index.jsx',
    defaultSize: { w: 980, h: 700 },
    header: { title: 'Notes', icon: 'Files' },
    lab: {
      title: 'Vault notes',
      props: {
        title: 'Brown butter nectarine tart',
        fileName: 'Brown butter nectarine tart.md',
      },
    },
    moduleMenu: {
      show: true,
      status: 'ready',
      order: 48,
      icon: 'Files',
      label: 'Vault notes',
      hint: 'Obsidian-style notes: Bases sidebar, tabs, breadcrumbs',
    },
    launcher: {
      show: true,
      order: 48,
      icon: 'Files',
      label: 'Vault notes',
      hint: 'Obsidian-style note vault',
    },
  },
  {
    kind: 'finderFiles',
    canvasType: 'finderFiles',
    label: 'Finder',
    componentName: 'FinderFilesWindow',
    componentPath: 'src/components/windows/finderFiles/index.jsx',
    defaultSize: { w: 920, h: 620 },
    header: { title: 'Downloads', icon: 'Folder' },
    lab: { title: 'Downloads', props: { folderName: 'Downloads' } },
    moduleMenu: {
      show: true,
      status: 'ready',
      order: 49,
      icon: 'Folder',
      label: 'Finder',
      hint: 'Finder-style file list with sidebar and zebra rows',
    },
    launcher: {
      show: true,
      order: 49,
      icon: 'Folder',
      label: 'Finder',
      hint: 'Finder-style Downloads browser',
    },
  },
];
