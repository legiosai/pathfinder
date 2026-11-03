// Profile matching. Pure functions: no DOM, no storage, so Node tests can import them.
//
// The score is a transparent heuristic, not a pass probability or a hiring signal.
// Every point it gives comes with a reason the UI shows next to the result.

export const LEVELS = ['entry', 'associate', 'professional', 'expert'];

// Which level an experience answer points at (index into LEVELS).
const EXPERIENCE_TARGET = { new: 0, some: 1, experienced: 2 };

const WEIGHTS = { interest: 45, role: 20, readiness: 20, level: 15 };

export function emptyProfile() {
  return {
    roles: [],
    known: [],
    want: [],
    experience: 'some',
    budget: null, // USD; null means no limit
    includeRestricted: false,
    style: 'any', // 'any' | 'knowledge' | 'practical'
  };
}

function overlap(list, set) {
  return list.filter((x) => set.has(x));
}

/**
 * Score one certification for a profile.
 * Returns { id, score (0-100), excluded (string|null), reasons[], warnings[] }.
 */
export function scoreCert(cert, profile, labels = {}) {
  const label = (id) => labels[id] || id;
  const want = new Set(profile.want || []);
  const known = new Set(profile.known || []);
  const roles = new Set(profile.roles || []);
  const reasons = [];
  const warnings = [];

  const wantHits = overlap(cert.skills, want);
  const knownHits = overlap(cert.skills, known);
  const roleHits = overlap(cert.roles, roles);

  let interest = 0.5;
  if (want.size) {
    interest = Math.min(1, wantHits.length / Math.min(want.size, cert.skills.length));
    if (wantHits.length) reasons.push(`Covers what you want to learn: ${wantHits.map(label).join(', ')}`);
  }

  let role = 0.5;
  if (roles.size) {
    role = roleHits.length ? 1 : 0;
    if (roleHits.length) reasons.push(`Aimed at ${roleHits.map(label).join(', ')}`);
  }

  const readiness = cert.skills.length ? knownHits.length / cert.skills.length : 0;
  if (knownHits.length) {
    reasons.push(`You already work with ${knownHits.map(label).join(', ')}`);
  }

  const target = EXPERIENCE_TARGET[profile.experience] ?? 1;
  const levelIdx = Math.max(0, LEVELS.indexOf(cert.level));
  const distance = Math.abs(levelIdx - target);
  const level = 1 - distance / (LEVELS.length - 1);
  if (distance === 0) reasons.push(`${label(cert.level)} level fits your experience`);
  else if (levelIdx > target) warnings.push(`${label(cert.level)} level: above your stated experience`);

  let score =
    WEIGHTS.interest * interest +
    WEIGHTS.role * role +
    WEIGHTS.readiness * readiness +
    WEIGHTS.level * level;

  if (profile.style && profile.style !== 'any' && cert.exam.style !== profile.style && cert.exam.style !== 'hybrid') {
    score -= 8;
    warnings.push(`Assessment is ${label(cert.exam.style)}, not your preferred style`);
  }

  let excluded = null;
  const fee = cert.fee.usd;
  if (fee == null) warnings.push('No single USD price published; check the issuer for your region');
  else if (profile.budget != null && fee > profile.budget) excluded = `Over your budget (US$${fee})`;
  if (cert.status === 'restricted' && !profile.includeRestricted) {
    excluded = excluded || 'Restricted eligibility (see requirements)';
  }
  if (cert.status === 'upcoming') warnings.push('Announced but not open for booking yet');
  if (cert.requirements && cert.status === 'restricted') warnings.push(cert.requirements);

  return {
    id: cert.id,
    score: Math.max(0, Math.min(100, Math.round(score))),
    excluded,
    reasons,
    warnings,
  };
}

/** Rank all certifications: included ones by score, then excluded ones. */
export function rank(certs, profile, labels = {}) {
  const results = certs.map((c) => scoreCert(c, profile, labels));
  return results.sort((a, b) => {
    if (!a.excluded !== !b.excluded) return a.excluded ? 1 : -1;
    return b.score - a.score || a.id.localeCompare(b.id);
  });
}
