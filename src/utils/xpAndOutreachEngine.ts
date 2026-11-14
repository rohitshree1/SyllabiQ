import type {
  Achievement,
  AppState,
  CandidateSummaryDoc,
  CandidateXpSnapshot,
  FlexCardRarityInfo,
  FlexCardRarityTier,
  TestAttempt,
  TopicItem,
} from '../types';

export const INACTIVITY_DISSOLVE_DAYS = 3;
export const DAILY_XP_DECAY_PER_DAY = 40;

interface RarityMilestoneSpec {
  tier: FlexCardRarityTier;
  minXp: number;
  badgeLabel: string;
  accentHex: string;
  secondaryHex: string;
  cardBgGradient: string;
  borderClass: string;
  textAccentClass: string;
  dropRateLabel: string;
}

export const FLEX_RARITY_MILESTONES: RarityMilestoneSpec[] = [
  {
    tier: 'Common Slate',
    minXp: 0,
    badgeLabel: 'Tier I · Common Slate',
    accentHex: '#94A3B8',
    secondaryHex: '#475569',
    cardBgGradient: 'linear-gradient(135deg, #0F172A 0%, #1E293B 100%)',
    borderClass: 'border-slate-600',
    textAccentClass: 'text-slate-300',
    dropRateLabel: 'Starter Tier · 0–199 XP',
  },
  {
    tier: 'Uncommon Emerald',
    minXp: 200,
    badgeLabel: 'Tier II · Uncommon Emerald',
    accentHex: '#34D399',
    secondaryHex: '#059669',
    cardBgGradient: 'linear-gradient(135deg, #06281E 0%, #0F172A 65%, #064E3B 100%)',
    borderClass: 'border-emerald-500/70',
    textAccentClass: 'text-emerald-300',
    dropRateLabel: 'Top 42% · 200–499 XP',
  },
  {
    tier: 'Rare Sapphire',
    minXp: 500,
    badgeLabel: 'Tier III · Rare Sapphire',
    accentHex: '#38BDF8',
    secondaryHex: '#0284C7',
    cardBgGradient: 'linear-gradient(135deg, #082F49 0%, #0F172A 60%, #1E3A8A 100%)',
    borderClass: 'border-sky-400/80',
    textAccentClass: 'text-sky-300',
    dropRateLabel: 'Top 18% · 500–999 XP',
  },
  {
    tier: 'Epic Amethyst',
    minXp: 1000,
    badgeLabel: 'Tier IV · Epic Amethyst',
    accentHex: '#C084FC',
    secondaryHex: '#7E22CE',
    cardBgGradient: 'linear-gradient(135deg, #2E1065 0%, #0F172A 58%, #4C1D95 100%)',
    borderClass: 'border-purple-400/80',
    textAccentClass: 'text-purple-300',
    dropRateLabel: 'Top 6% · 1,000–1,799 XP',
  },
  {
    tier: 'Mythic Sovereign',
    minXp: 1800,
    badgeLabel: 'Tier V · Mythic Sovereign',
    accentHex: '#FBBF24',
    secondaryHex: '#D97706',
    cardBgGradient: 'linear-gradient(135deg, #451A03 0%, #0F172A 52%, #78350F 100%)',
    borderClass: 'border-amber-400/90',
    textAccentClass: 'text-amber-300',
    dropRateLabel: 'Top 1% Rare · 1,800+ XP',
  },
];

export function getTodayDateISO(now: Date = new Date()): string {
  const year = now.getFullYear();
  const month = String(now.getMonth() + 1).padStart(2, '0');
  const day = String(now.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

export function shiftDateISO(baseDateISO: string, deltaDays: number): string {
  const parsed = new Date(`${baseDateISO}T00:00:00`);
  if (Number.isNaN(parsed.getTime())) {
    return baseDateISO;
  }
  parsed.setDate(parsed.getDate() + deltaDays);
  return getTodayDateISO(parsed);
}

export function computeInactiveDays(
  lastActiveDate?: string,
  referenceDateISO: string = getTodayDateISO()
): number {
  if (!lastActiveDate || typeof lastActiveDate !== 'string') {
    return 0;
  }
  const lastPart = lastActiveDate.slice(0, 10);
  const refPart = referenceDateISO.slice(0, 10);
  const lastMs = Date.parse(`${lastPart}T00:00:00Z`);
  const refMs = Date.parse(`${refPart}T00:00:00Z`);
  if (Number.isNaN(lastMs) || Number.isNaN(refMs)) {
    return 0;
  }
  const diffDays = Math.floor((refMs - lastMs) / (1000 * 60 * 60 * 24));
  return Math.max(0, diffDays);
}

export function computeInactivityDecayPenalty(inactiveDays: number): number {
  if (inactiveDays < INACTIVITY_DISSOLVE_DAYS) {
    return 0;
  }
  return (inactiveDays - (INACTIVITY_DISSOLVE_DAYS - 1)) * DAILY_XP_DECAY_PER_DAY;
}

export function resolveFlexRarityTier(xpInput: number): FlexCardRarityInfo {
  const clampedXp = Math.max(0, Math.round(xpInput));
  let matchedIndex = 0;
  for (let i = 0; i < FLEX_RARITY_MILESTONES.length; i++) {
    if (clampedXp >= FLEX_RARITY_MILESTONES[i].minXp) {
      matchedIndex = i;
    }
  }
  const current = FLEX_RARITY_MILESTONES[matchedIndex];
  const next = FLEX_RARITY_MILESTONES[matchedIndex + 1];

  let progressPercent = 100;
  if (next) {
    const span = Math.max(1, next.minXp - current.minXp);
    progressPercent = Math.min(
      100,
      Math.max(0, Math.round(((clampedXp - current.minXp) / span) * 100))
    );
  }

  return {
    tier: current.tier,
    minXp: current.minXp,
    nextTier: next?.tier,
    nextTierXp: next?.minXp,
    progressPercent,
    badgeLabel: current.badgeLabel,
    accentHex: current.accentHex,
    secondaryHex: current.secondaryHex,
    cardBgGradient: current.cardBgGradient,
    borderClass: current.borderClass,
    textAccentClass: current.textAccentClass,
    dropRateLabel: current.dropRateLabel,
  };
}

export function computeCandidateXpSnapshot(params: {
  state?: AppState;
  topics?: TopicItem[];
  attempts?: TestAttempt[];
  achievements?: Achievement[];
  focusMinutesTotal?: number;
  bonusPoints?: number;
  deductedPoints?: number;
  recoveredEthicsXp?: number;
  lastActiveDate?: string;
  referenceDateISO?: string;
}): CandidateXpSnapshot {
  const topics = params.topics ?? params.state?.topics ?? [];
  const attempts = params.attempts ?? params.state?.attempts ?? [];
  const achievements = params.achievements ?? params.state?.achievements ?? [];
  const focusMinutesTotal = params.focusMinutesTotal ?? params.state?.focusMinutesTotal ?? 0;
  const bonusPoints = params.bonusPoints ?? 0;
  const deductedPoints = params.deductedPoints ?? 0;
  const rawRecoveredEthicsXp =
    params.recoveredEthicsXp ?? params.state?.student.recoveredEthicsXp ?? 0;
  const lastActiveDate =
    params.lastActiveDate ?? params.state?.student.lastActiveDate ?? params.state?.student.createdAt;
  const referenceDateISO = params.referenceDateISO ?? getTodayDateISO();

  const completedTopics = topics.filter((t) => t.completed);
  const completedHighYield = completedTopics.filter((t) => t.yieldType === 'high');

  const chapterXp = completedTopics.length * 65 + completedHighYield.length * 20;

  const attemptsXp = attempts.reduce((sum, attempt) => {
    const scorePart = Math.round(attempt.overallScoreOutOf10 * 18);
    const modePart = attempt.mode === 'countdown_blitz' ? 25 : 15;
    return sum + scorePart + modePart;
  }, 0);

  const focusXp = Math.max(0, Math.round(focusMinutesTotal * 2));

  const badgeXp = achievements.reduce((sum, ach) => {
    if (!ach.unlocked) return sum;
    return sum + (typeof ach.xpReward === 'number' ? ach.xpReward : 60);
  }, 0);

  const earnedRawXp = chapterXp + attemptsXp + focusXp + badgeXp;
  const safeBonusXp = Math.max(0, Math.round(bonusPoints));
  const adminDeductionXp = Math.max(0, Math.round(deductedPoints));
  const recoveredEthicsXp = Math.min(
    adminDeductionXp,
    Math.max(0, Math.round(rawRecoveredEthicsXp))
  );

  const inactiveDays = computeInactiveDays(lastActiveDate, referenceDateISO);
  const activeLearnerDissolved = inactiveDays >= INACTIVITY_DISSOLVE_DAYS;
  const decayPenaltyXp = computeInactivityDecayPenalty(inactiveDays);

  const netXp = Math.max(
    0,
    earnedRawXp + safeBonusXp + recoveredEthicsXp - decayPenaltyXp - adminDeductionXp
  );
  const rarity = resolveFlexRarityTier(netXp);

  return {
    earnedRawXp,
    bonusXp: safeBonusXp,
    adminDeductionXp,
    recoveredEthicsXp,
    decayPenaltyXp,
    netXp,
    inactiveDays,
    activeLearnerDissolved,
    rarity,
  };
}

export function identifyNeededStudyTopics(topics: TopicItem[], maxCount = 3): string[] {
  if (!Array.isArray(topics) || topics.length === 0) {
    return [];
  }

  const incomplete = topics.filter((t) => !t.completed);
  const pool = incomplete.length > 0 ? incomplete : topics;

  const sorted = [...pool].sort((a, b) => {
    if (a.yieldType !== b.yieldType) {
      return a.yieldType === 'high' ? -1 : 1;
    }
    return a.masteryPercent - b.masteryPercent;
  });

  return sorted.slice(0, maxCount).map((t) => {
    const tag = t.yieldType === 'high' ? 'High-Yield PYQ' : 'Core';
    return `${t.title} (${t.subjectName} · ${tag} · ${t.masteryPercent}% mastery)`;
  });
}

export function sanitizeWhatsappDigits(phoneInput?: string): string {
  if (!phoneInput || typeof phoneInput !== 'string') {
    return '';
  }
  const digits = phoneInput.replace(/\D+/g, '');
  if (!digits) return '';
  if (digits.length === 10 && /^[6-9]/.test(digits)) {
    return `91${digits}`;
  }
  return digits;
}

export function validateAdminContactAssignment(
  emailInput: string,
  phoneInput: string
): {
  valid: boolean;
  normalizedEmail: string;
  normalizedPhone: string;
  error?: string;
} {
  const normalizedEmail = emailInput.trim().toLowerCase();
  const normalizedPhone = phoneInput.trim();
  const digits = normalizedPhone.replace(/\D+/g, '');

  if (!normalizedEmail || !/^[^\s@]+@gmail\.com$/.test(normalizedEmail)) {
    return {
      valid: false,
      normalizedEmail,
      normalizedPhone,
      error: 'Please enter a valid @gmail.com address assigned to this admin.',
    };
  }

  if (
    !normalizedPhone ||
    digits.length < 7 ||
    digits.length > 16 ||
    !/^[+0-9()\-\s]+$/.test(normalizedPhone)
  ) {
    return {
      valid: false,
      normalizedEmail,
      normalizedPhone,
      error: 'Please enter a valid admin phone / WhatsApp number (7–16 digits) assigned by the Super Admin.',
    };
  }

  return {
    valid: true,
    normalizedEmail,
    normalizedPhone,
  };
}

export function buildOneClickOutreachLinks(params: {
  candidate: CandidateSummaryDoc;
  adminName: string;
  adminEmail: string;
  adminPhone: string;
  customMessage?: string;
}): {
  subject: string;
  messageBody: string;
  gmailComposeUrl: string;
  whatsappUrl: string | null;
  recipientEmail: string;
  recipientPhoneDigits: string;
} {
  const { candidate, adminName, adminEmail, adminPhone, customMessage } = params;
  const recipientEmail = (candidate.contactEmail || candidate.email || '').trim();
  const recipientPhoneDigits = sanitizeWhatsappDigits(candidate.phoneNumber);

  const inactiveDays = candidate.inactiveDays ?? 0;
  const isDissolved = inactiveDays >= INACTIVITY_DISSOLVE_DAYS || candidate.activeLearnerActive === false;
  const xpPoints = candidate.xpPoints ?? 0;
  const flexTier = candidate.flexTier || resolveFlexRarityTier(xpPoints).tier;

  const badgeList =
    candidate.unlockedBadges && candidate.unlockedBadges.length > 0
      ? candidate.unlockedBadges.slice(0, 4).join(', ')
      : 'Syllabus Mapped Starter';

  const neededPlaces =
    candidate.weakTopics && candidate.weakTopics.length > 0
      ? candidate.weakTopics.slice(0, 3).map((item, idx) => `${idx + 1}. ${item}`).join('\n')
      : `1. Priority High-Yield PYQ chapters for ${candidate.examName}\n2. Daily compressed timed drill (${candidate.completedChapters}/${candidate.totalChapters} chapters completed)`;

  const statusHeadline = isDissolved
    ? `Action Needed: Your Active Learner badge dissolved after ${Math.max(3, inactiveDays)} inactive days and your XP is decaying daily.`
    : `Great Momentum: Your Active Learner status is live (${xpPoints} XP · ${flexTier} FlexCard tier).`;

  const subject = isDissolved
    ? `SyllabiQ Study Check-In: Restore Your Active Learner Badge & XP (${candidate.examName})`
    : `SyllabiQ Achievement & Priority Syllabus Update (${candidate.examName})`;

  const senderSignOff = [
    adminName || 'SyllabiQ Academic Admin',
    adminEmail ? `Gmail: ${adminEmail}` : '',
    adminPhone ? `WhatsApp / Phone: ${adminPhone}` : '',
  ]
    .filter(Boolean)
    .join(' | ');

  const defaultBody = `Hi ${candidate.displayName},

${statusHeadline}

Current Academic Snapshot:
- Target Exam: ${candidate.examName} (${candidate.boardOrUniversity})
- Syllabus Readiness: ${candidate.readinessPercent}% (${candidate.completedChapters}/${candidate.totalChapters} chapters · ${candidate.overallRatingOutOf10.toFixed(1)}/10 rating)
- Earned XP & FlexCard Rarity: ${xpPoints} XP (${flexTier})
- Active Achievements: ${badgeList}

Priority Syllabus Places to Focus Next:
${neededPlaces}

Complete one focused chapter or timed PYQ drill today on SyllabiQ to keep your XP growing and upgrade your rare FlexCard.

Best regards,
${senderSignOff}`;

  const messageBody =
    typeof customMessage === 'string' && customMessage.trim().length > 0
      ? customMessage.trim()
      : defaultBody;

  const gmailComposeUrl = `https://mail.google.com/mail/?view=cm&fs=1&to=${encodeURIComponent(
    recipientEmail
  )}&su=${encodeURIComponent(subject)}&body=${encodeURIComponent(messageBody)}`;

  const whatsappUrl = recipientPhoneDigits
    ? `https://wa.me/${recipientPhoneDigits}?text=${encodeURIComponent(messageBody)}`
    : null;

  return {
    subject,
    messageBody,
    gmailComposeUrl,
    whatsappUrl,
    recipientEmail,
    recipientPhoneDigits,
  };
}
