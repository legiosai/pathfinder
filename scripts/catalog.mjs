// Load and validate the catalog. Shared by the build, the validator CLI and the tests.
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { validatePractice } from '../site/lib/practice.js';

const LEVELS = ['entry', 'associate', 'professional', 'expert'];
const STATUSES = ['available', 'restricted', 'upcoming'];
const STYLES = ['knowledge', 'practical', 'hybrid'];
const TYPES = ['certification', 'certificate', 'microcredential', 'course'];
const PREP_KINDS = ['official-guide', 'course', 'docs', 'practice'];
const PREP_COSTS = ['free', 'paid'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;
// A BCP 47 tag of the shapes the catalog uses: language, optional script, optional region
// ("en", "es-419", "pt-BR", "zh-Hans", "zh-Hant-TW").
const LANG = /^[a-z]{2,3}(-[A-Z][a-z]{3})?(-([A-Z]{2}|\d{3}))?$/;
const DELIVERY = ['online', 'test-center'];
const TIMELINE_KINDS = ['retires', 'changes', 'opens', 'deadline'];
const ACCESS_LISTS = ['free_routes', 'discounts'];
const ACCESS_NOTES = ['retake', 'accommodations'];
const REGION = /^[A-Z]{2}$/;

export async function loadCatalog(root) {
  const dir = join(root, 'data');
  const files = (await readdir(join(dir, 'certifications'))).filter((f) => f.endsWith('.json')).sort();
  const certifications = [];
  for (const f of files) {
    const cert = JSON.parse(await readFile(join(dir, 'certifications', f), 'utf8'));
    cert._file = f;
    certifications.push(cert);
  }
  const read = async (name) => JSON.parse(await readFile(join(dir, name), 'utf8'));
  const practiceFiles = (await readdir(join(dir, 'practice')).catch(() => [])).filter((f) => f.endsWith('.json')).sort();
  const practice = [];
  for (const f of practiceFiles) practice.push({ ...JSON.parse(await readFile(join(dir, 'practice', f), 'utf8')), _file: f });
  return {
    certifications,
    practice,
    sources: await read('sources.json'),
    reports: await read('reports.json'),
    taxonomy: await read('taxonomy.json'),
    paths: (await read('paths.json').catch(() => ({ paths: [] }))).paths,
    regions: await read('regions.json').catch((e) => {
      if (e.code === 'ENOENT') return {};
      throw e;
    }),
  };
}

function isUrl(u) {
  try {
    const url = new URL(u);
    return url.protocol === 'https:' || url.protocol === 'http:';
  } catch {
    return false;
  }
}

/** A real calendar date written YYYY-MM-DD. */
function isDate(d) {
  if (typeof d !== 'string' || !DATE.test(d)) return false;
  const t = new Date(`${d}T00:00:00Z`);
  return !Number.isNaN(t.getTime()) && t.toISOString().slice(0, 10) === d;
}

/** Returns a list of human-readable problems. Empty means valid. */
export function validate({ certifications, sources, reports, taxonomy, practice = [], paths = [], regions = {} }) {
  const errors = [];
  const err = (where, msg) => errors.push(`${where}: ${msg}`);
  const str = (v) => typeof v === 'string';

  const skills = new Set(taxonomy.skills.map((s) => s.id));
  const roles = new Set(taxonomy.roles.map((r) => r.id));
  for (const l of taxonomy.levels) {
    if (!LEVELS.includes(l.id)) err('taxonomy', `unknown level ${l.id}`);
    if (!Array.isArray(l.hours) || l.hours.length !== 2 || !(l.hours[0] < l.hours[1])) err('taxonomy', `bad hours for ${l.id}`);
  }

  const sourceIds = new Set();
  for (const s of sources) {
    const w = `sources.json ${s.id}`;
    if (!str(s.id) || !s.id) err(w, 'missing id');
    if (sourceIds.has(s.id)) err(w, 'duplicate id');
    sourceIds.add(s.id);
    if (!str(s.title) || !s.title) err(w, 'missing title');
    if (!isUrl(s.url)) err(w, `bad url ${s.url}`);
    if ('checked_on' in s && !isDate(s.checked_on)) err(w, 'checked_on must be YYYY-MM-DD');
  }

  const reportIds = new Set();
  for (const r of reports) {
    const w = `reports.json ${r.id}`;
    if (reportIds.has(r.id)) err(w, 'duplicate id');
    reportIds.add(r.id);
    if (!str(r.title) || !r.title) err(w, 'missing title');
    if (!isUrl(r.url)) err(w, `bad url ${r.url}`);
    if (!DATE.test(r.checked_on || '')) err(w, 'checked_on must be YYYY-MM-DD');
  }

  const certIds = new Set();
  for (const c of certifications) {
    const w = c._file || c.id;
    if (!ID.test(c.id || '')) err(w, 'id must be lowercase words joined by hyphens');
    if (c._file && c._file !== `${c.id}.json`) err(w, `file name must be ${c.id}.json`);
    if (certIds.has(c.id)) err(w, 'duplicate id');
    certIds.add(c.id);
    for (const k of ['name', 'provider', 'code', 'category', 'scope']) {
      if (!str(c[k]) || !c[k].trim()) err(w, `missing ${k}`);
    }
    if (!TYPES.includes(c.type)) err(w, `type must be one of ${TYPES.join(', ')}`);
    if (!LEVELS.includes(c.level)) err(w, `level must be one of ${LEVELS.join(', ')}`);
    if (!STATUSES.includes(c.status)) err(w, `status must be one of ${STATUSES.join(', ')}`);
    if (!c.fee || !(c.fee.usd === null || (typeof c.fee.usd === 'number' && c.fee.usd >= 0))) err(w, 'fee.usd must be a number >= 0 or null');
    if (!c.exam || !STYLES.includes(c.exam.style)) err(w, `exam.style must be one of ${STYLES.join(', ')}`);
    if (c.exam && !(c.exam.minutes === null || (Number.isInteger(c.exam.minutes) && c.exam.minutes > 0))) err(w, 'exam.minutes must be a positive integer or null');
    if (c.exam && (!str(c.exam.format) || !c.exam.format)) err(w, 'missing exam.format');
    if (c.exam && 'question_count' in c.exam && !(Number.isInteger(c.exam.question_count) && c.exam.question_count > 0)) err(w, 'exam.question_count must be a positive integer');
    if (c.exam && 'languages' in c.exam) {
      const langs = c.exam.languages;
      if (!Array.isArray(langs) || !langs.length) err(w, 'exam.languages must be a non-empty list (omit it when unknown)');
      else {
        for (const l of langs) if (!str(l) || !LANG.test(l)) err(w, `exam.languages: "${l}" is not a language code like en, es-419 or pt-BR`);
        if (new Set(langs).size !== langs.length) err(w, 'exam.languages has duplicates');
      }
    }
    if (c.exam && 'delivery' in c.exam) {
      const d = c.exam.delivery;
      if (!Array.isArray(d) || !d.length) err(w, 'exam.delivery must be a non-empty list (omit it when unknown)');
      else {
        for (const x of d) if (!DELIVERY.includes(x)) err(w, `exam.delivery must only contain ${DELIVERY.join(', ')}`);
        if (new Set(d).size !== d.length) err(w, 'exam.delivery has duplicates');
      }
    }
    if ('access' in c) {
      const a = c.access;
      if (!a || typeof a !== 'object' || Array.isArray(a)) err(w, 'access must be an object');
      else {
        for (const k of Object.keys(a)) if (![...ACCESS_LISTS, ...ACCESS_NOTES].includes(k)) err(w, `access has unknown key ${k}`);
        for (const k of ACCESS_LISTS) {
          if (!(k in a)) continue;
          if (!Array.isArray(a[k]) || !a[k].length) {
            err(w, `access.${k} must be a non-empty list`);
            continue;
          }
          for (const item of a[k]) {
            if (!str(item?.text) || !item.text.trim()) err(w, `each access.${k} entry needs a text`);
            if (!isUrl(item?.url)) err(w, `bad access.${k} url ${item?.url}`);
            if (item && 'until' in item && !isDate(item.until)) err(w, `access.${k} until must be YYYY-MM-DD`);
          }
        }
        for (const k of ACCESS_NOTES) if (k in a && (!str(a[k]) || !a[k].trim())) err(w, `access.${k} must be a sentence`);
      }
    }
    if ('timeline' in c) {
      if (!Array.isArray(c.timeline)) err(w, 'timeline must be a list');
      else {
        for (const e of c.timeline) {
          if (!isDate(e?.date)) err(w, 'each timeline entry needs a date (YYYY-MM-DD)');
          if (!TIMELINE_KINDS.includes(e?.kind)) err(w, `timeline kind must be one of ${TIMELINE_KINDS.join(', ')}`);
          if (!str(e?.text) || !e.text.trim()) err(w, 'each timeline entry needs a text');
          if (!sourceIds.has(e?.source)) err(w, `timeline: unknown source ${e?.source}`);
        }
        const dates = c.timeline.map((e) => e?.date || '');
        if (dates.some((d, i) => i && d < dates[i - 1])) err(w, 'timeline must be sorted by date');
      }
    }
    if (c.status === 'restricted' && !c.requirements) err(w, 'restricted certifications must explain requirements');
    if (!Array.isArray(c.skills) || !c.skills.length) err(w, 'needs at least one skill');
    for (const s of c.skills || []) if (!skills.has(s)) err(w, `unknown skill "${s}" (add it to taxonomy.json)`);
    if (!Array.isArray(c.roles) || !c.roles.length) err(w, 'needs at least one role');
    for (const r of c.roles || []) if (!roles.has(r)) err(w, `unknown role "${r}"`);
    if (!Array.isArray(c.sources) || !c.sources.length) err(w, 'needs at least one source');
    for (const s of c.sources || []) if (!sourceIds.has(s)) err(w, `unknown source ${s}`);
    for (const r of c.reports || []) if (!reportIds.has(r)) err(w, `unknown report ${r}`);
    if (!DATE.test(c.checked_on || '')) err(w, 'checked_on must be YYYY-MM-DD');
    if (!Array.isArray(c.caveats)) err(w, 'caveats must be a list');
    if (!Array.isArray(c.prep)) err(w, 'prep must be a list (empty is fine)');
    for (const p of c.prep || []) {
      if (!str(p.title) || !p.title) err(w, 'each prep resource needs a title');
      if (!isUrl(p.url)) err(w, `bad prep url ${p.url}`);
      if (!PREP_KINDS.includes(p.kind)) err(w, `prep kind must be one of ${PREP_KINDS.join(', ')}`);
      if (!PREP_COSTS.includes(p.cost)) err(w, `prep cost must be one of ${PREP_COSTS.join(', ')}`);
      if ('lang' in p && !(str(p.lang) && LANG.test(p.lang))) err(w, `prep lang "${p.lang}" is not a language code (omit it for English)`);
    }
    if (!Array.isArray(c.domains)) err(w, 'domains must be a list');
    if (c.domains && c.domains.length) {
      const sum = c.domains.reduce((t, d) => t + d.weight, 0);
      if (Math.abs(sum - 100) > 1) err(w, `domain weights add up to ${sum}, expected 100`);
      for (const d of c.domains) if (!str(d.name) || !(d.weight > 0)) err(w, 'each domain needs a name and a positive weight');
      if (!c.domains_note) err(w, 'domains need a domains_note saying where the weights come from');
    }
  }
  for (const r of reports) {
    for (const id of r.certifications || []) if (!certIds.has(id)) err(`reports.json ${r.id}`, `unknown certification ${id}`);
  }
  for (const set of practice) {
    const w = `practice/${set._file}`;
    if (set._file !== `${set.cert}.json`) err(w, `file name must be ${set.cert}.json`);
    const cert = certifications.find((c) => c.id === set.cert);
    for (const problem of validatePractice(set, cert)) err(w, problem);
    if (cert && !Number.isInteger(cert.exam.minutes)) err(w, 'the certification needs exam.minutes');
    if (cert && !Number.isInteger(cert.exam.question_count)) err(w, 'the certification needs exam.question_count');
  }
  const pathIds = new Set();
  for (const p of paths) {
    const w = `paths.json ${p.id}`;
    if (!ID.test(p.id || '')) err(w, 'bad id');
    if (pathIds.has(p.id)) err(w, 'duplicate id');
    pathIds.add(p.id);
    for (const k of ['title', 'summary']) if (!str(p[k]?.en) || !str(p[k]?.es)) err(w, `${k} needs en and es`);
    if (!certifications.some((c) => c.category === p.category)) err(w, `unknown category ${p.category}`);
    if (!Array.isArray(p.steps) || p.steps.length < 2) err(w, 'needs at least two steps');
    for (const [i, step] of (p.steps || []).entries()) {
      if (!Array.isArray(step.certs) || !step.certs.length) err(w, `step ${i + 1} has no certifications`);
      for (const id of step.certs || []) if (!certIds.has(id)) err(w, `step ${i + 1}: unknown certification ${id}`);
      if (!str(step.note?.en) || !str(step.note?.es)) err(w, `step ${i + 1} note needs en and es`);
    }
  }
  if (!regions || typeof regions !== 'object' || Array.isArray(regions)) err('regions.json', 'must be an object keyed by region code');
  else {
    for (const [code, r] of Object.entries(regions)) {
      const w = `regions.json ${code}`;
      if (!REGION.test(code)) err(w, 'key must be a two-letter region code like AR');
      for (const k of ['en', 'es']) if (!str(r?.[k]) || !r[k].trim()) err(w, `needs ${k} text`);
      if (!Array.isArray(r?.sources) || !r.sources.length) err(w, 'needs at least one source');
      for (const s of r?.sources || []) if (!sourceIds.has(s)) err(w, `unknown source ${s}`);
      if (!isDate(r?.checked_on)) err(w, 'checked_on must be YYYY-MM-DD');
    }
  }
  return errors;
}

/** The single JSON file the site loads. */
export function bundle({ certifications, sources, reports, taxonomy, practice = [], paths = [], regions = {} }, generatedOn) {
  const counts = new Map(practice.map((set) => [set.cert, set.questions.length]));
  return {
    generated_on: generatedOn,
    certifications: certifications.map(({ _file, ...c }) => (counts.has(c.id) ? { ...c, practice_questions: counts.get(c.id) } : c)).sort((a, b) => a.name.localeCompare(b.name)),
    sources: Object.fromEntries(sources.map((s) => [s.id, s])),
    reports,
    taxonomy,
    paths,
    regions,
  };
}
