const fakes = {
  pg: new URL('./fakePg.mjs', import.meta.url).href,
  'embedded-postgres': new URL('./fakeEmbeddedPostgres.mjs', import.meta.url).href,
};

export async function resolve(specifier, context, nextResolve) {
  if (fakes[specifier]) return { url: fakes[specifier], shortCircuit: true };
  if (specifier.startsWith('@embedded-postgres/')) {
    return { url: new URL('./fakePgCtl.mjs', import.meta.url).href, shortCircuit: true };
  }
  return nextResolve(specifier, context);
}
