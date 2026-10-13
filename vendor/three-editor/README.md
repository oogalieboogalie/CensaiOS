# three.js editor (vendored)

The three.js editor from https://github.com/mrdoob/three.js/tree/r186/editor
(release r186, commit 9b4a2ac29c63ccb43fd51c5661f2f873ac2c39b8), MIT license
(`LICENSE`). It runs as the YorWare 3D Editor, a sealed module
(docs/specs/13-yorware-suite.md, "Eighth app").

The files here are unchanged copies of upstream. Left out: the script editor's
libraries (CodeMirror, Tern, Acorn, Esprima, jsonlint), the example projects,
docs, the service worker and index.html. `fonts/helvetiker_bold.typeface.json`
is from three.js `examples/fonts` (MgOpen license, `fonts/LICENSE`), used by
Add > Text.

How it is built and what is swapped: `server/boot/threeEditorBundle.js`.
To update: replace this folder with a new release's `editor/` (minus the parts
above), bump `three` in package.json to the same release, and run
`npm test -- tests/yorwareThreeEditor.test.js`.
