import type {
  AvatarVisibility,
  EthicsRecoveryModule,
  IssuedCredentialDoc,
  SocialVaultGrant,
  SubjectProfile,
  SubjectRefreshStatus,
  TestAttempt,
  TopicItem,
  VaultPermissionScope,
} from '../types.ts';
import { computeInactiveDays, getTodayDateISO } from './xpAndOutreachEngine.ts';

export const SKILL_REFRESH_STALE_DAYS = 60;
export const SKILL_REFRESH_WARNING_DAYS = 53;
export const ETHICS_RECOVERY_FRACTION = 0.4;

/**
 * Formats the proactive 7-day warning message shown on Analytics Dashboard and Study Planner
 * when a subject enters the 53–59 day window before its 60-day FlexCard badge dims.
 */
export function buildSubjectLusterWarningMessage(
  subjectName: string,
  daysSincePractice: number
): string {
  const cleanName = subjectName.trim() || 'Subject';
  return `${daysSincePractice} days since last ${cleanName} drill — 1 quick sprint keeps Full Badge Luster`;
}

/**
 * Evaluates every syllabus subject's most recent practice date across:
 * 1) subject.lastPracticedDateISO (updated whenever a subject quiz or refresh quiz finishes)
 * 2) any TestAttempt containing that subject in subjectBreakdown
 * 3) any completed TopicItem belonging to that subject (completedAt)
 * Flags approachingRefreshWarning = true when 53 <= daysSincePractice < 60 (7-day warning window),
 * and needsRefresh = true when daysSincePractice >= 60 days.
 */
export function computeSubjectRefreshStatuses(params: {
  subjects: SubjectProfile[];
  attempts: TestAttempt[];
  topics: TopicItem[];
  fallbackCreatedAtISO?: string;
  referenceDateISO?: string;
}): SubjectRefreshStatus[] {
  const {
    subjects,
    attempts,
    topics,
    fallbackCreatedAtISO,
    referenceDateISO = getTodayDateISO(),
  } = params;

  return subjects.map((subj) => {
    const candidateDates: string[] = [];

    if (subj.lastPracticedDateISO && /^\d{4}-\d{2}-\d{2}/.test(subj.lastPracticedDateISO)) {
      candidateDates.push(subj.lastPracticedDateISO.slice(0, 10));
    }

    for (const att of attempts) {
      const hasSubject = att.subjectBreakdown.some(
        (b) => b.subjectId === subj.id || b.subjectName.toLowerCase() === subj.name.toLowerCase()
      );
      if (hasSubject && att.dateISO) {
        candidateDates.push(att.dateISO.slice(0, 10));
      }
    }

    for (const topic of topics) {
      if (
        (topic.subjectId === subj.id ||
          topic.subjectName.toLowerCase() === subj.name.toLowerCase()) &&
        topic.completed &&
        topic.completedAt
      ) {
        candidateDates.push(topic.completedAt.slice(0, 10));
      }
    }

    let latestDateISO = fallbackCreatedAtISO?.slice(0, 10) || referenceDateISO.slice(0, 10);
    if (candidateDates.length > 0) {
      candidateDates.sort();
      latestDateISO = candidateDates[candidateDates.length - 1];
    }

    const daysSincePractice = computeInactiveDays(latestDateISO, referenceDateISO);
    const needsRefresh = daysSincePractice >= SKILL_REFRESH_STALE_DAYS;
    const approachingRefreshWarning =
      daysSincePractice >= SKILL_REFRESH_WARNING_DAYS &&
      daysSincePractice < SKILL_REFRESH_STALE_DAYS;
    const daysUntilDim = Math.max(0, SKILL_REFRESH_STALE_DAYS - daysSincePractice);

    return {
      subjectId: subj.id,
      subjectName: subj.name,
      lastPracticedDateISO: latestDateISO,
      daysSincePractice,
      needsRefresh,
      approachingRefreshWarning,
      daysUntilDim,
      warningMessage: approachingRefreshWarning
        ? buildSubjectLusterWarningMessage(subj.name, daysSincePractice)
        : undefined,
    };
  });
}

/**
 * Calculates the fractional XP a candidate recovers upon completing the
 * Academic Integrity & Ethics module for a specific XP deduction.
 */
export function calculateEthicsRecoveryXp(
  deductedPoints: number,
  alreadyRecovered: boolean
): number {
  if (alreadyRecovered) return 0;
  const cleanDeducted = Math.max(0, Math.round(deductedPoints));
  if (cleanDeducted <= 0) return 0;
  return Math.min(cleanDeducted, Math.max(5, Math.round(cleanDeducted * ETHICS_RECOVERY_FRACTION)));
}

/**
 * Deterministic fallback for the AI-generated Academic Integrity & Ethics recovery module
 * grounded in what the candidate did and why it undermined fair exam readiness.
 */
export function buildFallbackEthicsModule(params: {
  bonusId: string;
  infractionTitle: string;
  infractionReason: string;
  deductedPoints: number;
}): EthicsRecoveryModule {
  const recoverableXp = calculateEthicsRecoveryXp(params.deductedPoints, false);
  const cleanReason =
    params.infractionReason.trim() ||
    'Violating timed assessment or Social SyllabiQ conduct guidelines.';

  return {
    bonusId: params.bonusId,
    infractionTitle: params.infractionTitle || 'Academic Integrity & Conduct Infraction',
    infractionReason: cleanReason,
    deductedPoints: Math.max(0, Math.round(params.deductedPoints)),
    recoverableXp,
    whatHappenedSummary: `Your XP ledger recorded a ${Math.round(
      params.deductedPoints
    )} XP deduction for: "${cleanReason}".`,
    whyItWasWrong:
      'SyllabiQ FlexCards and Report Cards carry verifiable SLQ serial numbers trusted by teachers, peers, and recruiters. Shortcuts—such as tab-switching during timed drills, inflating study logs, or breaking Social SyllabiQ conduct rules—distort your diagnostic readiness score and erode trust in verified credentials for every student.',
    corePrinciples: [
      'Authentic Diagnostic Signal: Closed-book, single-tab timed PYQ drills reveal real conceptual gaps before exam day.',
      'Credential Trustworthiness: Every SLQ-FC and SLQ-RC serial represents genuine cognitive effort.',
      'Respectful Scholarly Conduct: Social SyllabiQ World and Private channels remain strictly name-only, ad-free, and focused on verified FlexCards.',
    ],
    questions: [
      {
        id: 'eth-q-1',
        question: `Why did "${cleanReason.slice(0, 90)}" result in an XP deduction on SyllabiQ?`,
        options: [
          'Because unverified shortcuts corrupt your /10 diagnostic accuracy and weaken trust in verifiable FlexCard credentials.',
          'Because SyllabiQ randomly deducts XP every week regardless of conduct.',
          'Because difficult syllabus subjects are not allowed in Peak Alertness slots.',
          'Because candidates are required to finish all chapters on Day 1.',
        ],
        correctIndex: 0,
        explanation:
          'Accurate PYQ diagnostics and tamper-evident credentials depend on honest timed attempts and respectful platform conduct.',
      },
      {
        id: 'eth-q-2',
        question:
          'When you hit an unfamiliar derivation or numerical during a compressed-timer PYQ drill, what is the right ethical workflow?',
        options: [
          'Open another tab or search engine mid-timer so your score looks higher.',
          'Complete the timer honestly, let the wrong-answer diagnostic log the gap, and use the 1-on-1 AI Tutor breakdown afterward.',
          'Post external photo screenshots of the live test in Social SyllabiQ World chat.',
          'Create a second account to test the answers first.',
        ],
        correctIndex: 1,
        explanation:
          'Honest wrong answers trigger personalized explanations and schedule high-yield revision before the real exam.',
      },
      {
        id: 'eth-q-3',
        question:
          'What is permitted inside Social SyllabiQ World and Private channels under platform conduct rules?',
        options: [
          'Sharing personal phone numbers, external ad links, and unverified photo uploads.',
          'Respectful academic discussion displaying only scholar names and sharing verified SyllabiQ FlexCards (plus opted-in Private vault credentials).',
          'Posting exam paper leaks or harassing batchmates.',
          'Impersonating faculty verifiers.',
        ],
        correctIndex: 1,
        explanation:
          'Social SyllabiQ enforces name-only identity and FlexCard-only sharing to keep collaboration safe, focused, and distraction-free.',
      },
    ],
    usedAi: false,
  };
}

/**
 * Enforces Social SyllabiQ World & Private conduct rules:
 * - No photo/image/data-URI or external file attachment links
 * - No leaking personal phone numbers or email addresses in chat (name-only policy)
 * - No spam/abusive harassment keywords
 */
export function validateSocialMessageConduct(
  rawText: string,
  hasFlexCard: boolean
): {
  allowed: boolean;
  sanitizedText: string;
  violationReason?: string;
} {
  const trimmed = rawText.trim();

  if (!trimmed && !hasFlexCard) {
    return {
      allowed: false,
      sanitizedText: '',
      violationReason: 'Enter a study message or attach one of your unlocked FlexCards.',
    };
  }

  if (trimmed.length > 500) {
    return {
      allowed: false,
      sanitizedText: trimmed.slice(0, 500),
      violationReason: 'Keep Social SyllabiQ messages concise (maximum 500 characters).',
    };
  }

  // Block raw image/media URLs or data URIs (FlexCards only; no photos or external files)
  if (
    /data:image\//i.test(trimmed) ||
    /\.(png|jpe?g|gif|webp|mp4|mov|pdf|zip)(\?|$|\s)/i.test(trimmed) ||
    /https?:\/\/[^\s]+/i.test(trimmed)
  ) {
    return {
      allowed: false,
      sanitizedText: trimmed,
      violationReason:
        'External links, photos, and file attachments are disabled in Social SyllabiQ. You can only share verified SyllabiQ FlexCards.',
    };
  }

  // Block email / phone PII leaks (name-only rule)
  if (/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/.test(trimmed)) {
    return {
      allowed: false,
      sanitizedText: trimmed,
      violationReason:
        'For student safety, emails cannot be posted in Social SyllabiQ—only candidate names and FlexCards are displayed.',
    };
  }

  const digitRuns = trimmed.replace(/[^0-9]/g, '');
  if (digitRuns.length >= 10 && /(\+?\d[\d\s\-()]{8,}\d)/.test(trimmed)) {
    return {
      allowed: false,
      sanitizedText: trimmed,
      violationReason:
        'Phone and WhatsApp numbers are private and cannot be shared in Social SyllabiQ.',
    };
  }

  return {
    allowed: true,
    sanitizedText: trimmed,
  };
}

/**
 * Resolves whether a viewer is allowed to see a student's profile photo:
 * - Own profile -> always visible
 * - avatarVisibility === 'world' -> visible to everyone in World & Private
 * - avatarVisibility === 'connections_only' -> hidden in World (returns undefined so UI shows monogram),
 *   visible ONLY to peers who have joined/connected with the student!
 */
export function resolveVisibleAvatarForViewer(params: {
  ownerId: string;
  viewerId: string;
  avatarUrl?: string;
  avatarVisibility?: AvatarVisibility;
  isConnectedPeer: boolean;
}): string | undefined {
  const { ownerId, viewerId, avatarUrl, avatarVisibility = 'world', isConnectedPeer } = params;
  if (!avatarUrl) return undefined;
  if (ownerId === viewerId) return avatarUrl;
  if (avatarVisibility === 'world') return avatarUrl;
  return isConnectedPeer ? avatarUrl : undefined;
}

export const VAULT_SCOPE_LABELS: Record<VaultPermissionScope, string> = {
  all_flexcards_and_report: 'All FlexCards + Official Report Card',
  all_flexcards_only: 'All FlexCards Only',
  report_card_only: 'Official Report Card Only',
  single_credential: 'Single Selected Credential Only',
};

/**
 * Filters a scholar's credential vault strictly to what they granted a specific connected peer.
 */
export function filterPermittedVaultForViewer(params: {
  grant: SocialVaultGrant | null | undefined;
  viewerId: string;
}): {
  permittedFlexCards: IssuedCredentialDoc[];
  permittedReportCard: IssuedCredentialDoc | null;
} {
  const { grant, viewerId } = params;
  if (!grant || grant.status !== 'granted' || grant.granteeId !== viewerId) {
    return { permittedFlexCards: [], permittedReportCard: null };
  }

  const allFlex = Array.isArray(grant.flexCardsSnapshot) ? grant.flexCardsSnapshot : [];
  const report = grant.reportCardSnapshot || null;

  switch (grant.scope) {
    case 'all_flexcards_and_report':
      return { permittedFlexCards: allFlex, permittedReportCard: report };
    case 'all_flexcards_only':
      return { permittedFlexCards: allFlex, permittedReportCard: null };
    case 'report_card_only':
      return { permittedFlexCards: [], permittedReportCard: report };
    case 'single_credential': {
      const code = (grant.singleCredentialCode || '').trim().toUpperCase();
      if (report && report.credentialCode.toUpperCase() === code) {
        return { permittedFlexCards: [], permittedReportCard: report };
      }
      return {
        permittedFlexCards: allFlex.filter((c) => c.credentialCode.toUpperCase() === code),
        permittedReportCard: null,
      };
    }
    default:
      return { permittedFlexCards: [], permittedReportCard: null };
  }
}
