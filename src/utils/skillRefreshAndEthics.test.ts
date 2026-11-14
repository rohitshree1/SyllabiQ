import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildFallbackEthicsModule,
  calculateEthicsRecoveryXp,
  computeSubjectRefreshStatuses,
  filterPermittedVaultForViewer,
  resolveVisibleAvatarForViewer,
  validateSocialMessageConduct,
} from './skillRefreshAndEthics';
import { computeCandidateXpSnapshot } from './xpAndOutreachEngine';
import type { IssuedCredentialDoc, SocialVaultGrant, SubjectProfile, TestAttempt, TopicItem } from '../types';

test('60-day subject inactivity flags Skill Refresh Needed and clears after quiz practice', () => {
  const subjects: SubjectProfile[] = [
    {
      id: 'subj-1',
      name: 'Electromagnetic Field Theory',
      difficulty: 'hard',
      previousScoreOutOf100: 64,
      currentRatingOutOf10: 8.5,
      questionsAnswered: 5,
      questionsCorrect: 4,
      lastPracticedDateISO: '2026-10-28',
    },
    {
      id: 'subj-2',
      name: 'Applied Engineering Calculus',
      difficulty: 'moderate',
      previousScoreOutOf100: 76,
      currentRatingOutOf10: 9.0,
      questionsAnswered: 3,
      questionsCorrect: 3,
      lastPracticedDateISO: '2026-08-15',
    },
  ];

  const attempts: TestAttempt[] = [];
  const topics: TopicItem[] = [];

  const initial = computeSubjectRefreshStatuses({
    subjects,
    attempts,
    topics,
    referenceDateISO: '2026-10-29',
  });

  const emft = initial.find((s) => s.subjectId === 'subj-1')!;
  const calc = initial.find((s) => s.subjectId === 'subj-2')!;

  assert.equal(emft.needsRefresh, false);
  assert.equal(emft.daysSincePractice, 1);
  assert.equal(calc.needsRefresh, true);
  assert.ok(calc.daysSincePractice >= 60);

  // Simulate completing the short Skill Refresh Quiz today
  const refreshedSubjects = subjects.map((s) =>
    s.id === 'subj-2' ? { ...s, lastPracticedDateISO: '2026-10-29' } : s
  );
  const afterQuiz = computeSubjectRefreshStatuses({
    subjects: refreshedSubjects,
    attempts,
    topics,
    referenceDateISO: '2026-10-29',
  });
  assert.equal(afterQuiz.find((s) => s.subjectId === 'subj-2')!.needsRefresh, false);
  assert.equal(afterQuiz.find((s) => s.subjectId === 'subj-2')!.approachingRefreshWarning, false);
});

test('7-day warning indicator triggers at 53-59 days unpracticed before FlexCard badge dims at 60 days', () => {
  const subjects: SubjectProfile[] = [
    {
      id: 'subj-calc',
      name: 'Calculus',
      difficulty: 'moderate',
      previousScoreOutOf100: 78,
      currentRatingOutOf10: 8.8,
      questionsAnswered: 4,
      questionsCorrect: 4,
      lastPracticedDateISO: '2026-09-06', // 53 days before 2026-10-29
    },
    {
      id: 'subj-safe',
      name: 'Physics',
      difficulty: 'hard',
      previousScoreOutOf100: 65,
      currentRatingOutOf10: 8.0,
      questionsAnswered: 4,
      questionsCorrect: 3,
      lastPracticedDateISO: '2026-09-10', // 49 days before 2026-10-29
    },
  ];

  const statuses = computeSubjectRefreshStatuses({
    subjects,
    attempts: [],
    topics: [],
    referenceDateISO: '2026-10-29',
  });

  const calc = statuses.find((s) => s.subjectId === 'subj-calc')!;
  const phys = statuses.find((s) => s.subjectId === 'subj-safe')!;

  assert.equal(calc.daysSincePractice, 53);
  assert.equal(calc.needsRefresh, false);
  assert.equal(calc.approachingRefreshWarning, true);
  assert.equal(calc.daysUntilDim, 7);
  assert.equal(
    calc.warningMessage,
    '53 days since last Calculus drill — 1 quick sprint keeps Full Badge Luster'
  );

  assert.equal(phys.daysSincePractice, 49);
  assert.equal(phys.approachingRefreshWarning, false);
  assert.equal(phys.needsRefresh, false);
  assert.equal(phys.daysUntilDim, 11);
});

test('fractional XP recovery restores 40% of deducted XP once and updates netXp', () => {
  assert.equal(calculateEthicsRecoveryXp(100, false), 40);
  assert.equal(calculateEthicsRecoveryXp(100, true), 0);
  assert.equal(calculateEthicsRecoveryXp(0, false), 0);

  const mod = buildFallbackEthicsModule({
    bonusId: 'bon-1',
    infractionTitle: 'Tab Switching',
    infractionReason: 'Rapid tab switching during timed PYQ drill',
    deductedPoints: 150,
  });
  assert.equal(mod.recoverableXp, 60);
  assert.equal(mod.questions.length, 3);

  const before = computeCandidateXpSnapshot({
    bonusPoints: 500,
    deductedPoints: 200,
    recoveredEthicsXp: 0,
    lastActiveDate: '2026-10-29',
    referenceDateISO: '2026-10-29',
  });
  const after = computeCandidateXpSnapshot({
    bonusPoints: 500,
    deductedPoints: 200,
    recoveredEthicsXp: 80,
    lastActiveDate: '2026-10-29',
    referenceDateISO: '2026-10-29',
  });
  assert.equal(before.netXp, 300);
  assert.equal(after.netXp, 380);
});

test('Social SyllabiQ enforces name-only and FlexCard-only conduct rules', () => {
  const validText = validateSocialMessageConduct(
    'Anyone revising Gauss Law & Divergence before tomorrow morning?',
    false
  );
  assert.equal(validText.allowed, true);

  const flexOnly = validateSocialMessageConduct('', true);
  assert.equal(flexOnly.allowed, true);

  const externalPhotoBlocked = validateSocialMessageConduct(
    'Check my photo https://example.com/photo.jpg',
    false
  );
  assert.equal(externalPhotoBlocked.allowed, false);

  const emailLeakBlocked = validateSocialMessageConduct(
    'Email me at student@gmail.com',
    false
  );
  assert.equal(emailLeakBlocked.allowed, false);

  const phoneLeakBlocked = validateSocialMessageConduct(
    'Call me on +91 98765 43210 right now',
    false
  );
  assert.equal(phoneLeakBlocked.allowed, false);
});

test('Profile photo visibility respects World vs Connected Peers Only', () => {
  const avatar = 'data:image/jpeg;base64,abc';

  // World mode -> everyone sees avatar
  assert.equal(
    resolveVisibleAvatarForViewer({
      ownerId: 'u1',
      viewerId: 'u2',
      avatarUrl: avatar,
      avatarVisibility: 'world',
      isConnectedPeer: false,
    }),
    avatar
  );

  // Connections-only -> hidden in World for unconnected peer, visible to connected peer & self
  assert.equal(
    resolveVisibleAvatarForViewer({
      ownerId: 'u1',
      viewerId: 'u2',
      avatarUrl: avatar,
      avatarVisibility: 'connections_only',
      isConnectedPeer: false,
    }),
    undefined
  );
  assert.equal(
    resolveVisibleAvatarForViewer({
      ownerId: 'u1',
      viewerId: 'u2',
      avatarUrl: avatar,
      avatarVisibility: 'connections_only',
      isConnectedPeer: true,
    }),
    avatar
  );
  assert.equal(
    resolveVisibleAvatarForViewer({
      ownerId: 'u1',
      viewerId: 'u1',
      avatarUrl: avatar,
      avatarVisibility: 'connections_only',
      isConnectedPeer: false,
    }),
    avatar
  );
});

test('Private granular vault permissions filter strictly to permitted FlexCards or Report Card', () => {
  const fc1: IssuedCredentialDoc = {
    credentialCode: 'SLQ-FC-1111AAAA',
    kind: 'flexcard',
    ownerUid: 'u1',
    ownerName: 'Aarav Mehta',
    boardOrUniversity: 'DTU',
    examName: 'Sem-IV',
    title: '8+/10 Exam Distinction',
    subtitleOrMetric: '8.3/10',
    xpPoints: 1200,
    flexTier: 'Epic Amethyst',
    issuedDateISO: '2026-10-29',
  };
  const fc2: IssuedCredentialDoc = {
    ...fc1,
    credentialCode: 'SLQ-FC-2222BBBB',
    title: 'Countdown Blitz Sprinter',
  };
  const rc: IssuedCredentialDoc = {
    ...fc1,
    credentialCode: 'SLQ-RC-9999ZZZZ',
    kind: 'report_card',
    title: 'Official Report Card',
  };

  const singleGrant: SocialVaultGrant = {
    id: 'g1',
    ownerId: 'u1',
    ownerName: 'Aarav Mehta',
    granteeId: 'u2',
    granteeName: 'Ananya Verma',
    scope: 'single_credential',
    singleCredentialCode: 'SLQ-FC-2222BBBB',
    status: 'granted',
    flexCardsSnapshot: [fc1, fc2],
    reportCardSnapshot: rc,
    updatedAt: '2026-10-29T10:00:00Z',
  };

  const viewer2 = filterPermittedVaultForViewer({ grant: singleGrant, viewerId: 'u2' });
  assert.equal(viewer2.permittedFlexCards.length, 1);
  assert.equal(viewer2.permittedFlexCards[0].credentialCode, 'SLQ-FC-2222BBBB');
  assert.equal(viewer2.permittedReportCard, null);

  // Unpermitted third party u3 sees nothing
  const viewer3 = filterPermittedVaultForViewer({ grant: singleGrant, viewerId: 'u3' });
  assert.equal(viewer3.permittedFlexCards.length, 0);
  assert.equal(viewer3.permittedReportCard, null);
});
