import { test } from 'node:test';
import assert from 'node:assert/strict';
import { allocate, buildPlan, countStudyDays, estimateHours, groupTopics, keepMost, planTopics, studyDates, toICS, toMarkdown } from '../site/lib/planner.js';

const cert = {
  id: 'demo',
  name: 'Demo Cert',
  provider: 'Acme',
  code: 'DMO-1',
  level: 'associate',
  skills: ['agents', 'mcp', 'prompting', 'llm-apps'],
  scope: 'Agents, tools and prompting.',
  exam: { minutes: 120, style: 'knowledge' },
  domains: [
    { name: 'Agents', weight: 50 },
    { name: 'Tools', weight: 30 },
    { name: 'Prompts', weight: 20 },
  ],
};

test('allocate keeps the total and follows weights', () => {
  const out = allocate(10, cert.domains);
  assert.equal(out.reduce((a, b) => a + b, 0), 10);
  assert.deepEqual(out, [5, 3, 2]);
});

test('estimate shrinks with known skills and grows for newcomers', () => {
  const none = estimateHours(cert, { known: [], experience: 'some' }).hours;
  const most = estimateHours(cert, { known: ['agents', 'mcp', 'prompting'], experience: 'some' }).hours;
  const fresh = estimateHours(cert, { known: [], experience: 'new' }).hours;
  assert.ok(most < none && none < fresh, `${most} < ${none} < ${fresh}`);
});

test('study dates only use the chosen weekdays', () => {
  // 2026-11-02 is a Monday.
  assert.deepEqual(studyDates('2026-11-02', [1, 3], 4), ['2026-11-02', '2026-11-04', '2026-11-09', '2026-11-11']);
});

test('plan has baseline first, two mocks, final last and roughly the asked hours', () => {
  const p = buildPlan({ cert, hours: 30, start: '2026-11-02', days: [1, 3, 5], sessionMinutes: 90 });
  assert.equal(p.sessions[0].kind, 'baseline');
  assert.equal(p.sessions.at(-1).kind, 'final');
  assert.equal(p.sessions.filter((s) => s.kind === 'mock').length, 2);
  assert.ok(p.sessions.filter((s) => s.kind === 'mock').every((s) => s.minutes === 120));
  assert.ok(Math.abs(p.hours - 30) <= 3, `planned ${p.hours} h`);
  const learn = p.sessions.filter((s) => s.kind === 'learn');
  const agents = learn.filter((s) => s.topic === 'Agents').length;
  const prompts = learn.filter((s) => s.topic === 'Prompts').length;
  assert.ok(agents > prompts);
  assert.ok(p.examDate > p.sessions.at(-1).date);
});

test('topics fall back to the scope summary, then a generic outline', () => {
  const inferred = planTopics({ ...cert, domains: [] });
  assert.equal(inferred.inferred, true);
  assert.deepEqual(inferred.topics.map((t) => t.name), ['Agents', 'Tools', 'Prompting']);
  const generic = planTopics({ ...cert, domains: [], scope: 'Something.' });
  assert.equal(generic.topics.length, 3);
});

test('ics export is valid-looking and folds long lines', () => {
  const p = buildPlan({ cert, hours: 10, start: '2026-11-02', days: [2], sessionMinutes: 60, startTime: '18:30' });
  const ics = toICS(p, new Date('2026-11-01T00:00:00Z'));
  assert.match(ics, /^BEGIN:VCALENDAR\r\n/);
  assert.match(ics, /END:VCALENDAR\r\n$/);
  assert.match(ics, /DTSTART:20261103T183000\r\n/);
  assert.match(ics, /DTEND:20261103T193000\r\n/);
  for (const line of ics.split('\r\n')) assert.ok(new TextEncoder().encode(line).length <= 75, line);
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, p.sessions.length);
});

test('markdown export lists every session as a checkbox', () => {
  const p = buildPlan({ cert, hours: 12, start: '2026-11-02', days: [1, 4], sessionMinutes: 60 });
  const md = toMarkdown(p);
  assert.equal((md.match(/^- \[ \]/gm) || []).length, p.sessions.length);
  assert.match(md, /DMO-1/);
});

test('low confidence pulls sessions toward a topic', () => {
  const even = buildPlan({ cert, hours: 30, start: '2026-11-02', days: [1, 3, 5], sessionMinutes: 90 });
  const weak = buildPlan({ cert, hours: 30, start: '2026-11-02', days: [1, 3, 5], sessionMinutes: 90, confidence: { Prompts: 1, Agents: 5 } });
  const count = (p, topic) => p.sessions.filter((s) => s.topic === topic).length;
  assert.ok(count(weak, 'Prompts') > count(even, 'Prompts'));
  assert.ok(count(weak, 'Agents') < count(even, 'Agents'));
});

test('deadline check reports fit, spare days and a fix', () => {
  const roomy = buildPlan({ cert, hours: 12, start: '2026-11-02', days: [1, 2, 3, 4, 5], sessionMinutes: 90, targetDate: '2026-12-31' });
  assert.equal(roomy.deadline.fits, true);
  assert.ok(roomy.deadline.spare > 0);
  const tight = buildPlan({ cert, hours: 30, start: '2026-11-02', days: [6], sessionMinutes: 60, targetDate: '2026-11-30' });
  assert.equal(tight.deadline.fits, false);
  assert.equal(tight.deadline.available, 4);
  assert.ok(tight.deadline.suggestedMinutes === null || tight.deadline.suggestedMinutes > 60);
});

test('countStudyDays counts the chosen weekdays before the end date', () => {
  // Mondays and Wednesdays from Mon 2 Nov up to (not including) Mon 16 Nov 2026.
  assert.equal(countStudyDays('2026-11-02', '2026-11-16', [1, 3]), 4);
});

test('markdown export can include resources', () => {
  const p = buildPlan({ cert, hours: 10, start: '2026-11-02', days: [1, 4], sessionMinutes: 60 });
  const md = toMarkdown(p, { resources: [{ title: 'Guide', url: 'https://example.com/g', cost: 'free' }] });
  assert.match(md, /## Resources/);
  assert.match(md, /\[Guide\]\(https:\/\/example.com\/g\)/);
});

test('markdown export takes a translated frame and keeps the rest', () => {
  const p = buildPlan({ cert, hours: 10, start: '2026-11-02', days: [1, 4], sessionMinutes: 60 });
  const md = toMarkdown(p, { resources: [{ title: 'Guide', url: 'https://example.com/g', cost: 'paid' }], text: { resources: 'Recursos', paid: ' (pago)', title: (x) => `# Plan: ${x.cert.code}` } });
  assert.match(md, /^# Plan: /);
  assert.match(md, /## Recursos/);
  assert.match(md, /\(pago\)/);
  assert.match(md, /## Sessions/);
});

// Five domains, like the Claude Architect guide, for the short-plan cases.
const five = {
  ...cert,
  domains: [
    { name: 'Agentic', weight: 27 },
    { name: 'Tools', weight: 18 },
    { name: 'Claude Code', weight: 20 },
    { name: 'Prompting', weight: 20 },
    { name: 'Context', weight: 15 },
  ],
};

test('groupTopics keeps the order, uses every topic once and balances weight', () => {
  const groups = groupTopics(2, five.domains);
  assert.deepEqual(groups.map((g) => g.map((t) => t.name)), [['Agentic', 'Tools'], ['Claude Code', 'Prompting', 'Context']]);
  assert.deepEqual(groupTopics(1, five.domains).map((g) => g.length), [5]);
  const four = groupTopics(4, five.domains);
  assert.equal(four.length, 4);
  assert.ok(four.every((g) => g.length >= 1));
  assert.deepEqual(four.flat().map((t) => t.name), five.domains.map((t) => t.name));
});

test('a short budget keeps close to the hours asked instead of a fixed outline', () => {
  // 10.5 h on Mondays and weekends, exam on Saturday 5 December: the plan used to
  // grow to twelve sessions (26.5 h) and say it could not fit.
  const p = buildPlan({ cert: five, hours: 10.5, start: '2026-11-17', days: [1, 6, 0], sessionMinutes: 135, targetDate: '2026-12-05' });
  assert.ok(Math.abs(p.hours - 10.5) <= 1.5, `planned ${p.hours} h`);
  assert.equal(p.sessions.filter((s) => s.kind === 'mock').length, 1);
  assert.equal(p.sessions[0].kind, 'baseline');
  assert.equal(p.sessions.at(-1).kind, 'final');
  assert.equal(p.deadline.fits, true);
  // Every domain is still studied, some sessions covering several of them.
  const covered = p.sessions.flatMap((s) => s.topics || (s.topic ? [s.topic] : []));
  assert.deepEqual([...new Set(covered)].sort(), five.domains.map((d) => d.name).sort());
});

test('shorter sessions in the same budget split the domains across more of them', () => {
  const p = buildPlan({ cert: five, hours: 10.5, start: '2026-11-17', days: [1, 6, 0], sessionMinutes: 90 });
  const learn = p.sessions.filter((s) => s.kind === 'learn');
  assert.ok(learn.length > 1 && learn.length < five.domains.length, `${learn.length} learning sessions`);
  assert.ok(Math.abs(p.hours - 10.5) <= 1.5, `planned ${p.hours} h`);
});

test('a roomy budget still gets two mocks and a session per domain', () => {
  const p = buildPlan({ cert: five, hours: 30, start: '2026-11-02', days: [1, 3, 5], sessionMinutes: 90 });
  assert.equal(p.sessions.filter((s) => s.kind === 'mock').length, 2);
  assert.ok(p.sessions.every((s) => !s.topics));
});

test('a plan that does not fit is cut to end before the exam date', () => {
  // 25 h on four days a week, exam on Saturday 28 November: 6 study days from Wed 18 Nov.
  const p = buildPlan({ cert: five, hours: 25, start: '2026-11-18', days: [1, 3, 5, 6], sessionMinutes: 90, targetDate: '2026-11-28' });
  assert.equal(p.deadline.fits, false);
  assert.equal(p.deadline.available, 6);
  assert.ok(p.deadline.needed > 6);
  assert.equal(p.sessions.length, 6);
  assert.ok(p.sessions.every((s) => s.date < '2026-11-28'), p.sessions.map((s) => s.date).join(' '));
  assert.equal(p.sessions[0].kind, 'baseline');
  assert.equal(p.sessions.at(-1).kind, 'final');
  assert.equal(p.sessions.filter((s) => s.kind === 'mock').length, 1);
  // Every domain is still studied, several per session.
  const covered = p.sessions.flatMap((s) => s.topics || (s.topic ? [s.topic] : []));
  assert.deepEqual([...new Set(covered)].sort(), five.domains.map((d) => d.name).sort());
  // The cut says what changed.
  assert.equal(p.cut.sessions, p.deadline.needed);
  assert.ok(p.cut.hours > p.hours);
  assert.equal(p.cut.grouped, true);
  const mock = p.cut.kinds.find((k) => k.kind === 'mock');
  assert.deepEqual(mock, { kind: 'mock', from: 2, to: 1 });
  assert.ok(p.cut.kinds.every((k) => k.from !== k.to));
  // A plan that fits is not cut.
  assert.equal(buildPlan({ cert: five, hours: 25, start: '2026-11-18', days: [1, 3, 5, 6], sessionMinutes: 90, targetDate: '2027-02-01' }).cut, null);
});

test('with only a few study days the final review, the mock and learning stay', () => {
  const kinds = (n) => {
    // Mondays from 2 Nov: n of them before the exam on the Tuesday after the nth.
    const exam = ['2026-11-03', '2026-11-10', '2026-11-17', '2026-11-24', '2026-12-01'][n - 1];
    return buildPlan({ cert, hours: 30, start: '2026-11-02', days: [1], sessionMinutes: 90, targetDate: exam }).sessions.map((s) => s.kind);
  };
  assert.deepEqual(kinds(1), ['final']);
  assert.deepEqual(kinds(2), ['mock', 'final']);
  assert.deepEqual(kinds(3), ['learn', 'mock', 'final']);
  assert.deepEqual(kinds(4), ['learn', 'mock', 'review', 'final']);
  assert.deepEqual(kinds(5), ['baseline', 'learn', 'mock', 'review', 'final']);
  assert.throws(() => buildPlan({ cert, hours: 30, start: '2026-11-03', days: [1], targetDate: '2026-11-09' }), /No study days before the exam date/);
});

test('ics export marks a booked exam day and has nothing after it', () => {
  const p = buildPlan({ cert, hours: 30, start: '2026-11-02', days: [6], sessionMinutes: 60, targetDate: '2026-11-30' });
  const ics = toICS(p, new Date('2026-11-01T00:00:00Z'), { exam: 'Examen' });
  assert.equal((ics.match(/BEGIN:VEVENT/g) || []).length, p.sessions.length + 1);
  assert.match(ics, /DTSTART;VALUE=DATE:20261130\r\nDTEND;VALUE=DATE:20261201\r\n/);
  assert.match(ics, /SUMMARY:DMO-1: Examen\r\n/);
  const starts = [...ics.matchAll(/^DTSTART:(\d{8})/gm)].map((m) => m[1]);
  assert.ok(starts.every((d) => d < '20261130'), starts.join(' '));
  // No booked date, no exam event.
  const open = buildPlan({ cert, hours: 10, start: '2026-11-02', days: [2], sessionMinutes: 60 });
  assert.doesNotMatch(toICS(open), /VALUE=DATE/);
});

test('markdown export says when the plan was cut', () => {
  const p = buildPlan({ cert, hours: 30, start: '2026-11-02', days: [6], sessionMinutes: 60, targetDate: '2026-11-30' });
  assert.match(toMarkdown(p), /cut to end before it: 4 sessions/);
});

test('keepMost drops practice, fixes and the second mock first and keeps the order', () => {
  const p = buildPlan({ cert, hours: 30, start: '2026-11-02', days: [1, 3, 5], sessionMinutes: 90 });
  const kept = keepMost(p.sessions, 9);
  assert.equal(kept.length, 9);
  assert.deepEqual(kept.map((s) => s.n), [...kept.map((s) => s.n)].sort((a, b) => a - b));
  assert.ok(!kept.some((s) => s.kind === 'practice' || s.kind === 'remediate'));
  assert.equal(kept.filter((s) => s.kind === 'mock').length, 1);
  assert.equal(kept.at(-1).kind, 'final');
  assert.equal(keepMost(p.sessions, 99), p.sessions);
  assert.deepEqual(keepMost(p.sessions, 0), []);
});
