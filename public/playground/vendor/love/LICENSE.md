# LÖVE for the web (love.js 11.4.1, compatibility build)

`love.js` and `love.wasm` are copied unchanged from the `love.js` npm package,
version 11.4.1, `src/compat/` (https://github.com/Davidobot/love.js).
The compatibility build runs without SharedArrayBuffer, so it works inside a
canvas window without cross-origin isolation.

- love.js: MIT License, Copyright (c) Tanner Rogalsky and contributors.
- LÖVE: zlib License, Copyright (c) 2006-2022 LOVE Development Team.
- Lua, SDL2, Emscripten runtime: MIT / zlib licenses of their authors.

Permission is hereby granted, free of charge, to any person obtaining a copy of
this software and associated documentation files, to deal in the Software
without restriction, subject to the conditions of the MIT and zlib licenses
above. The software is provided "as is", without warranty of any kind.
