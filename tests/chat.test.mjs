import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import {
  FIRST_BYTE_MS,
  LIMITS,
  RETRY_AFTER,
  STORE_VERSION,
  applyProfile,
  decide,
  formatText,
  fromStore,
  keepKnown,
  paused,
  planHref,
  readComparison,
  readPicks,
  readProfile,
  readReplies,
  readRoadmap,
  resolveApi,
  secondsLeft,
  shownIds,
  splitLead,
  toRequest,
  toStore,
  unknownIds,
  userText,
  weeklySchedule,
} from '../site/lib/chat.js';
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

test('the request sends back what the answers showed and the kept profile', () => {
  const answer = {
    role: 'assistant',
    content: 'Tres pasos.',
    picks: [{ id: 'aws-clf-c02', why: 'x' }],
    roadmap: { steps: [{ id: 'aws-clf-c02', weeks: 4, note: '' }, { id: 'aws-aif-c01', weeks: 5, note: '' }] },
    comparison: ['aws-aif-c01', 'microsoft-az-900'],
  };
  assert.deepEqual(shownIds(answer), ['aws-clf-c02', 'aws-aif-c01', 'microsoft-az-900']);
  const body = toRequest([user('Cloud, 5 h'), answer, user('¿Y después?')], 'es', { hours_per_week: 5, role: 'dev', junk: 1, budget_usd: 'x' });
  assert.deepEqual(body.messages[1].picks, ['aws-clf-c02', 'aws-aif-c01', 'microsoft-az-900']);
  assert.deepEqual(body.profile, { role: 'dev', hours_per_week: 5 });
  assert.equal('profile' in toRequest([user('hola')], 'es', {}), false);
  assert.equal('profile' in toRequest([user('hola')], 'es'), false);
  // An answer that only compared still counts as shown.
  assert.deepEqual(toRequest([user('a'), { role: 'assistant', content: '', comparison: ['a-b', 'c-d'] }, user('b')], 'en').messages[1], { role: 'assistant', content: '', picks: ['a-b', 'c-d'] });
});

// ---------- what the stream carries ----------

test('picks keep a warning and drop bad items', () => {
  assert.deepEqual(
    readPicks({
      picks: [
        { id: 'aws-clf-c02', why: ' Base\n de nube ', warning: ' Se pasa ' },
        { id: 'aws-clf-c02', why: 'again' },
        { id: 'Not An Id', why: 'x' },
        { id: 'microsoft-az-900', why: 7, warning: '' },
        null,
      ],
    }),
    [
      { id: 'aws-clf-c02', why: 'Base de nube', warning: 'Se pasa' },
      { id: 'microsoft-az-900', why: '' },
    ],
  );
  assert.deepEqual(readPicks({ picks: 'x' }), []);
  assert.equal(readPicks({ picks: Array.from({ length: 9 }, (_, i) => ({ id: `c-${i}`, why: 'x' })) }).length, 5);
});

test('a roadmap needs two steps; weeks are whole numbers or null', () => {
  assert.deepEqual(readRoadmap({ hours_per_week: 4, steps: [{ id: 'a-b', weeks: 3.6, note: 'Base' }, { id: 'c-d', weeks: 'x' }, { id: 'a-b', weeks: 1 }, { id: 'BAD', weeks: 1 }] }), {
    hours_per_week: 4,
    steps: [
      { id: 'a-b', weeks: 4, note: 'Base' },
      { id: 'c-d', weeks: null, note: '' },
    ],
  });
  assert.equal(readRoadmap({ steps: [{ id: 'a-b', weeks: 3 }] }), null);
  assert.equal(readRoadmap(null), null);
  assert.equal(readRoadmap({ hours_per_week: -2, steps: [{ id: 'a-b', weeks: 300 }, { id: 'c-d', weeks: 0 }] }).hours_per_week, undefined);
  assert.deepEqual(readRoadmap({ steps: [{ id: 'a-b', weeks: 300 }, { id: 'c-d', weeks: 0 }] }).steps.map((s) => s.weeks), [104, null]);
});

test('a comparison takes two to four ids; replies up to four distinct ones', () => {
  assert.deepEqual(readComparison({ ids: ['a-b', 'a-b', 'c-d', 'BAD'] }), ['a-b', 'c-d']);
  assert.deepEqual(readComparison({ ids: ['a-b'] }), []);
  assert.deepEqual(readComparison({ ids: ['a', 'b', 'c', 'd', 'e'] }), ['a', 'b', 'c', 'd']);
  assert.deepEqual(readReplies({ replies: ['Sí', 'sí', '', 3, 'x'.repeat(200), 'No', 'Más', 'Otra'] }), ['Sí', 'x'.repeat(80), 'No', 'Más']);
  assert.deepEqual(readReplies(null), []);
});

test('a profile keeps only valid fields', () => {
  assert.deepEqual(readProfile({ profile: { role: ' dev ', experience: 'some', goal: 'IA', budget_usd: 99.6, hours_per_week: 5, prefers_spanish_exam: true, country: 'ar', x: 1 } }), {
    role: 'dev',
    experience: 'some',
    goal: 'IA',
    budget_usd: 100,
    hours_per_week: 5,
    prefers_spanish_exam: true,
    country: 'AR',
  });
  assert.deepEqual(readProfile({ experience: 'senior', budget_usd: -1, hours_per_week: 0, country: 'ARG', prefers_spanish_exam: 'yes' }), {});
  assert.deepEqual(readProfile(null), {});
});

test('certifications the page does not know are found, then left out', () => {
  const has = (id) => id !== 'new-cert';
  const m = {
    picks: [{ id: 'new-cert', why: 'x' }, { id: 'aws-clf-c02', why: 'y' }],
    roadmap: { steps: [{ id: 'new-cert', weeks: 1, note: '' }, { id: 'aws-clf-c02', weeks: 2, note: '' }] },
    comparison: ['new-cert', 'aws-clf-c02'],
  };
  assert.deepEqual(unknownIds(m, has), ['new-cert']);
  assert.deepEqual(keepKnown(m, has), { picks: [{ id: 'aws-clf-c02', why: 'y' }] });
  assert.deepEqual(keepKnown({ picks: [{ id: 'new-cert', why: '' }] }, has), {});
});

test('the lead is the first paragraph; the rest follows the cards', () => {
  assert.deepEqual(splitLead('Arrancá por X.\n\nDespués Y.\n\nY armá el plan.'), ['Arrancá por X.', 'Después Y.\n\nY armá el plan.']);
  assert.deepEqual(splitLead('Una sola línea.'), ['Una sola línea.', '']);
  assert.deepEqual(splitLead(''), ['', '']);
});

// ---------- hand-offs ----------

test('weekly hours become study days and a session length', () => {
  assert.deepEqual(weeklySchedule(1), { days: [6], len: 60 });
  assert.deepEqual(weeklySchedule(4), { days: [1, 3, 5], len: 75 });
  assert.deepEqual(weeklySchedule(5), { days: [1, 3, 5], len: 105 });
  assert.deepEqual(weeklySchedule(40), { days: [1, 2, 3, 4, 5, 6], len: 240 });
  assert.equal(weeklySchedule(0), null);
  assert.equal(weeklySchedule(undefined), null);
});

test('the plan link carries the weekly schedule and, from a roadmap, the total hours', () => {
  const road = { hours_per_week: 4, steps: [{ id: 'isc2-cc', weeks: 5, note: '' }, { id: 'x-y', weeks: 9, note: '' }] };
  const href = planHref('isc2-cc', { hours_per_week: 6 }, road);
  const params = new URLSearchParams(href.split('?')[1]);
  assert.ok(href.startsWith('#plan?'));
  assert.deepEqual(Object.fromEntries(params), { cert: 'isc2-cc', hours: '20', days: '1,3,5', len: '75' });
  assert.equal(planHref('isc2-cc'), '#plan?cert=isc2-cc');
  assert.deepEqual(Object.fromEntries(new URLSearchParams(planHref('isc2-cc', { hours_per_week: 3 }).split('?')[1])), { cert: 'isc2-cc', days: '3,6', len: '90' });
});

test('"For me" gets the conversation with the AI profile on top', () => {
  const intent = { profile: { roles: ['developer'], known: [], want: ['security'], experience: 'some', budget: null }, levelStated: false, topical: 2 };
  const fromProfile = { profile: { roles: ['security'], known: ['python'], want: ['cloud', 'security'] }, topical: 3 };
  const out = applyProfile(intent, { experience: 'new', budget_usd: 0 }, fromProfile);
  assert.deepEqual(out.profile, { roles: ['developer', 'security'], known: ['python'], want: ['security', 'cloud'], experience: 'new', budget: 0 });
  assert.equal(out.levelStated, true);
  assert.equal(out.topical, 6);
  assert.deepEqual(applyProfile(intent, {}).profile, intent.profile);
  assert.equal(applyProfile({ ...intent, topical: 0 }, {}).topical, 0);
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

test('the saved conversation keeps warnings, roadmaps, comparisons, replies and the profile', () => {
  const answer = {
    role: 'assistant',
    content: 'Tres pasos.',
    source: 'ai',
    picks: [{ id: 'aws-clf-c02', why: 'x', warning: 'Ojo' }],
    roadmap: { hours_per_week: 5, steps: [{ id: 'aws-clf-c02', weeks: 4, note: '' }, { id: 'aws-aif-c01', weeks: 5, note: 'IA' }] },
    comparison: ['aws-aif-c01', 'microsoft-az-900'],
    replies: ['¿Algo más barato?'],
    live: true,
  };
  const saved = toStore([user('hola'), answer], { hours_per_week: 5, bogus: true });
  assert.deepEqual(saved.profile, { hours_per_week: 5 });
  const back = fromStore(JSON.parse(JSON.stringify(saved)));
  const { live, ...kept } = answer;
  assert.deepEqual(back.messages[1], kept);
  assert.deepEqual(back.profile, { hours_per_week: 5 });
  assert.equal('profile' in toStore([user('hola')], {}), false);
  // Only a comparison is still an answer worth keeping.
  assert.equal(fromStore(toStore([user('a'), { role: 'assistant', content: '', comparison: ['a-b', 'c-d'] }])).messages.length, 2);
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
  for (const value of [null, undefined, 'text', {}, { v: 0, messages: [] }, { v: STORE_VERSION, messages: 'no' }]) assert.deepEqual(fromStore(value), { messages: [], draft: '', profile: {} });
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
  for (const key of ['chat.ex1', 'chat.ex2', 'chat.ex3', 'chat.ex4', 'chat.roadmap', 'chat.weeks', 'chat.compare', 'chat.makePlan', 'chat.repliesLabel']) assert.ok(key in STR.en && key in STR.es, key);
  // Spanish examples are written in voseo, as people would type them.
  assert.match(STR.es['chat.ex3'], /armame/);
});

test('the service worker never answers the chat request', async () => {
  // The chat posts to another origin; the worker only handles same-origin GETs.
  const sw = await readFile(new URL('../site/sw.js', import.meta.url), 'utf8');
  const handler = sw.slice(sw.indexOf("addEventListener('fetch'"));
  assert.match(handler, /if \(request\.method !== 'GET'\) return;/);
  assert.match(handler, /if \(url\.origin !== self\.location\.origin\) return;/);
  assert.ok(handler.indexOf("request.method !== 'GET'") < handler.indexOf('respondWith'));
});
