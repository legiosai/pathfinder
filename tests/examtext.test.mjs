import { test } from 'node:test';
import assert from 'node:assert/strict';
import { examText } from '../site/lib/examtext.js';
import { loadCatalog } from '../scripts/catalog.mjs';

// Every distinct exam.questions, exam.validity, exam.passing and fee.basis in the catalog when
// this was written, with its Spanish form.
const ES = {
  // exam.questions
  '65 (50 scored)': '65 (cuentan 50)',
  '75 (65 scored)': '75 (cuentan 65)',
  60: '60',
  63: '63',
  53: '53',
  45: '45',
  100: '100',
  106: '106',
  125: '125',
  150: '150',
  '50–60': '50–60',
  '40–50': '40–50',
  'Maximum of 85': 'Hasta 85',
  'Maximum of 90': 'Hasta 90',
  '45 scored (plus up to 10 unscored)': '45 que cuentan (y hasta 10 que no)',
  '100–125 (CAT)': '100–125 (adaptativo)',
  '100–150 (CAT)': '100–150 (adaptativo)',
  "40–60 (Microsoft's usual range)": '40–60 (rango habitual de Microsoft)',
  // exam.validity
  '3 years': '3 años',
  '2 years': '2 años',
  '4 years': '4 años',
  '1 year': '1 año',
  '12 months': '12 meses',
  'Does not expire': 'No vence',
  '1 year; renewable free online': '1 año; se renueva gratis online',
  // exam.passing
  '700 scaled (100–1,000)': '700 (escala 100–1.000)',
  '720 scaled (100–1,000)': '720 (escala 100–1.000)',
  '750 scaled (100–1,000)': '750 (escala 100–1.000)',
  '750 scaled (100–900)': '750 (escala 100–900)',
  '450 scaled (200–800)': '450 (escala 200–800)',
  '700 scaled (out of 1,000)': '700 de 1.000 (escalado)',
  '700 scaled (1–1,000)': '700 (escala 1–1.000)',
  '750 scaled (0–1,000)': '750 (escala 0–1.000)',
  'Pass/fail only (no scaled score)': 'Solo aprobado o desaprobado (sin puntaje escalado)',
  '60–85% (cut score set per exam form)': '60–85% (el corte depende de cada versión del examen)',
  '72%': '72%',
  '66%': '66%',
  '67%': '67%',
  '75%': '75%',
  'Points threshold (not published) plus an accepted report': 'Un mínimo de puntos (no publicado) y un informe aprobado',
  '70 of 100 points (exams through 2026-11-30); scaled score from 2026-12-01': '70 de 100 puntos (exámenes hasta el 30/11/2026); puntaje escalado desde el 1/12/2026',
  // fee.basis
  'Exam only': 'Solo el examen',
  'Exam only, non-member': 'Solo el examen, sin membresía',
  'Exam only (two attempts)': 'Solo el examen (dos intentos)',
  'Exam attempt only': 'Solo un intento de examen',
  'Certification attempt': 'Un intento de certificación',
  'Training + exam': 'Capacitación + examen',
  'Exam voucher, remotely proctored': 'Voucher de examen, supervisado a distancia',
  'Assessed lab': 'Lab evaluado',
  'Regional exam price': 'Precio regional del examen',
  'Regional quote needed': 'Hay que pedir precio para tu región',
  'Announced retail': 'Precio de lista anunciado',
  'Voucher or annual plan': 'Voucher o plan anual',
  'Subscription + voucher': 'Suscripción + voucher',
  'Course bundle, from': 'Paquete con curso, desde',
  'Free course': 'Curso gratis',
};

test('every exam and fee phrase of the catalog has its Spanish form', () => {
  for (const [en, es] of Object.entries(ES)) assert.equal(examText(en, 'es'), es, en);
});

test('English and missing values come back untouched', () => {
  for (const en of Object.keys(ES)) assert.equal(examText(en, 'en'), en);
  assert.equal(examText(undefined, 'es'), undefined);
  assert.equal(examText('', 'es'), '');
});

test('unknown or half-known text passes through whole', () => {
  assert.equal(examText('Varies by testing partner', 'es'), 'Varies by testing partner');
  assert.equal(examText('3 years, renewable through CPE credits', 'es'), '3 years, renewable through CPE credits');
  // Shapes, not just the exact strings, so a new number or issuer reads the same way.
  assert.equal(examText('Maximum of 75', 'es'), 'Hasta 75');
  assert.equal(examText('5 years', 'es'), '5 años');
  assert.equal(examText('1 month', 'es'), '1 mes');
  assert.equal(examText('680 scaled (300–1,000)', 'es'), '680 (escala 300–1.000)');
  assert.equal(examText("50–55 (Cisco's usual range)", 'es'), '50–55 (rango habitual de Cisco)');
});

test('the shipped catalog has no exam phrase left in English', async () => {
  const { certifications } = await loadCatalog(new URL('..', import.meta.url).pathname);
  const left = new Set();
  for (const c of certifications) {
    for (const text of [c.exam.questions, c.exam.validity, c.exam.passing, c.fee.basis]) {
      if (typeof text === 'string' && /[a-z]/i.test(text) && examText(text, 'es') === text) left.add(text);
    }
  }
  assert.deepEqual([...left], [], 'add these shapes to site/lib/examtext.js');
});
