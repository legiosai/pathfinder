// A stand-in for the chat endpoint, for development and tests only. It speaks the same contract as
// the real one (POST /chat, server-sent events) with canned answers that recommend real catalog ids,
// and can act out every failure the page has to handle.
//
// Usage: node scripts/chat-mock.mjs [port] [--mode=<mode>]   (port 8813 by default)
// Then open the site with ?chat=http://127.0.0.1:8813. A mode can also go in the address, per request:
// ?chat=http://127.0.0.1:8813/m/429 posts to /m/429/chat.
//
// Modes:
//   ok          a streamed answer with picks (the default)
//   lag         the same after a 3 s pause, to see the typing indicator
//   slow        nothing for 25 s: the page gives up after 20 and answers on the device
//   429         rate limited, retry after 60 s       503 / disabled   upstream down / AI turned off
//   400 / 403 / 413 / 500                             the other errors before the stream
//   error       an `error` event (overloaded) before any text
//   refusal     an `error` event (refusal) before any text
//   late        some text, then an `error` event (internal)
//   cut         some text, then the connection closes without `done`
import { createServer } from 'node:http';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { bundle, loadCatalog } from './catalog.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const port = Number(args.find((a) => /^\d+$/.test(a)) || 8813);
const defaultMode = (args.find((a) => a.startsWith('--mode=')) || '--mode=ok').slice(7);
const catalog = bundle(await loadCatalog(root), new Date().toISOString().slice(0, 10));
const ids = new Set(catalog.certifications.map((c) => c.id));
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

// Canned answers by topic. Every id is checked against the catalog at start-up.
const TOPICS = [
  {
    words: /secur|segur|ciber|cyber|hack|pentest/,
    picks: [
      ['isc2-cc', { en: 'An entry exam that covers the security basics every role needs.', es: 'Un examen inicial que cubre la base de seguridad que pide cualquier rol.' }],
      ['comptia-security-plus', { en: 'The usual first step for a security job; vendor-neutral.', es: 'El primer paso típico para un puesto de seguridad; no depende de un proveedor.' }],
      ['aws-scs-c03', { en: 'Cloud security on AWS, once the basics are in place.', es: 'Seguridad en AWS, cuando ya tengas la base.' }],
    ],
    en: 'Good goal. Since you are starting in security, I would build the base first and then specialise:\n\n- **ISC2 CC** gives you the vocabulary and core ideas.\n- **Security+** is what most job posts ask for.\n- If cloud is where you want to end up, **AWS Security Specialty** comes after.\n\nWith 5 hours a week, plan about two months for each of the first two.',
    es: 'Buen objetivo. Como arrancás en seguridad, armaría primero la base y después me especializaría:\n\n- **ISC2 CC** te da el vocabulario y las ideas centrales.\n- **Security+** es la que más piden los avisos.\n- Si querés terminar en la nube, después viene **AWS Security Specialty**.\n\nCon 5 horas por semana, calculá unos dos meses para cada una de las dos primeras.',
  },
  {
    words: /\bai\b|\bia\b|llm|agent|genai|generativ|claude|machine learning/,
    picks: [
      ['aws-aif-c01', { en: 'Entry level and US$100; pathfinder has practice questions for it.', es: 'Nivel inicial y US$100; pathfinder tiene preguntas de práctica.' }],
      ['claude-architect-foundations', { en: 'Hands-on with building on Claude, a step up from the basics.', es: 'Práctica construyendo con Claude, un paso después de lo básico.' }],
      ['langchain-lcae', { en: 'Agents and LLM apps with LangChain, under US$100.', es: 'Agentes y apps con LLM usando LangChain, por menos de US$100.' }],
    ],
    en: 'For generative AI I would start broad and then pick a stack. **AWS AI Practitioner** is cheap and covers the concepts; after that, one of the builder certifications depending on the tools you want to use.',
    es: 'Para IA generativa empezaría por algo amplio y después elegiría un stack. **AWS AI Practitioner** es barata y cubre los conceptos; después, una de las certificaciones para construir, según las herramientas que quieras usar.',
  },
  {
    words: /data|datos|sql|analyt|analist|analyst/,
    picks: [
      ['microsoft-dp-900', { en: 'Data fundamentals: a gentle start.', es: 'Fundamentos de datos: un comienzo tranquilo.' }],
      ['snowflake-snowpro-core', { en: 'Widely used warehouse, associate level.', es: 'Un data warehouse muy usado, nivel asociado.' }],
      ['aws-dea-c01', { en: 'Data engineering on AWS for when you are ready.', es: 'Ingeniería de datos en AWS para cuando estés listo.' }],
    ],
    en: 'For data, these three go from fundamentals to engineering.',
    es: 'Para datos, estas tres van de los fundamentos a la ingeniería.',
  },
  {
    words: /cloud|nube|aws|azure|gcp|google|kubernetes|devops|k8s/,
    picks: [
      ['aws-clf-c02', { en: 'The entry point to AWS; practice questions included here.', es: 'La puerta de entrada a AWS; acá tiene preguntas de práctica.' }],
      ['google-cloud-digital-leader', { en: 'Google Cloud basics for under US$100.', es: 'Lo básico de Google Cloud por menos de US$100.' }],
      ['lf-kcna', { en: 'Kubernetes and cloud native concepts.', es: 'Conceptos de Kubernetes y cloud native.' }],
    ],
    en: 'Here are three good entry points to cloud. Pick the provider your company or target jobs use; the concepts carry over.',
    es: 'Estas son tres buenas puertas de entrada a la nube. Elegí el proveedor que usa tu empresa o los trabajos que buscás; los conceptos se trasladan.',
  },
];
for (const t of TOPICS) for (const [id] of t.picks) if (!ids.has(id)) throw new Error(`chat-mock: ${id} is not in the catalog`);
const ASK = {
  en: 'Happy to help. What do you do today, and what would you like to work on? A budget and the hours you have each week help too.',
  es: 'Con gusto. ¿A qué te dedicás hoy y en qué te gustaría trabajar? También ayuda saber tu presupuesto y cuántas horas por semana tenés.',
};

function answerFor(messages, lang) {
  const text = messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join(' ')
    .toLowerCase();
  const topic = TOPICS.find((t) => t.words.test(text));
  if (!topic) return { text: ASK[lang], picks: [] };
  return { text: topic[lang], picks: topic.picks.map(([id, why]) => ({ id, why: why[lang] })) };
}

// The endpoint's checks (worker/src/validate.ts), so the page is tested against the same rules.
// Returns [status, detail] for a request it would refuse.
function check(body) {
  const { messages, lang } = body || {};
  if (lang !== 'en' && lang !== 'es') return [400, 'lang'];
  if (!Array.isArray(messages) || !messages.length) return [400, 'messages'];
  if (messages.length > 20) return [413, 'too many messages'];
  for (const [i, m] of messages.entries()) {
    if (m?.role !== (i % 2 ? 'assistant' : 'user')) return [400, `role at ${i}`];
    if (typeof m.content !== 'string') return [400, `content at ${i}`];
    if (m.content.length > (m.role === 'user' ? 1000 : 4000)) return [413, `length at ${i}`];
    if (m.role === 'user' && !m.content.trim()) return [400, `empty at ${i}`];
    if (m.picks !== undefined && (m.role !== 'assistant' || !Array.isArray(m.picks) || m.picks.length > 10 || m.picks.some((id) => !ids.has(id)))) return [400, `picks at ${i}`];
  }
  if (messages.at(-1).role !== 'user') return [400, 'last'];
  return null;
}

const cors = (req) => ({
  'access-control-allow-origin': req.headers.origin || '*',
  'access-control-expose-headers': 'Retry-After',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type',
  'access-control-max-age': '600',
  vary: 'Origin',
});

const ERRORS = {
  429: [429, { error: 'rate_limited', retryAfter: 60 }],
  503: [503, { error: 'upstream' }],
  disabled: [503, { error: 'disabled' }],
  400: [400, { error: 'bad_request' }],
  403: [403, { error: 'origin' }],
  413: [413, { error: 'too_long' }],
  500: [500, { error: 'internal' }],
};

createServer(async (req, res) => {
  const path = new URL(req.url, 'http://x').pathname;
  const route = path.match(/^(?:\/m\/([\w-]+))?\/chat$/);
  if (req.method === 'OPTIONS') return res.writeHead(204, cors(req)).end();
  if (!route || req.method !== 'POST') return res.writeHead(404, { ...cors(req), 'content-type': 'application/json' }).end('{"error":"not_found"}');
  const mode = route[1] || defaultMode;
  const json = (status, body) => res.writeHead(status, { ...cors(req), 'content-type': 'application/json', ...(body.retryAfter ? { 'retry-after': String(body.retryAfter) } : {}) }).end(JSON.stringify(body));

  let raw = '';
  for await (const chunk of req) {
    raw += chunk;
    if (raw.length > 128 * 1024) return json(413, { error: 'too_long' });
  }
  let body = null;
  try {
    body = JSON.parse(raw);
  } catch {
    /* checked below */
  }
  const problem = check(body);
  console.log(`${new Date().toISOString().slice(11, 19)} ${mode} ${problem ? `${problem[0]} (${problem[1]})` : `${body.messages.length} messages, ${body.lang}`}`);
  if (problem) return json(problem[0], problem[0] === 413 ? { error: 'too_long' } : { error: 'bad_request', detail: problem[1] });
  if (ERRORS[mode]) return json(...ERRORS[mode]);

  let closed = false;
  req.on('close', () => (closed = true));
  if (mode === 'slow') await sleep(25000);
  if (closed) return;
  res.writeHead(200, { ...cors(req), 'content-type': 'text/event-stream; charset=utf-8', 'cache-control': 'no-store' });
  const send = (event, data) => !closed && res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
  res.write(': connected\n\n');
  if (mode === 'lag') await sleep(3000);
  if (mode === 'error' || mode === 'refusal') {
    await sleep(400);
    send('error', { code: mode === 'error' ? 'overloaded' : 'refusal' });
    return res.end();
  }
  const { text, picks } = answerFor(body.messages, body.lang);
  const words = text.match(/\S+\s*/g) || [];
  const stopAt = mode === 'late' || mode === 'cut' ? Math.ceil(words.length / 3) : words.length;
  await sleep(500);
  for (let i = 0; i < stopAt; i += 2) {
    if (closed) return;
    send('text', { t: words.slice(i, i + 2).join('') });
    await sleep(45);
  }
  if (mode === 'late') {
    send('error', { code: 'internal' });
    return res.end();
  }
  if (mode === 'cut') return res.destroy();
  if (picks.length) send('picks', { picks });
  send('done', {});
  res.end();
}).listen(port, '127.0.0.1', () => console.log(`chat mock (${defaultMode}) on http://127.0.0.1:${port}/chat`));
