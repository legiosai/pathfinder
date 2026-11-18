// The catalog search. People type codes and nicknames ("sec+", "az 900", "saa", "cka") as often
// as names, so a query is first compared with every certification's codes and short names written
// without spaces, hyphens or accents ("+" reads as "plus"). A code or nickname answers on its own;
// a full name leads the fuzzy results over names, providers, topics and scope. "Free" and "gratis"
// are filters rather than words to look for.
//
// Fuse (site/vendor/fuse.js) is passed in rather than imported, so this module, like the others in
// lib/, imports nothing and the build can version every module URL from app.js.

/** "Security+" → "securityplus", "AZ-900" → "az900", "Café" → "cafe". */
export const compact = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .replace(/\+/g, 'plus')
    .replace(/[^a-z0-9]/g, '');

const words = (s) =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .toLowerCase()
    .split(/[^a-z0-9+]+/)
    .filter(Boolean);

/** Nicknames that can't be derived from a code or a name. Ids missing from the catalog are ignored. */
export const ALIASES = {
  'comptia-security-plus': ['sec+', 'security+', 'secplus'],
  'comptia-network-plus': ['net+', 'netplus', 'network+'],
  'comptia-linux-plus': ['linux+'],
  'comptia-cysa-plus': ['cysa'],
  'comptia-pentest-plus': ['pentest+'],
  'comptia-a-plus': ['a+'],
  'offsec-oscp': ['oscp'],
  'aws-saa': ['saa-c03'],
  'aws-clf-c02': ['ccp', 'cloud practitioner'],
  'aws-aif-c01': ['ai practitioner'],
  'ec-council-ceh': ['ceh'],
  'isc2-cc': ['certified in cybersecurity'],
};

/** Words that ask for free certifications instead of naming one. */
export const FREE_WORDS = ['free', 'gratis', 'gratuito', 'gratuita', 'gratuitos', 'gratuitas', 'gratuitamente', 'sin costo', 'no cost', 'costo cero'];

// A code piece reads as a code when it has a digit or at least two capitals ("CCNA", "PEN-200",
// "eJPT"); "Data Engineer Associate" is a name used as a code and stays a name.
const codeLike = (piece) => /\d/.test(piece) || /[A-Z].*[A-Z]/.test(piece);

/** The exact forms a certification answers to: { codes, names }, each a Set of compact strings. */
export function keys(cert) {
  const codes = new Set();
  const names = new Set();
  const add = (set, s) => {
    const k = compact(s);
    if (k.length >= 2) set.add(k);
  };
  const code = String(cert.code || '');
  const pieces = code.split(/\s*\/\s*|\s+|[()]/).filter(Boolean);
  if (pieces.every(codeLike)) {
    add(codes, code);
    // Codes that hold more than one form: "OSCP+ / PEN-200", "200-301 CCNA", "312-50 (CEH v13)".
    if (pieces.length > 1) for (const piece of pieces) if (/[a-z]/i.test(piece)) add(codes, piece);
  } else add(names, code);
  // AWS-style exam codes also go by their letters: "CLF-C02" → "clf".
  const aws = code.match(/^([A-Z]{3})-C\d{2}$/);
  if (aws) add(codes, aws[1]);
  // Abbreviations in the name: "CompTIA Cybersecurity Analyst (CySA+)".
  for (const piece of String(cert.name).match(/\(([^)]+)\)/g) || []) if (codeLike(piece)) add(codes, piece.slice(1, -1));
  for (const alias of ALIASES[cert.id] || []) add(codes, alias);
  add(names, cert.name);
  // The name without its issuer: "CompTIA PenTest+" → "pentest+".
  if (cert.provider && cert.name.toLowerCase().startsWith(`${cert.provider.toLowerCase()} `)) add(names, cert.name.slice(cert.provider.length + 1));
  for (const k of codes) names.delete(k);
  return { codes, names };
}

const FREE = new Set(FREE_WORDS.filter((w) => !w.includes(' ')));
const FREE_PHRASES = FREE_WORDS.filter((w) => w.includes(' '));

/** Splits "free" words off a query: { text, free }. */
export function readQuery(q) {
  let text = ` ${words(q).join(' ')} `;
  let free = false;
  for (const phrase of FREE_PHRASES) {
    if (text.includes(` ${phrase} `)) {
      free = true;
      text = text.replace(` ${phrase} `, ' ');
    }
  }
  const rest = text.split(' ').filter((w) => {
    if (!FREE.has(w)) return true;
    free = true;
    return false;
  });
  return { text: rest.join(' ').trim(), free };
}

/**
 * Builds the search over `certs` with the Fuse class. `doc(cert)` adds searchable text (a category
 * or skill names in the interface language, say) to the fuzzy part.
 * search(q) → { ids: matching ids, best first; exact: ids whose code or nickname is the query; free }
 */
export function createSearch(certs, Fuse, { doc = () => ({}) } = {}) {
  const index = (kind) => {
    const map = new Map();
    for (const c of certs) {
      for (const k of keys(c)[kind]) {
        if (!map.has(k)) map.set(k, []);
        map.get(k).push(c.id);
      }
    }
    return map;
  };
  const byCode = index('codes');
  const byName = index('names');
  const all = certs.map((c) => {
    const k = keys(c);
    return { id: c.id, keys: [...k.codes, ...k.names] };
  });
  const fuse = new Fuse(
    certs.map((c) => ({ id: c.id, name: c.name, code: c.code, provider: c.provider, category: c.category, scope: c.scope, ...doc(c) })),
    {
      keys: [{ name: 'name', weight: 3 }, { name: 'code', weight: 3 }, { name: 'provider', weight: 2 }, { name: 'skills', weight: 1.5 }, 'category', 'scope'],
      threshold: 0.25,
      ignoreLocation: true,
    },
  );
  const isFree = new Set(certs.filter((c) => c.fee?.usd === 0).map((c) => c.id));

  return function search(q) {
    const { text, free } = readQuery(q);
    const key = compact(text);
    let ids = [];
    let exact = [];
    if (!key) {
      if (free) ids = all.map((c) => c.id);
    } else if (byCode.has(key)) {
      ids = exact = byCode.get(key);
    } else {
      const hits = fuse.search(text);
      // A full name, then codes and names that start with what was typed ("pentest" → PenTest+).
      const lead = key.length >= 3 ? all.filter((c) => c.keys.some((k) => k.startsWith(key))).map((c) => c.id) : [];
      ids = [...new Set([...(byName.get(key) || []), ...lead, ...hits.map((r) => r.item.id)])];
    }
    if (free) {
      ids = ids.filter((id) => isFree.has(id));
      exact = exact.filter((id) => isFree.has(id));
    }
    return { ids, exact, free };
  };
}
