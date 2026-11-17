import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { FIRST_BYTE_MS, LIMITS, RETRY_AFTER, STORE_VERSION, decide, formatText, fromStore, paused, resolveApi, secondsLeft, toRequest, toStore, userText } from '../site/lib/chat.js';
import { STR } from '../site/i18n.js';

const user = (content) => ({ role: 'user', content });
const bot = (content, picks) => ({ role: 'assistant', content, source: 'ai', ...(picks ? { picks: picks.map((id) => ({ id, why: 'x' })) } : {}) });

// ---------- the request ----------

test('the request alternates, starts and ends with the user and carries the shown picks', () => {
  const body = toRequest([user('Junior dev, cloud security'), bot('Here are two.', ['aws-aif-c01', 'az-500']), user('Cheaper?')], 'es');
  assert.deepEqual(body, {
    lang: 'es',
    messages: [
      { role: 'user', content: 'Junior dev, cloud security' },
      { role: 'assistant', content: 'Here are two.', picks: ['aws-aif-c01', 'az-500'] },
      { role: 'user', content: 'Cheaper?' },
    ],
  });
  assert.equal(toRequest([user('hi')], 'fr').lang, 'en');
});

test('the request keeps the last 20 messages and still starts with the user', () => {
  const long = [];
  for (let i = 0; i < 15; i++) long.push(user(`q${i}`), bot(`a${i}`));
  long.push(user('last'));
  const { messages } = toRequest(long, 'en');
  assert.ok(messages.length <= LIMITS.messages);
  assert.equal(messages[0].role, 'user');
  assert.equal(messages.at(-1).content, 'last');
  for (let i = 1; i < messages.length; i++) assert.notEqual(messages[i].role, messages[i - 1].role);
});

test('an answer with picks and no words is sent with empty text; long answers are capped', () => {
  const { messages } = toRequest([user('a'), { role: 'assistant', content: '', picks: [{ id: 'az-900', why: '' }] }, user('b'), bot('x'.repeat(5000)), user('c')], 'en');
  assert.deepEqual(messages[1], { role: 'assistant', content: '', picks: ['az-900'] });
  assert.equal(messages[3].content.length, LIMITS.answerChars);
});

test('the request leaves out empty answers and trailing answers, and caps the user text', () => {
  const { messages } = toRequest([user('a'), bot('  '), user('b'.repeat(1500)), bot('partial')], 'en');
  assert.deepEqual(
    messages.map((m) => m.role),
    ['user'],
  );
  assert.equal(messages[0].content.length, LIMITS.chars, 'two user turns in a row: the later one stands, capped');
});

// ---------- when the matcher answers ----------

test('network errors, timeouts and server trouble fall back, with a retry', () => {
  for (const result of [{ type: 'network' }, { type: 'timeout' }, { type: 'http', status: 503, error: 'upstream' }, { type: 'http', status: 500 }, { type: 'http', status: 404 }]) {
    const d = decide(result, 0);
    assert.equal(d.fallback, true, JSON.stringify(result));
    assert.equal(d.retry, true, JSON.stringify(result));
    assert.equal(d.pauseUntil, null);
  }
  assert.equal(decide({ type: 'network' }).reason, 'offline');
  assert.equal(decide({ type: 'timeout' }).reason, 'timeout');
  assert.equal(decide({ type: 'http', status: 503, error: 'upstream' }).reason, 'busy');
  assert.ok(FIRST_BYTE_MS >= 15000 && FIRST_BYTE_MS <= 30000);
});

test('a rate limit falls back and waits retryAfter before the AI is tried again', () => {
  const d = decide({ type: 'http', status: 429, error: 'rate_limited', retryAfter: 42 }, 1000);
  assert.deepEqual(d, { fallback: true, reason: 'rate', retry: true, retryAt: 43000, pauseUntil: 43000 });
  assert.equal(decide({ type: 'http', status: 429 }, 0).retryAt, RETRY_AFTER * 1000, 'no retryAfter: the default');
  assert.equal(paused({ reason: d.reason, until: d.pauseUntil }, 42999), 'rate');
  assert.equal(paused({ reason: d.reason, until: d.pauseUntil }, 43000), null);
  assert.equal(secondsLeft(d.retryAt, 1000), 42);
  assert.equal(secondsLeft(d.retryAt, 42500), 1);
  assert.equal(secondsLeft(d.retryAt, 43000), 0);
});

test('a disabled AI or a refused origin falls back for the rest of the visit, without a retry', () => {
  const off = decide({ type: 'http', status: 503, error: 'disabled' }, 0);
  assert.deepEqual([off.fallback, off.reason, off.retry, off.pauseUntil], [true, 'disabled', false, Infinity]);
  const forbidden = decide({ type: 'http', status: 403, error: 'forbidden' }, 0);
  assert.deepEqual([forbidden.fallback, forbidden.retry, forbidden.pauseUntil], [true, false, Infinity]);
  for (const status of [400, 413]) {
    const d = decide({ type: 'http', status }, 0);
    assert.deepEqual([d.fallback, d.reason, d.retry, d.pauseUntil], [true, 'rejected', false, null], String(status));
  }
});

test('an error event falls back only before any text', () => {
  assert.deepEqual(decide({ type: 'event', code: 'overloaded', text: false }), { fallback: true, reason: 'busy', retry: true, retryAt: null, pauseUntil: null });
  assert.deepEqual(decide({ type: 'event', code: 'internal', text: false }).reason, 'error');
  assert.deepEqual(decide({ type: 'event', code: 'refusal', text: false }), { fallback: true, reason: 'refused', retry: false, retryAt: null, pauseUntil: null });
  const late = decide({ type: 'event', code: 'overloaded', text: true });
  assert.deepEqual([late.fallback, late.reason, late.retry], [false, 'busy', true]);
  assert.equal(decide({ type: 'event', code: 'refusal', text: true }).retry, false);
});

test('a stream cut short keeps its text; with none the matcher answers', () => {
  assert.deepEqual([decide({ type: 'cut', text: true }).fallback, decide({ type: 'cut', text: true }).reason], [false, 'cut']);
  assert.equal(decide({ type: 'cut', text: false }).fallback, true);
  assert.deepEqual(decide({ type: 'done' }), { fallback: false, reason: null, retry: false, retryAt: null, pauseUntil: null });
  assert.equal(decide({ type: 'stopped', text: true }).fallback, false);
});

test('the matcher reads everything the user wrote, oldest first', () => {
  assert.equal(userText([user('dev junior'), bot('ok'), user('menos de 200 dólares')]), 'dev junior\nmenos de 200 dólares');
});

// ---------- the saved conversation ----------

test('the saved conversation is versioned, capped and cleaned', () => {
  const many = [];
  for (let i = 0; i < 30; i++) many.push(i % 2 ? bot(`a${i}`, ['aws-aif-c01']) : user(`q${i}`));
  const saved = toStore([...many, { role: 'system', content: 'x' }, { role: 'assistant', content: 'y', streaming: true, picks: [{ id: 1 }] }]);
  assert.equal(saved.v, STORE_VERSION);
  assert.equal(saved.messages.length, LIMITS.stored);
  assert.deepEqual(saved.messages.at(-1), { role: 'assistant', content: 'y', source: 'ai' });
  const back = fromStore(JSON.parse(JSON.stringify(saved)));
  assert.equal(back.draft, '');
  assert.deepEqual(back.messages, saved.messages);
});

test('a question left without an answer goes back to the composer', () => {
  const { messages, draft } = fromStore(toStore([user('first'), bot('answer'), user('unanswered')]));
  assert.equal(draft, 'unanswered');
  assert.deepEqual(
    messages.map((m) => m.content),
    ['first', 'answer'],
  );
});

test('anything unexpected in storage gives an empty conversation', () => {
  for (const value of [null, undefined, 'text', {}, { v: 0, messages: [] }, { v: STORE_VERSION, messages: 'no' }]) assert.deepEqual(fromStore(value), { messages: [], draft: '' });
  const odd = fromStore({ v: STORE_VERSION, messages: [{ role: 'assistant', content: 'ok', reason: 'nope', key: '<b>', retryAt: 'soon' }, 5, { role: 'user', content: 3 }] });
  assert.deepEqual(odd.messages, [{ role: 'assistant', content: 'ok', source: 'ai' }]);
});

// ---------- where the endpoint is ----------

const live = 'https://pathfinder-api.legios.com.ar';

test('the endpoint is the build setting unless a loopback ?chat= says otherwise', () => {
  assert.deepEqual(resolveApi({ page: 'pathfinder.legios.com.ar', fallback: live }), { api: live, save: undefined });
  assert.deepEqual(resolveApi({ param: 'http://127.0.0.1:8787/', page: 'pathfinder.legios.com.ar', fallback: live }), { api: 'http://127.0.0.1:8787', save: 'http://127.0.0.1:8787' });
  assert.deepEqual(resolveApi({ saved: 'http://localhost:8813', page: 'pathfinder.legios.com.ar', fallback: live }), { api: 'http://localhost:8813', save: undefined });
  assert.deepEqual(resolveApi({ param: '', saved: 'http://localhost:8813', page: 'x', fallback: live }), { api: live, save: '' });
  assert.deepEqual(resolveApi({ param: 'default', saved: 'http://localhost:8813', page: 'x', fallback: live }), { api: live, save: '' });
});

test('a link to the live site cannot point the chat somewhere else', () => {
  assert.deepEqual(resolveApi({ param: 'https://evil.example', page: 'pathfinder.legios.com.ar', fallback: live }), { api: live, save: undefined });
  assert.deepEqual(resolveApi({ saved: 'https://evil.example', page: 'pathfinder.legios.com.ar', fallback: live }), { api: live, save: undefined });
  for (const bad of ['javascript:alert(1)', 'ftp://127.0.0.1', 'http://user:pw@127.0.0.1:1', 'not a url']) assert.equal(resolveApi({ param: bad, page: '127.0.0.1', fallback: live }).api, live, bad);
  // A page served from loopback (development) may use any address.
  assert.equal(resolveApi({ param: 'https://staging.example/api/', page: '127.0.0.1', fallback: live }).api, 'https://staging.example/api');
});

// ---------- the assistant's text ----------

test('formatText escapes everything and keeps a little Markdown', () => {
  assert.equal(formatText('<img src=x onerror=alert(1)>'), '<p>&lt;img src=x onerror=alert(1)&gt;</p>');
  assert.equal(formatText('One **bold** and *soft* `AZ-900` [docs](https://evil.example)'), '<p>One <strong>bold</strong> and <em>soft</em> <code>AZ-900</code> docs</p>');
  assert.equal(formatText('First line\nsecond\n\nNew paragraph'), '<p>First line<br>second</p><p>New paragraph</p>');
  assert.equal(formatText('Options:\n- A\n- B\n\nDone'), '<p>Options:</p><ul><li>A</li><li>B</li></ul><p>Done</p>');
  assert.equal(formatText('1. One\n\n2. Two\n   more'), '<ol><li>One</li><li>Two more</li></ol>');
  assert.equal(formatText('3. Three'), '<ol start="3"><li>Three</li></ol>');
  assert.equal(formatText('## Plan'), '<p><strong>Plan</strong></p>');
  assert.equal(formatText('2 * 3 * 4 and snake_case_name'), '<p>2 * 3 * 4 and snake_case_name</p>');
  assert.equal(formatText('**unclosed'), '<p>**unclosed</p>');
  assert.equal(formatText(''), '');
});

// ---------- copy ----------

test('every chat string exists in both languages', () => {
  const keys = Object.keys(STR.en).filter((k) => k.startsWith('chat.'));
  assert.ok(keys.length > 20);
  for (const k of keys) assert.ok(k in STR.es, k);
  for (const reason of ['offline', 'timeout', 'busy', 'error', 'rate', 'disabled', 'rejected', 'refused']) assert.ok(`chat.why.${reason}` in STR.en, reason);
  for (const reason of ['stopped', 'cut', 'busy', 'error', 'refused']) assert.ok(`chat.end.${reason}` in STR.en, reason);
});

test('the service worker never answers the chat request', async () => {
  // The chat posts to another origin; the worker only handles same-origin GETs.
  const sw = await readFile(new URL('../site/sw.js', import.meta.url), 'utf8');
  const handler = sw.slice(sw.indexOf("addEventListener('fetch'"));
  assert.match(handler, /if \(request\.method !== 'GET'\) return;/);
  assert.match(handler, /if \(url\.origin !== self\.location\.origin\) return;/);
  assert.ok(handler.indexOf("request.method !== 'GET'") < handler.indexOf('respondWith'));
});
