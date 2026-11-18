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
