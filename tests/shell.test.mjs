import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { STR } from '../site/i18n.js';

// index.html puts the page frame in Spanish before app.js loads, with its own copy of a few strings.
const html = await readFile(new URL('../site/index.html', import.meta.url), 'utf8');
const script = html.match(/<body>\s*<script>([\s\S]*?)<\/script>/)?.[1] || '';
const copy = JSON.parse(script.match(/var T = (\{.*?\});/)?.[1] || '{}');

test('the early Spanish strings match i18n.js', () => {
  assert.ok(Object.keys(copy).length > 5, 'the script holds its strings');
  for (const [key, text] of Object.entries(copy)) assert.equal(text, STR.es[key], key);
});

test('every string of the visible frame has its early Spanish copy', () => {
  // What shows before the app runs: the skip link and header, "Loading…" and the footer.
  const frame = [html.match(/<a class="skip"[\s\S]*?<\/header>/)[0], html.match(/<p class="loading"[^>]*>/)[0], html.match(/<footer[\s\S]*?<\/footer>/)[0]].join('\n');
  const keys = new Set();
  for (const [, key] of frame.matchAll(/data-i18n(?:-html)?="([^"]+)"/g)) keys.add(key);
  for (const [, pairs] of frame.matchAll(/data-i18n-attr="([^"]+)"/g)) for (const pair of pairs.split(';')) keys.add(pair.split(':')[1].trim());
  assert.ok(keys.size > 8);
  for (const key of keys) assert.ok(key in copy, `${key} is missing from the script at the start of <body>`);
  assert.ok('lang.switch' in copy && 'lang.aria' in copy, 'the language button');
});

test('the script stays small and only acts for Spanish', () => {
  assert.ok(script.length < 4000, `${script.length} characters`);
  assert.match(script, /if \(lang !== "es"\) return;/);
  assert.match(script, /pathfinder:lang/);
});
