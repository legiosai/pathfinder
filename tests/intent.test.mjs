import { test } from 'node:test';
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { AREAS, CHEAP_USD, intentFrom, normalize, parseIntent, recommend, signalKey, vocabulary, withoutSignal } from '../site/lib/intent.js';
import { emptyProfile, rank } from '../site/lib/match.js';
import { estimateHours } from '../site/lib/planner.js';
import { bundle, loadCatalog } from '../scripts/catalog.mjs';

const root = new URL('..', import.meta.url).pathname;
const taxonomy = JSON.parse(await readFile(new URL('../data/taxonomy.json', import.meta.url), 'utf8'));
const certs = bundle(await loadCatalog(root), '2026-11-17').certifications;

const read = (text, opts) => parseIntent(text, opts);
const values = (intent, type) => intent.signals.filter((s) => s.type === type).map((s) => s.value);
const budget = (text) => read(text).profile.budget;
const level = (text) => read(text).profile.experience;

// ---------- vocabulary ----------

test('the vocabulary is large, unambiguous and uses taxonomy ids only', () => {
  const v = vocabulary();
  assert.ok(v.phrases > 1000, `${v.phrases} phrases`);
  assert.deepEqual(v.conflicts, [], 'a phrase listed under two different meanings');
  const skills = new Set(taxonomy.skills.map((s) => s.id));
  const roles = new Set(taxonomy.roles.map((r) => r.id));
  for (const id of v.skillIds) assert.ok(skills.has(id), `unknown skill ${id}`);
  for (const id of v.roleIds) assert.ok(roles.has(id), `unknown role ${id}`);
  for (const a of v.areaNames) assert.ok(AREAS.includes(a), `unknown area ${a}`);
  // Every skill and role can be reached from text.
  assert.deepEqual(v.skillIds, [...skills].sort());
  assert.deepEqual(v.roleIds, [...roles].sort());
});

test('areas include the categories being added to the catalog', () => {
  for (const cat of ['AI engineering', 'ML foundations', 'AI security', 'Cloud & platform', 'Cybersecurity', 'Data & analytics']) assert.ok(AREAS.includes(cat), cat);
  assert.deepEqual(values(read('ciberseguridad'), 'area'), ['Cybersecurity']);
  assert.deepEqual(values(read('análisis de datos y dashboards'), 'area'), ['Data & analytics']);
});

test('normalize drops case, accents and apostrophes', () => {
  assert.equal(normalize('Dólares, CIBERSEGURIDAD, don’t, Ñandú'), 'dolares, ciberseguridad, dont, nandu');
  assert.equal(normalize(null), '');
});

// ---------- the two sentences from the brief ----------

test('reads an English goal with role, level, topic, budget and time', () => {
  const it = read("I'm a junior dev, I want to get into cloud security, budget under 200 dollars, I have about 5 hours a week");
  assert.deepEqual(it.profile.roles, ['developer']);
  assert.equal(it.profile.experience, 'new');
  assert.deepEqual(it.profile.want, ['security']);
  assert.ok(it.areas.includes('Cybersecurity') && it.areas.includes('Cloud & platform'));
  assert.equal(it.profile.budget, 200);
  assert.equal(it.hoursPerWeek, 5);
  assert.deepEqual(it.profile.known, []);
});

test('reads a Spanish goal the same way', () => {
  const it = read('soy analista de datos y quiero meterme en IA generativa, algo para principiantes');
  assert.deepEqual(it.profile.roles, ['data-engineer']);
  assert.deepEqual(it.profile.want, ['llm-apps']);
  assert.ok(it.areas.includes('AI engineering'));
  assert.equal(it.profile.experience, 'new');
  assert.equal(it.profile.budget, null);
});

// ---------- topics, synonyms, accents ----------

test('synonyms in both languages land on the same skill', () => {
  const same = (skill, ...phrases) => {
    for (const p of phrases) assert.ok(read(p).profile.want.includes(skill), `${p} → ${skill}`);
  };
  same('security', 'hacking', 'pentesting', 'ciberseguridad', 'red team', 'seguridad informática', 'ethical hacking', 'Hacking ético');
  same('kubernetes', 'kubernetes', 'k8s', 'contenedores', 'Docker', 'containers');
  same('devops', 'DevOps', 'CI/CD', 'integración continua');
  same('data', 'datos', 'data engineering', 'analytics', 'SQL', 'ingeniería de datos', 'Power BI');
  same('llm-apps', 'IA generativa', 'generative AI', 'LLMs', 'GenAI');
  same('agents', 'agentes', 'AI agents', 'agentic', 'agentes de IA');
  same('rag', 'RAG', 'vector databases', 'búsqueda semántica', 'embeddings');
  same('prompting', 'prompts', 'prompt engineering', 'ingeniería de prompts');
  same('networking', 'redes', 'networking', 'routing');
  same('ai-security', 'AI security', 'seguridad de IA', 'prompt injection', 'AI red teaming');
  same('aws', 'AWS', 'Amazon Web Services');
  same('azure', 'Azure', 'microsoft azure');
  same('gcp', 'Google Cloud', 'GCP', 'google');
  same('iac', 'Terraform', 'infraestructura como código', 'IaC');
  same('governance', 'gobernanza de IA', 'compliance', 'responsible AI', 'privacidad');
});

test('case and accents do not matter', () => {
  const a = read('Quiero CIBERSEGURIDAD, menos de 200 DÓLARES, soy PRINCIPIANTE');
  const b = read('quiero ciberseguridad, menos de 200 dolares, soy principiante');
  assert.deepEqual(a.profile, b.profile);
  assert.deepEqual(a.profile.want, ['security']);
});

test('the longest phrase wins', () => {
  assert.deepEqual(read('seguridad de IA').profile.want, ['ai-security']);
  assert.deepEqual(read('redes neuronales').profile.want, ['deep-learning']);
  assert.deepEqual(read('data engineer').profile.roles, ['data-engineer']);
  assert.deepEqual(read('data engineer').profile.want, []);
});

test('generic cloud and AI point at areas', () => {
  assert.deepEqual(read('cloud').areas, ['Cloud & platform']);
  assert.deepEqual(read('la nube').profile.want, []);
  const ai = read('inteligencia artificial');
  assert.deepEqual(ai.profile.want, ['ml-foundations', 'llm-apps']);
  assert.ok(ai.areas.includes('AI engineering') && ai.areas.includes('ML foundations'));
});

// ---------- roles ----------

test('roles describe the present; a goal role also adds what it implies', () => {
  const now = read("I'm a security analyst");
  assert.deepEqual(now.profile.roles, ['security']);
  assert.deepEqual(now.profile.want, []);
  const goal = read('quiero ser pentester');
  assert.deepEqual(goal.profile.roles, ['security']);
  assert.deepEqual(goal.profile.want, ['security']);
  assert.deepEqual(read('soy DevOps').profile.roles, ['platform']);
  assert.deepEqual(read('senior DevOps').profile.roles, ['platform']);
  assert.deepEqual(read('I want to learn DevOps').profile.want, ['devops']);
  assert.deepEqual(read('I am not a developer').profile.roles, []);
  assert.deepEqual(read('product manager, non technical').profile.roles, ['business']);
});

// ---------- what you already use ----------

test('known skills are told apart from goals', () => {
  const it = read('I know Python and SQL, want to learn RAG and agents');
  assert.deepEqual(it.profile.known, ['python', 'data']);
  assert.deepEqual(it.profile.want, ['rag', 'agents']);
  const es = read('ya uso AWS pero quiero aprender Azure');
  assert.deepEqual(es.profile.known, ['aws']);
  assert.deepEqual(es.profile.want, ['azure']);
  assert.deepEqual(read('Python developer').profile.known, ['python']);
  // A weak "use" inside a goal stays a goal.
  assert.deepEqual(read('I want to learn to use Kubernetes').profile.want, ['kubernetes']);
});

// ---------- negation and issuers ----------

test('negation leaves issuers and skills out', () => {
  const es = read('no quiero AWS');
  assert.deepEqual(es.avoid.providers, ['AWS']);
  assert.deepEqual(es.avoid.skills, ['aws']);
  assert.deepEqual(es.profile.want, []);
  assert.deepEqual(read("I don't want Azure").avoid.skills, ['azure']);
  assert.deepEqual(read("I don't want to learn AWS").avoid.providers, ['AWS']);
  assert.deepEqual(read('anything but Oracle').avoid.providers, ['Oracle']);
  const list = read('nada de AWS, Azure ni Google');
  assert.deepEqual(list.avoid.skills.sort(), ['aws', 'azure', 'gcp']);
  assert.deepEqual(list.profile.want, []);
});

test('negation stops at the end of its clause', () => {
  const it = read('no AWS, I want security');
  assert.deepEqual(it.avoid.providers, ['AWS']);
  assert.deepEqual(it.profile.want, ['security']);
  const b = read('no quiero AWS pero sí Azure');
  assert.deepEqual(b.profile.want, ['azure']);
  const c = read('no AWS and I want kubernetes');
  assert.deepEqual(c.profile.want, ['kubernetes']);
  const d = read('Soy DevOps y quiero aprender seguridad, no me interesa la nube');
  assert.deepEqual(d.profile.want, ['security']);
  assert.deepEqual(d.avoid.areas, ['Cloud & platform']);
});

test('phrases that only look negative are not negation', () => {
  assert.deepEqual(read('not only AWS').profile.want, ['aws']);
  assert.equal(level('sin experiencia en cloud'), 'new');
  assert.deepEqual(read('sin experiencia en cloud').avoid.areas, []);
  assert.equal(budget('sin costo'), 0);
  assert.equal(level("I'm not a beginner"), 'some');
  assert.equal(level('no soy principiante'), 'some');
});

test('issuer names come from the catalog when it is given', () => {
  const fake = [{ id: 'acme-x1', code: 'ACME-X1', provider: 'Acme Labs', skills: ['agents'], category: 'AI engineering' }];
  assert.deepEqual(read('something from Acme Labs', { certs: fake }).providers, ['Acme Labs']);
  // An alias for an issuer the catalog lacks keeps its skills but no issuer.
  const it = read('Snowflake', { certs: fake });
  assert.deepEqual(it.providers, []);
  assert.deepEqual(it.profile.want, ['data']);
  // Without a catalog the alias stands.
  assert.deepEqual(read('Snowflake').providers, ['Snowflake']);
  // Naming Anthropic shows its partner-only exams, with their warning.
  assert.equal(read('Claude certification').profile.includeRestricted, true);
  assert.equal(read('agents').profile.includeRestricted, false);
});

test('certification codes from the catalog are recognized', () => {
  const like = read('something like AZ-900', { certs });
  assert.deepEqual(values(like, 'cert'), ['microsoft-az-900']);
  assert.ok(like.profile.want.includes('azure'));
  assert.ok(like.areas.includes('Cloud & platform'));
  const has = read('ya tengo la CLF-C02', { certs });
  assert.deepEqual(values(has, 'has'), ['aws-clf-c02']);
  assert.ok(has.profile.known.includes('aws'));
  assert.deepEqual(read('anything but the CKAD', { certs }).avoid.certs, ['lf-ckad']);
  assert.deepEqual(values(read('AZ900', { certs }), 'cert'), ['microsoft-az-900']);
  // Codes that are names ("Agent databases") stay plain words.
  assert.deepEqual(values(read('agent databases', { certs }), 'cert'), []);
  // A code not in the catalog, negated, does not rule out its whole issuer.
  assert.deepEqual(read('the CKAD, not the CKA', { certs }).avoid.providers, []);
});

// ---------- budget ----------

test('budgets in many forms', () => {
  assert.equal(budget('$150'), 150);
  assert.equal(budget('150 USD'), 150);
  assert.equal(budget('150usd'), 150);
  assert.equal(budget('US$ 99'), 99);
  assert.equal(budget('u$s 120'), 120);
  assert.equal(budget('menos de 200 dólares'), 200);
  assert.equal(budget('hasta 300'), 300);
  assert.equal(budget('under 250'), 250);
  assert.equal(budget('budget of 1,500'), 1500);
  assert.equal(budget('presupuesto de 1.500 dólares'), 1500);
  assert.equal(budget('max $1k'), 1000);
  assert.equal(budget('between 100 and 300 USD'), 300);
  assert.equal(budget('entre 100 y 300 dólares'), 300);
  assert.equal(budget('$100-$300'), 300);
  assert.equal(budget('doscientos dólares'), 200);
  assert.equal(budget('a hundred dollars'), 100);
  assert.equal(budget('I have $500 but would rather stay under $200'), 200);
  // Emoji before the number do not shift what is read.
  const it = read('🙂🙂 kubernetes, under $200, 5 hours a week');
  assert.equal(it.profile.budget, 200);
  assert.equal(it.hoursPerWeek, 5);
  assert.deepEqual(it.profile.want, ['kubernetes']);
});

test('free, cheap and any price', () => {
  assert.equal(budget('free'), 0);
  assert.equal(budget('gratis'), 0);
  assert.equal(budget('algo gratuito'), 0);
  assert.equal(budget('$0'), 0);
  assert.equal(budget('free or under $100'), 100);
  const cheap = read('something cheap');
  assert.equal(cheap.profile.budget, CHEAP_USD);
  assert.equal(cheap.signals.find((s) => s.type === 'budget').soft, true);
  assert.equal(budget('barato'), CHEAP_USD);
  assert.equal(budget('nada caro'), CHEAP_USD);
  assert.equal(budget('cheap, under $80'), 80);
  assert.equal(budget('money is no object'), null);
  assert.equal(budget('no me importa el precio'), null);
  assert.equal(budget("doesn't have to be free"), null);
});

test('numbers that are not a budget', () => {
  assert.equal(budget('AZ-900'), null);
  assert.equal(budget('k8s'), null);
  assert.equal(budget('under 10 hours a week'), null);
  assert.equal(budget('5 years of experience'), null);
  assert.equal(budget('500 pesos'), null);
  assert.equal(budget('100 euros'), null);
  assert.equal(budget('I have free time on weekends'), null);
  assert.equal(budget('tengo 30 años'), null);
  assert.equal(budget('ISO 42001'), null);
  assert.equal(read('under 10 hours a week').hoursPerWeek, 10);
});

// ---------- experience ----------

test('experience from words and years', () => {
  for (const t of ['beginner', 'principiante', 'sin experiencia', 'junior', 'desde cero', 'entry level', 'recién empiezo', 'estudiante', 'nothing too advanced']) assert.equal(level(t), 'new', t);
  for (const t of ['senior', 'avanzado', 'experto', 'experienced', 'expert level', 'nivel profesional']) assert.equal(level(t), 'experienced', t);
  for (const t of ['intermediate', 'semi senior', 'nivel intermedio', 'some experience']) assert.equal(level(t), 'some', t);
  assert.equal(level('3 years of experience'), 'experienced');
  assert.equal(level('5+ years'), 'experienced');
  assert.equal(level('3 años de experiencia'), 'experienced');
  assert.equal(level('llevo 2 años como desarrollador'), 'some');
  assert.equal(level('1-2 years in IT'), 'some');
  assert.equal(level('6 months of experience'), 'new');
  assert.equal(level('less than a year'), 'new');
  // Age and plans are not experience.
  assert.equal(read("I'm 25 years old").levelStated, false);
  assert.equal(read('tengo 30 años').levelStated, false);
  assert.equal(read('in 2 years I want to be an architect').levelStated, false);
  // Mixed signals meet in the middle.
  assert.equal(level('senior developer but a beginner in cloud'), 'some');
  assert.equal(level('I want to become an expert in AI'), 'some');
  assert.equal(read('I want to become an expert in AI').levelStated, false);
});

// ---------- time, practice and exam style ----------

test('hours a week and a deadline', () => {
  assert.equal(read('5 hours a week').hoursPerWeek, 5);
  assert.equal(read('10 horas por semana').hoursPerWeek, 10);
  assert.equal(read('6 hs semanales').hoursPerWeek, 6);
  assert.equal(read('2h/week').hoursPerWeek, 2);
  assert.equal(read('una hora por día').hoursPerWeek, 7);
  assert.equal(read('an hour a day').hoursPerWeek, 7);
  assert.equal(read('a couple of hours a week').hoursPerWeek, 2);
  assert.equal(read('in 3 months').weeks, 13);
  assert.equal(read('en un mes').weeks, 4);
  assert.equal(read('en 6 semanas').weeks, 6);
  assert.equal(read('next month').weeks, 4);
  assert.equal(read('twice a week').weeks, null);
  assert.equal(read('6 months of experience').weeks, null);
});

test('practice questions and exam style', () => {
  assert.equal(read('with practice questions').practice, true);
  assert.equal(read('quiero simulacros').practice, true);
  assert.equal(read('preguntas de práctica').practice, true);
  assert.equal(read('agents').practice, false);
  assert.equal(read('hands-on exams').profile.style, 'practical');
  assert.equal(read('examen práctico').profile.style, 'practical');
  assert.equal(read('multiple choice').profile.style, 'knowledge');
  assert.equal(read('no labs').profile.style, 'knowledge');
  assert.equal(read('agents').profile.style, 'any');
  assert.equal(read('best practices').practice, false);
});

// ---------- empty and odd input ----------

test('empty and garbage input understand nothing', () => {
  for (const t of ['', '   ', 'asdf qwer zzz', '!!!???', '12345', null, undefined, '🙂🙂']) {
    const it = read(t);
    assert.equal(it.signals.length, 0, String(t));
    assert.equal(it.topical, 0);
    assert.deepEqual(it.profile.want, []);
  }
});

test('long input stays fast', () => {
  const text = "I'm a junior dev who wants cloud security and agents, no AWS, under $200, 5 hours a week. ".repeat(40);
  const t0 = performance.now();
  for (let i = 0; i < 10; i++) read(text, { certs });
  const each = (performance.now() - t0) / 10;
  assert.ok(each < 50, `${each.toFixed(1)} ms per parse`);
});

// ---------- the intent object ----------

test('the profile has the "For me" shape', () => {
  const it = read('junior dev, cloud security, under $200');
  assert.deepEqual(Object.keys(it.profile).sort(), Object.keys(emptyProfile()).sort());
  assert.deepEqual(Object.keys(read('').profile).sort(), Object.keys(emptyProfile()).sort());
  assert.equal(read('').profile.experience, emptyProfile().experience);
});

test('removing a chip removes its effect', () => {
  const it = read('junior dev, cloud security, no AWS, under $200');
  const noBudget = withoutSignal(it, signalKey(it.signals.find((s) => s.type === 'budget')));
  assert.equal(noBudget.profile.budget, null);
  assert.deepEqual(noBudget.profile.want, it.profile.want);
  const keepAws = withoutSignal(it, 'avoid-provider:AWS');
  assert.deepEqual(keepAws.avoid.providers, []);
  const noLevel = withoutSignal(it, 'level:new');
  assert.equal(noLevel.profile.experience, 'some');
  assert.deepEqual(intentFrom([]).profile, read('').profile);
});

test('every signal keeps the words that produced it', () => {
  const it = read('Soy dev junior, quiero Kubernetes, hasta 150 USD');
  for (const s of it.signals) assert.ok(s.words && typeof s.words === 'string', signalKey(s));
  assert.equal(it.signals.find((s) => s.type === 'budget').words, '150 usd');
});

// ---------- recommendations with the shipped catalog ----------
// These check properties, not certification ids, so they hold as the catalog grows.

const suggest = (text, opts = {}) => {
  const intent = read(text, { certs });
  const ranked = rank(certs, intent.profile);
  return { intent, ...recommend(certs, ranked, intent, { estimate: (c) => estimateHours(c, intent.profile).hours, ...opts }) };
};
const fee = (c) => c.fee.usd;

test('junior dev into cloud security under $200: affordable security picks', () => {
  const { picks } = suggest("I'm a junior dev, I want to get into cloud security, budget under 200 dollars, I have about 5 hours a week");
  assert.ok(picks.length >= 2 && picks.length <= 5);
  for (const p of picks) {
    assert.ok(fee(p.cert) == null || fee(p.cert) <= 200, p.id);
    assert.ok(p.cert.skills.includes('security') || ['Cybersecurity', 'Cloud & platform'].includes(p.cert.category), p.id);
    assert.ok(p.reasons.length > 0, p.id);
    assert.ok(p.notes.some((n) => /weeks? at 5 h a week/.test(n)), p.id);
  }
  assert.ok(['entry', 'associate'].includes(picks[0].cert.level));
  assert.ok(picks[0].cert.skills.includes('security'));
});

test('data analyst into generative AI as a beginner: GenAI picks, entry level near the top', () => {
  const { picks } = suggest('soy analista de datos y quiero meterme en IA generativa, algo para principiantes');
  assert.ok(picks.length >= 3);
  assert.ok(picks[0].cert.skills.includes('llm-apps'));
  assert.ok(picks.slice(0, 3).some((p) => p.cert.level === 'entry'));
  for (const p of picks) assert.notEqual(p.cert.status, 'restricted', p.id);
});

test('senior DevOps, Kubernetes, hands-on, no AWS: Kubernetes first and no AWS at all', () => {
  const { picks, left } = suggest('Senior DevOps engineer, Kubernetes and hands-on exams, no AWS');
  assert.ok(picks.length >= 1);
  assert.ok(picks[0].cert.skills.includes('kubernetes'));
  for (const p of picks) assert.notEqual(p.cert.provider, 'AWS', p.id);
  assert.ok(left >= 0);
});

test('agents without AWS or Azure under 150 dollars', () => {
  const { picks } = suggest('nada de AWS ni Azure, quiero agentes, menos de 150 dólares');
  assert.ok(picks.length >= 1);
  assert.ok(picks[0].cert.skills.includes('agents'));
  for (const p of picks) {
    assert.notEqual(p.cert.provider, 'AWS', p.id);
    assert.ok(fee(p.cert) == null || fee(p.cert) <= 150, p.id);
    if (p.cert.skills.includes('azure')) assert.ok(p.warnings.some((w) => /skip/.test(w)), p.id);
  }
});

test('free means a known price of zero', () => {
  const { picks } = suggest('algo gratis para principiantes');
  assert.ok(picks.length >= 1);
  for (const p of picks) assert.equal(fee(p.cert), 0, p.id);
});

test('a named issuer comes first and partner-only exams show with their warning', () => {
  const { picks } = suggest('Claude certification for developers');
  assert.equal(picks[0].cert.provider, 'Anthropic');
  for (const p of picks.filter((x) => x.cert.status === 'restricted')) assert.ok(p.warnings.length > 0, p.id);
});

test('a named code is the first pick and what you already have is left out', () => {
  assert.equal(suggest('something like AZ-900').picks[0].id, 'microsoft-az-900');
  const { picks } = suggest('ya tengo la CLF-C02 y quiero algo de seguridad en AWS');
  assert.ok(picks.length >= 1);
  assert.ok(!picks.some((p) => p.id === 'aws-clf-c02'));
  assert.equal(picks[0].cert.provider, 'AWS');
});

test('a deadline that does not fit warns', () => {
  const { picks } = suggest('cloud security, 2 hours a week, in 2 weeks');
  assert.ok(picks.length >= 1);
  for (const p of picks) assert.ok(p.warnings.some((w) => /more than 2 weeks at 2 h a week/.test(w)), p.id);
});

test('nothing topical: every certification is a candidate, still within the budget', () => {
  const { picks } = suggest('under $100');
  assert.ok(picks.length >= 1);
  for (const p of picks) assert.ok(fee(p.cert) == null || fee(p.cert) <= 100, p.id);
});

test('picks stay few and sorted', () => {
  for (const text of ['agents', 'cloud', 'security', 'datos', 'AI', 'kubernetes, senior']) {
    const { picks } = suggest(text, { limit: 4 });
    assert.ok(picks.length <= 4, text);
    for (let i = 1; i < picks.length; i++) assert.ok(picks[i - 1].score >= picks[i].score, text);
    for (const p of picks) assert.ok(p.score >= 0 && p.score <= 100, text);
  }
});

test('moving into an area: certs of that area are not held back by the role you have now', () => {
  // Two certs that both cover security at entry level: one aimed at developers in Cloud & platform,
  // one aimed at security roles in Cybersecurity. Wanting to move into cybersecurity as a developer
  // should put the second first, whatever the real catalog holds.
  const base = certs.find((c) => c.level === 'entry' && c.fee.usd != null && c.fee.usd <= 150);
  const cloud = { ...base, id: 'demo-cloud', code: 'DC-1', category: 'Cloud & platform', roles: ['developer'], skills: ['security', 'aws'], fee: { ...base.fee, usd: 100 } };
  const cyber = { ...base, id: 'demo-cyber', code: 'DS-1', category: 'Cybersecurity', roles: ['security'], skills: ['security'], fee: { ...base.fee, usd: 150 } };
  const pool = [cloud, cyber];
  for (const text of ['soy dev junior, quiero meterme en ciberseguridad', "I'm a junior developer and I want to get into cybersecurity"]) {
    const intent = parseIntent(text, { certs: pool });
    assert.deepEqual(intent.profile.roles, ['developer'], text);
    const { picks } = recommend(pool, rank(pool, intent.profile, {}), intent);
    assert.equal(picks[0].id, 'demo-cyber', text);
  }
  // Without a named area, the role still counts as before.
  const plain = parseIntent('soy dev junior, quiero aprender security', { certs: pool });
  if (!plain.areas.includes('Cybersecurity')) {
    const { picks } = recommend(pool, rank(pool, plain.profile, {}), plain);
    assert.equal(picks[0].id, 'demo-cloud');
  }
});
