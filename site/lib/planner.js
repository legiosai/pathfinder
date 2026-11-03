// Study-plan generator. Pure functions so Node tests can import them.
//
// Dates are plain YYYY-MM-DD strings handled in UTC, so a plan never shifts by a
// day because of the viewer's time zone.

const DEFAULT_LEVEL_HOURS = {
  entry: [10, 25],
  associate: [25, 45],
  professional: [40, 80],
  expert: [80, 160],
};

const EXPERIENCE_FACTOR = { new: 1.25, some: 1, experienced: 0.85 };

/**
 * Rough planning hours for a certification and profile.
 * Starts from the level range and moves toward the low end the more of the
 * certification's skills the learner already uses.
 */
export function estimateHours(cert, profile = {}, levelHours = DEFAULT_LEVEL_HOURS) {
  const [lo, hi] = levelHours[cert.level] || DEFAULT_LEVEL_HOURS.associate;
  const known = new Set(profile.known || []);
  const coverage = cert.skills.length ? cert.skills.filter((s) => known.has(s)).length / cert.skills.length : 0;
  const factor = EXPERIENCE_FACTOR[profile.experience] ?? 1;
  const hours = Math.round((lo + (hi - lo) * (1 - coverage)) * factor);
  return { hours, low: Math.round(lo * factor), high: Math.round(hi * factor), coverage };
}

/**
 * Topics to plan around: the published domains when known, otherwise topics
 * read from the scope summary, otherwise a generic outline.
 */
export function planTopics(cert) {
  if (cert.domains && cert.domains.length) {
    return { inferred: false, topics: cert.domains.map((d) => ({ name: d.name, weight: d.weight })) };
  }
  const first = (cert.scope || '').split(/\.\s/)[0].replace(/\.$/, '');
  const head = first.includes(':') ? first.split(':').slice(1).join(':') : first;
  const parts = head
    .split(/;|,|\band\b/)
    .map((s) => s.trim().replace(/^(the|an?)\s+/i, ''))
    .filter((s) => s.length >= 3 && s.length <= 60);
  if (parts.length >= 2) {
    const topics = parts.slice(0, 6).map((p) => ({ name: p[0].toUpperCase() + p.slice(1), weight: 1 }));
    return { inferred: true, topics };
  }
  return {
    inferred: true,
    topics: [
      { name: 'Official exam objectives', weight: 1 },
      { name: 'Core concepts', weight: 1 },
      { name: 'Hands-on practice', weight: 1 },
    ],
  };
}

// Self-rated confidence per topic (1 = new to me, 5 = could teach it) scales its share of study time.
export const CONFIDENCE_FACTOR = { 1: 1.6, 2: 1.3, 3: 1, 4: 0.7, 5: 0.45 };

/** Topic weights adjusted by confidence ratings keyed by topic name. Unrated topics count as 3. */
export function weightTopics(topics, confidence = {}) {
  return topics.map((t) => ({ ...t, weight: t.weight * (CONFIDENCE_FACTOR[confidence[t.name]] ?? 1) }));
}

/** Split `count` slots across topics by weight (largest remainder). */
export function allocate(count, topics) {
  const total = topics.reduce((s, t) => s + t.weight, 0) || 1;
  const exact = topics.map((t) => (count * t.weight) / total);
  const out = exact.map(Math.floor);
  let left = count - out.reduce((s, n) => s + n, 0);
  const order = exact.map((x, i) => [x - Math.floor(x), i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  for (let k = 0; left > 0; k = (k + 1) % order.length, left--) out[order[k][1]] += 1;
  return out;
}

export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatDate(dt) {
  return dt.toISOString().slice(0, 10);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

/** Next `n` dates on or after `start` that fall on one of `days` (0 = Sunday). */
export function studyDates(start, days, n) {
  const want = new Set(days);
  if (!want.size) throw new Error('Pick at least one study day');
  const out = [];
  const d = parseDate(start);
  while (out.length < n) {
    if (want.has(d.getUTCDay())) out.push(formatDate(d));
    d.setUTCDate(d.getUTCDate() + 1);
  }
  return out;
}

/**
 * Build a dated plan.
 * opts: { cert, hours, start, days, sessionMinutes, startTime, confidence, targetDate }
 * Returns { cert, hours, sessionMinutes, startTime, inferredTopics, topics, sessions[], examDate, weeks, deadline }
 * `examDate` is the earliest date the pace allows; `deadline` compares it with `targetDate` when given.
 */
export function buildPlan({ cert, hours, start, days, sessionMinutes = 90, startTime = '19:00', confidence = {}, targetDate = null }) {
  if (!(hours > 0)) throw new Error('Hours must be positive');
  if (!(sessionMinutes >= 15)) throw new Error('Sessions must be at least 15 minutes');
  const examMinutes = cert.exam.minutes || 90;
  const { topics: baseTopics, inferred } = planTopics(cert);
  const topics = weightTopics(baseTopics, confidence);

  // Mocks run as long as the exam, so they get their own length.
  const mockCount = cert.exam.style === 'practical' ? 1 : 2;
  const fixedMinutes = mockCount * examMinutes;
  const regularSlots = Math.max(4, Math.round((hours * 60 - fixedMinutes) / sessionMinutes));

  // Regular sessions: 1 baseline, learning, practice, one review per mock, remediation, final.
  const reserved = 1 + mockCount + 1;
  const flexible = Math.max(topics.length, regularSlots - reserved);
  const learnCount = Math.max(Math.min(topics.length, flexible), Math.round(flexible * 0.6));
  const practiceCount = Math.max(0, Math.round(flexible * 0.25));
  const remediationCount = Math.max(0, flexible - learnCount - practiceCount);

  const items = [];
  items.push({
    kind: 'baseline',
    title: 'Baseline: exam guide and diagnostic',
    detail: 'Read the official exam guide end to end, note every objective, and take a short diagnostic to find weak areas.',
  });
  allocate(learnCount, topics).forEach((n, i) => {
    for (let k = 1; k <= n; k++) {
      items.push({
        kind: 'learn',
        topic: topics[i].name,
        title: `Learn: ${topics[i].name}${n > 1 ? ` (${k}/${n})` : ''}`,
        detail: 'Study this topic from primary sources. Close by writing three questions you could not answer yet.',
      });
    }
  });
  allocate(practiceCount, topics).forEach((n, i) => {
    for (let k = 1; k <= n; k++) {
      items.push({
        kind: 'practice',
        topic: topics[i].name,
        title: `Practice: ${topics[i].name}`,
        detail: 'Hands-on lab or scenario questions. Log every mistake with the reason you made it.',
      });
    }
  });
  const mock = (n) => ({
    kind: 'mock',
    minutes: examMinutes,
    title: mockCount > 1 ? `Timed mock exam ${n}` : 'Timed full rehearsal',
    detail: `Full-length and timed (${examMinutes} min), under exam conditions. No notes, no AI help.`,
  });
  const review = (n) => ({
    kind: 'review',
    title: mockCount > 1 ? `Review mock ${n}` : 'Review the rehearsal',
    detail: 'Classify every miss by topic and cause, then re-study the two weakest topics.',
  });
  items.push(mock(1), review(1));
  for (let k = 1; k <= remediationCount; k++) {
    items.push({
      kind: 'remediate',
      title: `Close gaps (${k}/${remediationCount})`,
      detail: 'Work through the error log: re-learn, then redo similar questions until you get them right.',
    });
  }
  if (mockCount > 1) items.push(mock(2), review(2));
  items.push({
    kind: 'final',
    title: 'Final review and exam logistics',
    detail: 'Skim your notes and error log. Check ID, exam rules, system test for online proctoring, and the booking time.',
  });

  const dates = studyDates(start, days, items.length + 1);
  const sessions = items.map((it, i) => ({
    n: i + 1,
    date: dates[i],
    weekday: WEEKDAYS[parseDate(dates[i]).getUTCDay()],
    minutes: it.minutes || sessionMinutes,
    ...it,
  }));
  const totalMinutes = sessions.reduce((s, x) => s + x.minutes, 0);
  const examDate = dates[items.length];
  const weeks = Math.ceil((parseDate(examDate) - parseDate(start)) / (7 * 86400000)) || 1;
  return {
    cert: { id: cert.id, name: cert.name, provider: cert.provider, code: cert.code },
    hours: Math.round((totalMinutes / 60) * 10) / 10,
    sessionMinutes,
    startTime,
    inferredTopics: inferred,
    topics: baseTopics.map((t) => t.name),
    sessions,
    examDate,
    weeks,
    deadline: targetDate ? checkDeadline({ sessions, start, days, targetDate, sessionMinutes }) : null,
  };
}

/** Count study dates in [start, end) that fall on `days`. */
export function countStudyDays(start, end, days) {
  const want = new Set(days);
  let n = 0;
  for (const d = parseDate(start), stop = parseDate(end); d < stop; d.setUTCDate(d.getUTCDate() + 1)) {
    if (want.has(d.getUTCDay())) n += 1;
  }
  return n;
}

/**
 * Does the plan fit before a booked or target exam date?
 * When it does not, suggests the session length that would make the regular sessions fit.
 */
export function checkDeadline({ sessions, start, days, targetDate, sessionMinutes }) {
  const available = countStudyDays(start, targetDate, days);
  const needed = sessions.length;
  const fits = available >= needed;
  let suggestedMinutes = null;
  if (!fits) {
    const fixed = sessions.filter((s) => s.kind === 'mock');
    const regularMinutes = sessions.filter((s) => s.kind !== 'mock').reduce((t, s) => t + s.minutes, 0);
    const slots = available - fixed.length;
    if (slots > 0) {
      const m = Math.ceil(regularMinutes / slots / 15) * 15;
      suggestedMinutes = m <= 240 ? Math.max(m, sessionMinutes + 15) : null;
    }
  }
  const weeks = Math.max(0, Math.round((parseDate(targetDate) - parseDate(start)) / (7 * 86400000) * 10) / 10);
  return { targetDate, available, needed, fits, spare: available - needed, suggestedMinutes, weeks };
}

function fmtMinutes(m) {
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? (r ? `${h} h ${r} min` : `${h} h`) : `${r} min`;
}

export function toMarkdown(plan, { resources = [] } = {}) {
  const lines = [
    `# Study plan: ${plan.cert.name} (${plan.cert.code})`,
    '',
    `${plan.sessions.length} sessions, ${plan.hours} hours over about ${plan.weeks} week${plan.weeks === 1 ? '' : 's'}.`,
    `Earliest exam date if you keep pace: **${plan.examDate}**. Book it only after the last mock goes well.`,
    '',
  ];
  if (plan.deadline) {
    const d = plan.deadline;
    lines.push(
      d.fits
        ? `Target exam date ${d.targetDate}: fits, with ${d.spare} spare study day${d.spare === 1 ? '' : 's'} as buffer.`
        : `Target exam date ${d.targetDate}: does not fit. ${d.needed} sessions are needed and only ${d.available} study days are available.`,
      '',
    );
  }
  if (resources.length) {
    lines.push('## Resources', '');
    for (const r of resources) lines.push(`- [${r.title}](${r.url})${r.cost === 'paid' ? ' (paid)' : ''}`);
    lines.push('', '## Sessions', '');
  }
  if (plan.inferredTopics) {
    lines.push('> Topics were read from the scope summary. Replace them with the official exam objectives.', '');
  }
  for (const s of plan.sessions) {
    lines.push(`- [ ] **${s.date}** (${s.weekday}) · ${fmtMinutes(s.minutes)} · ${s.title}`);
    lines.push(`  ${s.detail}`);
  }
  lines.push('', 'Generated by pathfinder: https://legiosai.github.io/pathfinder/', '');
  return lines.join('\n');
}

function icsEscape(s) {
  return String(s).replace(/\\/g, '\\\\').replace(/;/g, '\\;').replace(/,/g, '\\,').replace(/\r?\n/g, '\\n');
}

// RFC 5545: lines longer than 75 octets continue on the next line after a space.
function fold(line) {
  const bytes = new TextEncoder().encode(line);
  if (bytes.length <= 75) return line;
  const out = [];
  let cur = '';
  let curLen = 0;
  for (const ch of line) {
    const len = new TextEncoder().encode(ch).length;
    if (curLen + len > (out.length ? 74 : 75)) {
      out.push(cur);
      cur = '';
      curLen = 0;
    }
    cur += ch;
    curLen += len;
  }
  out.push(cur);
  return out.join('\r\n ');
}

function icsLocal(date, time, addMinutes = 0) {
  const [h, m] = time.split(':').map(Number);
  const dt = parseDate(date);
  dt.setUTCMinutes(h * 60 + m + addMinutes);
  return dt.toISOString().replace(/[-:]/g, '').slice(0, 15);
}

/** iCalendar export with floating local times (the calendar app's own time zone). */
export function toICS(plan, now = new Date()) {
  const stamp = now.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '');
  const lines = ['BEGIN:VCALENDAR', 'VERSION:2.0', 'PRODID:-//legiosai//pathfinder//EN', 'CALSCALE:GREGORIAN'];
  for (const s of plan.sessions) {
    lines.push(
      'BEGIN:VEVENT',
      `UID:${plan.cert.id}-${s.date}-${s.n}@pathfinder.legiosai`,
      `DTSTAMP:${stamp}`,
      `DTSTART:${icsLocal(s.date, plan.startTime)}`,
      `DTEND:${icsLocal(s.date, plan.startTime, s.minutes)}`,
      `SUMMARY:${icsEscape(`${plan.cert.code}: ${s.title}`)}`,
      `DESCRIPTION:${icsEscape(s.detail)}`,
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
