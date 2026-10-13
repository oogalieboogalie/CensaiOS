# Canvas Objects

The canvas has two separate concepts that should stay distinct:

- Canvas Object: the persisted/runtime data model that can be synced across users.
- React Component: the visual renderer for one canvas object type.
- Agent Event: activity stream data that can create or update canvas objects.
- Browser Session: runtime browser state referenced by a browser canvas object.

## Contract

A Canvas Object has this core shape:

```js
{
  id,
  type,
  title,
  x,
  y,
  width,
  height,
  zIndex,
  state,
  metadata,
  createdBy,
  lockedBy,
  createdAt,
  updatedAt,
}
```

The current workspace still persists legacy window records under `wins` with `kind`, `w`, and `h`. The canvas object contract layer normalizes those records for rendering while avoiding a storage migration in this pass.

## Rendering

Renderers are registered in `src/lib/canvasObjectRegistry.jsx`. `src/components/CanvasObjectRenderer.jsx` receives a canvas object, finds the renderer for its type, and passes shared props into the existing window component.

Current object types include:

- `browser`
- `agent`
- `chat`
- `doc`
- `todo`
- `files`
- `calendar`
- `chrome`
- `generic`

Legacy `todos` records are normalized to the `todo` object type and still render with the existing `TodosWindow` component.
