import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createParser, json, readEvents } from '../site/lib/sse.js';

const all = (chunks) => {
  const p = createParser();
  return [...chunks.flatMap((c) => p.push(c)), ...p.end()];
};

const STREAM = 'event: text\ndata: {"t":"Hola"}\n\nevent: text\ndata: {"t":", ¿cómo va?"}\n\nevent: picks\ndata: {"picks":[{"id":"aws-aif-c01","why":"Entry level"}]}\n\nevent: done\ndata: {}\n\n';

test('reads the events of a chat stream in order', () => {
  const events = all([STREAM]);
  assert.deepEqual(
    events.map((e) => e.event),
    ['text', 'text', 'picks', 'done'],
  );
  assert.equal(json(events[1].data).t, ', ¿cómo va?');
  assert.deepEqual(json(events[2].data).picks, [{ id: 'aws-aif-c01', why: 'Entry level' }]);
});

test('gives the same events however the stream is cut', () => {
  const whole = all([STREAM]);
  for (let size = 1; size <= 9; size++) {
    const chunks = [];
    for (let i = 0; i < STREAM.length; i += size) chunks.push(STREAM.slice(i, i + size));
    assert.deepEqual(all(chunks), whole, `chunks of ${size}`);
  }
});

test('accepts \\r\\n and \\r line endings, even split between chunks', () => {
  const crlf = STREAM.replace(/\n/g, '\r\n');
  assert.deepEqual(all([crlf]), all([STREAM]));
  assert.deepEqual(all(crlf.split(/(?<=\r)/)), all([STREAM]), 'every chunk ends right after a \\r');
  assert.deepEqual(all([STREAM.replace(/\n/g, '\r')]), all([STREAM]));
});

test('joins data lines, skips comments and unknown fields, and defaults the event name', () => {
  const events = all([': keep-alive\n\nid: 7\nretry: 1000\ndata: one\ndata:two\ndata\nfoo: bar\n\n']);
  assert.deepEqual(events, [{ event: 'message', data: 'one\ntwo\n' }]);
});

test('drops a blank event and keeps one space after the colon only', () => {
  assert.deepEqual(all(['event: text\n\n', 'data:  two spaces\n\n']), [{ event: 'message', data: ' two spaces' }]);
});

test('a last event without its closing blank line still arrives at the end', () => {
  const p = createParser();
  assert.deepEqual(p.push('event: done\ndata: {}'), []);
  assert.deepEqual(p.end(), [{ event: 'done', data: '{}' }]);
});

test('json() returns null for data that is not JSON', () => {
  assert.equal(json('{"t":'), null);
  assert.deepEqual(json('{}'), {});
});

const body = (chunks) => {
  const enc = new TextEncoder();
  return new ReadableStream({
    start(c) {
      for (const x of chunks) c.enqueue(typeof x === 'string' ? enc.encode(x) : x);
      c.close();
    },
  });
};

test('readEvents decodes UTF-8 split inside a character', async () => {
  const bytes = new TextEncoder().encode('event: text\ndata: {"t":"señal ✓"}\n\n');
  const cut = bytes.indexOf(0xc3) + 1; // between the two bytes of ñ
  const seen = [];
  let chunks = 0;
  await readEvents(body([bytes.slice(0, cut), bytes.slice(cut)]), (e) => seen.push(json(e.data).t), { onChunk: () => chunks++ });
  assert.deepEqual(seen, ['señal ✓']);
  assert.equal(chunks, 2);
});

test('readEvents stops reading when the handler returns false', async () => {
  const seen = [];
  await readEvents(body([STREAM]), (e) => {
    seen.push(e.event);
    return e.event !== 'picks';
  });
  assert.deepEqual(seen, ['text', 'text', 'picks']);
});

// A whole answer as the endpoint sends it since it has tools: every event after the text, in order.
const TOOLS_STREAM = [
  'event: text\ndata: {"t":"Arrancá por CLF-C02."}\n\n',
  'event: picks\ndata: {"picks":[{"id":"aws-clf-c02","why":"Base","warning":"Se pasa de tu presupuesto."}]}\n\n',
  'event: roadmap\ndata: {"steps":[{"id":"aws-clf-c02","weeks":4,"note":"Base"},{"id":"aws-aif-c01","weeks":5,"note":"IA"}],"hours_per_week":5}\n\n',
  'event: comparison\ndata: {"ids":["aws-clf-c02","microsoft-az-900"]}\n\n',
  'event: profile\ndata: {"profile":{"hours_per_week":5,"country":"AR"}}\n\n',
  'event: replies\ndata: {"replies":["¿Algo más barato?","Armame el plan"]}\n\n',
  'event: done\ndata: {}\n\n',
].join('');

test('reads the tool events of an answer, however the stream is cut', () => {
  const whole = all([TOOLS_STREAM]);
  assert.deepEqual(
    whole.map((e) => e.event),
    ['text', 'picks', 'roadmap', 'comparison', 'profile', 'replies', 'done'],
  );
  assert.equal(json(whole[1].data).picks[0].warning, 'Se pasa de tu presupuesto.');
  assert.deepEqual(json(whole[2].data).steps.map((s) => s.weeks), [4, 5]);
  assert.deepEqual(json(whole[5].data).replies, ['¿Algo más barato?', 'Armame el plan']);
  for (const size of [1, 7, 33]) {
    const chunks = [];
    for (let i = 0; i < TOOLS_STREAM.length; i += size) chunks.push(TOOLS_STREAM.slice(i, i + size));
    assert.deepEqual(all(chunks), whole, `chunks of ${size}`);
  }
});

test('readEvents delivers events it does not know, for the page to ignore', async () => {
  const seen = [];
  await readEvents(body(['event: future\ndata: {"x":1}\n\n', TOOLS_STREAM]), (e) => {
    seen.push(e.event);
  });
  assert.deepEqual(seen, ['future', 'text', 'picks', 'roadmap', 'comparison', 'profile', 'replies', 'done']);
});
