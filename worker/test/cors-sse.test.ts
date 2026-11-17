import { describe, expect, it } from 'vitest';
import { corsHeaders, isAllowedOrigin, preflightHeaders } from '../src/cors';
import { doneEvent, errorEvent, parseSse, picksEvent, sseEvent, textEvent } from '../src/sse';

describe('CORS', () => {
  it('allows the site, GitHub Pages and local servers on any port', () => {
    for (const origin of [
      'https://pathfinder.legios.com.ar',
      'https://legiosai.github.io',
      'http://localhost',
      'http://localhost:5173',
      'http://127.0.0.1:8080',
      'http://127.0.0.1:65535',
    ]) {
      expect(isAllowedOrigin(origin), origin).toBe(true);
    }
  });

  it('rejects everything else', () => {
    for (const origin of [
      null,
      undefined,
      '',
      'null',
      'http://pathfinder.legios.com.ar',
      'https://pathfinder.legios.com.ar.evil.example',
      'https://evil.example',
      'https://legiosai.github.io.evil.example',
      'https://localhost:5173',
      'http://localhost.evil.example',
      'http://localhost:5173/path',
      'http://127.0.0.2:8080',
    ]) {
      expect(isAllowedOrigin(origin), String(origin)).toBe(false);
    }
  });

  it('echoes only an allowed origin and always varies on Origin', () => {
    expect(corsHeaders('https://legiosai.github.io')).toMatchObject({
      'access-control-allow-origin': 'https://legiosai.github.io',
      vary: 'Origin',
    });
    expect(corsHeaders('https://evil.example')).toEqual({ vary: 'Origin' });
  });

  it('answers preflights with the contract methods and header', () => {
    expect(preflightHeaders('http://localhost:3000')).toMatchObject({
      'access-control-allow-origin': 'http://localhost:3000',
      'access-control-allow-methods': 'GET, POST, OPTIONS',
      'access-control-allow-headers': 'content-type',
    });
  });
});

describe('SSE encoding', () => {
  it('writes one event and one data line per event', () => {
    expect(sseEvent('text', { t: 'hola' })).toBe('event: text\ndata: {"t":"hola"}\n\n');
    expect(doneEvent()).toBe('event: done\ndata: {}\n\n');
    expect(errorEvent('refusal')).toBe('event: error\ndata: {"code":"refusal"}\n\n');
  });

  it('keeps newlines and quotes inside the JSON', () => {
    const chunk = 'line one\n\nline "two"\r\n';
    const encoded = textEvent(chunk);
    expect(encoded.split('\n').filter(Boolean)).toHaveLength(2);
    expect(parseSse(encoded)).toEqual([{ event: 'text', data: { t: chunk } }]);
  });

  it('round-trips a whole reply', () => {
    const body = textEvent('A') + textEvent('B') + picksEvent([{ id: 'aws-clf-c02', why: 'Cloud basics.' }]) + doneEvent();
    expect(parseSse(body).map((e) => e.event)).toEqual(['text', 'text', 'picks', 'done']);
  });
});
