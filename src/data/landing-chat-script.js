// Landing-page demo chat — every reply is the same line. That's the joke.

export const AGENT_LINE = [
  "hello, imagine you are having a very constructive conversation with me right now and then i magically produced what you asked for or we carried on a very deep and meaningful conversation while listening to lofi music",
  "",
  'try making another spot on the board and scrolling down the menu to the music note and selecting "synthwave radio" and experience what could be',
].join("\n");

export function scriptedReply() {
  return AGENT_LINE;
}

export function replyDelayMs() {
  return 600;
}
