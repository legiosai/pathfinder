// MOCK=1: a canned, contract-valid reply with picks from the real catalog, for building the
// UI and for tests. Claude is never called. A last user message of "mock:ask",
// "mock:refusal", "mock:overloaded", "mock:internal" or "mock:upstream" produces that case.

import type { CatalogCert, CompiledCatalog } from './catalog';
import type { ErrorCode, Pick } from './sse';
import type { ChatRequest, Lang } from './validate';

export type MockPlan =
  | { kind: 'upstream' }
  | { kind: 'stream'; chunks: string[]; picks: Pick[]; error?: ErrorCode };

const TEXT: Record<Lang, { reply: string[]; ask: string[]; partial: string[] }> = {
  en: {
    reply: [
      'This is a mock reply from the chat worker (MOCK=1), ',
      'so you can build the interface without calling Claude. ',
      'Here are a few certifications from the catalog to try the cards with.\n\n',
      'Prices vary by country, so confirm them with the issuer before you book.',
    ],
    ask: ['This is a mock follow-up question (MOCK=1). ', 'What is your current role, and how many hours a week can you study?'],
    partial: ['This mock reply stops halfway ', 'with an overloaded error'],
  },
  es: {
    reply: [
      'Esta es una respuesta de prueba del worker del chat (MOCK=1), ',
      'para que puedas armar la interfaz sin llamar a Claude. ',
      'Acá van algunas certificaciones del catálogo para probar las tarjetas.\n\n',
      'Los precios cambian según el país, así que confirmalos con el emisor antes de reservar.',
    ],
    ask: ['Esta es una repregunta de prueba (MOCK=1). ', '¿Qué rol tenés hoy y cuántas horas por semana podés estudiar?'],
    partial: ['Esta respuesta de prueba se corta ', 'con un error de sobrecarga'],
  },
};

const words = (text: string) => new Set(text.toLowerCase().split(/[^a-z0-9áéíóúñü]+/).filter((w) => w.length >= 3));

function haystack(cert: CatalogCert): string {
  return [cert.id, cert.name, cert.provider, cert.code, cert.category, ...cert.skills, ...cert.roles].join(' ').toLowerCase();
}

/** Up to three certifications that share words with the message, else the first entry-level ones. */
export function mockPicks(message: string, catalog: CompiledCatalog, lang: Lang): Pick[] {
  const tokens = [...words(message)];
  const scored = catalog.certs
    .map((cert) => ({ cert, score: tokens.filter((t) => haystack(cert).includes(t)).length }))
    .filter((s) => s.score > 0)
    .sort((a, b) => b.score - a.score || (a.cert.id < b.cert.id ? -1 : 1))
    .map((s) => s.cert);
  const entry = catalog.certs.filter((c) => c.level === 'entry');
  const chosen = (scored.length ? scored : entry.length ? entry : catalog.certs).slice(0, 3);
  return chosen.map((cert) => ({
    id: cert.id,
    why: lang === 'es' ? `Sugerencia de prueba: ${cert.category}, nivel ${cert.level}, de ${cert.provider}.` : `Mock pick: ${cert.level}-level ${cert.category} from ${cert.provider}.`,
  }));
}

export function planMock(request: ChatRequest, catalog: CompiledCatalog): MockPlan {
  const last = request.messages[request.messages.length - 1].content.trim();
  const text = TEXT[request.lang];
  switch (last.toLowerCase()) {
    case 'mock:upstream':
      return { kind: 'upstream' };
    case 'mock:ask':
      return { kind: 'stream', chunks: text.ask, picks: [] };
    case 'mock:refusal':
      return { kind: 'stream', chunks: [], picks: [], error: 'refusal' };
    case 'mock:overloaded':
      return { kind: 'stream', chunks: text.partial, picks: [], error: 'overloaded' };
    case 'mock:internal':
      return { kind: 'stream', chunks: [], picks: [], error: 'internal' };
    default:
      return { kind: 'stream', chunks: text.reply, picks: mockPicks(last, catalog, request.lang) };
  }
}
