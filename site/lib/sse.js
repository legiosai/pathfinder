// Server-sent events from a fetch() body. EventSource only does GET, and the chat posts the
// conversation, so the stream is read by hand. Pure: no DOM, no network; Node tests import it.
//
// The parser follows the format in the HTML standard: lines end in \n, \r\n or \r; "event:" names the
// event, "data:" lines are joined with \n, lines starting with ":" are comments (keep-alives), and a
// blank line dispatches. "id:" and "retry:" are accepted and ignored: nothing here reconnects.

/**
 * Incremental parser. push(text) takes any slice of the stream (a chunk can end mid-line, even
 * between \r and \n) and returns the events it completed as { event, data }; end() returns the last
 * one when the stream stops without its closing blank line, which the standard would drop.
 */
export function createParser() {
  let buffer = '';
  let skipLF = false; // the previous chunk ended in \r: a \n opening the next one belongs to it
  let event = '';
  let data = [];

  function dispatch(out) {
    if (data.length) out.push({ event: event || 'message', data: data.join('\n') });
    event = '';
    data = [];
  }

  function line(text, out) {
    if (text === '') return dispatch(out);
    if (text[0] === ':') return;
    const colon = text.indexOf(':');
    const field = colon < 0 ? text : text.slice(0, colon);
    let value = colon < 0 ? '' : text.slice(colon + 1);
    if (value[0] === ' ') value = value.slice(1);
    if (field === 'event') event = value;
    else if (field === 'data') data.push(value);
  }

  return {
    push(chunk) {
      const out = [];
      let text = String(chunk);
      if (skipLF && text[0] === '\n') text = text.slice(1);
      skipLF = false;
      buffer += text;
      let start = 0;
      for (let i = 0; i < buffer.length; i++) {
        const c = buffer[i];
        if (c !== '\n' && c !== '\r') continue;
        line(buffer.slice(start, i), out);
        if (c === '\r') {
          if (i + 1 === buffer.length) skipLF = true;
          else if (buffer[i + 1] === '\n') i++;
        }
        start = i + 1;
      }
      buffer = buffer.slice(start);
      return out;
    },
    end() {
      const out = [];
      if (buffer) line(buffer, out);
      buffer = '';
      dispatch(out);
      return out;
    },
  };
}

/** JSON in an event's data, or null when it is not JSON. */
export function json(data) {
  try {
    return JSON.parse(data);
  } catch {
    return null;
  }
}

/**
 * Read a byte stream (response.body) and call onEvent for every event, in order. Resolves when the
 * stream ends or onEvent returns false (the rest is cancelled); rejects when reading fails, an abort
 * included. onChunk runs on every read, before the events it completes, so a caller can tell that
 * bytes arrived even when no event is complete yet.
 */
export async function readEvents(body, onEvent, { onChunk } = {}) {
  const reader = body.getReader();
  const decoder = new TextDecoder();
  const parser = createParser();
  const deliver = (events) => events.every((e) => onEvent(e) !== false);
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    onChunk?.();
    if (!deliver(parser.push(decoder.decode(value, { stream: true })))) {
      await reader.cancel().catch(() => {});
      return;
    }
  }
  deliver([...parser.push(decoder.decode()), ...parser.end()]);
}
