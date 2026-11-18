// What to look at next: the study paths of data/paths.json and certifications close to one.

const LEVELS = ['entry', 'associate', 'professional', 'expert'];

/** Paths for a catalog category, or every path when the category is empty. */
export const pathsFor = (paths, category = '') => (paths || []).filter((p) => !category || p.category === category);

/**
 * The certifications that follow `id` in any path: for each path and step holding it, the next
 * step's certifications, with the path and that step's note. Each certification appears once.
 */
export function nextSteps(id, paths) {
  const out = [];
  const seen = new Set([id]);
  for (const path of paths || []) {
    path.steps.forEach((step, i) => {
      const next = path.steps[i + 1];
      if (!next || !step.certs.includes(id)) return;
      const certs = next.certs.filter((c) => !seen.has(c));
      certs.forEach((c) => seen.add(c));
      if (certs.length) out.push({ path, step: i + 1, certs, note: next.note });
    });
  }
  return out;
}

/**
 * Certifications in the same category one level apart or at the same level, closest level
 * first, then the most shared skills. `exclude` holds ids already shown elsewhere.
 */
export function similar(cert, certs, { exclude = [], limit = 4 } = {}) {
  const level = LEVELS.indexOf(cert.level);
  const skills = new Set(cert.skills || []);
  const skip = new Set([cert.id, ...exclude]);
  return certs
    .filter((c) => !skip.has(c.id) && c.category === cert.category && Math.abs(LEVELS.indexOf(c.level) - level) <= 1)
    .map((c) => ({ c, gap: Math.abs(LEVELS.indexOf(c.level) - level), shared: (c.skills || []).filter((s) => skills.has(s)).length }))
    .sort((a, b) => a.gap - b.gap || b.shared - a.shared || a.c.name.localeCompare(b.c.name))
    .slice(0, limit)
    .map((x) => x.c);
}

const codeLike = (word) => /\d/.test(word) || /[A-Z].*[A-Z]/.test(word);

/**
 * What people call a certification in a hurry, for a chain of small badges: "Security+", "CySA+",
 * "CCNA", "SC-900", "OSCP+", "Terraform Associate".
 */
export function shortName(cert) {
  const name = String(cert.name || '');
  const abbr = name.match(/\(([^)]+)\)/)?.[1];
  if (abbr && codeLike(abbr)) return abbr;
  const bare = cert.provider && name.startsWith(`${cert.provider} `) ? name.slice(cert.provider.length + 1) : name;
  if (bare.length <= 12) return bare;
  const code = String(cert.code || '');
  const inCode = code.match(/\(([^)]+)\)/)?.[1];
  if (inCode && codeLike(inCode)) return inCode;
  const first = code.split(/\s*\/\s*/)[0].trim();
  const words = first.split(/\s+/).filter(Boolean);
  if (words.length && /[a-z]/i.test(first) && words.every(codeLike)) return words.length > 1 ? words.filter((w) => /[a-z]/i.test(w)).at(-1) : first;
  if (words.length && /[a-z]/i.test(first) && words.every((w) => /^[A-Z]/.test(w))) return withoutCertificate(first, cert);
  return withoutCertificate(bare, cert);
}

// "Cybersecurity Certificate" → "Google Cybersecurity": the issuer says more than the word "Certificate".
function withoutCertificate(short, cert) {
  const plain = short.replace(/\s+(professional\s+)?certificate$/i, '');
  if (plain === short) return short;
  return cert.provider && `${cert.provider} ${plain}`.length <= 24 ? `${cert.provider} ${plain}` : plain;
}
