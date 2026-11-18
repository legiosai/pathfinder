// A stand-in for the chat endpoint, for development and tests only. It speaks the same contract as
// the real one (POST /chat, server-sent events) with canned answers that recommend real catalog ids,
// and can act out every failure the page has to handle.
//
// Answers carry every event the real endpoint sends: text, picks (with a warning for restricted,
// upcoming or over-budget certifications), roadmap (when the message asks for an order or a path),
// comparison (when it names two or more certifications, or says "compare"/"vs"), profile (hours a
// week, budget, role, country and Spanish exam when the message says them) and replies. A message of
// "mock:unknown" adds a pick the catalog doesn't have, to see the page drop it.
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
//   tools       every event on every answer
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
    en: 'Start with ISC2 CC: it gives you the vocabulary every security role expects, and Security+ is what most job posts ask for next.\n\nIf cloud is where you want to end up, AWS Security Specialty comes after those two. Build the plan from the first card to see the weeks.',
    es: 'Arrancá por ISC2 CC: te da el vocabulario que pide cualquier rol de seguridad, y después Security+, que es la que más piden los avisos.\n\nSi querés terminar en la nube, AWS Security Specialty viene después de esas dos. Armá el plan desde la primera tarjeta para ver las semanas.',
  },
  {
    words: /\bai\b|\bia\b|llm|agent|genai|generativ|claude|machine learning/,
    picks: [
      ['aws-aif-c01', { en: 'Entry level and US$100; pathfinder has practice questions for it.', es: 'Nivel inicial y US$100; pathfinder tiene preguntas de práctica.' }],
      ['claude-architect-foundations', { en: 'Hands-on with building on Claude, a step up from the basics.', es: 'Práctica construyendo con Claude, un paso después de lo básico.' }],
      ['langchain-lcae', { en: 'Agents and LLM apps with LangChain, under US$100.', es: 'Agentes y apps con LLM usando LangChain, por menos de US$100.' }],
    ],
    en: 'AWS AI Practitioner is the best first step: entry level, US$100, and it covers the concepts before you pick a stack.\n\nAfter it, take one of the builder certifications depending on the tools you want to use.',
    es: 'AWS AI Practitioner es el mejor primer paso: nivel inicial, US$100, y cubre los conceptos antes de elegir un stack.\n\nDespués, una de las certificaciones para construir, según las herramientas que quieras usar.',
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
const COMPARE_TEXT = {
  en: 'They cover the same ground at the same level; pick the provider your target jobs use. The table has the details.',
  es: 'Cubren lo mismo y al mismo nivel; elegí el proveedor que usan los trabajos que buscás. La tabla tiene el detalle.',
};
const REPLIES = {
  en: ['Anything cheaper?', 'Plan the path in order', 'I have 5 hours a week'],
  es: ['¿Algo más barato?', 'Armame el camino en orden', 'Tengo 5 horas por semana'],
};
const WARN = {
  restricted: { en: 'Only for people who meet its eligibility rules.', es: 'Solo si cumplís los requisitos de elegibilidad.' },
  upcoming: { en: 'Announced but not open for registration yet.', es: 'Anunciada, pero la inscripción todavía no abrió.' },
  budget: { en: 'Over your budget.', es: 'Se pasa de tu presupuesto.' },
};
const byId = new Map(catalog.certifications.map((c) => [c.id, c]));
const LEVEL_HOURS = Object.fromEntries(catalog.taxonomy.levels.map((l) => [l.id, l.hours]));

/** What the message says about the person, the way set_profile would record it. */
function profileFrom(text) {
  const p = {};
  const hours = text.match(/(\d+(?:[.,]\d+)?)\s*(?:h|horas?|hours?)\b(?:\s*(?:a la|por|a|per|each)\s*(?:semana|week))?/);
  if (hours) p.hours_per_week = Number(hours[1].replace(',', '.'));
  const budget = text.match(/(?:us\$|usd\s*|\$)\s*(\d+)|(\d+)\s*(?:usd|d[oó]lares|dollars)/);
  if (budget) p.budget_usd = Number(budget[1] || budget[2]);
  if (/argentin/.test(text)) p.country = 'AR';
  if (/en español|in spanish|inglés (es )?(muy )?flojo/.test(text)) p.prefers_spanish_exam = true;
  const role = text.match(/\b(dev(?:eloper)? backend|backend dev(?:eloper)?|soporte técnico|help ?desk|estudiante|student|sysadmin)\b/);
  if (role) p.role = role[1];
  return p;
}

/** Certifications the message names by exam code or by name (for the comparison). */
function named(text) {
  const found = [];
  for (const c of catalog.certifications) {
    const code = c.code.toLowerCase();
    const short = c.name.replace(/^(AWS Certified|Microsoft|Google Cloud|CompTIA)\s+/, '').toLowerCase();
    if ((code.length >= 4 && text.includes(code)) || (short.split(' ').length >= 2 && text.includes(short))) found.push(c.id);
  }
  return found;
}

const ASK = {
  en: 'Happy to help. What do you do today, and what would you like to work on? A budget and the hours you have each week help too.',
  es: 'Con gusto. ¿A qué te dedicás hoy y en qué te gustaría trabajar? También ayuda saber tu presupuesto y cuántas horas por semana tenés.',
};

/** The canned answer and its events. `everything` (mode tools) adds a roadmap and a table to any answer. */
function answerFor(messages, lang, kept = {}, everything = false) {
  const text = messages
    .filter((m) => m.role === 'user')
    .map((m) => m.content)
    .join(' ')
    .toLowerCase();
  const last = messages.at(-1).content.toLowerCase();
  const profile = { ...kept, ...profileFrom(last) };
  const said = Object.keys(profileFrom(last)).length ? profileFrom(last) : null;
  const answer = { text: ASK[lang], picks: [], roadmap: null, comparison: [], profile: said, replies: REPLIES[lang].slice(0, 2) };

  const compared = named(last);
  if (compared.length >= 2 || /compar|\bvs\.?\b/.test(last)) {
    answer.comparison = (compared.length >= 2 ? compared : ['aws-clf-c02', 'microsoft-az-900']).slice(0, 4);
    answer.text = COMPARE_TEXT[lang];
    answer.replies = REPLIES[lang].slice(1);
    if (!everything) return answer;
  }
  const topic = TOPICS.find((t) => t.words.test(text)) || (everything || last === 'mock:unknown' ? TOPICS.at(-1) : null);
  if (!topic) return answer;
  answer.text = answer.comparison.length ? `${COMPARE_TEXT[lang]}\n\n${topic[lang]}` : topic[lang];
  answer.picks = topic.picks.map(([id, why]) => {
    const c = byId.get(id);
    const pick = { id, why: why[lang] };
    const reason = c.status === 'restricted' || c.status === 'upcoming' ? c.status : profile.budget_usd != null && c.fee.usd > profile.budget_usd ? 'budget' : null;
    if (reason) pick.warning = WARN[reason][lang];
    return pick;
  });
  if (last === 'mock:unknown') answer.picks.unshift({ id: 'made-up-cert', why: 'Not in the catalog.' });
  if (everything || /camino|orden|path|order|roadmap|paso a paso|step by step/.test(last)) {
    const hpw = profile.hours_per_week || 5;
    answer.roadmap = {
      hours_per_week: hpw,
      steps: topic.picks.map(([id]) => {
        const [lo, hi] = LEVEL_HOURS[byId.get(id).level] || [25, 45];
        return { id, weeks: Math.max(1, Math.round((lo + hi) / 2 / hpw)), note: '' };
      }),
    };
    answer.roadmap.steps[0].note = lang === 'es' ? 'La base' : 'The basics';
    answer.picks = answer.picks.slice(0, 1);
  }
  if (everything && !answer.comparison.length) answer.comparison = topic.picks.slice(0, 2).map(([id]) => id);
  return answer;
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
  if (body.profile != null && (typeof body.profile !== 'object' || Array.isArray(body.profile))) return [400, 'profile'];
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
  const answer = answerFor(body.messages, body.lang, body.profile || {}, mode === 'tools');
  const { text, picks } = answer;
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
  if (answer.roadmap) send('roadmap', answer.roadmap);
  if (answer.comparison.length) send('comparison', { ids: answer.comparison });
  if (answer.profile) send('profile', { profile: answer.profile });
  if (answer.replies.length) send('replies', { replies: answer.replies });
  send('done', {});
  res.end();
}).listen(port, '127.0.0.1', () => console.log(`chat mock (${defaultMode}) on http://127.0.0.1:${port}/chat`));
