// Load and validate the catalog. Shared by the build, the validator CLI and the tests.
import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';

const LEVELS = ['entry', 'associate', 'professional', 'expert'];
const STATUSES = ['available', 'restricted', 'upcoming'];
const STYLES = ['knowledge', 'practical', 'hybrid'];
const TYPES = ['certification', 'certificate', 'microcredential', 'course'];
const PREP_KINDS = ['official-guide', 'course', 'docs', 'practice'];
const PREP_COSTS = ['free', 'paid'];
const DATE = /^\d{4}-\d{2}-\d{2}$/;
const ID = /^[a-z0-9]+(-[a-z0-9]+)*$/;

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
  return {
    certifications,
    sources: await read('sources.json'),
    reports: await read('reports.json'),
    taxonomy: await read('taxonomy.json'),
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

/** Returns a list of human-readable problems. Empty means valid. */
export function validate({ certifications, sources, reports, taxonomy }) {
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
  return errors;
}

/** The single JSON file the site loads. */
export function bundle({ certifications, sources, reports, taxonomy }, generatedOn) {
  return {
    generated_on: generatedOn,
    certifications: certifications.map(({ _file, ...c }) => c).sort((a, b) => a.name.localeCompare(b.name)),
    sources: Object.fromEntries(sources.map((s) => [s.id, s])),
    reports,
    taxonomy,
  };
}
