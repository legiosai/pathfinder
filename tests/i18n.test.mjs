import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';

// A key written twice in an object literal silently keeps the last value, so the first meaning is
// lost (the result filter once read "Not this time…" instead of "Only mistakes"). Read the source.
const source = readFileSync(new URL('../site/i18n.js', import.meta.url), 'utf8');

/** Top-level keys of `const <name> = { … };`, one per line at two spaces of indent. */
function keysOf(name) {
  const start = source.indexOf(`const ${name} = {\n`);
  assert.ok(start >= 0, `const ${name} not found`);
  const end = source.indexOf('\n};', start);
  const body = source.slice(start, end).split('\n').slice(1);
  return body.map((line) => line.match(/^ {2}(?:'([^']+)'|([A-Za-z_$][\w$]*))\s*:/)).filter(Boolean).map((m) => m[1] || m[2]);
}

const dupes = (keys) => keys.filter((k, i) => keys.indexOf(k) !== i);

for (const name of ['en', 'es', 'ES_LABELS', 'ES_DETAIL', 'ES_MARKDOWN']) {
  test(`no key is defined twice in ${name}`, () => {
    const keys = keysOf(name);
    assert.ok(keys.length > 5, `read ${keys.length} keys from ${name}`);
    assert.deepEqual(dupes(keys), []);
  });
}
