import type {
  AdminDigestDoc,
  AppState,
  CandidateSummaryDoc,
  CredentialVerificationNotice,
  GlobalUpdateCategory,
  GlobalUpdateDoc,
  IndividualBonusDoc,
  IndividualBonusType,
  IssuedCredentialDoc,
  StaffAccessProfile,
  StaffInviteDoc,
  StaffMemberDoc,
} from '../types';
import { computeDashboardMetrics } from './studyEngine';
import { computeCandidateXpSnapshot, identifyNeededStudyTopics } from './xpAndOutreachEngine';
import { MAX_AVATAR_DATA_URL_LENGTH, sanitizeAvatarForCloud } from './avatarStudio';

// Verbatim constants & regexes synchronized with firebase-blueprint.json & firestore.rules
export const VALID_ID_REGEX = /^[a-zA-Z0-9_\-]+$/;
export const BOOTSTRAPPED_SUPER_ADMIN_EMAIL = 'rohitshree1973@gmail.com';
export const DEMO_PLACEHOLDER_EMAIL = 'aarav.mehta.study@gmail.com';

const DEMO_PLACEHOLDER_NAMES = new Set([
  'aarav mehta',
  'aarav sharma',
  'aarav',
  'scholar',
  'banned candidate',
]);

export function isSuperAdminEmail(email: unknown): boolean {
  return (
    typeof email === 'string' &&
    email.trim().toLowerCase() === BOOTSTRAPPED_SUPER_ADMIN_EMAIL
  );
}

export function isDemoPlaceholderStudentName(name: unknown): boolean {
  if (typeof name !== 'string') return true;
  const normalized = name.trim().toLowerCase();
  if (!normalized) return true;
  return DEMO_PLACEHOLDER_NAMES.has(normalized);
}

export function resolveAuthenticatedDisplayName(user: {
  displayName?: string | null;
  email?: string | null;
}): string {
  const rawName = sanitizeText(user.displayName ?? '', BLUEPRINT_LIMITS.displayNameMax, '');
  if (rawName && !isDemoPlaceholderStudentName(rawName)) {
    return rawName;
  }
  const cleanEmail = typeof user.email === 'string' ? user.email.trim() : '';
  if (isSuperAdminEmail(cleanEmail)) {
    return 'Rohit Shree';
  }
  if (cleanEmail.includes('@')) {
    const localPart = cleanEmail.split('@')[0].replace(/[._-]+/g, ' ').trim();
    if (localPart) {
      const formatted = localPart
        .split(/\s+/)
        .filter(Boolean)
        .map((w) => w.charAt(0).toUpperCase() + w.slice(1))
        .join(' ')
        .slice(0, BLUEPRINT_LIMITS.displayNameMax);
      if (formatted && !isDemoPlaceholderStudentName(formatted)) {
        return formatted;
      }
    }
  }
  return 'Scholar';
}

export function isSuperAdminCandidateRecord(
  cand:
    | {
        ownerUid?: unknown;
        email?: unknown;
        contactEmail?: unknown;
        role?: unknown;
      }
    | null
    | undefined,
  knownSuperAdminUid?: string | null
): boolean {
  if (!cand) return false;
  if (isSuperAdminEmail(cand.email) || isSuperAdminEmail(cand.contactEmail)) {
    return true;
  }
  if (typeof cand.role === 'string' && cand.role.trim().toLowerCase() === 'super_admin') {
    return true;
  }
  if (knownSuperAdminUid && cand.ownerUid === knownSuperAdminUid) {
    return true;
  }
  return false;
}

export const BLUEPRINT_LIMITS = {
  idMax: 128,
  emailMin: 3,
  emailMax: 160,
  phoneMin: 7,
  phoneMax: 32,
  dateMax: 20,
  displayNameMax: 80,
  avatarMax: MAX_AVATAR_DATA_URL_LENGTH,
  boardMax: 120,
  examNameMax: 120,
  examDateMax: 20,
  banReasonMax: 240,
  reoptNoteMax: 500,
  subjectsMaxCount: 25,
  topicsMaxCount: 150,
  scheduleMaxCount: 120,
  attemptsMaxCount: 50,
  achievementsMaxCount: 30,
  digestEntriesMaxCount: 50,
  badgeListMax: 15,
  weakTopicsMax: 8,
  topicTitleMax: 120,
  updateTitleMax: 120,
  updateBodyMax: 800,
  roleLabelMax: 40,
  bonusTitleMax: 100,
  bonusMessageMax: 500,
  bonusPointsMaxPerGrant: 5000,
  totalBonusPointsMax: 500000,
  serialCodeMax: 32,
  credentialTitleMax: 120,
  metricSummaryMax: 200,
} as const;

export function isValidFirestoreId(id: unknown): id is string {
  return (
    typeof id === 'string' &&
    id.length >= 1 &&
    id.length <= BLUEPRINT_LIMITS.idMax &&
    VALID_ID_REGEX.test(id)
  );
}

export function sanitizeText(value: unknown, maxLength: number, fallback = ''): string {
  const raw = typeof value === 'string' ? value.trim() : '';
  const resolved = raw || fallback;
  return resolved.slice(0, maxLength);
}

export function clampInt(value: unknown, min: number, max: number): number {
  const num = typeof value === 'number' && Number.isFinite(value) ? Math.trunc(value) : min;
  return Math.max(min, Math.min(max, num));
}

export function clampNumber(value: unknown, min: number, max: number): number {
  const num = typeof value === 'number' && Number.isFinite(value) ? value : min;
  return Math.max(min, Math.min(max, Math.round(num * 10) / 10));
}

/**
 * Deterministically converts an email into a Firestore-safe inviteKey matching ^[a-zA-Z0-9_\-]+$
 */
export function emailToInviteKey(email: string): string {
  const cleaned = email
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_+|_+$/g, '')
    .slice(0, 110);
  return cleaned ? `inv_${cleaned}` : 'inv_invalid';
}

export type SandboxRolePreviewMode =
  | 'none'
  | 'super_admin'
  | 'sub_admin_minimal'
  | 'sub_admin_maximum';

export function computeDelegatedRoleLabel(perms: {
  canPostUpdates: boolean;
  canGrantBonuses: boolean;
  canBanUsers: boolean;
}): string {
  const enabledCount =
    (perms.canPostUpdates ? 1 : 0) +
    (perms.canGrantBonuses ? 1 : 0) +
    (perms.canBanUsers ? 1 : 0);

  if (enabledCount === 3) return 'Maximum Delegated Admin';
  if (enabledCount === 1) return 'Minimal Delegated Admin';
  if (enabledCount === 0) return 'Read-Only Delegated Admin';
  return 'Delegated Admin';
}

export function resolveSandboxStaffAccess(mode: SandboxRolePreviewMode): StaffAccessProfile {
  if (mode === 'super_admin') {
    return {
      tier: 'super_admin',
      roleLabel: 'Super Admin',
      adminEmail: BOOTSTRAPPED_SUPER_ADMIN_EMAIL,
      adminPhone: '+91 98000 00001',
      canPostUpdates: true,
      canGrantBonuses: true,
      canBanUsers: true,
      canManageAdmins: true,
      canSendOutreach: true,
      isDemoPreview: true,
    };
  }
  if (mode === 'sub_admin_minimal') {
    return {
      tier: 'sub_admin',
      roleLabel: 'Minimal Delegated Admin',
      adminEmail: 'priya.menon.academic@gmail.com',
      adminPhone: '+91 98201 11223',
      canPostUpdates: true,
      canGrantBonuses: false,
      canBanUsers: false,
      canManageAdmins: false,
      canSendOutreach: true,
      isDemoPreview: true,
    };
  }
  if (mode === 'sub_admin_maximum') {
    return {
      tier: 'sub_admin',
      roleLabel: 'Maximum Delegated Admin',
      adminEmail: 'vikram.desai.mentor@gmail.com',
      adminPhone: '+91 98334 55678',
      canPostUpdates: true,
      canGrantBonuses: true,
      canBanUsers: true,
      canManageAdmins: false,
      canSendOutreach: true,
      isDemoPreview: true,
    };
  }
  return {
    tier: 'none',
    roleLabel: 'Candidate',
    canPostUpdates: false,
    canGrantBonuses: false,
    canBanUsers: false,
    canManageAdmins: false,
    canSendOutreach: false,
  };
}

/**
 * Retains full candidate academic + Gmail + WhatsApp profile for all authorized admins
 * (Super Admin and delegated Sub-Admins), while stripping contact PII for non-staff viewers.
 */
export function filterCandidatePiiForStaff(
  candidates: CandidateSummaryDoc[],
  isAuthorizedStaff: boolean
): CandidateSummaryDoc[] {
  if (isAuthorizedStaff) return candidates;
  return candidates.map(
    ({
      email: _email,
      contactEmail: _contactEmail,
      phoneNumber: _phone,
      authProvider: _provider,
      ...safeRest
    }) => safeRest
  );
}

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (value === null || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const proto = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * Strips undefined keys recursively from plain objects and arrays while strictly preserving
 * non-plain SDK instances such as Firestore Timestamp and FieldValue (serverTimestamp).
 */
export function stripUndefinedDeep<T>(obj: T): T {
  if (Array.isArray(obj)) {
    return obj
      .filter((item) => item !== undefined)
      .map((item) => stripUndefinedDeep(item)) as unknown as T;
  }
  if (isPlainObject(obj)) {
    const out: Record<string, unknown> = {};
    for (const [k, v] of Object.entries(obj)) {
      if (v !== undefined) {
        out[k] = stripUndefinedDeep(v);
      }
    }
    return out as T;
  }
  return obj;
}

/**
 * Builds a schema-compliant CandidateSummary payload from AppState
 */
export function buildSanitizedCandidateSummary(params: {
  ownerUid: string;
  fallbackName: string;
  state: AppState;
  existingBonusPoints?: number;
  existingDeductedPoints?: number;
  existingBanned?: boolean;
  existingBanReason?: string;
  existingAdsEnabled?: boolean;
}): Omit<CandidateSummaryDoc, 'createdAt' | 'updatedAt' | 'email' | 'authProvider'> {
  const metrics = computeDashboardMetrics(params.state);
  const bonusPoints = clampInt(
    params.existingBonusPoints ?? 0,
    0,
    BLUEPRINT_LIMITS.totalBonusPointsMax
  );
  const deductedPoints = clampInt(
    params.existingDeductedPoints ?? 0,
    0,
    BLUEPRINT_LIMITS.totalBonusPointsMax
  );
  const recoveredEthicsXp = clampInt(
    params.state.student.recoveredEthicsXp ?? 0,
    0,
    BLUEPRINT_LIMITS.totalBonusPointsMax
  );
  const xpSnapshot = computeCandidateXpSnapshot({
    state: params.state,
    bonusPoints,
    deductedPoints,
    recoveredEthicsXp,
  });
  const weakTopics = identifyNeededStudyTopics(params.state.topics, 4)
    .map((t) => sanitizeText(t, BLUEPRINT_LIMITS.topicTitleMax, ''))
    .filter(Boolean)
    .slice(0, BLUEPRINT_LIMITS.weakTopicsMax);
  const unlockedBadges = params.state.achievements
    .filter((a) => a.unlocked)
    .map((a) => sanitizeText(a.title, 80, ''))
    .filter(Boolean)
    .slice(0, BLUEPRINT_LIMITS.badgeListMax);

  const displayName = sanitizeText(
    params.state.student.name,
    BLUEPRINT_LIMITS.displayNameMax,
    sanitizeText(params.fallbackName, BLUEPRINT_LIMITS.displayNameMax, 'Scholar')
  );

  const cleanAvatar = sanitizeAvatarForCloud(params.state.student.avatarUrl);

  return {
    ownerUid: params.ownerUid.slice(0, BLUEPRINT_LIMITS.idMax),
    displayName,
    ...(cleanAvatar ? { avatarUrl: cleanAvatar } : {}),
    contactEmail: sanitizeText(params.state.student.email ?? '', BLUEPRINT_LIMITS.emailMax, ''),
    phoneNumber: sanitizeText(
      params.state.student.phoneNumber ?? '',
      BLUEPRINT_LIMITS.phoneMax,
      ''
    ),
    notifyGmailOptIn: Boolean(params.state.student.notifyGmailOptIn ?? false),
    notifyWhatsappOptIn: Boolean(params.state.student.notifyWhatsappOptIn ?? false),
    institutionType: params.state.student.institutionType === 'school' ? 'school' : 'university',
    boardOrUniversity: sanitizeText(
      params.state.student.boardOrUniversity,
      BLUEPRINT_LIMITS.boardMax,
      ''
    ),
    examName: sanitizeText(params.state.student.examName, BLUEPRINT_LIMITS.examNameMax, ''),
    examDate: sanitizeText(params.state.student.examDate, BLUEPRINT_LIMITS.examDateMax, ''),
    dailyStudyHours: clampNumber(params.state.student.dailyStudyHours, 1, 16),
    readinessPercent: clampNumber(metrics.examReadinessPercent, 0, 100),
    overallRatingOutOf10: clampNumber(metrics.overallScoreOutOf10 ?? 0, 0, 10),
    completedChapters: clampInt(metrics.completedChapters, 0, 500),
    totalChapters: clampInt(metrics.totalChapters, 0, 500),
    attemptsCount: clampInt(params.state.attempts.length, 0, 5000),
    focusMinutesLogged: clampInt(params.state.focusMinutesTotal ?? 0, 0, 500000),
    bonusPoints,
    deductedPoints,
    xpPoints: clampInt(xpSnapshot.netXp, 0, BLUEPRINT_LIMITS.totalBonusPointsMax),
    flexTier: xpSnapshot.rarity.tier,
    lastActiveDate: sanitizeText(
      params.state.student.lastActiveDate ?? params.state.student.createdAt ?? '',
      BLUEPRINT_LIMITS.dateMax,
      ''
    ),
    inactiveDays: clampInt(xpSnapshot.inactiveDays, 0, 3650),
    activeLearnerActive: !xpSnapshot.activeLearnerDissolved,
    unlockedBadges,
    weakTopics,
    banned: Boolean(params.existingBanned ?? false),
    banReason: sanitizeText(params.existingBanReason ?? '', BLUEPRINT_LIMITS.banReasonMax, ''),
    adsEnabled: params.existingAdsEnabled !== undefined ? Boolean(params.existingAdsEnabled) : false,
  };
}

/**
 * Builds a schema-compliant CandidateWorkspace native-map payload within bounded array limits
 */
export function buildSanitizedWorkspacePayload(ownerUid: string, state: AppState) {
  const todayISO = new Date().toISOString().slice(0, 10);
  return stripUndefinedDeep({
    ownerUid: ownerUid.slice(0, BLUEPRINT_LIMITS.idMax),
    onboarded: Boolean(state.onboarded),
    student: {
      name: sanitizeText(state.student.name, BLUEPRINT_LIMITS.displayNameMax, ''),
      avatarUrl: sanitizeAvatarForCloud(state.student.avatarUrl),
      avatarVisibility:
        state.student.avatarVisibility === 'connections_only'
          ? 'connections_only'
          : state.student.avatarVisibility === 'world'
          ? 'world'
          : undefined,
      email: sanitizeText(state.student.email ?? '', BLUEPRINT_LIMITS.emailMax, ''),
      phoneNumber: sanitizeText(state.student.phoneNumber ?? '', BLUEPRINT_LIMITS.phoneMax, ''),
      notifyGmailOptIn: Boolean(state.student.notifyGmailOptIn ?? false),
      notifyWhatsappOptIn: Boolean(state.student.notifyWhatsappOptIn ?? false),
      lastActiveDate: sanitizeText(
        state.student.lastActiveDate ?? state.student.createdAt ?? todayISO,
        BLUEPRINT_LIMITS.dateMax,
        todayISO
      ),
      aiAboutLines: Array.isArray(state.student.aiAboutLines)
        ? state.student.aiAboutLines
            .map((line) => sanitizeText(line, 240, ''))
            .filter(Boolean)
            .slice(0, 15)
        : undefined,
      aiAboutUpdatedAt: state.student.aiAboutUpdatedAt
        ? sanitizeText(state.student.aiAboutUpdatedAt, 30, '')
        : undefined,
      referralCode: state.student.referralCode
        ? sanitizeText(state.student.referralCode, 32, '')
        : undefined,
      referredByCode: state.student.referredByCode
        ? sanitizeText(state.student.referredByCode, 32, '')
        : undefined,
      recoveredEthicsXp:
        state.student.recoveredEthicsXp !== undefined
          ? clampInt(state.student.recoveredEthicsXp, 0, BLUEPRINT_LIMITS.totalBonusPointsMax)
          : undefined,
      recoveredDeductionIds: Array.isArray(state.student.recoveredDeductionIds)
        ? state.student.recoveredDeductionIds
            .map((id) => sanitizeText(id, BLUEPRINT_LIMITS.idMax, ''))
            .filter(Boolean)
            .slice(0, 50)
        : undefined,
      institutionType: state.student.institutionType === 'school' ? 'school' : 'university',
      boardOrUniversity: sanitizeText(
        state.student.boardOrUniversity,
        BLUEPRINT_LIMITS.boardMax,
        ''
      ),
      examName: sanitizeText(state.student.examName, BLUEPRINT_LIMITS.examNameMax, ''),
      examDate: sanitizeText(state.student.examDate, BLUEPRINT_LIMITS.examDateMax, ''),
      dailyStudyHours: clampNumber(state.student.dailyStudyHours, 1, 16),
      alertnessWindow: state.student.alertnessWindow,
      learningStyle: state.student.learningStyle,
      customStyleFeedback: sanitizeText(state.student.customStyleFeedback, 300, ''),
      createdAt: sanitizeText(state.student.createdAt, 20, todayISO),
    },
    subjects: state.subjects.slice(0, BLUEPRINT_LIMITS.subjectsMaxCount),
    topics: state.topics.slice(0, BLUEPRINT_LIMITS.topicsMaxCount),
    schedule: state.schedule.slice(0, BLUEPRINT_LIMITS.scheduleMaxCount),
    attempts: state.attempts.slice(-BLUEPRINT_LIMITS.attemptsMaxCount),
    achievements: state.achievements.slice(0, BLUEPRINT_LIMITS.achievementsMaxCount),
    lastReoptimizationNote: sanitizeText(
      state.lastReoptimizationNote ?? '',
      BLUEPRINT_LIMITS.reoptNoteMax,
      ''
    ),
    focusSessionsCompleted: clampInt(state.focusSessionsCompleted ?? 0, 0, 100000),
    focusMinutesTotal: clampInt(state.focusMinutesTotal ?? 0, 0, 500000),
    ...(state.aiStrategyBriefing
      ? {
          aiStrategyBriefing: {
            headline: sanitizeText(state.aiStrategyBriefing.headline, 240, ''),
            alertnessStrategy: sanitizeText(state.aiStrategyBriefing.alertnessStrategy, 500, ''),
            pyqFocusAdvice: sanitizeText(state.aiStrategyBriefing.pyqFocusAdvice, 500, ''),
            classSyncTip: sanitizeText(state.aiStrategyBriefing.classSyncTip, 500, ''),
            recoveryNote: state.aiStrategyBriefing.recoveryNote
              ? sanitizeText(state.aiStrategyBriefing.recoveryNote, 300, '')
              : undefined,
            actionableSteps: Array.isArray(state.aiStrategyBriefing.actionableSteps)
              ? state.aiStrategyBriefing.actionableSteps
                  .map((step) => sanitizeText(step, 200, ''))
                  .filter(Boolean)
                  .slice(0, 8)
              : [],
            generatedAt: sanitizeText(state.aiStrategyBriefing.generatedAt, 40, todayISO),
            usedAi: Boolean(state.aiStrategyBriefing.usedAi),
          },
        }
      : {}),
  });
}

// ============================================================================
// Pure Zero-Trust Security Rule Evaluator (Mirrors firestore.rules for TDD)
// ============================================================================
export interface SimulatedAuthContext {
  uid: string;
  email: string;
  email_verified: boolean;
}

export interface SimulatedDatabaseState {
  users_private: Record<string, Record<string, unknown>>;
  candidates: Record<string, CandidateSummaryDoc>;
  workspaces: Record<string, Record<string, unknown>>;
  global_updates: Record<string, GlobalUpdateDoc>;
  individual_bonuses: Record<string, IndividualBonusDoc>;
  staff_invites: Record<string, StaffInviteDoc>;
  staff_members: Record<string, StaffMemberDoc>;
  admin_digests: Record<string, AdminDigestDoc>;
  issued_credentials?: Record<string, Record<string, unknown>>;
  credential_verifications?: Record<string, Record<string, unknown>>;
  social_profiles?: Record<string, Record<string, unknown>>;
  social_messages?: Record<string, Record<string, unknown>>;
  social_connections?: Record<string, Record<string, unknown>>;
}

export type RuleDecision = 'ALLOW' | 'PERMISSION_DENIED';

function hasExactKeys(data: Record<string, unknown>, keys: string[]): boolean {
  const actual = Object.keys(data);
  if (actual.length !== keys.length) return false;
  const set = new Set(keys);
  return actual.every((k) => set.has(k));
}

function affectedKeysOnly(
  existing: Record<string, unknown>,
  incoming: Record<string, unknown>,
  allowed: string[]
): boolean {
  const allowedSet = new Set(allowed);
  const allKeys = new Set([...Object.keys(existing), ...Object.keys(incoming)]);
  for (const k of allKeys) {
    if (JSON.stringify(existing[k]) !== JSON.stringify(incoming[k])) {
      if (!allowedSet.has(k)) return false;
    }
  }
  return true;
}

export function evaluateFirestoreRuleOperation(params: {
  collection: keyof SimulatedDatabaseState;
  operation: 'get' | 'list' | 'create' | 'update' | 'delete';
  docId?: string;
  auth: SimulatedAuthContext | null;
  db: SimulatedDatabaseState;
  incomingData?: Record<string, unknown>;
  requestTimeISO?: string;
}): RuleDecision {
  const { collection, operation, docId = '', auth, db, incomingData } = params;
  const reqTime = params.requestTimeISO || '2026-10-26T05:00:00.000Z';

  const isSignedIn = auth !== null;
  const isVerified = Boolean(auth && auth.email_verified === true);
  const isSuperAdmin = Boolean(
    isVerified && auth?.email === BOOTSTRAPPED_SUPER_ADMIN_EMAIL
  );

  const hasStaffPerm = (perm: 'canPostUpdates' | 'canGrantBonuses' | 'canBanUsers'): boolean => {
    if (!isVerified || !auth) return false;
    const member = db.staff_members[auth.uid];
    if (!member || !member.active) return false;
    const invite = db.staff_invites[member.inviteKey];
    if (!invite || invite.status !== 'active') return false;
    return Boolean(member[perm] && invite[perm]);
  };

  const isSubAdmin = (): boolean => {
    if (!isVerified || !auth) return false;
    const member = db.staff_members[auth.uid];
    if (!member || !member.active) return false;
    const invite = db.staff_invites[member.inviteKey];
    return Boolean(invite && invite.status === 'active');
  };

  if (operation !== 'list' && !isValidFirestoreId(docId)) {
    return 'PERMISSION_DENIED';
  }

  // 1. users_private
  if (collection === 'users_private') {
    const existing = db.users_private[docId];
    if (operation === 'get') {
      if (!existing) return 'PERMISSION_DENIED';
      return (isVerified && auth?.uid === docId) || isSuperAdmin || isSubAdmin()
        ? 'ALLOW'
        : 'PERMISSION_DENIED';
    }
    if (operation === 'list') {
      return isSuperAdmin ? 'ALLOW' : 'PERMISSION_DENIED';
    }
    if (operation === 'create') {
      if (!isVerified || !auth || auth.uid !== docId || !incomingData) return 'PERMISSION_DENIED';
      if (
        !hasExactKeys(incomingData, ['ownerUid', 'email', 'authProvider', 'createdAt', 'updatedAt'])
      ) {
        return 'PERMISSION_DENIED';
      }
      if (
        incomingData.ownerUid !== auth.uid ||
        incomingData.email !== auth.email ||
        (incomingData.authProvider !== 'google.com' &&
          incomingData.authProvider !== 'microsoft.com') ||
        incomingData.createdAt !== reqTime ||
        incomingData.updatedAt !== reqTime
      ) {
        return 'PERMISSION_DENIED';
      }
      return 'ALLOW';
    }
  }

  // 2. candidates
  if (collection === 'candidates') {
    const existing = db.candidates[docId] as unknown as Record<string, unknown> | undefined;
    const validCandidateShape = (d: Record<string, unknown>): boolean => {
      const reqKeys = [
        'ownerUid',
        'displayName',
        'boardOrUniversity',
        'examName',
        'examDate',
        'readinessPercent',
        'overallRatingOutOf10',
        'completedChapters',
        'totalChapters',
        'attemptsCount',
        'focusMinutesLogged',
        'bonusPoints',
        'banned',
        'banReason',
        'createdAt',
        'updatedAt',
      ];
      const allowedSet = new Set([
        ...reqKeys,
        'avatarUrl',
        'adsEnabled',
        'contactEmail',
        'phoneNumber',
        'notifyGmailOptIn',
        'notifyWhatsappOptIn',
        'institutionType',
        'dailyStudyHours',
        'deductedPoints',
        'xpPoints',
        'flexTier',
        'lastActiveDate',
        'inactiveDays',
        'activeLearnerActive',
        'unlockedBadges',
        'weakTopics',
      ]);
      const actualKeys = Object.keys(d);
      if (!reqKeys.every((k) => actualKeys.includes(k))) return false;
      if (!actualKeys.every((k) => allowedSet.has(k))) return false;
      if (!isValidFirestoreId(d.ownerUid)) return false;
      if (typeof d.displayName !== 'string' || d.displayName.length < 1 || d.displayName.length > 80)
        return false;
      if (
        'avatarUrl' in d &&
        (typeof d.avatarUrl !== 'string' || d.avatarUrl.length > BLUEPRINT_LIMITS.avatarMax)
      )
        return false;
      if (
        typeof d.bonusPoints !== 'number' ||
        !Number.isFinite(d.bonusPoints) ||
        d.bonusPoints < 0 ||
        d.bonusPoints > BLUEPRINT_LIMITS.totalBonusPointsMax
      )
        return false;
      if (typeof d.banned !== 'boolean') return false;
      if (typeof d.banReason !== 'string' || d.banReason.length > 240) return false;
      if ('adsEnabled' in d && typeof d.adsEnabled !== 'boolean') return false;
      if ('contactEmail' in d && (typeof d.contactEmail !== 'string' || d.contactEmail.length > 160))
        return false;
      if ('phoneNumber' in d && (typeof d.phoneNumber !== 'string' || d.phoneNumber.length > 32))
        return false;
      if ('notifyGmailOptIn' in d && typeof d.notifyGmailOptIn !== 'boolean') return false;
      if ('notifyWhatsappOptIn' in d && typeof d.notifyWhatsappOptIn !== 'boolean') return false;
      if (
        'institutionType' in d &&
        d.institutionType !== 'school' &&
        d.institutionType !== 'university'
      )
        return false;
      if (
        'dailyStudyHours' in d &&
        (typeof d.dailyStudyHours !== 'number' || d.dailyStudyHours < 0 || d.dailyStudyHours > 24)
      )
        return false;
      if (
        'deductedPoints' in d &&
        (typeof d.deductedPoints !== 'number' ||
          !Number.isFinite(d.deductedPoints) ||
          d.deductedPoints < 0 ||
          d.deductedPoints > BLUEPRINT_LIMITS.totalBonusPointsMax)
      )
        return false;
      if (
        'xpPoints' in d &&
        (typeof d.xpPoints !== 'number' ||
          !Number.isFinite(d.xpPoints) ||
          d.xpPoints < 0 ||
          d.xpPoints > BLUEPRINT_LIMITS.totalBonusPointsMax)
      )
        return false;
      if ('flexTier' in d && (typeof d.flexTier !== 'string' || d.flexTier.length > 40))
        return false;
      if ('lastActiveDate' in d && (typeof d.lastActiveDate !== 'string' || d.lastActiveDate.length > 20))
        return false;
      if (
        'inactiveDays' in d &&
        (typeof d.inactiveDays !== 'number' ||
          !Number.isFinite(d.inactiveDays) ||
          d.inactiveDays < 0 ||
          d.inactiveDays > 3650)
      )
        return false;
      if ('activeLearnerActive' in d && typeof d.activeLearnerActive !== 'boolean') return false;
      if (
        'unlockedBadges' in d &&
        (!Array.isArray(d.unlockedBadges) || d.unlockedBadges.length > BLUEPRINT_LIMITS.badgeListMax)
      )
        return false;
      if (
        'weakTopics' in d &&
        (!Array.isArray(d.weakTopics) || d.weakTopics.length > BLUEPRINT_LIMITS.weakTopicsMax)
      )
        return false;
      return true;
    };

    if (operation === 'get') {
      return (isVerified && auth?.uid === docId) || isSuperAdmin || isSubAdmin()
        ? 'ALLOW'
        : 'PERMISSION_DENIED';
    }
    if (operation === 'create') {
      if (!isVerified || !auth || auth.uid !== docId || !incomingData) return 'PERMISSION_DENIED';
      if (!validCandidateShape(incomingData)) return 'PERMISSION_DENIED';
      if (
        incomingData.ownerUid !== auth.uid ||
        incomingData.bonusPoints !== 0 ||
        ('deductedPoints' in incomingData && incomingData.deductedPoints !== 0) ||
        incomingData.banned !== false ||
        incomingData.banReason !== '' ||
        ('adsEnabled' in incomingData && typeof incomingData.adsEnabled !== 'boolean') ||
        incomingData.createdAt !== reqTime ||
        incomingData.updatedAt !== reqTime
      ) {
        return 'PERMISSION_DENIED';
      }
      return 'ALLOW';
    }
    if (operation === 'update') {
      if (!isSignedIn || !isVerified || !auth || !existing || !incomingData)
        return 'PERMISSION_DENIED';
      if (!validCandidateShape(incomingData)) return 'PERMISSION_DENIED';
      const ownerImmutable =
        !('ownerUid' in existing) ||
        typeof existing.ownerUid !== 'string' ||
        existing.ownerUid === '' ||
        incomingData.ownerUid === existing.ownerUid;
      const existingHasValidTimestamp =
        'createdAt' in existing && typeof existing.createdAt === 'string' && existing.createdAt.length > 0;
      const createdAtImmutable = existingHasValidTimestamp
        ? incomingData.createdAt === existing.createdAt
        : incomingData.createdAt === reqTime;
      if (!ownerImmutable || !createdAtImmutable || incomingData.updatedAt !== reqTime) {
        return 'PERMISSION_DENIED';
      }

      const existingBanned = 'banned' in existing ? existing.banned : false;
      const existingBonus =
        'bonusPoints' in existing && typeof existing.bonusPoints === 'number'
          ? existing.bonusPoints
          : 0;
      const existingBanReason =
        'banReason' in existing && typeof existing.banReason === 'string'
          ? existing.banReason
          : '';
      const adsUnchanged =
        !('adsEnabled' in existing) || typeof existing.adsEnabled !== 'boolean'
          ? !('adsEnabled' in incomingData) || incomingData.adsEnabled === false
          : 'adsEnabled' in incomingData && incomingData.adsEnabled === existing.adsEnabled;

      const existingDeducted =
        'deductedPoints' in existing && typeof existing.deductedPoints === 'number'
          ? existing.deductedPoints
          : 0;
      const deductedUnchanged =
        !('deductedPoints' in existing) || typeof existing.deductedPoints !== 'number'
          ? !('deductedPoints' in incomingData) || incomingData.deductedPoints === 0
          : 'deductedPoints' in incomingData &&
            incomingData.deductedPoints === existing.deductedPoints;

      const ownerSync =
        auth.uid === docId &&
        incomingData.ownerUid === auth.uid &&
        existingBanned === false &&
        incomingData.banned === false &&
        incomingData.bonusPoints === existingBonus &&
        deductedUnchanged &&
        incomingData.banReason === existingBanReason &&
        adsUnchanged &&
        affectedKeysOnly(existing, incomingData, [
          'ownerUid',
          'displayName',
          'avatarUrl',
          'contactEmail',
          'phoneNumber',
          'notifyGmailOptIn',
          'notifyWhatsappOptIn',
          'institutionType',
          'boardOrUniversity',
          'examName',
          'examDate',
          'dailyStudyHours',
          'readinessPercent',
          'overallRatingOutOf10',
          'completedChapters',
          'totalChapters',
          'attemptsCount',
          'focusMinutesLogged',
          'bonusPoints',
          'deductedPoints',
          'xpPoints',
          'flexTier',
          'lastActiveDate',
          'inactiveDays',
          'activeLearnerActive',
          'unlockedBadges',
          'weakTopics',
          'banned',
          'banReason',
          'adsEnabled',
          'email',
          'authProvider',
          'photoURL',
          'role',
          'adsRemoved',
          'streakDays',
          'createdAt',
          'updatedAt',
        ]);
      const privRec = db.users_private?.[docId] as Record<string, unknown> | undefined;
      const isProtectedSuperAdminTarget = Boolean(
        isSuperAdminEmail(privRec?.email) ||
          isSuperAdminEmail(existing.contactEmail) ||
          (isSuperAdmin && auth?.uid === docId)
      );
      const banTargetSafe =
        incomingData.banned === false || !isProtectedSuperAdminTarget;

      const staffBan =
        (isSuperAdmin || hasStaffPerm('canBanUsers')) &&
        banTargetSafe &&
        affectedKeysOnly(existing, incomingData, ['banned', 'banReason', 'updatedAt']);
      const staffBonus =
        (isSuperAdmin || hasStaffPerm('canGrantBonuses')) &&
        typeof incomingData.bonusPoints === 'number' &&
        typeof existing.bonusPoints === 'number' &&
        incomingData.bonusPoints >= existing.bonusPoints &&
        incomingData.bonusPoints - existing.bonusPoints <= 5000 &&
        affectedKeysOnly(existing, incomingData, ['bonusPoints', 'updatedAt']);
      const staffDeduction =
        (isSuperAdmin || hasStaffPerm('canGrantBonuses')) &&
        'deductedPoints' in incomingData &&
        typeof incomingData.deductedPoints === 'number' &&
        incomingData.deductedPoints >= existingDeducted &&
        incomingData.deductedPoints - existingDeducted <= 5000 &&
        affectedKeysOnly(existing, incomingData, ['deductedPoints', 'updatedAt']);
      const superAdminAds =
        isSuperAdmin &&
        'adsEnabled' in incomingData &&
        typeof incomingData.adsEnabled === 'boolean' &&
        affectedKeysOnly(existing, incomingData, ['adsEnabled', 'updatedAt']);

      return ownerSync ||
        staffBan ||
        staffBonus ||
        staffDeduction ||
        superAdminAds ||
        (isSuperAdmin && banTargetSafe)
        ? 'ALLOW'
        : 'PERMISSION_DENIED';
    }
  }

  // 3. workspaces
  if (collection === 'workspaces') {
    const existing = db.workspaces[docId] as Record<string, unknown> | undefined;
    const cand = db.candidates[docId];
    const notBanned = Boolean(!cand || cand.banned === false);
    const validWorkspaceShape = (d: Record<string, unknown>): boolean => {
      const reqKeys = [
        'ownerUid',
        'onboarded',
        'student',
        'subjects',
        'topics',
        'schedule',
        'attempts',
        'achievements',
        'lastReoptimizationNote',
        'focusSessionsCompleted',
        'focusMinutesTotal',
        'createdAt',
        'updatedAt',
      ];
      const allowedSet = new Set([...reqKeys, 'aiStrategyBriefing']);
      const keys = Object.keys(d);
      if (!reqKeys.every((k) => keys.includes(k))) return false;
      if (!keys.every((k) => allowedSet.has(k))) return false;
      if (!isValidFirestoreId(d.ownerUid)) return false;
      if (typeof d.onboarded !== 'boolean') return false;
      if (!d.student || typeof d.student !== 'object' || Object.keys(d.student as object).length > 30)
        return false;
      if (!Array.isArray(d.subjects) || d.subjects.length > 25) return false;
      if (!Array.isArray(d.topics) || d.topics.length > 150) return false;
      if (!Array.isArray(d.schedule) || d.schedule.length > 120) return false;
      if (!Array.isArray(d.attempts) || d.attempts.length > 50) return false;
      if (!Array.isArray(d.achievements) || d.achievements.length > 30) return false;
      if (typeof d.lastReoptimizationNote !== 'string' || d.lastReoptimizationNote.length > 500)
        return false;
      if (
        typeof d.focusSessionsCompleted !== 'number' ||
        d.focusSessionsCompleted < 0 ||
        d.focusSessionsCompleted > 100000
      )
        return false;
      if (
        typeof d.focusMinutesTotal !== 'number' ||
        d.focusMinutesTotal < 0 ||
        d.focusMinutesTotal > 500000
      )
        return false;
      if (
        'aiStrategyBriefing' in d &&
        (!d.aiStrategyBriefing ||
          typeof d.aiStrategyBriefing !== 'object' ||
          Array.isArray(d.aiStrategyBriefing) ||
          Object.keys(d.aiStrategyBriefing as object).length > 10)
      ) {
        return false;
      }
      return true;
    };

    if (operation === 'get') {
      return (isVerified && auth?.uid === docId) || isSuperAdmin ? 'ALLOW' : 'PERMISSION_DENIED';
    }
    if (operation === 'create') {
      if (!isVerified || !auth || !incomingData) return 'PERMISSION_DENIED';
      if (!validWorkspaceShape(incomingData)) return 'PERMISSION_DENIED';
      if (
        (auth.uid === docId &&
          incomingData.ownerUid === auth.uid &&
          notBanned &&
          incomingData.createdAt === reqTime &&
          incomingData.updatedAt === reqTime) ||
        (isSuperAdmin &&
          incomingData.createdAt === reqTime &&
          incomingData.updatedAt === reqTime)
      ) {
        return 'ALLOW';
      }
      return 'PERMISSION_DENIED';
    }
    if (operation === 'update') {
      if (!isVerified || !auth || !existing || !incomingData) return 'PERMISSION_DENIED';
      if (!validWorkspaceShape(incomingData)) return 'PERMISSION_DENIED';
      const ownerImmutable =
        !('ownerUid' in existing) ||
        typeof existing.ownerUid !== 'string' ||
        existing.ownerUid === '' ||
        incomingData.ownerUid === existing.ownerUid;
      const existingHasCreatedAt =
        'createdAt' in existing && typeof existing.createdAt === 'string' && existing.createdAt.length > 0;
      const createdAtOk = existingHasCreatedAt
        ? incomingData.createdAt === existing.createdAt
        : incomingData.createdAt === reqTime;
      if (!ownerImmutable || !createdAtOk || incomingData.updatedAt !== reqTime) {
        return 'PERMISSION_DENIED';
      }
      if (
        (auth.uid === docId &&
          incomingData.ownerUid === auth.uid &&
          notBanned &&
          affectedKeysOnly(existing, incomingData, [
            'ownerUid',
            'onboarded',
            'student',
            'subjects',
            'topics',
            'schedule',
            'attempts',
            'achievements',
            'lastReoptimizationNote',
            'focusSessionsCompleted',
            'focusMinutesTotal',
            'aiStrategyBriefing',
            'createdAt',
            'updatedAt',
          ])) ||
        isSuperAdmin
      ) {
        return 'ALLOW';
      }
      return 'PERMISSION_DENIED';
    }
  }

  // 5. individual_bonuses
  if (collection === 'individual_bonuses') {
    const existing = db.individual_bonuses[docId] as unknown as Record<string, unknown> | undefined;
    if (operation === 'list') {
      if (isSuperAdmin) return 'ALLOW';
      // Unfiltered list check: every doc in collection must belong to auth.uid
      if (!isVerified || !auth) return 'PERMISSION_DENIED';
      const docs = Object.values(db.individual_bonuses);
      return docs.length > 0 && docs.every((b) => b.targetUserId === auth.uid)
        ? 'ALLOW'
        : 'PERMISSION_DENIED';
    }
    if (operation === 'create') {
      if (!isVerified || !auth || !incomingData) return 'PERMISSION_DENIED';
      if (!(isSuperAdmin || hasStaffPerm('canGrantBonuses'))) return 'PERMISSION_DENIED';
      const targetId = String(incomingData.targetUserId || '');
      if (!db.candidates[targetId]) return 'PERMISSION_DENIED';
      if (
        incomingData.grantedByUid !== auth.uid ||
        incomingData.acknowledged !== false ||
        incomingData.createdAt !== reqTime ||
        incomingData.updatedAt !== reqTime
      ) {
        return 'PERMISSION_DENIED';
      }
      return 'ALLOW';
    }
    if (operation === 'update') {
      if (!isVerified || !auth || !existing || !incomingData) return 'PERMISSION_DENIED';
      if (
        incomingData.targetUserId !== existing.targetUserId ||
        incomingData.grantedByUid !== existing.grantedByUid ||
        incomingData.createdAt !== existing.createdAt ||
        incomingData.updatedAt !== reqTime
      ) {
        return 'PERMISSION_DENIED';
      }
      const recipientAck =
        existing.targetUserId === auth.uid &&
        existing.acknowledged === false &&
        incomingData.acknowledged === true &&
        affectedKeysOnly(existing, incomingData, ['acknowledged', 'updatedAt']);
      return recipientAck || isSuperAdmin ? 'ALLOW' : 'PERMISSION_DENIED';
    }
  }

  // 6. staff_invites
  if (collection === 'staff_invites') {
    if (operation === 'create' || operation === 'update') {
      if (!isSuperAdmin) return 'PERMISSION_DENIED';
      if (incomingData) {
        if (
          typeof incomingData.adminPhone !== 'string' ||
          incomingData.adminPhone.trim().length < BLUEPRINT_LIMITS.phoneMin ||
          incomingData.adminPhone.length > BLUEPRINT_LIMITS.phoneMax ||
          typeof incomingData.targetEmail !== 'string' ||
          !incomingData.targetEmail.toLowerCase().endsWith('@gmail.com')
        ) {
          return 'PERMISSION_DENIED';
        }
      }
      return 'ALLOW';
    }
    if (operation === 'delete') {
      return isSuperAdmin ? 'ALLOW' : 'PERMISSION_DENIED';
    }
  }

  // 7. staff_members
  if (collection === 'staff_members') {
    const existing = db.staff_members[docId] as unknown as Record<string, unknown> | undefined;
    if (operation === 'create') {
      if (!isVerified || !auth || !incomingData || incomingData.userId !== docId) {
        return 'PERMISSION_DENIED';
      }
      if (isSuperAdmin) return 'ALLOW';
      if (auth.uid !== docId || incomingData.active !== true) return 'PERMISSION_DENIED';
      const invKey = String(incomingData.inviteKey || '');
      const invite = db.staff_invites[invKey];
      if (!invite || invite.status !== 'active' || invite.targetEmail !== auth.email) {
        return 'PERMISSION_DENIED';
      }
      if (
        incomingData.canPostUpdates !== invite.canPostUpdates ||
        incomingData.canGrantBonuses !== invite.canGrantBonuses ||
        incomingData.canBanUsers !== invite.canBanUsers
      ) {
        return 'PERMISSION_DENIED';
      }
      return 'ALLOW';
    }
    if (operation === 'update') {
      if (!isVerified || !auth || !existing || !incomingData) return 'PERMISSION_DENIED';
      if (
        incomingData.userId !== existing.userId ||
        incomingData.inviteKey !== existing.inviteKey ||
        incomingData.createdAt !== existing.createdAt ||
        incomingData.updatedAt !== reqTime
      ) {
        return 'PERMISSION_DENIED';
      }
      const allowedFields = [
        'displayName',
        'adminEmail',
        'adminPhone',
        'canPostUpdates',
        'canGrantBonuses',
        'canBanUsers',
        'active',
        'updatedAt',
      ];
      if (!affectedKeysOnly(existing, incomingData, allowedFields)) return 'PERMISSION_DENIED';
      if (isSuperAdmin) return 'ALLOW';
      if (auth.uid !== docId || incomingData.active !== true) return 'PERMISSION_DENIED';
      const invKey = String(existing.inviteKey || '');
      const invite = db.staff_invites[invKey];
      if (!invite || invite.status !== 'active' || invite.targetEmail !== auth.email) {
        return 'PERMISSION_DENIED';
      }
      if (
        incomingData.canPostUpdates !== invite.canPostUpdates ||
        incomingData.canGrantBonuses !== invite.canGrantBonuses ||
        incomingData.canBanUsers !== invite.canBanUsers
      ) {
        return 'PERMISSION_DENIED';
      }
      return 'ALLOW';
    }
  }

  // 4. global_updates
  if (collection === 'global_updates') {
    if (operation === 'create') {
      if (!isVerified || !auth || !incomingData) return 'PERMISSION_DENIED';
      const cat = incomingData.category as GlobalUpdateCategory;
      const validCats: GlobalUpdateCategory[] = [
        'exam_alert',
        'feature_update',
        'study_tip',
        'bonus_event',
      ];
      const bonusTypes: IndividualBonusType[] = ['xp_boost', 'xp_deduction'];
      void bonusTypes;
      if (!validCats.includes(cat) || incomingData.visibility !== 'public') {
        return 'PERMISSION_DENIED';
      }
      return isSuperAdmin || hasStaffPerm('canPostUpdates') ? 'ALLOW' : 'PERMISSION_DENIED';
    }
  }

  // 9. issued_credentials
  if (collection === 'issued_credentials') {
    const credentialsMap = db.issued_credentials ?? {};
    const existing = credentialsMap[docId] as unknown as Record<string, unknown> | undefined;
    if (operation === 'list') return 'PERMISSION_DENIED';
    if (operation === 'get') {
      return docId.length <= BLUEPRINT_LIMITS.serialCodeMax ? 'ALLOW' : 'PERMISSION_DENIED';
    }
    if (operation === 'create') {
      if (!isVerified || !auth || !incomingData || docId.length > BLUEPRINT_LIMITS.serialCodeMax) {
        return 'PERMISSION_DENIED';
      }
      if (
        'candidateEmail' in incomingData ||
        incomingData.credentialCode !== docId ||
        incomingData.createdAt !== reqTime ||
        incomingData.updatedAt !== reqTime
      ) {
        return 'PERMISSION_DENIED';
      }
      const ownerUid = String(incomingData.ownerUid || '');
      if (isSuperAdmin) return 'ALLOW';
      if (auth.uid === ownerUid && Boolean(db.candidates[ownerUid])) return 'ALLOW';
      return 'PERMISSION_DENIED';
    }
    if (operation === 'update') {
      if (!isVerified || !auth || !existing || !incomingData) return 'PERMISSION_DENIED';
      if (
        'candidateEmail' in incomingData ||
        incomingData.credentialCode !== existing.credentialCode ||
        incomingData.ownerUid !== existing.ownerUid ||
        incomingData.credentialType !== existing.credentialType ||
        incomingData.createdAt !== existing.createdAt ||
        incomingData.updatedAt !== reqTime
      ) {
        return 'PERMISSION_DENIED';
      }
      if (isSuperAdmin) return 'ALLOW';
      return auth.uid === existing.ownerUid ? 'ALLOW' : 'PERMISSION_DENIED';
    }
  }

  // 10. credential_verifications
  if (collection === 'credential_verifications') {
    const verificationsMap = db.credential_verifications ?? {};
    const credentialsMap = db.issued_credentials ?? {};
    const existing = verificationsMap[docId] as unknown as Record<string, unknown> | undefined;
    if (operation === 'get') {
      if (!isVerified || !auth || !existing) return 'PERMISSION_DENIED';
      return existing.targetUserId === auth.uid || isSuperAdmin ? 'ALLOW' : 'PERMISSION_DENIED';
    }
    if (operation === 'list') {
      if (isSuperAdmin) return 'ALLOW';
      if (!isVerified || !auth) return 'PERMISSION_DENIED';
      const docs = Object.values(verificationsMap);
      return docs.length > 0 && docs.every((v) => v.targetUserId === auth.uid)
        ? 'ALLOW'
        : 'PERMISSION_DENIED';
    }
    if (operation === 'create') {
      if (!isVerified || !auth || !incomingData) return 'PERMISSION_DENIED';
      const code = String(incomingData.credentialCode || '');
      const issued = credentialsMap[code];
      const gmail = String(incomingData.verifierGmail || '');
      const post = String(incomingData.verifierPost || '');
      if (
        !issued ||
        issued.ownerUid !== incomingData.targetUserId ||
        incomingData.verificationId !== docId ||
        incomingData.verifierUid !== auth.uid ||
        incomingData.acknowledged !== false ||
        !/^[^@\s]+@gmail\.com$/.test(gmail) ||
        !['teacher', 'company_executive', 'student'].includes(post) ||
        incomingData.createdAt !== reqTime ||
        incomingData.updatedAt !== reqTime
      ) {
        return 'PERMISSION_DENIED';
      }
      return 'ALLOW';
    }
    if (operation === 'update') {
      if (!isVerified || !auth || !existing || !incomingData) return 'PERMISSION_DENIED';
      if (
        incomingData.verificationId !== existing.verificationId ||
        incomingData.credentialCode !== existing.credentialCode ||
        incomingData.targetUserId !== existing.targetUserId ||
        incomingData.verifierUid !== existing.verifierUid ||
        incomingData.createdAt !== existing.createdAt ||
        incomingData.updatedAt !== reqTime
      ) {
        return 'PERMISSION_DENIED';
      }
      const ownerAck =
        existing.targetUserId === auth.uid &&
        existing.acknowledged === false &&
        incomingData.acknowledged === true &&
        affectedKeysOnly(existing, incomingData, ['acknowledged', 'updatedAt']);
      return ownerAck || isSuperAdmin ? 'ALLOW' : 'PERMISSION_DENIED';
    }
  }

  // 11. social_profiles
  if (collection === 'social_profiles') {
    const map = db.social_profiles ?? {};
    const existing = map[docId];
    if (operation === 'get') {
      return isVerified && isValidFirestoreId(docId) ? 'ALLOW' : 'PERMISSION_DENIED';
    }
    if (operation === 'list') {
      if (isSuperAdmin) return 'ALLOW';
      if (!isVerified) return 'PERMISSION_DENIED';
      const docs = Object.values(map);
      return docs.every((d) => typeof d.userId === 'string') ? 'ALLOW' : 'PERMISSION_DENIED';
    }
    if (operation === 'create') {
      if (!isVerified || !auth || !incomingData || auth.uid !== docId) return 'PERMISSION_DENIED';
      if (
        incomingData.userId !== auth.uid ||
        typeof incomingData.profileId !== 'string' ||
        !VALID_ID_REGEX.test(incomingData.profileId) ||
        typeof incomingData.displayName !== 'string' ||
        incomingData.displayName.length < 1 ||
        incomingData.displayName.length > 80 ||
        (incomingData.avatarVisibility !== 'world' &&
          incomingData.avatarVisibility !== 'connections_only') ||
        incomingData.createdAt !== reqTime ||
        incomingData.updatedAt !== reqTime
      ) {
        return 'PERMISSION_DENIED';
      }
      return 'ALLOW';
    }
    if (operation === 'update') {
      if (!isVerified || !auth || !existing || !incomingData || auth.uid !== docId) {
        return 'PERMISSION_DENIED';
      }
      if (
        incomingData.userId !== existing.userId ||
        incomingData.profileId !== existing.profileId ||
        incomingData.createdAt !== existing.createdAt ||
        incomingData.updatedAt !== reqTime ||
        !affectedKeysOnly(existing, incomingData, [
          'displayName',
          'avatarUrl',
          'avatarVisibility',
          'flexTier',
          'updatedAt',
        ])
      ) {
        return 'PERMISSION_DENIED';
      }
      return 'ALLOW';
    }
    if (operation === 'delete') {
      return isSuperAdmin ? 'ALLOW' : 'PERMISSION_DENIED';
    }
  }

  // 12. social_messages
  if (collection === 'social_messages') {
    const map = db.social_messages ?? {};
    const existing = map[docId];
    if (operation === 'get') {
      if (!isVerified || !auth || !existing) return 'PERMISSION_DENIED';
      const participants = Array.isArray(existing.participants) ? existing.participants : [];
      return existing.channelType === 'world' || participants.includes(auth.uid) || isSuperAdmin
        ? 'ALLOW'
        : 'PERMISSION_DENIED';
    }
    if (operation === 'list') {
      if (isSuperAdmin) return 'ALLOW';
      if (!isVerified || !auth) return 'PERMISSION_DENIED';
      const docs = Object.values(map);
      return docs.every((m) => {
        const participants = Array.isArray(m.participants) ? m.participants : [];
        return m.channelType === 'world' || participants.includes(auth.uid);
      })
        ? 'ALLOW'
        : 'PERMISSION_DENIED';
    }
    if (operation === 'create') {
      if (!isVerified || !auth || !incomingData) return 'PERMISSION_DENIED';
      const cand = db.candidates[auth.uid];
      if (cand && cand.banned === true) return 'PERMISSION_DENIED';
      const participants = Array.isArray(incomingData.participants)
        ? incomingData.participants
        : [];
      if (
        incomingData.id !== docId ||
        incomingData.senderId !== auth.uid ||
        incomingData.createdAt !== reqTime ||
        typeof incomingData.text !== 'string' ||
        incomingData.text.length > 500 ||
        participants.length < 1 ||
        participants.length > 2
      ) {
        return 'PERMISSION_DENIED';
      }
      if (incomingData.channelType === 'world') {
        return incomingData.channelId === 'world' ? 'ALLOW' : 'PERMISSION_DENIED';
      }
      if (incomingData.channelType === 'dm') {
        return participants.length === 2 && participants.includes(auth.uid)
          ? 'ALLOW'
          : 'PERMISSION_DENIED';
      }
      return 'PERMISSION_DENIED';
    }
    if (operation === 'update') {
      return 'PERMISSION_DENIED';
    }
    if (operation === 'delete') {
      return isSuperAdmin ? 'ALLOW' : 'PERMISSION_DENIED';
    }
  }

  // 13. social_connections
  if (collection === 'social_connections') {
    const map = db.social_connections ?? {};
    const existing = map[docId];
    if (operation === 'get') {
      if (!isVerified || !auth || !existing) return 'PERMISSION_DENIED';
      const participants = Array.isArray(existing.participants) ? existing.participants : [];
      return participants.includes(auth.uid) || isSuperAdmin ? 'ALLOW' : 'PERMISSION_DENIED';
    }
    if (operation === 'list') {
      if (isSuperAdmin) return 'ALLOW';
      if (!isVerified || !auth) return 'PERMISSION_DENIED';
      const docs = Object.values(map);
      return docs.every((c) => {
        const participants = Array.isArray(c.participants) ? c.participants : [];
        return participants.includes(auth.uid);
      })
        ? 'ALLOW'
        : 'PERMISSION_DENIED';
    }
    if (operation === 'create') {
      if (!isVerified || !auth || !incomingData) return 'PERMISSION_DENIED';
      const participants = Array.isArray(incomingData.participants)
        ? incomingData.participants
        : [];
      if (
        incomingData.id !== docId ||
        incomingData.requesterId !== auth.uid ||
        incomingData.recipientId === auth.uid ||
        incomingData.status !== 'pending' ||
        participants.length !== 2 ||
        !participants.includes(incomingData.requesterId) ||
        !participants.includes(incomingData.recipientId) ||
        incomingData.createdAt !== reqTime ||
        incomingData.updatedAt !== reqTime
      ) {
        return 'PERMISSION_DENIED';
      }
      return 'ALLOW';
    }
    if (operation === 'update') {
      if (!isVerified || !auth || !existing || !incomingData) return 'PERMISSION_DENIED';
      if (
        incomingData.id !== existing.id ||
        incomingData.requesterId !== existing.requesterId ||
        incomingData.recipientId !== existing.recipientId ||
        JSON.stringify(incomingData.participants) !== JSON.stringify(existing.participants) ||
        incomingData.createdAt !== existing.createdAt ||
        incomingData.updatedAt !== reqTime
      ) {
        return 'PERMISSION_DENIED';
      }
      if (isSuperAdmin) return 'ALLOW';
      if (
        existing.status === 'pending' &&
        incomingData.status === 'connected' &&
        existing.recipientId === auth.uid &&
        affectedKeysOnly(existing, incomingData, [
          'status',
          'recipientAvatarUrl',
          'recipientAvatarVisibility',
          'updatedAt',
        ])
      ) {
        return 'ALLOW';
      }
      return 'PERMISSION_DENIED';
    }
    if (operation === 'delete') {
      return isSuperAdmin ? 'ALLOW' : 'PERMISSION_DENIED';
    }
  }

  return 'PERMISSION_DENIED';
}
