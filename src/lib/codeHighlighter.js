export function highlightCode(text, theme = {}) {
  if (!text) return '';

  let escaped = text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');

  // Using regex literal directly in JS code prevents triple-escaping bugs.
  const regex = /(\/\/.*|\/\*[\s\S]*?\*\/)|("(?:\\.|[^"\\])*"|'(?:\\.|[^'\\])*'|`(?:\\.|[^`\\])*`)|([0-9]+(?:\.[0-9]+)?)|(\b(?:fn|let|mut|const|function|return|if|else|for|while|match|struct|enum|impl|use|import|from|class|pub|export|default|var|new|async|await|as|break|continue|in|of|type|interface|static|void)\b)|(\b(?:u8|u16|u32|u64|i8|i16|i32|i64|f32|f64|str|String|bool|Option|Result|Vec|Self|self|int|float|boolean|number|any|unknown|undefined|null|true|false)\b)|(\b(?:println!|println|print|panic|log|console|document|window|process|require|module|exports)\b)|(\b[a-zA-Z_]\w*)(?=\s*\()/g;

  return escaped.replace(regex, (match, p1, p2, p3, p4, p5, p6, p7) => {
    if (p1) return `<span style="color: #64748b; font-style: italic;">${match}</span>`;
    if (p2) return `<span style="color: ${theme.green || '#34d399'};">${match}</span>`;
    if (p3) return `<span style="color: ${theme.yellow || '#fbbf24'};">${match}</span>`;
    if (p4) return `<span style="color: ${theme.red || '#fb7185'}; font-weight: 600;">${match}</span>`;
    if (p5) return `<span style="color: ${theme.blue || '#60a5fa'}; font-weight: 600;">${match}</span>`;
    if (p6) return `<span style="color: ${theme.magenta || '#c084fc'}; font-weight: 600;">${match}</span>`;
    if (p7) return `<span style="color: ${theme.cyan || '#38bdf8'};">${match}</span>`;
    return match;
  });
}
