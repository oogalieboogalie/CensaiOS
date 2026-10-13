/* Game playground runner (censaiOS).
 *
 * This page runs inside the Game Playground window's iframe with
 * sandbox="allow-scripts allow-pointer-lock" and no allow-same-origin, so it
 * has an opaque origin: a game can't read the app's cookies, storage or DOM.
 * The window hands it a plan over postMessage:
 *
 *   { kind: 'love', files: [{ path, data }], args }
 *       LÖVE through love.js (compat build, no SharedArrayBuffer needed).
 *   { kind: 'web', entry, files: [{ path, data, type, text, deps }], importMap }
 *       Any HTML5 build (Three.js scene, Godot export, itch download) served
 *       from memory. Text files arrive with their relative references
 *       already swapped for tokens (src/lib/games/playground/virtualSite.js);
 *       this page turns each file into a blob URL and fills the tokens in.
 *
 * Escape and focus changes go back to the window so the canvas keyboard
 * contract (src/lib/keyboardClaim.js) holds.
 */
(function () {
  'use strict';

  var TOKEN = /__HBVFS\[([^\]]*)\]__/g;
  var VENDOR = '/playground/vendor/';
  var parentWindow = window.parent;
  var files = {};
  var urls = {};
  var started = false;

  function send(type, extra) {
    var msg = { __hbPlay: 1, type: type };
    if (extra) for (var k in extra) msg[k] = extra[k];
    try { parentWindow.postMessage(msg, '*'); } catch (e) { /* parent gone */ }
  }

  function status(text) {
    var el = document.getElementById('hb-status');
    if (el) el.textContent = text || '';
    send('status', { text: text || '' });
  }

  function fail(text) {
    status('');
    send('error', { text: String(text && text.message ? text.message : text) });
  }

  // ── Keyboard and focus back to the window ───────────────────────────────
  function hooks() {
    if (window.__hbHooked) return;
    window.__hbHooked = true;
    window.addEventListener('keydown', function (e) {
      if (e.key === 'Escape') { e.preventDefault(); e.stopImmediatePropagation(); send('escape'); }
    }, true);
    window.addEventListener('focus', function () { send('focus'); });
    window.addEventListener('blur', function () { send('blur'); });
    window.addEventListener('pointerdown', function () { send('focus'); }, true);
    window.addEventListener('error', function (e) { send('script-error', { text: String(e.message || 'Script error') }); });
  }
  window.__hbHooks = function () { window.__hbHooked = false; hooks(); };

  // ── Virtual files ───────────────────────────────────────────────────────
  // Relative paths resolve against this page (/playground/runner.html), so a
  // game asking for "index.wasm" asks for /playground/index.wasm.
  var BASE = new URL('./', location.href);

  function keyOf(url) {
    if (url == null) return null;
    var s = String(url);
    if (/^(blob:|data:)/i.test(s)) return null;
    var abs;
    try { abs = new URL(s, BASE); } catch (e) { return null; }
    if (abs.origin !== BASE.origin && !(abs.protocol === BASE.protocol && abs.host === BASE.host)) return null;
    if (abs.pathname.indexOf(BASE.pathname) !== 0) return null;
    var key = decodeURIComponent(abs.pathname.slice(BASE.pathname.length));
    return Object.prototype.hasOwnProperty.call(files, key) ? key : null;
  }

  function blobUrl(path, visiting) {
    if (urls[path]) return urls[path];
    var file = files[path];
    if (!file) return '';
    var body = file.data;
    if (typeof file.text === 'string') {
      visiting = visiting || {};
      if (visiting[path]) return '';
      visiting[path] = true;
      body = file.text.replace(TOKEN, function (_, key) { return blobUrl(decodeURIComponent(key), visiting) || key; });
      delete visiting[path];
    }
    urls[path] = URL.createObjectURL(new Blob([body], { type: file.type || 'application/octet-stream' }));
    return urls[path];
  }

  function mapUrl(url) {
    var key = keyOf(url);
    return key === null ? url : blobUrl(key);
  }

  function installShims() {
    var realFetch = window.fetch.bind(window);
    window.fetch = function (input, init) {
      var raw = typeof input === 'string' || input instanceof URL ? String(input) : (input && input.url);
      var mapped = mapUrl(raw);
      if (mapped !== raw) return realFetch(mapped, init);
      return realFetch(input, init);
    };
    var open = XMLHttpRequest.prototype.open;
    XMLHttpRequest.prototype.open = function (method, url) {
      var args = Array.prototype.slice.call(arguments);
      args[1] = mapUrl(url);
      return open.apply(this, args);
    };
    [window.HTMLImageElement, window.HTMLMediaElement, window.HTMLScriptElement, window.HTMLSourceElement].forEach(function (Ctor) {
      if (!Ctor) return;
      var desc = Object.getOwnPropertyDescriptor(Ctor.prototype, 'src');
      if (!desc || !desc.set) return;
      Object.defineProperty(Ctor.prototype, 'src', {
        configurable: true, enumerable: desc.enumerable, get: desc.get,
        set: function (value) { desc.set.call(this, mapUrl(value)); },
      });
    });
    var setAttribute = Element.prototype.setAttribute;
    Element.prototype.setAttribute = function (name, value) {
      if (/^(src|href)$/i.test(name)) value = mapUrl(value);
      return setAttribute.call(this, name, value);
    };
    if (window.Worker) {
      var RealWorker = window.Worker;
      window.Worker = function (url, options) { return new RealWorker(mapUrl(url), options); };
      window.Worker.prototype = RealWorker.prototype;
    }
    if (window.AudioWorklet && window.AudioWorklet.prototype.addModule) {
      var addModule = window.AudioWorklet.prototype.addModule;
      window.AudioWorklet.prototype.addModule = function (url, options) { return addModule.call(this, mapUrl(url), options); };
    }
  }

  // ── Plans ───────────────────────────────────────────────────────────────
  function loadScript(src) {
    return new Promise(function (resolve, reject) {
      var s = document.createElement('script');
      s.src = src;
      s.onload = resolve;
      s.onerror = function () { reject(new Error('Could not load ' + src)); };
      document.head.appendChild(s);
    });
  }

  function runLove(plan) {
    status('Starting LÖVE…');
    var canvas = document.createElement('canvas');
    canvas.id = 'canvas';
    canvas.tabIndex = 0;
    canvas.oncontextmenu = function (e) { e.preventDefault(); };
    canvas.addEventListener('webglcontextlost', function (e) { e.preventDefault(); fail('The game lost its graphics context. Restart it.'); });
    document.getElementById('hb-stage').appendChild(canvas);
    window.addEventListener('keydown', function (e) {
      if ([32, 37, 38, 39, 40].indexOf(e.keyCode) > -1) e.preventDefault();
    });
    // Letterbox the game's canvas at its own aspect. Sizing the element
    // (not object-fit) keeps SDL's mouse mapping right.
    function fit() {
      var w = canvas.width || 800;
      var h = canvas.height || 600;
      var scale = Math.min(window.innerWidth / w, window.innerHeight / h);
      canvas.style.width = Math.floor(w * scale) + 'px';
      canvas.style.height = Math.floor(h * scale) + 'px';
    }
    window.addEventListener('resize', fit);
    setInterval(fit, 500);
    var Module = {
      arguments: plan.args || ['./'],
      INITIAL_MEMORY: plan.memory || 67108864,
      canvas: canvas,
      printErr: function (text) {
        // The sandbox has no IndexedDB, so love.js can't restore saves. Let
        // the game start anyway; its save folder lives in memory.
        if (text && (text.name === 'SecurityError' || /IndexedDB/i.test(String(text)))) {
          if (!Module.__hbNoSaves) { Module.__hbNoSaves = true; Module.removeRunDependency('IDBFS_sync'); }
          return;
        }
        console.error(text);
      },
      print: function (text) { console.log(text); },
      locateFile: function (path) { return VENDOR + 'love/' + path; },
      setStatus: function (text) {
        if (!text || /^Running/i.test(text)) { status(''); return; }
        status(text.replace(/\(\d+\/\d+\)/, '').trim());
      },
      totalDependencies: 0,
      monitorRunDependencies: function (left) { if (!left) { status(''); send('started'); } },
      preRun: [function () {
        var made = {};
        plan.files.forEach(function (file) {
          var parts = file.path.split('/');
          var name = parts.pop();
          var dir = '/';
          parts.forEach(function (part) {
            var next = dir === '/' ? '/' + part : dir + '/' + part;
            if (!made[next]) { Module.FS_createPath(dir, part, true, true); made[next] = true; }
            dir = next;
          });
          var data = typeof file.data === 'string' ? file.data : new Uint8Array(file.data);
          Module.FS_createDataFile(dir, name, data, true, true, true);
        });
      }],
    };
    window.Module = Module;
    canvas.focus();
    return loadScript(VENDOR + 'love/love.js').then(function () {
      if (typeof window.Love !== 'function') throw new Error('The LÖVE runtime did not load.');
      return window.Love(Module);
    });
  }

  function runWeb(plan) {
    status('Starting…');
    files = {};
    urls = {};
    plan.files.forEach(function (file) { files[file.path] = file; });
    installShims();
    var entry = files[plan.entry];
    if (!entry || typeof entry.text !== 'string') throw new Error('This build has no page to open.');
    var html = entry.text.replace(TOKEN, function (_, key) { return blobUrl(decodeURIComponent(key)) || key; });
    var head = '<script>window.__hbHooks&&window.__hbHooks();</' + 'script>';
    if (plan.importMap) head += '<script type="importmap">' + JSON.stringify(plan.importMap) + '</' + 'script>';
    if (plan.theme) head += '<script>window.HB_THEME=' + JSON.stringify(plan.theme) + ';</' + 'script>';
    if (/<head[^>]*>/i.test(html)) html = html.replace(/<head[^>]*>/i, function (m) { return m + head; });
    else html = head + html;
    status('');
    document.open();
    document.write(html);
    document.close();
    send('started');
  }

  window.addEventListener('message', function (event) {
    if (event.source !== parentWindow) return;
    var msg = event.data;
    if (!msg || msg.__hbPlay !== 1 || msg.type !== 'boot' || started) return;
    started = true;
    var plan = msg.plan || {};
    if (plan.theme && plan.theme.bg) document.body.style.background = plan.theme.bg;
    Promise.resolve().then(function () {
      if (plan.kind === 'love') return runLove(plan);
      if (plan.kind === 'web') return runWeb(plan);
      throw new Error('Unknown game type.');
    }).catch(fail);
  });

  hooks();
  send('ready');
}());
