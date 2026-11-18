// The catalog list: which certifications a set of filters keeps, in what order, and how the
// filters travel in the address (#list?cat=Cybersecurity&max=200&sort=price) so a filtered list
// can be shared and survives a reload.

export const LEVELS = ['entry', 'associate', 'professional', 'expert'];
export const SORTS = ['recommended', 'price', 'name'];

/** The filters as the page starts. */
export const emptyFilters = () => ({ q: '', cat: '', prov: '', level: '', max: null, sort: 'recommended', es: false, online: false });

/** True, false, or null when the catalog doesn't say. */
export function examInSpanish(cert) {
  const langs = cert.exam?.languages;
  if (!Array.isArray(langs) || !langs.length) return null;
  return langs.some((l) => /^es(-|$)/i.test(l));
}

export function examOnline(cert) {
  const d = cert.exam?.delivery;
  if (!Array.isArray(d) || !d.length) return null;
  return d.includes('online');
}

/**
 * Certifications that pass every filter. A price ceiling keeps the ones priced by region
 * (fee.usd null): their price depends on the country, so they are shown and marked rather than
 * dropped. "Free" (max 0) means a list price of zero. The Spanish and online filters keep only
 * the certifications the catalog confirms; unknown is not a yes. `hits` limits to search matches.
 */
export function filterCerts(certs, f, { hits = null } = {}) {
  return certs.filter((c) => {
    if (f.cat && c.category !== f.cat) return false;
    if (f.prov && c.provider !== f.prov) return false;
    if (f.level && c.level !== f.level) return false;
    if (f.max != null) {
      if (c.fee.usd == null) {
        if (f.max === 0) return false;
      } else if (c.fee.usd > f.max) return false;
    }
    if (f.es && examInSpanish(c) !== true) return false;
    if (f.online && examOnline(c) !== true) return false;
    if (hits && !hits.has(c.id)) return false;
    return true;
  });
}

const byName = (a, b) => a.name.localeCompare(b.name);
const levelRank = (c) => (LEVELS.includes(c.level) ? LEVELS.indexOf(c.level) : LEVELS.length);

/**
 * Orders a filtered list. "recommended" is relevance while searching (`hits`: id → rank), the
 * "For me" score when there is one (`scores`: id → { score }), and otherwise entry level first,
 * then associate, professional and expert, by name within a level. "price" goes low to high with
 * the prices that vary by country last; "name" is alphabetical.
 */
export function sortCerts(list, sort = 'recommended', { hits = null, scores = null } = {}) {
  const out = [...list];
  if (sort === 'price') {
    const fee = (c) => (c.fee.usd == null ? Infinity : c.fee.usd);
    return out.sort((a, b) => fee(a) - fee(b) || levelRank(a) - levelRank(b) || byName(a, b));
  }
  if (sort === 'name') return out.sort(byName);
  if (hits) return out.sort((a, b) => hits.get(a.id) - hits.get(b.id));
  if (scores) return out.sort((a, b) => (scores.get(b.id)?.score ?? 0) - (scores.get(a.id)?.score ?? 0) || levelRank(a) - levelRank(b) || byName(a, b));
  return out.sort((a, b) => levelRank(a) - levelRank(b) || byName(a, b));
}

/** Reads filters from the address; anything unknown or malformed falls back to the default. */
export function filtersFromParams(params, { categories = null, providers = null } = {}) {
  const f = emptyFilters();
  const get = (k) => (params.get(k) || '').trim();
  f.q = get('q').slice(0, 100);
  const cat = get('cat');
  if (cat && (!categories || categories.includes(cat))) f.cat = cat;
  const prov = get('prov');
  if (prov && (!providers || providers.includes(prov))) f.prov = prov;
  if (LEVELS.includes(get('level'))) f.level = get('level');
  if (/^\d{1,5}$/.test(get('max'))) f.max = Number(get('max'));
  if (SORTS.includes(get('sort'))) f.sort = get('sort');
  f.es = get('es') === '1';
  f.online = get('online') === '1';
  return f;
}

/** The address form of the filters, with defaults left out. */
export function filtersToParams(f) {
  const p = new URLSearchParams();
  if (f.cat) p.set('cat', f.cat);
  if (f.prov) p.set('prov', f.prov);
  if (f.level) p.set('level', f.level);
  if (f.max != null) p.set('max', String(f.max));
  if (f.es) p.set('es', '1');
  if (f.online) p.set('online', '1');
  if (f.sort && f.sort !== 'recommended') p.set('sort', f.sort);
  if (f.q) p.set('q', f.q);
  return p;
}

/** Filters that narrow the list (the sort order doesn't), for the empty state and "clear". */
export function activeFilters(f) {
  return ['q', 'cat', 'prov', 'level', 'max', 'es', 'online'].filter((k) => (k === 'max' ? f.max != null : !!f[k]));
}
