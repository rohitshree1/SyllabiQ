import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFallbackBanFlexDraft,
  buildFallbackStudentAboutLines,
  buildReferralShareLinks,
  generateFlexCardSerial,
  generateReferralCode,
  generateReportCardSerial,
  isPlausibleSerialFormat,
  normalizeStudentAboutLines,
  validateVerifierSubmission,
} from './verificationAndReferral';
import { createDemoSeedState } from '../data/seedData';
import { isValidFirestoreId } from './firestoreValidators';

test('generateFlexCardSerial and generateReportCardSerial produce deterministic Firestore-safe serials', () => {
  const fc1 = generateFlexCardSerial('cand-aarav-01', 'EIGHT_PLUS_FLEX');
  const fc2 = generateFlexCardSerial('cand-aarav-01', 'EIGHT_PLUS_FLEX');
  const fcOther = generateFlexCardSerial('cand-ananya-02', 'EIGHT_PLUS_FLEX');
  const rc1 = generateReportCardSerial('cand-aarav-01', 'ALL');

  assert.equal(fc1, fc2);
  assert.notEqual(fc1, fcOther);
  assert.notEqual(fc1, rc1);
  assert.ok(fc1.startsWith('SLQ-FC-'));
  assert.ok(rc1.startsWith('SLQ-RC-'));
  assert.equal(isPlausibleSerialFormat(fc1), true);
  assert.equal(isPlausibleSerialFormat(rc1), true);
  assert.equal(isValidFirestoreId(fc1), true);
  assert.equal(isValidFirestoreId(rc1), true);
});

test('validateVerifierSubmission allows silent verification for staff and requires Name + @gmail.com + Post for non-admins', () => {
  const serial = generateFlexCardSerial('cand-aarav-01', 'EIGHT_PLUS_FLEX');

  const staffCheck = validateVerifierSubmission({
    serialInput: `  ${serial.toLowerCase()} `,
    isStaff: true,
    verifierName: '',
    verifierGmail: '',
    verifierPost: '',
  });
  assert.equal(staffCheck.valid, true);
  assert.equal(staffCheck.normalizedSerial, serial);

  const missingGmail = validateVerifierSubmission({
    serialInput: serial,
    isStaff: false,
    verifierName: 'Dr. Neha Verma',
    verifierGmail: 'neha@university.edu',
    verifierPost: 'teacher',
  });
  assert.equal(missingGmail.valid, false);
  assert.ok(missingGmail.error?.includes('@gmail.com'));

  const invalidPost = validateVerifierSubmission({
    serialInput: serial,
    isStaff: false,
    verifierName: 'Dr. Neha Verma',
    verifierGmail: 'neha.verma@gmail.com',
    verifierPost: 'invalid_role',
  });
  assert.equal(invalidPost.valid, false);

  const validNonAdmin = validateVerifierSubmission({
    serialInput: serial,
    isStaff: false,
    verifierName: 'Dr. Neha Verma',
    verifierGmail: 'Neha.Verma@gmail.com ',
    verifierPost: 'company_executive',
  });
  assert.equal(validNonAdmin.valid, true);
  assert.equal(validNonAdmin.normalizedGmail, 'neha.verma@gmail.com');
  assert.equal(validNonAdmin.normalizedPost, 'company_executive');
});

test('buildFallbackStudentAboutLines and normalizeStudentAboutLines strictly enforce 10-15 lines', () => {
  const demo = createDemoSeedState();
  const fallback = buildFallbackStudentAboutLines(demo);
  assert.ok(fallback.length >= 10 && fallback.length <= 15);
  assert.ok(fallback.some((line) => line.includes(demo.student.name)));

  const shortAi = ['Line one about strong calculus score.', 'Line two about peak morning slot.'];
  const normalizedFromShort = normalizeStudentAboutLines(shortAi, fallback);
  assert.ok(normalizedFromShort.length >= 10 && normalizedFromShort.length <= 15);

  const twentyLines = Array.from({ length: 20 }, (_, idx) => `Detailed student performance insight line number ${idx + 1}.`);
  const normalizedFromLong = normalizeStudentAboutLines(twentyLines, fallback);
  assert.equal(normalizedFromLong.length, 15);
});

test('generateReferralCode, buildReferralShareLinks, and buildFallbackBanFlexDraft produce valid outputs', () => {
  const code = generateReferralCode('cand-aarav-01', 'Aarav Mehta');
  assert.ok(code.startsWith('SLQ-REF-AAR'));

  const links = buildReferralShareLinks({
    referralCode: code,
    candidateName: 'Aarav Mehta',
    examName: 'B.Tech Sem-IV Finals',
    originUrl: 'https://syllabiq.example.com/',
  });
  assert.equal(links.referralUrl, `https://syllabiq.example.com/?ref=${code}`);
  assert.ok(links.whatsappUrl.startsWith('https://wa.me/?text='));
  assert.ok(links.gmailComposeUrl.includes('mail.google.com'));

  const banDraft = buildFallbackBanFlexDraft({
    candidateName: 'Suspended Scholar',
    examName: 'Engineering Finals',
    banReason: 'Multiple tab-switch anomalies during timed PYQ drill',
    xpPoints: 620,
    flexTier: 'Rare Sapphire',
  });
  assert.ok(banDraft.headline.includes('Multiple tab-switch anomalies'));
  assert.ok(banDraft.caption.includes('Multiple tab-switch anomalies'));
});
