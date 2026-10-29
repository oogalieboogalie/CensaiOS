// Both testers' screens in one picture, Pat on the left and Sam on the right,
// so a reader sees at a glance that the two screens agree.

export async function sideBySide(t, title, shot) {
  const [a, b] = await Promise.all([t.pat.page, t.sam.page].map((p) => p.screenshot({ type: 'png' })));
  const view = await t.browser.newPage({ viewport: { width: 1800, height: 620 } });
  const img = (buf, who) => `<figure><figcaption>${who}</figcaption><img src="data:image/png;base64,${buf.toString('base64')}"></figure>`;
  await view.setContent(`<style>body{margin:0;display:flex;gap:12px;padding:12px;background:gray;font:14px sans-serif}
    figure{margin:0;flex:1}img{width:100%;display:block}figcaption{padding:4px 0}</style>${img(a, "Pat's screen")}${img(b, "Sam's screen")}`);
  await shot(view, title);
  await view.close();
}
