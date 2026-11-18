// Exam facts are kept as the issuers write them, in English ("3 years", "Maximum of 90",
// "700 scaled (100–1,000)"). This puts the common shapes of exam.questions, exam.validity,
// exam.passing and fee.basis into Spanish for the interface. A string is translated only when
// every part of it is understood; anything else passes through unchanged, so a new phrasing in
// the catalog shows in English rather than half translated.

const n = (s) => s.replace(/(\d),(\d{3})\b/g, '$1.$2');
const date = (s) => {
  const [y, m, d] = s.split('-').map(Number);
  return `${d}/${m}/${y}`;
};
const plural = (count, one, many) => `${count} ${count === '1' ? one : many}`;
const ISO = '(\\d{4}-\\d{2}-\\d{2})';

// Each shape is matched, ignoring case, against the whole string and otherwise against each of
// its parts (split on ", " and "; "), so "Exam only, non-member" is "Exam only" plus "non-member".
const ES = [
  // validity
  [/^does not expire$/, 'No vence'],
  [/^(\d+) years?$/, (m, x) => plural(x, 'año', 'años')],
  [/^(\d+) months?$/, (m, x) => plural(x, 'mes', 'meses')],
  [/^(\d+) years? \(([A-Z0-9+ -]+)\)$/, (m, x, what) => `${plural(x, 'año', 'años')} (${what})`],
  [/^lifetime$/, 'De por vida'],
  [/^renewable free online$/, 'se renueva gratis online'],
  // questions
  [/^maximum of (\d+)$/, 'Hasta $1'],
  [/^(\d+) \((\d+) scored\)$/, '$1 (cuentan $2)'],
  [/^(\d+) scored \(plus up to (\d+) unscored\)$/, '$1 que cuentan (y hasta $2 que no)'],
  [/^([\d–-]+) \(cat\)$/, '$1 (adaptativo)'],
  [/^([\d–-]+) \((.+)'s usual range\)$/, (m, x, who) => `${x} (rango habitual de ${who})`],
  [/^(\d+) \(beta; (\d+) with (\d+) scored in the standard exam\)$/, '$1 (beta; $2 con $3 que cuentan en el examen normal)'],
  [/^([\d–-]+) performance-based tasks$/, '$1 tareas prácticas'],
  [/^(\d+) multiple-choice \(plus (\d+) hands-on lab challenges\)$/, '$1 de opción múltiple (y $2 desafíos prácticos de laboratorio)'],
  // passing score
  [/^(\d+) scaled \(([\d,]+)–([\d,]+)\)$/, (m, x, a, b) => `${x} (escala ${n(a)}–${n(b)})`],
  [/^(\d+) scaled \(out of ([\d,]+)\)$/, (m, x, b) => `${x} de ${n(b)} (escalado)`],
  [/^pass\/fail only \(no scaled score\)$/, 'Solo aprobado o desaprobado (sin puntaje escalado)'],
  [/^([\d–-]+%) \(cut score set per exam form\)$/, '$1 (el corte depende de cada versión del examen)'],
  [/^points threshold \(not published\) plus an accepted report$/, 'Un mínimo de puntos (no publicado) y un informe aprobado'],
  [new RegExp(`^(\\d+) of (\\d+) points \\(exams through ${ISO}\\)$`), (m, a, b, d) => `${a} de ${b} puntos (exámenes hasta el ${date(d)})`],
  [new RegExp(`^scaled score from ${ISO}$`), (m, d) => `puntaje escalado desde el ${date(d)}`],
  [/^(\d+) of (\d+) points$/, '$1 de $2 puntos'],
  [new RegExp(`^(\\d+) of (\\d+) points for exams starting before ${ISO} (\\d{2}:\\d{2}) GMT$`), (m, a, b, d, h) => `${a} de ${b} puntos en exámenes que empiezan antes del ${date(d)} a las ${h} GMT`],
  [/^from then$/, 'desde entonces'],
  [/^a scaled score of (\d+) on a ([\d,]+)–([\d,]+) scale$/, (m, x, a, b) => `un puntaje escalado de ${x} en una escala de ${n(a)}–${n(b)}`],
  [/^(\d+) on a ([\d,]+)–([\d,]+) scale$/, (m, x, a, b) => `${x} en una escala de ${n(a)}–${n(b)}`],
  [/^(\d+) of (\d+) correct \((\d+%)\)$/, '$1 de $2 correctas ($3)'],
  [/^exploit the ai application and submit an accepted professional report$/, 'Explotar la aplicación de IA y entregar un informe profesional aprobado'],
  [/^not published \(results show pass\/fail and a score per objective\)$/, 'No se publica (el resultado muestra si aprobaste y un puntaje por objetivo)'],
  // fee basis
  [/^exam only$/, 'Solo el examen'],
  [/^exam only \(two attempts\)$/, 'Solo el examen (dos intentos)'],
  [/^exam only \(beta price\)$/, 'Solo el examen (precio beta)'],
  [/^exam \+ required labs$/, 'Examen + labs obligatorios'],
  [/^exam attempt only$/, 'Solo un intento de examen'],
  [/^non-member$/, 'sin membresía'],
  [/^certification attempt$/, 'Un intento de certificación'],
  [/^training \+ exam$/, 'Capacitación + examen'],
  [/^exam voucher$/, 'Voucher de examen'],
  [/^remotely proctored$/, 'supervisado a distancia'],
  [/^assessed lab$/, 'Lab evaluado'],
  [/^regional exam price$/, 'Precio regional del examen'],
  [/^regional quote needed$/, 'Hay que pedir precio para tu región'],
  [/^announced retail$/, 'Precio de lista anunciado'],
  [/^voucher or annual plan$/, 'Voucher o plan anual'],
  [/^subscription \+ voucher$/, 'Suscripción + voucher'],
  [/^course bundle$/, 'Paquete con curso'],
  [/^from$/, 'desde'],
  [/^free course$/, 'Curso gratis'],
  [/^free course and online (test|exam)$/, (m, x) => `Curso y ${x === 'test' ? 'prueba' : 'examen'} online gratis`],
  [/^coursera subscription$/, 'Suscripción a Coursera'],
];

for (const rule of ES) rule[0] = new RegExp(rule[0].source, 'i');

const capitalized = (s) => s && s[0] !== s[0].toLowerCase();
const withCase = (to, like) => (capitalized(like) ? to[0].toUpperCase() + to.slice(1) : to[0].toLowerCase() + to.slice(1));

function part(text) {
  // Numbers and symbols alone ("60", "50–60", "72%") read the same in both languages.
  if (!/[a-z]/i.test(text)) return n(text);
  for (const [re, to] of ES) {
    if (!re.test(text)) continue;
    const out = text.replace(re, to);
    return /^\d/.test(out) ? out : withCase(out, text);
  }
  return null;
}

/** Puts an exam or fee fact from the catalog into `lang`; unknown text comes back as it was. */
export function examText(text, lang = 'en') {
  if (lang !== 'es' || typeof text !== 'string' || !text.trim()) return text;
  const whole = part(text);
  if (whole != null) return whole;
  const pieces = text.split(/(, |; )/);
  const out = [];
  for (const [i, piece] of pieces.entries()) {
    if (i % 2) {
      out.push(piece);
      continue;
    }
    const done = part(piece);
    if (done == null) return text;
    out.push(done);
  }
  return out.join('');
}
