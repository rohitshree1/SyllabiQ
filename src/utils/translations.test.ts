import test from 'node:test';
import assert from 'node:assert/strict';
import {
  DEFAULT_LANGUAGE,
  SUPPORTED_LANGUAGES,
  resolveAppLanguage,
  t,
} from './translations.ts';
import {
  generateScholarProfileId,
  normalizeProfileId,
  isPlausibleProfileId,
} from './verificationAndReferral.ts';

test('translations defaults to English only', () => {
  assert.equal(DEFAULT_LANGUAGE, 'en');
  assert.equal(SUPPORTED_LANGUAGES.length, 1);
  assert.equal(SUPPORTED_LANGUAGES[0].code, 'en');
});

test('resolveAppLanguage always resolves to English', () => {
  assert.equal(resolveAppLanguage('?lang=hi'), 'en');
  assert.equal(resolveAppLanguage('?lang=en'), 'en');
  assert.equal(resolveAppLanguage(''), 'en');
});

test('t returns correct English strings', () => {
  assert.equal(t('appName'), 'SyllabiQ');
  assert.equal(t('nav_dashboard'), 'Analytics Dashboard');
  assert.equal(t('nav_planner'), 'Study Planner');
  assert.equal(t('verifyModalTitle'), 'Verify FlexCard or Report Card Serial');
});

test('t handles dynamic replacements', () => {
  const enLuster = t('lusterWarningTitle', 'en', {
    days: 53,
    subject: 'Applied Engineering Calculus',
  });
  assert.equal(
    enLuster,
    '53 days since last Applied Engineering Calculus drill — 1 quick sprint keeps Full Badge Luster'
  );
});

test('generateScholarProfileId creates deterministic, formatted Profile IDs', () => {
  const id1 = generateScholarProfileId('sandbox-candidate');
  const id2 = generateScholarProfileId('sandbox-candidate');
  assert.equal(id1, id2);
  assert.match(id1, /^SLQ-USR-[A-Z0-9]{8}$/);

  const idAnanya = generateScholarProfileId('cand-ananya-02');
  assert.match(idAnanya, /^SLQ-USR-[A-Z0-9]{8}$/);
  assert.notEqual(id1, idAnanya);
});

test('normalizeProfileId handles case and prefixes properly', () => {
  assert.equal(normalizeProfileId('slq-usr-7m4k28np'), 'SLQ-USR-7M4K28NP');
  assert.equal(normalizeProfileId('7M4K28NP'), 'SLQ-USR-7M4K28NP');
  assert.equal(isPlausibleProfileId('SLQ-USR-7M4K28NP'), true);
  assert.equal(isPlausibleProfileId('INVALID-ID'), false);
});
