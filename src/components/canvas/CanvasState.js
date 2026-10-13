export const DEFAULT_CODE_EDITOR = `// Write code here.
function greet(name) {
  return 'Hello, ' + name + '!';
}

console.log(greet('Censai'));`;

export const DEFAULT_HTML_PREVIEW = `<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Censai Preview</title>
    <style>
      body {
        margin: 0;
        min-height: 100vh;
        display: grid;
        place-items: center;
        font-family: Inter, system-ui, sans-serif;
        background: #f8fafc;
        color: #0f172a;
      }
      main {
        width: min(560px, calc(100vw - 48px));
        padding: 32px;
        border: 1px solid #dbe3ef;
        border-radius: 10px;
        background: white;
        box-shadow: 0 16px 45px rgba(15, 23, 42, 0.12);
      }
      h1 { margin: 0 0 10px; font-size: 28px; }
      p { margin: 0; line-height: 1.55; color: #475569; }
    </style>
  </head>
  <body>
    <main>
      <h1>HTML Preview</h1>
      <p>This preview window is live and ready for pasted or opened HTML.</p>
    </main>
  </body>
</html>`;
