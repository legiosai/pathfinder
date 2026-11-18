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

/**
 * Split topics, in their published order, into `count` groups of similar weight.
 * Short plans use it so one learning session can cover several domains.
 */
export function groupTopics(count, topics) {
  const total = topics.reduce((s, t) => s + t.weight, 0) || 1;
  const goal = (g) => (total * g) / count;
  const groups = [];
  let current = [];
  let done = 0;
  topics.forEach((t, i) => {
    const open = count - groups.length - 1;
    const left = topics.length - i;
    // Close the group before this topic when adding it overshoots the goal more
    // than stopping short does, or when every topic left needs a group of its own.
    const target = goal(groups.length + 1);
    if (current.length && open > 0 && (left === open || done + t.weight - target > target - done)) {
      groups.push(current);
      current = [];
    }
    current.push(t);
    done += t.weight;
  });
  groups.push(current);
  return groups;
}

export function parseDate(s) {
  const [y, m, d] = s.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function formatDate(dt) {
  return dt.toISOString().slice(0, 10);
}

const WEEKDAYS = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];

export const KIND_LABEL = {
  baseline: 'Start',
  learn: 'Learn',
  practice: 'Practice',
  mock: 'Mock',
  review: 'Review',
  remediate: 'Fix',
  final: 'Final',
};

export const KIND_DETAIL = {
  baseline: 'Read the official exam guide and take a short diagnostic.',
  learn: 'Study from primary sources. Write down three questions you cannot answer yet.',
  practice: 'Labs or scenario questions. Log each mistake and why it happened.',
  mock: 'Full length, timed, no notes.',
  review: 'Sort every miss by topic and cause. Re-study the two weakest topics.',
  remediate: 'Work through the error log until similar questions come out right.',
  final: 'Skim your notes. Check your ID, the exam rules and the proctoring system test.',
};

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
 * The kinds of session in order: 1 baseline, learning, practice, a mock and its review, remediation,
 * a second mock and review when there are two, and a final. `regularSlots` counts every session but
 * the mocks. When there are fewer flexible slots than topics, a learning session covers several.
 */
function outline(topics, regularSlots, mockCount, examMinutes) {
  const reserved = 1 + mockCount + 1;
  const flexible = regularSlots - reserved;
  const grouped = flexible < topics.length;
  const learnCount = grouped ? flexible : Math.max(topics.length, Math.round(flexible * 0.6));
  const practiceCount = grouped ? 0 : Math.max(0, Math.round(flexible * 0.25));
  const remediationCount = grouped ? 0 : Math.max(0, flexible - learnCount - practiceCount);

  // `name` is what the session is about; `title` adds the kind for calendars and Markdown.
  const items = [];
  const add = (kind, name, extra = {}) => items.push({ kind, name, title: `${KIND_LABEL[kind]}: ${name}`, detail: KIND_DETAIL[kind], ...extra });
  add('baseline', 'guide and diagnostic');
  if (grouped) {
    for (const group of groupTopics(learnCount, topics)) {
      const names = group.map((t) => t.name);
      const name = names.length > 1 && names.length === topics.length ? 'every exam domain' : names.join(' + ');
      add('learn', name, names.length > 1 ? { topics: names } : { topic: names[0] });
    }
  } else {
    allocate(learnCount, topics).forEach((n, i) => {
      for (let k = 1; k <= n; k++) add('learn', `${topics[i].name}${n > 1 ? ` (${k}/${n})` : ''}`, { topic: topics[i].name });
    });
  }
  allocate(practiceCount, topics).forEach((n, i) => {
    for (let k = 1; k <= n; k++) add('practice', topics[i].name, { topic: topics[i].name });
  });
  const mock = (n) => add('mock', mockCount > 1 ? `full exam ${n}` : 'full exam', {
    minutes: examMinutes,
    detail: `Full length (${examMinutes} min), timed, no notes.`,
    round: n,
  });
  const review = (n) => add('review', mockCount > 1 ? `mock ${n}` : 'the mock', { round: n });
  mock(1);
  review(1);
  for (let k = 1; k <= remediationCount; k++) add('remediate', remediationCount > 1 ? `weak spots (${k}/${remediationCount})` : 'weak spots');
  if (mockCount > 1) {
    mock(2);
    review(2);
  }
  add('final', 'review and logistics');
  return items;
}

/**
 * Drop order when sessions have to be left out, lowest first: practice, remediation, a second mock
 * and its review, extra learning sessions on a topic that has another one, the baseline, the first
 * mock's review, the remaining learning sessions, the mock, and the final review last of all.
 */
function dropRanks(list) {
  const learned = new Set();
  return list.map((s) => {
    if (s.kind === 'practice') return 1;
    if (s.kind === 'remediate') return 2;
    if (s.kind === 'mock') return s.round > 1 ? 3 : 8;
    if (s.kind === 'review') return s.round > 1 ? 3 : 6;
    if (s.kind === 'baseline') return 5;
    if (s.kind === 'learn') {
      const key = s.topic || (s.topics || []).join(' + ') || s.name;
      if (learned.has(key)) return 4;
      learned.add(key);
      return 7;
    }
    return 9;
  });
}

/** The `count` most important sessions of `list`, in their order. Ties drop the later one first. */
export function keepMost(list, count) {
  if (list.length <= count) return list;
  const rank = dropRanks(list);
  const order = list.map((_, i) => i).sort((a, b) => rank[a] - rank[b] || b - a);
  const out = new Set(order.slice(0, list.length - Math.max(0, count)));
  return list.filter((_, i) => !out.has(i));
}

/** Sessions per kind that changed between two outlines, in KIND_LABEL order. */
function kindChanges(before, after) {
  const count = (list) => list.reduce((m, s) => m.set(s.kind, (m.get(s.kind) || 0) + 1), new Map());
  const a = count(before);
  const b = count(after);
  return Object.keys(KIND_LABEL)
    .map((kind) => ({ kind, from: a.get(kind) || 0, to: b.get(kind) || 0 }))
    .filter((x) => x.from !== x.to);
}

/**
 * Build a dated plan.
 * opts: { cert, hours, start, days, sessionMinutes, startTime, confidence, targetDate }
 * Returns { cert, hours, sessionMinutes, startTime, inferredTopics, topics, sessions[], examDate, weeks, deadline, cut }
 * `examDate` is the earliest date the pace allows for the whole plan; `deadline` compares it with
 * `targetDate` when given. A plan never runs past `targetDate`: when the whole plan does not fit
 * before it, the sessions are cut to the study days there are and `cut` says what changed.
 */
export function buildPlan({ cert, hours, start, days, sessionMinutes = 90, startTime = '19:00', confidence = {}, targetDate = null }) {
  if (!(hours > 0)) throw new Error('Hours must be positive');
  if (!(sessionMinutes >= 15)) throw new Error('Sessions must be at least 15 minutes');
  const examMinutes = cert.exam.minutes || 90;
  const { topics: baseTopics, inferred } = planTopics(cert);
  const topics = weightTopics(baseTopics, confidence);

  // Mocks run as long as the exam, so they get their own length. Regular sessions
  // are 1 baseline, learning, practice, one review per mock, remediation and a final.
  // A short budget keeps one mock, so the time goes to learning one domain per
  // session; shorter still, a learning session covers several domains. The plan
  // stays close to the hours asked instead of growing to fit a fixed outline.
  const budget = hours * 60;
  const reservedFor = (mocks) => 1 + mocks + 1;
  const roomFor = (mocks) => mocks * examMinutes + (reservedFor(mocks) + topics.length) * sessionMinutes;
  const mockCount = cert.exam.style === 'practical' || budget < roomFor(2) ? 1 : 2;
  const fixedMinutes = mockCount * examMinutes;
  const regularSlots = Math.max(reservedFor(mockCount) + 1, Math.round((budget - fixedMinutes) / sessionMinutes));
  const full = outline(topics, regularSlots, mockCount, examMinutes);
  const dates = studyDates(start, days, full.length + 1);
  const minutesOf = (it) => it.minutes || sessionMinutes;

  // With a booked exam, the plan ends before it. Too few study days: rebuild the outline for the
  // days there are (one mock unless a learning session per topic still fits around two), and
  // below five days keep only the most useful kinds.
  let items = full;
  let cut = null;
  if (targetDate) {
    const available = countStudyDays(start, targetDate, days);
    if (!available) throw new Error('No study days before the exam date');
    if (full.length > available) {
      const mocks = mockCount > 1 && available - 6 >= topics.length ? 2 : 1;
      items = keepMost(outline(topics, Math.max(4, available - mocks), mocks, examMinutes), available);
      cut = {
        sessions: full.length,
        hours: Math.round((full.reduce((t, it) => t + minutesOf(it), 0) / 60) * 10) / 10,
        kinds: kindChanges(full, items),
        grouped: items.some((it) => it.topics) && !full.some((it) => it.topics),
      };
    }
  }

  const sessions = items.map((it, i) => ({
    n: i + 1,
    date: dates[i],
    weekday: WEEKDAYS[parseDate(dates[i]).getUTCDay()],
    minutes: minutesOf(it),
    ...it,
  }));
  const totalMinutes = sessions.reduce((s, x) => s + x.minutes, 0);
  const examDate = dates[full.length];
  const end = cut ? targetDate : examDate;
  const weeks = Math.ceil((parseDate(end) - parseDate(start)) / (7 * 86400000)) || 1;
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
    deadline: targetDate ? checkDeadline({ sessions: full.map((it) => ({ kind: it.kind, minutes: minutesOf(it) })), start, days, targetDate, sessionMinutes }) : null,
    cut,
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

/** Sessions dated before `today` and not done: how many, and the date of the first one. */
export function behind(sessions, done, today) {
  const finished = new Set(done);
  const missed = sessions.filter((s) => s.date < today && !finished.has(s.n));
  return { count: missed.length, since: missed.length ? missed.reduce((a, s) => (s.date < a ? s.date : a), missed[0].date) : null };
}

/**
 * Catch up after missed sessions. The sessions not done yet move, in their order, onto the study
 * days from `today` on, before `targetDate` when there is one, skipping days that already hold a
 * done session. When fewer days are left than sessions, the least important are left out (see
 * keepMost). Done sessions keep their dates.
 * Returns { dates: { n: date }, skipped: [n], available, remaining }.
 */
export function reschedule({ sessions, done = [], today, days, targetDate = null }) {
  const finished = new Set(done);
  const left = sessions.filter((s) => !finished.has(s.n));
  const busy = new Set(sessions.filter((s) => finished.has(s.n)).map((s) => s.date));
  const slots = [];
  if (days.length && (!targetDate || today < targetDate)) {
    for (const d = parseDate(today); targetDate ? formatDate(d) < targetDate : slots.length < left.length; d.setUTCDate(d.getUTCDate() + 1)) {
      const date = formatDate(d);
      if (days.includes(d.getUTCDay()) && !busy.has(date)) slots.push(date);
    }
  }
  const keep = keepMost(left, slots.length);
  const kept = new Set(keep.map((s) => s.n));
  return {
    dates: Object.fromEntries(keep.map((s, i) => [s.n, slots[i]])),
    skipped: left.filter((s) => !kept.has(s.n)).map((s) => s.n),
    available: slots.length,
    remaining: left.length,
  };
}

/**
 * A plan with saved moves applied: sessions get their new dates, skipped ones go, and the order,
 * hours and earliest exam date follow. Without a target date the earliest exam date is the next
 * study day after the last session.
 */
export function applyMoves(plan, { dates = {}, skipped = [] } = {}, days = []) {
  const skip = new Set(skipped);
  const sessions = plan.sessions
    .filter((s) => !skip.has(s.n))
    .map((s) => (dates[s.n] ? { ...s, date: dates[s.n], weekday: WEEKDAYS[parseDate(dates[s.n]).getUTCDay()] } : s))
    .sort((a, b) => a.date.localeCompare(b.date) || a.n - b.n);
  if (!sessions.length) return { ...plan, sessions: plan.sessions };
  const last = parseDate(sessions.at(-1).date);
  last.setUTCDate(last.getUTCDate() + 1);
  const examDate = !plan.deadline && days.length ? studyDates(formatDate(last), days, 1)[0] : plan.examDate;
  const minutes = sessions.reduce((t, s) => t + s.minutes, 0);
  return { ...plan, sessions, examDate, hours: Math.round((minutes / 60) * 10) / 10, skipped: plan.sessions.filter((s) => skip.has(s.n)) };
}

function fmtMinutes(m) {
  const h = Math.floor(m / 60);
  const r = m % 60;
  return h ? (r ? `${h} h ${r} min` : `${h} h`) : `${r} min`;
}

// The Markdown frame; the app passes a translated copy as `text`.
const MARKDOWN_TEXT = {
  title: (p) => `# Study plan: ${p.cert.name} (${p.cert.code})`,
  summary: (p) => `${p.sessions.length} sessions, ${p.hours} hours over about ${p.weeks} week${p.weeks === 1 ? '' : 's'}.`,
  earliest: (p) => `Earliest exam date if you keep pace: **${p.examDate}**. Book it only after the last mock goes well.`,
  fits: (d) => `Target exam date ${d.targetDate}: fits, with ${d.spare} spare study day${d.spare === 1 ? '' : 's'} as buffer.`,
  noFit: (d) => `Target exam date ${d.targetDate}: does not fit. ${d.needed} sessions are needed and only ${d.available} study days are available.`,
  cut: (p) => `The sessions below are cut to end before it: ${p.sessions.length} sessions and ${p.hours} h instead of ${p.cut.sessions} sessions and ${p.cut.hours} h.`,
  resources: 'Resources',
  sessions: 'Sessions',
  paid: ' (paid)',
  inferred: '> Topics were read from the scope summary. Replace them with the official exam objectives.',
  footer: 'Generated by pathfinder: https://legiosai.github.io/pathfinder/',
};

export function toMarkdown(plan, { resources = [], text = {} } = {}) {
  const T = { ...MARKDOWN_TEXT, ...text };
  const lines = [T.title(plan), '', T.summary(plan), T.earliest(plan), ''];
  if (plan.deadline) {
    const d = plan.deadline;
    lines.push(d.fits ? T.fits(d) : T.noFit(d), '');
    if (plan.cut) lines.push(T.cut(plan), '');
  }
  if (resources.length) {
    lines.push(`## ${T.resources}`, '');
    for (const r of resources) lines.push(`- [${r.title}](${r.url})${r.cost === 'paid' ? T.paid : ''}`);
    lines.push('', `## ${T.sessions}`, '');
  }
  if (plan.inferredTopics) {
    lines.push(T.inferred, '');
  }
  for (const s of plan.sessions) {
    lines.push(`- [ ] **${s.date}** (${s.weekday}) · ${fmtMinutes(s.minutes)} · ${s.title}`);
    lines.push(`  ${s.detail}`);
  }
  lines.push('', T.footer, '');
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

/**
 * iCalendar export with floating local times (the calendar app's own time zone). A booked exam
 * date comes as an all-day event; `text.exam` names it in the interface language.
 */
export function toICS(plan, now = new Date(), text = {}) {
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
  if (plan.deadline) {
    const day = plan.deadline.targetDate;
    const next = parseDate(day);
    next.setUTCDate(next.getUTCDate() + 1);
    lines.push(
      'BEGIN:VEVENT',
      `UID:${plan.cert.id}-${day}-exam@pathfinder.legiosai`,
      `DTSTAMP:${stamp}`,
      `DTSTART;VALUE=DATE:${day.replace(/-/g, '')}`,
      `DTEND;VALUE=DATE:${formatDate(next).replace(/-/g, '')}`,
      `SUMMARY:${icsEscape(`${plan.cert.code}: ${text.exam || 'Exam'}`)}`,
      'TRANSP:TRANSPARENT',
      'END:VEVENT',
    );
  }
  lines.push('END:VCALENDAR');
  return lines.map(fold).join('\r\n') + '\r\n';
}
