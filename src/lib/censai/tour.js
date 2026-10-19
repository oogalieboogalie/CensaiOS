// "Show me around": Censai's short first lesson about the board. Each step
// is a few plain sentences; `action` names an event the step can fire so
// the person sees the thing Censai is talking about.

export const OPEN_ADD_MENU = 'censai:open-add-palette';

export const CENSAI_TOUR = Object.freeze([
  {
    id: 'board',
    title: 'This is your board',
    body: 'Everything lives on one big canvas. Drag empty space to move around, and scroll or pinch to zoom. Windows stay where you put them, and your board saves itself.',
  },
  {
    id: 'add',
    title: 'Adding things',
    body: 'The Add menu holds every window: chats, notes, files, the Terminal, the YorWare apps and the rest. Pick one and it lands on the board.',
    action: { label: 'Open the Add menu', event: OPEN_ADD_MENU },
  },
  {
    id: 'dock',
    title: 'The dock at the bottom',
    body: 'The dock holds your tools: select, pen, shapes and chat. Press C any time to open or close this chat with me.',
  },
  {
    id: 'family',
    title: 'The family',
    body: 'I hold the big plan and hand the specialist work to the family: Atlas for the backend, Nexus for databases, Foundation for containers, Genesis for design, Echo for the business, The Architect for plans and Phoenix for recovery. Each one keeps their own memory.',
  },
  {
    id: 'me',
    title: 'I am always here',
    body: 'This chat stays pinned on top of every window. Click my face to shrink me to a bubble. Tell me what you want built, and I will tell you who I handed it to and what came back on the Family desk.',
  },
]);
