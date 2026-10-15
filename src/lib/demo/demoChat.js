// Sample replies for chat windows on the try-it board. There is no model and
// no key here; the reply says so and points at what the visitor can try.

const INSTALL = 'Install censaiOS and add your own AI key (Claude, OpenAI, Gemini or a free local model) to get real answers.';

const TOPICS = [
  [/lead|customer|client|prospect/i, 'Finding customers is what **LeadHound** does. Open the sample hunt next to me to see a finished one: real-looking leads, a seven-day intro plan and an ice breaker for the best fit.'],
  [/music|song|play/i, 'Try the **Music** window from the Add button. On your own censaiOS it plays your files and streams.'],
  [/group|layout|window/i, 'Drag one window onto another to group them, then use the group header to tile them side by side. Everything you do here is only in this browser tab.'],
  [/price|cost|pay|free/i, 'censaiOS runs on your own computer and uses your own AI key, so you pay your AI provider directly and nothing else.'],
];

function textOf(content) {
  if (Array.isArray(content)) return content.map((part) => textOf(part?.text ?? part)).join(' ');
  return typeof content === 'string' ? content : '';
}

export function demoReply(messages) {
  const list = Array.isArray(messages) ? messages : [];
  const last = [...list].reverse().find((m) => m && m.role !== 'assistant' && m.role !== 'system') || list[list.length - 1];
  const text = textOf(last?.content ?? last?.text);
  const hit = TOPICS.find(([re]) => re.test(text));
  const lead = hit ? hit[1] : 'This is the try-it board, so I can only give sample replies.';
  return `${lead}\n\n${INSTALL}`;
}

/** The reply as the app's streaming chat format: a few deltas, then the result. */
export function demoChatStream(messages) {
  const text = demoReply(messages);
  const words = text.split(/(?<=\s)/);
  const enc = new TextEncoder();
  return new ReadableStream({
    async start(controller) {
      const send = (event) => controller.enqueue(enc.encode(`${JSON.stringify(event)}\n`));
      for (let i = 0; i < words.length; i += 6) {
        send({ type: 'delta', text: words.slice(i, i + 6).join(''), round: 1 });
        await new Promise((r) => setTimeout(r, 40));
      }
      send({ type: 'result', text, timings: null, tools: [], projectContext: [] });
      controller.close();
    },
  });
}
