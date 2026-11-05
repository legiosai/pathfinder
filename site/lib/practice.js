// Practice exams: pick questions by exam domain, grade them and keep a history. No DOM here.

const shuffle = (list, random) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

/** Split `size` questions across the domains by weight, largest remainders first. */
export function domainCounts(domains, size) {
  const total = domains.reduce((t, d) => t + d.weight, 0) || 1;
  const exact = domains.map((d) => (d.weight / total) * size);
  const counts = exact.map(Math.floor);
  const order = exact.map((x, i) => [x - counts[i], i]).sort((a, b) => b[0] - a[0] || a[1] - b[1]);
  const missing = size - counts.reduce((t, c) => t + c, 0);
  for (let k = 0; k < missing; k++) counts[order[k][1]] += 1;
  return counts;
}

/** Question ids for one run: by domain weight, unseen first, topped up when a domain runs short. */
export function buildRun({ questions, domains, size, seen = new Set(), random = Math.random }) {
  const wanted = Math.min(size, questions.length);
  const counts = domainCounts(domains, wanted);
  const ordered = (list) => [...shuffle(list.filter((q) => !seen.has(q.id)), random), ...shuffle(list.filter((q) => seen.has(q.id)), random)];
  const picked = [];
  const spare = [];
  domains.forEach((d, i) => {
    const mine = ordered(questions.filter((q) => q.domain === d.name));
    picked.push(...mine.slice(0, counts[i]));
    spare.push(...mine.slice(counts[i]));
  });
  picked.push(...ordered(spare).slice(0, wanted - picked.length));
  return shuffle(picked, random).map((q) => q.id);
}

/** Time for a shorter run, at the real exam's pace. */
export function minutesFor(exam, count) {
  return Math.max(1, Math.ceil((exam.minutes * count) / exam.questions));
}

export function isCorrect(question, answer = []) {
  return answer.length === question.correct.length && question.correct.every((k) => answer.includes(k));
}

/** Only answered questions count, so finishing early does not read as wrong answers. */
export function grade({ questions, domains, ids, answers }) {
  const byId = new Map(questions.map((q) => [q.id, q]));
  const per = domains.map((d) => ({ name: d.name, weight: d.weight, ok: 0, n: 0, pct: null }));
  const wrong = [];
  const right = [];
  for (const id of ids) {
    const q = byId.get(id);
    const answer = answers[id];
    if (!q || !answer || !answer.length) continue;
    const row = per.find((d) => d.name === q.domain);
    if (row) row.n += 1;
    if (isCorrect(q, answer)) {
      if (row) row.ok += 1;
      right.push(id);
    } else wrong.push(id);
  }
  for (const d of per) if (d.n) d.pct = Math.round((d.ok / d.n) * 100);
  const n = right.length + wrong.length;
  const answered = per.filter((d) => d.n);
  const weightSum = answered.reduce((t, d) => t + d.weight, 0);
  return {
    total: ids.length,
    n,
    ok: right.length,
    unanswered: ids.length - n,
    pct: n ? Math.round((right.length / n) * 100) : null,
    // Exam weights, normalized over the domains that had answers. An accuracy, not a predicted score.
    weighted: n ? Math.round(answered.reduce((t, d) => t + d.weight * (d.ok / d.n), 0) * (100 / weightSum)) : null,
    per,
    right,
    wrong,
  };
}

export const emptyHistory = () => ({ attempts: [], questions: {} });

/** A new history with this attempt added. Unanswered questions are not recorded as seen. */
export function record(history, result, answers, when) {
  const questions = { ...history.questions };
  const touch = (id, missed) => {
    const old = questions[id] || { seen: 0, wrong: 0 };
    questions[id] = { seen: old.seen + 1, wrong: old.wrong + (missed ? 1 : 0), last: missed ? answers[id] : null };
  };
  result.right.forEach((id) => touch(id, false));
  result.wrong.forEach((id) => touch(id, true));
  const attempt = {
    id: `a${when}`,
    when,
    total: result.total,
    n: result.n,
    ok: result.ok,
    pct: result.pct,
    weighted: result.weighted,
    per: result.per,
    wrong: result.wrong,
    answers,
  };
  return { attempts: [...history.attempts, attempt], questions };
}

/** Totals by domain across every attempt. */
export function totals(history, domains) {
  return domains.map((d) => {
    let ok = 0;
    let n = 0;
    for (const a of history.attempts) {
      const row = a.per.find((x) => x.name === d.name);
      if (row) {
        ok += row.ok;
        n += row.n;
      }
    }
    return { name: d.name, weight: d.weight, ok, n, pct: n ? Math.round((ok / n) * 100) : null };
  });
}

/** Questions ever missed, most missed first. */
export function mistakes(history, questions) {
  return questions
    .filter((q) => history.questions[q.id]?.wrong)
    .map((q) => ({ question: q, ...history.questions[q.id] }))
    .sort((a, b) => b.wrong - a.wrong);
}

const cell = (v) => `"${String(v ?? '').replace(/"/g, '""')}"`;

/** Mistakes as CSV in the given language. */
export function mistakesCsv(rows, lang) {
  const head = ['id', 'domain', 'question', 'your_answer', 'correct', 'times_wrong', 'times_seen'];
  const lines = rows.map((r) => [r.question.id, r.question.domain, r.question.prompt[lang], (r.last || []).join(' '), r.question.correct.join(' '), r.wrong, r.seen].map(cell).join(','));
  return [head.join(','), ...lines].join('\n');
}

/** Problems in one certification's question file. Empty means valid. */
export function validatePractice(set, cert) {
  const errors = [];
  const domains = new Set((cert?.domains || []).map((d) => d.name));
  if (!cert) errors.push(`unknown certification ${set.cert}`);
  if (!set.license) errors.push('missing license');
  if (!Array.isArray(set.questions) || !set.questions.length) errors.push('needs questions');
  const ids = new Set();
  for (const q of set.questions || []) {
    const w = q.id || '(no id)';
    if (!q.id || ids.has(q.id)) errors.push(`${w}: missing or duplicate id`);
    ids.add(q.id);
    if (cert && !domains.has(q.domain)) errors.push(`${w}: domain "${q.domain}" is not in the certification`);
    const keys = (q.options || []).map((o) => o.key);
    if (keys.length < 3 || new Set(keys).size !== keys.length) errors.push(`${w}: needs at least three options with distinct keys`);
    if (!Array.isArray(q.correct) || !q.correct.length) errors.push(`${w}: needs a correct answer`);
    for (const k of q.correct || []) if (!keys.includes(k)) errors.push(`${w}: correct key ${k} is not an option`);
    for (const lang of ['en', 'es']) {
      if (!q.prompt?.[lang] || !q.explanation?.[lang]) errors.push(`${w}: missing ${lang} text`);
      if ((q.options || []).some((o) => !o.text?.[lang])) errors.push(`${w}: missing ${lang} option text`);
    }
  }
  return errors;
}
