import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildOneClickOutreachLinks,
  computeCandidateXpSnapshot,
  computeInactiveDays,
  computeInactivityDecayPenalty,
  identifyNeededStudyTopics,
  resolveFlexRarityTier,
  sanitizeWhatsappDigits,
  validateAdminContactAssignment,
} from './xpAndOutreachEngine';
import { createDefaultAchievements, createDemoSeedState } from '../data/seedData';
import type { CandidateSummaryDoc } from '../types';

test('resolveFlexRarityTier auto-upgrades rarity tiers across all 5 XP milestones', () => {
  assert.equal(resolveFlexRarityTier(0).tier, 'Common Slate');
  assert.equal(resolveFlexRarityTier(199).tier, 'Common Slate');
  assert.equal(resolveFlexRarityTier(200).tier, 'Uncommon Emerald');
  assert.equal(resolveFlexRarityTier(500).tier, 'Rare Sapphire');
  assert.equal(resolveFlexRarityTier(1000).tier, 'Epic Amethyst');
  assert.equal(resolveFlexRarityTier(1800).tier, 'Mythic Sovereign');
});

test('computeInactiveDays and computeInactivityDecayPenalty trigger after 3 inactive days', () => {
  assert.equal(computeInactiveDays('2026-10-26', '2026-10-27'), 1);
  assert.equal(computeInactivityDecayPenalty(0), 0);
  assert.equal(computeInactivityDecayPenalty(2), 0);
  assert.equal(computeInactivityDecayPenalty(3), 40);
  assert.equal(computeInactivityDecayPenalty(5), 120);
});

test('computeCandidateXpSnapshot awards XP from chapters, tests, focus, badges, bonusPoints and decays after 3 days', () => {
  const demo = createDemoSeedState();
  const activeSnap = computeCandidateXpSnapshot({
    state: demo,
    bonusPoints: 150,
    lastActiveDate: '2026-10-27',
    referenceDateISO: '2026-10-27',
  });

  assert.equal(activeSnap.activeLearnerDissolved, false);
  assert.equal(activeSnap.decayPenaltyXp, 0);
  assert.ok(activeSnap.netXp >= 1800);
  assert.equal(activeSnap.rarity.tier, 'Mythic Sovereign');

  const decayedSnap = computeCandidateXpSnapshot({
    topics: demo.topics,
    attempts: demo.attempts,
    achievements: createDefaultAchievements(),
    focusMinutesTotal: 10,
    bonusPoints: 0,
    lastActiveDate: '2026-10-20',
    referenceDateISO: '2026-10-27',
  });

  assert.equal(decayedSnap.inactiveDays, 7);
  assert.equal(decayedSnap.activeLearnerDissolved, true);
  assert.equal(decayedSnap.decayPenaltyXp, 200);
  assert.ok(decayedSnap.netXp < decayedSnap.earnedRawXp);

  const deductedSnap = computeCandidateXpSnapshot({
    state: demo,
    bonusPoints: 150,
    deductedPoints: 950,
    lastActiveDate: '2026-10-27',
    referenceDateISO: '2026-10-27',
  });
  assert.equal(deductedSnap.adminDeductionXp, 950);
  assert.equal(deductedSnap.netXp, Math.max(0, activeSnap.netXp - 950));
  assert.equal(deductedSnap.rarity.tier, 'Rare Sapphire');
});

test('identifyNeededStudyTopics prioritizes incomplete high-yield lowest-mastery chapters', () => {
  const demo = createDemoSeedState();
  const needed = identifyNeededStudyTopics(demo.topics, 2);
  assert.equal(needed.length, 2);
  assert.ok(needed[0].includes('Plane Wave Propagation'));
  assert.ok(needed[0].includes('High-Yield PYQ'));
});

test('validateAdminContactAssignment enforces mandatory @gmail.com and valid phone number', () => {
  const missingPhone = validateAdminContactAssignment('mentor@gmail.com', '');
  assert.equal(missingPhone.valid, false);

  const nonGmail = validateAdminContactAssignment('mentor@outlook.com', '+91 98765 43210');
  assert.equal(nonGmail.valid, false);

  const valid = validateAdminContactAssignment('Mentor.Team@Gmail.com ', '+91 98765 43210');
  assert.equal(valid.valid, true);
  assert.equal(valid.normalizedEmail, 'mentor.team@gmail.com');
  assert.equal(sanitizeWhatsappDigits('98765 43210'), '919876543210');
});

test('buildOneClickOutreachLinks builds pre-filled Gmail compose and WhatsApp links with admin contact signature', () => {
  const candidate: CandidateSummaryDoc = {
    ownerUid: 'cand-1',
    displayName: 'Kabir Nair',
    email: 'kabir.nair@gmail.com',
    contactEmail: 'kabir.nair@gmail.com',
    phoneNumber: '+91 97654 32109',
    boardOrUniversity: 'VIT Vellore',
    examName: 'CS Core Finals',
    examDate: '2026-11-10',
    readinessPercent: 44,
    overallRatingOutOf10: 6.4,
    completedChapters: 3,
    totalChapters: 9,
    attemptsCount: 2,
    focusMinutesLogged: 35,
    bonusPoints: 0,
    xpPoints: 340,
    flexTier: 'Uncommon Emerald',
    inactiveDays: 5,
    activeLearnerActive: false,
    unlockedBadges: ['Syllabus Architect'],
    weakTopics: ['Banker Algorithm (OS · High-Yield PYQ · 28% mastery)'],
    banned: false,
    banReason: '',
  };

  const outreach = buildOneClickOutreachLinks({
    candidate,
    adminName: 'Prof. Priya Menon',
    adminEmail: 'priya.menon.academic@gmail.com',
    adminPhone: '+91 98201 11223',
  });

  assert.ok(outreach.gmailComposeUrl.startsWith('https://mail.google.com/mail/?view=cm&fs=1&to=kabir.nair%40gmail.com'));
  assert.ok(outreach.whatsappUrl?.startsWith('https://wa.me/919765432109?text='));
  assert.ok(outreach.messageBody.includes('dissolved after 5 inactive days'));
  assert.ok(outreach.messageBody.includes('Banker Algorithm'));
  assert.ok(outreach.messageBody.includes('priya.menon.academic@gmail.com'));
  assert.ok(outreach.messageBody.includes('+91 98201 11223'));
});
