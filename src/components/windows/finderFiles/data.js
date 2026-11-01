// Seed content for the Finder-like Downloads window (visual preset).

export const FINDER_NAV = Object.freeze([
  { id: 'recents', label: 'Recents', icon: 'clock' },
  { id: 'shared', label: 'Shared', icon: 'group' },
]);

export const FINDER_FAVORITES = Object.freeze([
  { id: 'airdrop', label: 'AirDrop' },
  { id: 'applications', label: 'Applications' },
  { id: 'desktop', label: 'Desktop' },
  { id: 'documents', label: 'Documents' },
  { id: 'downloads', label: 'Downloads' },
]);

export const FINDER_LOCATIONS = Object.freeze([
  { id: 'officepc', label: 'officepc' },
]);

export const FINDER_TAGS = Object.freeze([
  { id: 'important', label: 'Important', tone: 'outline' },
  { id: 'work', label: 'Work', tone: 'outline' },
  { id: 'red', label: 'Red', tone: 'danger' },
  { id: 'purple', label: 'Purple', tone: 'purple' },
  { id: 'green', label: 'Green', tone: 'success' },
  { id: 'gray', label: 'Gray', tone: 'faint' },
  { id: 'orange', label: 'Orange', tone: 'orange' },
]);

export const DEFAULT_FINDER_FILES = Object.freeze([
  {
    id: 'nectarine',
    name: 'Brown butter nectarine tart.md',
    modified: 'Today at 09:55',
    size: '4 KB',
  },
]);
