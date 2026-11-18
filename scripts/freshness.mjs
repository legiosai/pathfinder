// What in the catalog needs a fresh look, as a Markdown report: facts checked too long ago, dated
// changes coming up (or already past), offers about to end, announced exams, and links that no
// longer work. The weekly freshness workflow posts it as an issue.
// Usage: node scripts/freshness.mjs [--no-links] [--today YYYY-MM-DD] [--out report.md]
import { writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { loadCatalog } from './catalog.mjs';

const STALE_DAYS = 45; // a fact older than this gets re-read against the issuer
const SOON_DAYS = 30; // timeline entries and offers this close (or past) are listed
const TIMEOUT_MS = 20000;
const MAX_BODY = 60000; // GitHub issues take 65,536 characters
// Hosts that answer automated requests with 403/405/429 (bot protection) whatever the page's state:
// those answers mean "couldn't check", not "broken".
const PROTECTED = ['comptia.org', 'isc2.org', 'isaca.org', 'eccouncil.org', 'offsec.com', 'giac.org', 'sans.org', 'iapp.org', 'credly.com', 'linkedin.com', 'udemy.com', 'coursera.org', 'reddit.com', 'medium.com', 'cisco.com', 'oracle.com', 'nvidia.com', 'hackthebox.com', 'ine.com', 'tcm-sec.com', 'cloudsecurityalliance.org', 'pearsonvue.com', 'databricks.com', 'snowflake.com', 'redhat.com'];
const UA = 'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36';

const args = process.argv.slice(2);
const option = (name) => {
  const i = args.indexOf(name);
  return i >= 0 ? args[i + 1] : null;
};
const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const today = option('--today') || new Date().toISOString().slice(0, 10);
const day = (s) => Date.parse(`${s}T00:00:00Z`);
const daysFrom = (s) => Math.round((day(s) - day(today)) / 86400000);
const cell = (s) => String(s ?? '').replace(/\|/g, '\\|').replace(/\s+/g, ' ').trim();
const when = (n) => (n < 0 ? `${-n} day${n === -1 ? '' : 's'} ago` : n === 0 ? 'today' : `in ${n} day${n === 1 ? '' : 's'}`);

export async function report({ links = true, log = () => {} } = {}) {
  const data = await loadCatalog(root);
  const certs = data.certifications;
  const out = [`# Catalog freshness, ${today}`, ''];
  const counts = {};

  // 1. Facts checked more than STALE_DAYS ago.
  const staleCerts = certs.filter((c) => daysFrom(c.checked_on) < -STALE_DAYS).sort((a, b) => a.checked_on.localeCompare(b.checked_on));
  const staleSources = data.sources.filter((s) => s.checked_on && daysFrom(s.checked_on) < -STALE_DAYS).sort((a, b) => a.checked_on.localeCompare(b.checked_on));
  counts.stale = staleCerts.length + staleSources.length;

  // 2. Dated changes in the next SOON_DAYS days or already past.
  const timeline = certs
    .flatMap((c) => (c.timeline || []).map((e) => ({ c, e, n: daysFrom(e.date) })))
    .filter(({ n }) => n <= SOON_DAYS)
    .sort((a, b) => a.e.date.localeCompare(b.e.date));
  counts.timeline = timeline.length;

  // 3. Free routes and discounts ending within SOON_DAYS days, or already ended.
  const offers = certs
    .flatMap((c) =>
      ['free_routes', 'discounts'].flatMap((kind) => (c.access?.[kind] || []).filter((o) => o.until).map((o) => ({ c, kind, o, n: daysFrom(o.until) }))),
    )
    .filter(({ n }) => n <= SOON_DAYS)
    .sort((a, b) => a.o.until.localeCompare(b.o.until));
  counts.offers = offers.length;

  // 4. Announced exams: the opening date and details move.
  const upcoming = certs.filter((c) => c.status === 'upcoming');
  counts.upcoming = upcoming.length;

  // 5. Links.
  let checked = null;
  if (links) {
    const urls = new Map(); // url -> where it is used
    const use = (url, where) => url && urls.set(url, [...(urls.get(url) || []), where]);
    for (const s of data.sources) use(s.url, `source ${s.id}`);
    for (const c of certs) for (const p of c.prep || []) use(p.url, `${c.id} prep`);
    for (const c of certs) for (const kind of ['free_routes', 'discounts']) for (const o of c.access?.[kind] || []) use(o.url, `${c.id} ${kind}`);
    checked = { broken: [], other: [], blocked: [], ok: 0, total: urls.size };
    let i = 0;
    for (const [url, where] of urls) {
      const r = await probe(url);
      log(`${++i}/${urls.size} ${r.kind} ${r.status || r.error || ''} ${url}`);
      if (r.kind === 'ok') checked.ok++;
      else checked[r.kind].push({ url, where, ...r });
    }
    counts.links = checked.broken.length + checked.other.length;
  }

  const total = counts.stale + counts.timeline + counts.offers + counts.upcoming + (counts.links || 0);
  out.push(
    total
      ? `${[
          counts.stale && `${counts.stale} fact${counts.stale === 1 ? '' : 's'} checked more than ${STALE_DAYS} days ago`,
          counts.timeline && `${counts.timeline} dated change${counts.timeline === 1 ? '' : 's'} due`,
          counts.offers && `${counts.offers} offer${counts.offers === 1 ? '' : 's'} ending`,
          counts.upcoming && `${counts.upcoming} announced exam${counts.upcoming === 1 ? '' : 's'}`,
          counts.links && `${counts.links} link${counts.links === 1 ? '' : 's'} to fix or look at`,
        ]
          .filter(Boolean)
          .join(', ')}.`
      : 'Nothing to re-check this week.',
    '',
    `Generated by \`scripts/freshness.mjs\`${links ? '' : ' without the link check'}. Re-read each issuer page, update the data and its \`checked_on\`, then let the next run close the gap.`,
    '',
  );

  out.push(`## Checked more than ${STALE_DAYS} days ago`, '');
  if (!counts.stale) out.push('Nothing.', '');
  if (staleCerts.length) {
    out.push(`Certifications (${staleCerts.length}):`, '', '| Certification | Checked | Age |', '|---|---|---|');
    for (const c of staleCerts) out.push(`| \`${c.id}\` ${cell(c.name)} | ${c.checked_on} | ${-daysFrom(c.checked_on)} days |`);
    out.push('');
  }
  if (staleSources.length) {
    out.push(`Sources (${staleSources.length}):`, '', '| Source | Checked | Age |', '|---|---|---|');
    for (const s of staleSources) out.push(`| \`${s.id}\` [${cell(s.title)}](${s.url}) | ${s.checked_on} | ${-daysFrom(s.checked_on)} days |`);
    out.push('');
  }

  out.push(`## Timeline: due within ${SOON_DAYS} days or past`, '');
  if (!timeline.length) out.push('Nothing.', '');
  else {
    out.push('| Date | Certification | Kind | What | Source |', '|---|---|---|---|---|');
    for (const { c, e, n } of timeline) out.push(`| ${e.date} (${when(n)}) | \`${c.id}\` | ${cell(e.kind)} | ${cell(e.text)} | ${cell(e.source)} |`);
    out.push('');
  }

  out.push(`## Free routes and discounts ending within ${SOON_DAYS} days or ended`, '');
  if (!offers.length) out.push('Nothing.', '');
  else {
    out.push('| Until | Certification | Kind | Offer |', '|---|---|---|---|');
    for (const { c, kind, o, n } of offers) out.push(`| ${o.until} (${when(n)}) | \`${c.id}\` | ${kind.replace('_', ' ')} | ${o.url ? `[${cell(o.text)}](${o.url})` : cell(o.text)} |`);
    out.push('');
  }

  out.push('## Announced, not open yet', '');
  if (!upcoming.length) out.push('Nothing.', '');
  else {
    for (const c of upcoming) out.push(`- \`${c.id}\` ${cell(c.name)} (checked ${c.checked_on})`);
    out.push('');
  }

  if (checked) {
    const list = (items) => items.map((x) => `- ${x.status || x.error}: ${x.url} (${x.where.slice(0, 3).join(', ')}${x.where.length > 3 ? ', …' : ''})`);
    out.push('## Links', '', `${checked.total} distinct source, prep and offer links, fetched one at a time: ${checked.ok} answered, ${checked.broken.length} broken, ${checked.other.length} to look at, ${checked.blocked.length} couldn't be checked.`, '');
    out.push('### Broken (404, 410 or the host does not exist)', '', ...(checked.broken.length ? list(checked.broken) : ['None.']), '');
    out.push('### To look at (other errors, timeouts, refusals from hosts not known to block robots)', '', ...(checked.other.length ? list(checked.other) : ['None.']), '');
    if (checked.blocked.length) out.push('<details><summary>Couldn\'t check (bot protection): ' + checked.blocked.length + '</summary>', '', ...list(checked.blocked), '', '</details>', '');
  }

  let text = out.join('\n');
  if (text.length > MAX_BODY) text = `${text.slice(0, MAX_BODY - 200).replace(/\n[^\n]*$/, '')}\n\n_Cut to fit an issue; run \`node scripts/freshness.mjs\` for the whole report._\n`;
  return { text, counts };
}

/** GET a URL like a browser would. kind: ok, broken (404/410/DNS), blocked (bot protection) or other. */
async function probe(url) {
  const host = (() => {
    try {
      return new URL(url).hostname;
    } catch {
      return '';
    }
  })();
  const isProtected = PROTECTED.some((h) => host === h || host.endsWith(`.${h}`));
  try {
    const res = await fetch(url, {
      redirect: 'follow',
      signal: AbortSignal.timeout(TIMEOUT_MS),
      headers: { 'user-agent': UA, accept: 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8', 'accept-language': 'en-US,en;q=0.9' },
    });
    await res.body?.cancel().catch(() => {});
    const { status } = res;
    if (status < 400) return { kind: 'ok', status };
    if (status === 404 || status === 410) return { kind: 'broken', status };
    const challenge = res.headers.get('cf-mitigated') === 'challenge' || /cloudflare|akamai/i.test(res.headers.get('server') || '');
    if ([403, 405, 429].includes(status) && (isProtected || challenge)) return { kind: 'blocked', status };
    return { kind: 'other', status };
  } catch (err) {
    const code = err.cause?.code || err.name;
    if (code === 'ENOTFOUND' || code === 'EAI_AGAIN') return { kind: 'broken', error: `DNS ${code}` };
    if (isProtected) return { kind: 'blocked', error: code };
    return { kind: 'other', error: code === 'TimeoutError' ? `timeout after ${TIMEOUT_MS / 1000} s` : code };
  }
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const { text } = await report({ links: !args.includes('--no-links'), log: args.includes('--verbose') ? (s) => console.error(s) : () => {} });
  const out = option('--out');
  if (out) await writeFile(out, text);
  else process.stdout.write(text);
}
