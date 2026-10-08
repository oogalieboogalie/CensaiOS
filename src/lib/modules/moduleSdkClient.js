// Spec 6: the tiny Module SDK script injected into every module's sandbox.
// It is a string because it runs inside the iframe, not in the app bundle.
// The sandbox has an opaque origin, so this postMessage bridge is the only
// way a module reaches the host, and the host answers only the calls below.
//
//   censai.theme.get(name) / theme.onChange(fn)
//   censai.storage.get(key, fallback) / storage.set(key, value) / storage.onChange(fn)
//   censai.agent.ask(prompt)      -> Promise<string> (needs the "agent" permission)
//   censai.presence.list() / presence.onChange(fn)
//   censai.toast(message)
//   censai.resize(w, h)

export const MODULE_SDK_CLIENT = String.raw`(function () {
  var init = window.__hbInit || {};
  var storage = init.storage && typeof init.storage === 'object' ? init.storage : {};
  var presence = Array.isArray(init.presence) ? init.presence : [];
  var tokens = init.tokens || {};
  var pending = {};
  var seq = 0;
  var subs = { theme: [], storage: [], presence: [] };

  function emit(kind, a, b) {
    subs[kind].slice().forEach(function (fn) { try { fn(a, b); } catch (err) { console.error(err); } });
  }
  function call(method, args) {
    return new Promise(function (resolve, reject) {
      seq += 1;
      pending[seq] = { resolve: resolve, reject: reject };
      parent.postMessage({ __hbModule: 1, id: seq, method: method, args: args || {} }, '*');
    });
  }
  function applyTokens(next) {
    tokens = next || {};
    var root = document.documentElement.style;
    Object.keys(tokens).forEach(function (name) { root.setProperty(name, tokens[name]); });
  }

  window.addEventListener('message', function (event) {
    if (event.source !== parent) return;
    var msg = event.data;
    if (!msg || msg.__hbHost !== 1) return;
    if (msg.id && pending[msg.id]) {
      var p = pending[msg.id];
      delete pending[msg.id];
      if (msg.error) p.reject(new Error(msg.error)); else p.resolve(msg.result);
      return;
    }
    if (msg.type === 'theme') { applyTokens(msg.tokens); emit('theme', tokens); }
    if (msg.type === 'storage') {
      var next = msg.data && typeof msg.data === 'object' ? msg.data : {};
      var changed = Object.keys(Object.assign({}, storage, next)).filter(function (key) {
        return JSON.stringify(storage[key]) !== JSON.stringify(next[key]);
      });
      storage = next;
      changed.forEach(function (key) { emit('storage', key, storage[key]); });
    }
    if (msg.type === 'presence') { presence = msg.people || []; emit('presence', presence); }
  });

  window.addEventListener('error', function (event) {
    parent.postMessage({ __hbModule: 1, method: 'error', args: { message: String(event.message || 'Script error') } }, '*');
  });

  function clone(value) { return value === undefined ? undefined : JSON.parse(JSON.stringify(value)); }

  window.censai = Object.freeze({
    theme: Object.freeze({
      get: function (name) { return tokens[name.indexOf('--') === 0 ? name : '--' + name]; },
      onChange: function (fn) { subs.theme.push(fn); },
    }),
    storage: Object.freeze({
      get: function (key, fallback) { return key in storage ? clone(storage[key]) : fallback; },
      set: function (key, value) {
        storage[key] = clone(value);
        return call('storage.set', { key: String(key), value: storage[key] });
      },
      remove: function (key) { delete storage[key]; return call('storage.set', { key: String(key), value: null, remove: true }); },
      onChange: function (fn) { subs.storage.push(fn); },
    }),
    agent: Object.freeze({
      ask: function (prompt) { return call('agent.ask', { prompt: String(prompt || '') }); },
    }),
    presence: Object.freeze({
      list: function () { return presence.slice(); },
      onChange: function (fn) { subs.presence.push(fn); },
    }),
    toast: function (message) { return call('toast', { message: String(message || '') }); },
    resize: function (w, h) { return call('resize', { w: Number(w), h: Number(h) }); },
  });
})();`;
