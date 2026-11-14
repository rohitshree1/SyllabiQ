import type {
  AlertnessWindow,
  AppState,
  BanFlexAiDraft,
  CandidateXpSnapshot,
  FlexCardRarityTier,
  LearningStylePreset,
  PostRoleBadge,
  VerifierPostRole,
} from '../types.ts';
import { computeDashboardMetrics } from './studyEngine.ts';
import { computeCandidateXpSnapshot, identifyNeededStudyTopics } from './xpAndOutreachEngine.ts';

const ALPHANUM = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ';

function deterministicHashCode(seed: string, length: number): string {
  const normalized = seed.trim().toLowerCase() || 'syllabiq-default';
  let h1 = 0x811c9dc5;
  let h2 = 0x9e3779b9;
  for (let i = 0; i < normalized.length; i++) {
    const ch = normalized.charCodeAt(i);
    h1 ^= ch;
    h1 = Math.imul(h1, 0x01000193);
    h2 ^= ch + i * 31;
    h2 = Math.imul(h2, 0x85ebca6b);
  }
  let out = '';
  let stateA = h1 >>> 0;
  let stateB = h2 >>> 0;
  for (let idx = 0; idx < length; idx++) {
    stateA = (Math.imul(stateA ^ (stateB >>> 13), 1664525) + 1013904223 + idx) >>> 0;
    stateB = (Math.imul(stateB ^ (stateA >>> 7), 22695477) + 1) >>> 0;
    const combined = (stateA ^ stateB) >>> 0;
    out += ALPHANUM[combined % ALPHANUM.length];
  }
  return out;
}

export function normalizeSerialCode(raw: string): string {
  return String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
}

export function isPlausibleSerialFormat(code: string): boolean {
  const normalized = normalizeSerialCode(code);
  return /^SLQ-(FC|RC)-[A-Z0-9]{6,14}$/.test(normalized);
}

/**
 * Generates a deterministic, collision-resistant FlexCard verification serial (`SLQ-FC-XXXXXXXX`)
 * tied to the candidate owner key and achievement code.
 */
export function generateFlexCardSerial(ownerKey: string, achievementCode: string): string {
  const cleanOwner = (ownerKey || 'sandbox-candidate').trim().toLowerCase();
  const cleanCode = (achievementCode || 'SCHOLAR_FLEX').trim().toUpperCase();
  return `SLQ-FC-${deterministicHashCode(`fc::${cleanOwner}::${cleanCode}`, 8)}`;
}

/**
 * Generates a deterministic Report Card verification serial (`SLQ-RC-XXXXXXXX`)
 * tied to the candidate owner key and subject scope.
 */
export function generateReportCardSerial(ownerKey: string, scopeKey = 'ALL'): string {
  const cleanOwner = (ownerKey || 'sandbox-candidate').trim().toLowerCase();
  const cleanScope = (scopeKey || 'ALL').trim().toUpperCase();
  return `SLQ-RC-${deterministicHashCode(`rc::${cleanOwner}::${cleanScope}`, 8)}`;
}

/**
 * Generates a deterministic candidate referral code (`SLQ-REF-XXXXXX`).
 */
export function generateReferralCode(ownerKey: string, candidateName: string): string {
  const prefixLetters = String(candidateName || 'SCHOLAR')
    .replace(/[^a-zA-Z]/g, '')
    .toUpperCase()
    .slice(0, 3)
    .padEnd(3, 'X');
  const suffix = deterministicHashCode(`ref::${ownerKey}::${candidateName}`, 5);
  return `SLQ-REF-${prefixLetters}${suffix}`;
}

/**
 * Generates a deterministic, unique scholar Profile ID (`SLQ-USR-XXXXXXXX`)
 * tied to the candidate user ID / owner key.
 */
export function generateScholarProfileId(ownerKey: string): string {
  const cleanOwner = (ownerKey || 'sandbox-candidate').trim().toLowerCase();
  return `SLQ-USR-${deterministicHashCode(`usr::${cleanOwner}`, 8)}`;
}

export function normalizeProfileId(raw: string): string {
  const cleaned = String(raw || '')
    .trim()
    .toUpperCase()
    .replace(/\s+/g, '');
  if (/^[A-Z0-9]{8}$/.test(cleaned)) {
    return `SLQ-USR-${cleaned}`;
  }
  return cleaned;
}

export function isPlausibleProfileId(code: string): boolean {
  const normalized = normalizeProfileId(code);
  return /^SLQ-USR-[A-Z0-9]{6,12}$/.test(normalized);
}

export function buildReferralShareLinks(params: {
  referralCode: string;
  candidateName: string;
  examName: string;
  originUrl?: string;
}): {
  referralCode: string;
  referralUrl: string;
  shareHeadline: string;
  shareMessage: string;
  whatsappUrl: string;
  gmailComposeUrl: string;
  linkedinUrl: string;
  xUrl: string;
} {
  const baseOrigin = (params.originUrl || 'https://syllabiq.app').replace(/\/+$/, '');
  const referralCode = normalizeSerialCode(params.referralCode);
  const referralUrl = `${baseOrigin}/?ref=${encodeURIComponent(referralCode)}`;
  const candidateLabel = (params.candidateName || 'A SyllabiQ Scholar').trim();
  const examLabel = (params.examName || 'upcoming finals').trim();

  const shareHeadline = `Join ${candidateLabel} on SyllabiQ (${referralCode})`;
  const shareMessage = `${candidateLabel} invited you to plan ${examLabel} on SyllabiQ — Adaptive Exam & Syllabus Planner. Map High-Yield PYQs to your peak alertness window, run compressed timed drills, and earn verifiable Rare FlexCards.\n\nReferral Code: ${referralCode}\nJoin Link: ${referralUrl}`;

  const whatsappUrl = `https://wa.me/?text=${encodeURIComponent(shareMessage)}`;
  const gmailComposeUrl = `https://mail.google.com/mail/?view=cm&fs=1&su=${encodeURIComponent(
    `Invitation to SyllabiQ Adaptive Exam Planner (${referralCode})`
  )}&body=${encodeURIComponent(shareMessage)}`;
  const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(
    referralUrl
  )}`;
  const xUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(shareMessage)}`;

  return {
    referralCode,
    referralUrl,
    shareHeadline,
    shareMessage,
    whatsappUrl,
    gmailComposeUrl,
    linkedinUrl,
    xUrl,
  };
}

export function formatVerifierPostLabel(post: VerifierPostRole): string {
  if (post === 'teacher') return 'Teacher / Faculty';
  if (post === 'company_executive') return 'Company Executive / Recruiter';
  return 'Student / Peer';
}

const KNOWN_BOT_IDS = new Set([
  'cand-ananya-02',
  'cand-kabir-03',
  'cand-meera-04',
  'cand-aarav-01',
  'cand-banned-04',
  'sandbox-candidate',
]);

const KNOWN_BOT_NAMES = new Set([
  'ananya verma',
  'kabir nair',
  'meera krishnan',
  'aarav mehta',
  'aarav sharma',
]);

export function isGmailEmail(email: unknown): boolean {
  if (typeof email !== 'string') return false;
  return /^[^@\s]+@gmail\.com$/i.test(email.trim());
}

export function isBotAccountId(uid: unknown): boolean {
  if (typeof uid !== 'string') return false;
  const trimmed = uid.trim().toLowerCase();
  if (!trimmed) return false;
  if (KNOWN_BOT_IDS.has(trimmed)) return true;
  if (/^cand-(aarav|ananya|kabir|meera|banned)-/i.test(trimmed)) return true;
  if (trimmed.startsWith('sandbox-')) return true;
  return false;
}

export function isBotDisplayName(name: unknown): boolean {
  if (typeof name !== 'string') return false;
  return KNOWN_BOT_NAMES.has(name.trim().toLowerCase());
}

export function formatPostRoleLabel(raw: unknown): PostRoleBadge | undefined {
  if (typeof raw !== 'string') return undefined;
  const normalized = raw.trim().toLowerCase();
  if (!normalized) return undefined;
  if (normalized === 'super admin' || normalized === 'super_admin') {
    return 'Super Admin';
  }
  if (
    normalized === 'delegated team admin' ||
    normalized === 'delegated admin' ||
    normalized === 'minimal delegated admin' ||
    normalized === 'maximum delegated admin' ||
    normalized === 'read-only delegated admin' ||
    normalized === 'sub_admin' ||
    normalized === 'sub admin' ||
    normalized.includes('delegated')
  ) {
    return 'Delegated Team Admin';
  }
  if (normalized === 'teacher' || normalized === 'teacher / faculty' || normalized === 'faculty') {
    return 'Teacher';
  }
  return undefined;
}

export function resolvePostRoleBadge(params: {
  staffTier?: 'none' | 'sub_admin' | 'super_admin';
  accountRole?: 'student' | 'teacher';
  rawBadge?: unknown;
}): PostRoleBadge | undefined {
  if (params.staffTier === 'super_admin') return 'Super Admin';
  if (params.staffTier === 'sub_admin') return 'Delegated Team Admin';
  const explicit = formatPostRoleLabel(params.rawBadge);
  if (explicit) return explicit;
  if (params.accountRole === 'teacher') return 'Teacher';
  return undefined;
}

export function validateVerifierSubmission(params: {
  serialInput: string;
  isStaff: boolean;
  verifierName: string;
  verifierGmail: string;
  verifierPost: string;
}): {
  valid: boolean;
  normalizedSerial: string;
  normalizedName: string;
  normalizedGmail: string;
  normalizedPost: VerifierPostRole;
  error?: string;
} {
  const normalizedSerial = normalizeSerialCode(params.serialInput);
  const normalizedName = String(params.verifierName || '').trim();
  const normalizedGmail = String(params.verifierGmail || '').trim().toLowerCase();
  const validPosts: VerifierPostRole[] = ['teacher', 'company_executive', 'student'];
  const normalizedPost: VerifierPostRole = validPosts.includes(
    params.verifierPost as VerifierPostRole
  )
    ? (params.verifierPost as VerifierPostRole)
    : 'teacher';

  if (!normalizedSerial || normalizedSerial.length < 6) {
    return {
      valid: false,
      normalizedSerial,
      normalizedName,
      normalizedGmail,
      normalizedPost,
      error: 'Enter the FlexCard or Report Card serial code (e.g., SLQ-FC-XXXXXXXX or SLQ-RC-XXXXXXXX).',
    };
  }

  if (params.isStaff) {
    return {
      valid: true,
      normalizedSerial,
      normalizedName: normalizedName || 'Authorized Admin',
      normalizedGmail,
      normalizedPost,
    };
  }

  if (normalizedName.length < 2 || normalizedName.length > 80) {
    return {
      valid: false,
      normalizedSerial,
      normalizedName,
      normalizedGmail,
      normalizedPost,
      error: 'Please enter your full name (2–80 characters) to verify this credential.',
    };
  }

  if (!/^[^\s@]+@gmail\.com$/.test(normalizedGmail)) {
    return {
      valid: false,
      normalizedSerial,
      normalizedName,
      normalizedGmail,
      normalizedPost,
      error: 'Please enter a valid @gmail.com address. Non-admin verifications notify the credential owner.',
    };
  }

  if (!validPosts.includes(params.verifierPost as VerifierPostRole)) {
    return {
      valid: false,
      normalizedSerial,
      normalizedName,
      normalizedGmail,
      normalizedPost,
      error: 'Select your post (Teacher, Company Executive, or Student).',
    };
  }

  return {
    valid: true,
    normalizedSerial,
    normalizedName,
    normalizedGmail,
    normalizedPost,
  };
}

function describeAlertnessSlot(slot: AlertnessWindow): string {
  switch (slot) {
    case 'early_morning':
      return 'early-morning peak window (05:30–08:30)';
    case 'late_morning':
      return 'late-morning peak window (09:00–12:30)';
    case 'afternoon':
      return 'afternoon analytical window (14:00–17:30)';
    case 'night_owl':
      return 'deep-night focus window (21:00–00:30)';
  }
}

function describeLearningStyle(style: LearningStylePreset): string {
  switch (style) {
    case 'first_principles':
      return 'first-principles derivations and conceptual proofs';
    case 'exam_shortcuts':
      return 'high-speed exam heuristics and elimination shortcuts';
    case 'step_by_step':
      return 'structured step-by-step worked solutions';
    case 'visual_analogies':
      return 'visual mental models and physical analogies';
  }
}

/**
 * Deterministically builds a 12-line (strictly within 10–15 lines) academic "About the Student"
 * narrative grounded in past baseline marks, /10 PYQ ratings, chapter completion, focus discipline,
 * and XP rarity tier.
 */
export function buildFallbackStudentAboutLines(
  state: AppState,
  xpInput?: CandidateXpSnapshot
): string[] {
  const xp = xpInput ?? computeCandidateXpSnapshot({ state });
  const metrics = computeDashboardMetrics(state);
  const { student, subjects, topics, attempts } = state;

  const avgBaseline =
    subjects.length > 0
      ? Math.round(
          subjects.reduce((acc, s) => acc + s.previousScoreOutOf100, 0) / subjects.length
        )
      : 70;

  const strongestSubject =
    [...subjects].sort(
      (a, b) =>
        (b.currentRatingOutOf10 ?? b.previousScoreOutOf100 / 10) -
        (a.currentRatingOutOf10 ?? a.previousScoreOutOf100 / 10)
    )[0]?.name || 'Core Foundations';

  const hardestSubject =
    subjects.find((s) => s.difficulty === 'hard')?.name ||
    [...subjects].sort((a, b) => a.previousScoreOutOf100 - b.previousScoreOutOf100)[0]?.name ||
    'Advanced Derivations';

  const highYieldTotal = topics.filter((t) => t.yieldType === 'high').length;
  const highYieldDone = topics.filter((t) => t.yieldType === 'high' && t.completed).length;
  const priorityNext = identifyNeededStudyTopics(topics, 2);
  const focusMins = state.focusMinutesTotal ?? 0;
  const focusSessions = state.focusSessionsCompleted ?? 0;
  const unlockedCount = state.achievements.filter((a) => a.unlocked).length;
  const bestScore =
    attempts.length > 0
      ? Math.max(...attempts.map((a) => a.overallScoreOutOf10)).toFixed(1)
      : '—';

  const lines: string[] = [
    `${student.name || 'This candidate'} is a ${student.institutionType === 'school' ? 'school board' : 'university'} scholar at ${student.boardOrUniversity || 'their institution'} preparing systematically for ${student.examName || 'upcoming finals'}.`,
    `Entering preparation with an average historical baseline of ${avgBaseline}/100 across ${subjects.length} mapped subjects, they have calibrated a ${student.dailyStudyHours}-hour daily study commitment.`,
    `Their current SyllabiQ composite readiness stands at ${metrics.examReadinessPercent}%, backed by an overall timed PYQ performance rating of ${metrics.overallScoreOutOf10 !== null ? `${metrics.overallScoreOutOf10.toFixed(1)}/10` : 'baseline calibration'}.`,
    `Across ${attempts.length} compressed-timer assessments, they have recorded a peak score of ${bestScore === '—' ? 'pending first drill' : `${bestScore}/10`} while training under stricter-than-exam time pressure.`,
    `Subject telemetry highlights ${strongestSubject} as a primary scoring anchor, showing reliable conceptual retention on past-year question patterns.`,
    `Conversely, ${hardestSubject} is designated as a high-focus growth frontier where targeted derivation practice yields the steepest mark gains.`,
    `To date, ${metrics.completedChapters} of ${metrics.totalChapters} total syllabus chapters are complete, including ${highYieldDone} of ${highYieldTotal} High-Yield PYQ units.`,
    `Cognitively, the student performs sharpest during their ${describeAlertnessSlot(student.alertnessWindow)}, where heavy analytical chapters are deliberately scheduled.`,
    `Their explanation engine is tuned to ${describeLearningStyle(student.learningStyle)}${student.customStyleFeedback ? `, incorporating "${student.customStyleFeedback.slice(0, 70)}"` : ''}.`,
    `Deep-work discipline includes ${focusMins} logged focus minutes across ${focusSessions} uninterrupted Pomodoro blocks, unlocking ${unlockedCount} verified academic badges.`,
    `With ${xp.netXp.toLocaleString()} net XP, their credential profile holds ${xp.rarity.tier} rarity status (${xp.activeLearnerDissolved ? `Active Learner paused after ${xp.inactiveDays} inactive days` : 'Active Learner streak intact'}).`,
    priorityNext.length > 0
      ? `Immediate high-leverage focus areas ahead of ${student.examDate || 'exam day'} include ${priorityNext.join(' and ')}.`
      : `Maintaining steady revision drills ahead of ${student.examDate || 'exam day'} will consolidate distinction-grade accuracy across all syllabus units.`,
  ];

  return lines;
}

/**
 * Enforces that any AI-returned or cached "About the Student" summary resolves to
 * strictly 10–15 clean, readable lines without markdown bullets or numbering clutter.
 */
export function normalizeStudentAboutLines(
  rawInput: string[] | string | undefined,
  fallbackLines: string[]
): string[] {
  const rawList: string[] = Array.isArray(rawInput)
    ? rawInput
    : typeof rawInput === 'string'
      ? rawInput.split(/\r?\n+/)
      : [];

  const cleaned: string[] = [];
  for (const item of rawList) {
    const trimmed = String(item || '')
      .replace(/^\s*(?:[-*•]|\d+[.)])\s*/, '')
      .replace(/\s+/g, ' ')
      .trim();
    if (!trimmed) continue;
    if (trimmed.length > 220 && trimmed.includes('. ')) {
      const sentences = trimmed
        .split(/(?<=[.!?])\s+/)
        .map((s) => s.trim())
        .filter(Boolean);
      for (const s of sentences) {
        if (s.length >= 12) cleaned.push(s.slice(0, 240));
      }
    } else if (trimmed.length >= 12) {
      cleaned.push(trimmed.slice(0, 240));
    }
  }

  if (cleaned.length >= 10 && cleaned.length <= 15) {
    return cleaned;
  }

  if (cleaned.length > 15) {
    return cleaned.slice(0, 15);
  }

  const merged = [...cleaned];
  for (const fb of fallbackLines) {
    if (merged.length >= 12) break;
    if (!merged.some((existing) => existing.slice(0, 28) === fb.slice(0, 28))) {
      merged.push(fb);
    }
  }

  return merged.slice(0, 15);
}

/**
 * Deterministic fallback for Banned Candidate FlexCard message optimized around why
 * the account was restricted.
 */
export function buildFallbackBanFlexDraft(params: {
  candidateName: string;
  examName: string;
  banReason: string;
  xpPoints: number;
  flexTier: FlexCardRarityTier;
}): BanFlexAiDraft {
  const name = (params.candidateName || 'Candidate').trim();
  const exam = (params.examName || 'Final Examinations').trim();
  const reason = (
    params.banReason || 'Academic integrity & workspace policy review'
  ).trim();

  return {
    headline: `Accountability & Reset Mode · Pausing for "${reason}"`,
    caption: `Transparency check from ${name} (${exam}): My SyllabiQ study workspace is currently in restricted review due to "${reason}". Owning the lesson, rebuilding disciplined study habits from first principles, and coming back stronger. (${params.xpPoints.toLocaleString()} XP · ${params.flexTier})`,
    comebackPledge: `Addressed "${reason}" with full transparency — committed to clean, timed exam preparation.`,
    usedAi: false,
  };
}
