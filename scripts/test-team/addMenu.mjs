// Opening a window from the Add menu the way a person does: Ctrl+K, type its
// name, Enter. Returns the new window's id and kind (both null if none opened).

export async function addFromMenu(page, name) {
  const before = await page.evaluate(() => window.__e2eStore.getState().wins.map((w) => w.id));
  await page.mouse.click(1300, 120);
  await page.keyboard.press('Control+k');
  await page.waitForFunction(() => document.querySelector('.hb-palette-input')?.value === '', null, { timeout: 5_000 });
  await page.keyboard.type(name, { delay: 15 });
  await page.keyboard.press('Enter');
  const opened = (ids) => window.__e2eStore.getState().wins.find((w) => !ids.includes(w.id)) || null;
  await page.waitForFunction(opened, before, { timeout: 5_000 }).catch(() => {});
  await page.waitForTimeout(1200);
  const win = await page.evaluate(opened, before);
  return { id: win?.id || null, kind: win?.kind || null };
}
