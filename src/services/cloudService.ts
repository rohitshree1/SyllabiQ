import {
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import {
  collection,
  deleteDoc,
  doc,
  getDoc,
  getDocs,
  limit,
  onSnapshot,
  query,
  serverTimestamp,
  setDoc,
  Timestamp,
  updateDoc,
  where,
  type Unsubscribe,
} from 'firebase/firestore';
import {
  auth,
  clearCloudTokenDiagnostic,
  db,
  googleProvider,
  handleFirestoreError,
  microsoftProvider,
  OperationType,
  validateFirebaseUserSession,
} from '../firebase';
import { isTransientFirestoreOfflineError } from '../utils/firebaseConnectionGuard';
import type {
  AdminDigestEntry,
  AppState,
  AuthenticatedAccount,
  CandidateSummaryDoc,
  CredentialVerificationNotice,
  FlexCardRarityTier,
  GlobalUpdateCategory,
  GlobalUpdateDoc,
  IndividualBonusDoc,
  IndividualBonusType,
  IssuedCredentialDoc,
  StaffAccessProfile,
  StaffInviteDoc,
  VerifierPostRole,
} from '../types';
import {
  BLUEPRINT_LIMITS,
  BOOTSTRAPPED_SUPER_ADMIN_EMAIL,
  buildSanitizedCandidateSummary,
  buildSanitizedWorkspacePayload,
  clampInt,
  emailToInviteKey,
  sanitizeText,
  stripUndefinedDeep,
} from '../utils/firestoreValidators';

function timestampToISO(val: unknown): string {
  if (val instanceof Timestamp) {
    return val.toDate().toISOString();
  }
  if (typeof val === 'string' && val) {
    return val;
  }
  return new Date().toISOString();
}

function parseCandidateSummaryFromFirestore(
  fallbackUid: string,
  d: Record<string, unknown>,
  pii?: { email?: string; authProvider?: 'google.com' | 'microsoft.com' },
  fallbackDisplayName = 'Scholar'
): CandidateSummaryDoc {
  const contactEmail = d.contactEmail ? String(d.contactEmail) : undefined;
  return {
    ownerUid: String(d.ownerUid || fallbackUid),
    displayName: String(d.displayName || fallbackDisplayName),
    avatarUrl: typeof d.avatarUrl === 'string' && d.avatarUrl ? d.avatarUrl : undefined,
    email: pii?.email || contactEmail,
    contactEmail,
    phoneNumber: d.phoneNumber ? String(d.phoneNumber) : undefined,
    notifyGmailOptIn: d.notifyGmailOptIn !== undefined ? Boolean(d.notifyGmailOptIn) : undefined,
    notifyWhatsappOptIn:
      d.notifyWhatsappOptIn !== undefined ? Boolean(d.notifyWhatsappOptIn) : undefined,
    authProvider: pii?.authProvider,
    institutionType:
      d.institutionType === 'school'
        ? 'school'
        : d.institutionType === 'university'
        ? 'university'
        : undefined,
    boardOrUniversity: String(d.boardOrUniversity || ''),
    examName: String(d.examName || ''),
    examDate: String(d.examDate || ''),
    dailyStudyHours: d.dailyStudyHours !== undefined ? Number(d.dailyStudyHours) : undefined,
    readinessPercent: Number(d.readinessPercent || 0),
    overallRatingOutOf10: Number(d.overallRatingOutOf10 || 0),
    completedChapters: Number(d.completedChapters || 0),
    totalChapters: Number(d.totalChapters || 0),
    attemptsCount: Number(d.attemptsCount || 0),
    focusMinutesLogged: Number(d.focusMinutesLogged || 0),
    bonusPoints: Number(d.bonusPoints || 0),
    deductedPoints: d.deductedPoints !== undefined ? Number(d.deductedPoints) : undefined,
    xpPoints: d.xpPoints !== undefined ? Number(d.xpPoints) : undefined,
    flexTier: d.flexTier ? (String(d.flexTier) as FlexCardRarityTier) : undefined,
    lastActiveDate: d.lastActiveDate ? String(d.lastActiveDate) : undefined,
    inactiveDays: d.inactiveDays !== undefined ? Number(d.inactiveDays) : undefined,
    activeLearnerActive:
      d.activeLearnerActive !== undefined ? Boolean(d.activeLearnerActive) : undefined,
    unlockedBadges: Array.isArray(d.unlockedBadges)
      ? d.unlockedBadges.map((b) => String(b)).slice(0, BLUEPRINT_LIMITS.badgeListMax)
      : undefined,
    weakTopics: Array.isArray(d.weakTopics)
      ? d.weakTopics.map((t) => String(t)).slice(0, BLUEPRINT_LIMITS.weakTopicsMax)
      : undefined,
    banned: Boolean(d.banned),
    banReason: String(d.banReason || ''),
    adsEnabled: d.adsEnabled !== undefined ? Boolean(d.adsEnabled) : false,
    createdAt: timestampToISO(d.createdAt),
    updatedAt: timestampToISO(d.updatedAt),
  };
}

export function mapFirebaseUserToAccount(user: User): AuthenticatedAccount {
  const providerRaw = user.providerData[0]?.providerId || 'google.com';
  const providerId: 'google.com' | 'microsoft.com' =
    providerRaw === 'microsoft.com' ? 'microsoft.com' : 'google.com';

  return {
    uid: user.uid,
    email: user.email || '',
    displayName: user.displayName || user.email?.split('@')[0] || 'Scholar',
    photoURL: user.photoURL || undefined,
    providerId,
    emailVerified: Boolean(user.emailVerified),
  };
}

export async function signInWithGooglePopup(): Promise<AuthenticatedAccount> {
  const cred = await signInWithPopup(auth, googleProvider);
  clearCloudTokenDiagnostic();
  return mapFirebaseUserToAccount(cred.user);
}

export async function signInWithMicrosoftPopup(): Promise<AuthenticatedAccount> {
  const cred = await signInWithPopup(auth, microsoftProvider);
  clearCloudTokenDiagnostic();
  return mapFirebaseUserToAccount(cred.user);
}

export async function signOutAccount(): Promise<void> {
  await signOut(auth);
}

/**
 * Resolves staff RBAC permissions for the signed-in user, automatically claiming any pending StaffInvite
 */
export async function resolveStaffAccessForUser(user: User): Promise<StaffAccessProfile> {
  const normalizedEmail = (user.email || '').trim().toLowerCase();

  if (user.emailVerified && normalizedEmail === BOOTSTRAPPED_SUPER_ADMIN_EMAIL) {
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
    };
  }

  if (!user.emailVerified || !normalizedEmail) {
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

  const inviteKey = emailToInviteKey(normalizedEmail);
  const invitePath = `staff_invites/${inviteKey}`;
  const memberPath = `staff_members/${user.uid}`;

  try {
    // Check if an active invite exists for this verified email
    const inviteSnap = await getDoc(doc(db, 'staff_invites', inviteKey));
    if (!inviteSnap.exists()) {
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

    const inv = inviteSnap.data() as StaffInviteDoc;
    if (inv.status !== 'active' || inv.targetEmail.toLowerCase() !== normalizedEmail) {
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

    const cleanDisplayName = sanitizeText(
      inv.displayName || user.displayName,
      BLUEPRINT_LIMITS.displayNameMax,
      'Sub-Admin'
    );
    const cleanAdminPhone = sanitizeText(inv.adminPhone || '', BLUEPRINT_LIMITS.phoneMax, '');

    // Ensure /staff_members/{uid} exists AND mirrors exact minimal-to-maximum permissions + contact from /staff_invites/{inviteKey}
    const memberRef = doc(db, 'staff_members', user.uid);
    const memberSnap = await getDoc(memberRef);
    if (!memberSnap.exists()) {
      try {
        await setDoc(memberRef, {
          userId: user.uid,
          inviteKey,
          displayName: cleanDisplayName,
          adminEmail: normalizedEmail,
          adminPhone: cleanAdminPhone,
          role: 'sub_admin',
          canPostUpdates: Boolean(inv.canPostUpdates),
          canGrantBonuses: Boolean(inv.canGrantBonuses),
          canBanUsers: Boolean(inv.canBanUsers),
          active: true,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } catch (writeErr) {
        handleFirestoreError(writeErr, OperationType.CREATE, memberPath);
      }
    } else {
      const m = memberSnap.data();
      const needsSync =
        Boolean(m.canPostUpdates) !== Boolean(inv.canPostUpdates) ||
        Boolean(m.canGrantBonuses) !== Boolean(inv.canGrantBonuses) ||
        Boolean(m.canBanUsers) !== Boolean(inv.canBanUsers) ||
        Boolean(m.active) !== true ||
        String(m.displayName || '') !== cleanDisplayName ||
        String(m.adminEmail || '') !== normalizedEmail ||
        String(m.adminPhone || '') !== cleanAdminPhone;

      if (needsSync) {
        try {
          await updateDoc(memberRef, {
            displayName: cleanDisplayName,
            adminEmail: normalizedEmail,
            adminPhone: cleanAdminPhone,
            canPostUpdates: Boolean(inv.canPostUpdates),
            canGrantBonuses: Boolean(inv.canGrantBonuses),
            canBanUsers: Boolean(inv.canBanUsers),
            active: true,
            updatedAt: serverTimestamp(),
          });
        } catch (updateErr) {
          handleFirestoreError(updateErr, OperationType.UPDATE, memberPath);
        }
      }
    }

    const enabledCount =
      (inv.canPostUpdates ? 1 : 0) +
      (inv.canGrantBonuses ? 1 : 0) +
      (inv.canBanUsers ? 1 : 0);

    const roleLabel =
      enabledCount === 3
        ? 'Maximum Delegated Admin'
        : enabledCount === 1
        ? 'Minimal Delegated Admin'
        : 'Delegated Admin';

    return {
      tier: 'sub_admin',
      roleLabel,
      adminEmail: normalizedEmail,
      adminPhone: cleanAdminPhone,
      canPostUpdates: Boolean(inv.canPostUpdates),
      canGrantBonuses: Boolean(inv.canGrantBonuses),
      canBanUsers: Boolean(inv.canBanUsers),
      canManageAdmins: false,
      canSendOutreach: true,
    };
  } catch (error) {
    if (
      error instanceof Error &&
      (error.message.includes('Missing or insufficient permissions') ||
        error.message.includes('PERMISSION_DENIED'))
    ) {
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
    handleFirestoreError(error, OperationType.GET, invitePath);
  }
}

/**
 * Hydrates or initializes a candidate's private PII, summary telemetry, and study workspace on login
 */
export async function hydrateOrBootstrapCandidateCloud(
  user: User,
  localState: AppState
): Promise<{
  summary: CandidateSummaryDoc;
  workspaceState: AppState | null;
}> {
  const uid = user.uid;
  const providerId: 'google.com' | 'microsoft.com' =
    user.providerData[0]?.providerId === 'microsoft.com' ? 'microsoft.com' : 'google.com';

  // 1. Upsert isolated PII record (/users_private/{uid})
  const privRef = doc(db, 'users_private', uid);
  const cleanAuthEmail = sanitizeText(
    user.email,
    BLUEPRINT_LIMITS.emailMax,
    'user@verified.local'
  );
  try {
    const privSnap = await getDoc(privRef);
    if (!privSnap.exists()) {
      await setDoc(privRef, {
        ownerUid: uid,
        email: cleanAuthEmail,
        authProvider: providerId,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const existingPriv = privSnap.data();
      const privCreatedAt =
        existingPriv.createdAt instanceof Timestamp ? existingPriv.createdAt : serverTimestamp();
      await setDoc(privRef, {
        ownerUid: uid,
        email: cleanAuthEmail,
        authProvider: providerId,
        createdAt: privCreatedAt,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `users_private/${uid}`);
  }

  // 2. Read or create /candidates/{uid}
  const candRef = doc(db, 'candidates', uid);
  let summaryDoc: CandidateSummaryDoc;

  try {
    const candSnap = await getDoc(candRef);
    if (!candSnap.exists()) {
      const enrichedState: AppState = {
        ...localState,
        student: {
          ...localState.student,
          email: localState.student.email || user.email || '',
        },
      };
      const baseSummary = buildSanitizedCandidateSummary({
        ownerUid: uid,
        fallbackName: user.displayName || 'Scholar',
        state: enrichedState,
        existingBonusPoints: 0,
        existingBanned: false,
        existingBanReason: '',
        existingAdsEnabled: false,
      });
      await setDoc(candRef, {
        ...stripUndefinedDeep(baseSummary),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
      summaryDoc = {
        ...baseSummary,
        email: user.email || baseSummary.contactEmail,
        authProvider: providerId,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      };
    } else {
      summaryDoc = parseCandidateSummaryFromFirestore(
        uid,
        candSnap.data(),
        { email: user.email || undefined, authProvider: providerId },
        user.displayName || 'Scholar'
      );
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `candidates/${uid}`);
  }

  // If account is banned, do not write workspace; return summary immediately so UI locks cleanly
  if (summaryDoc.banned) {
    return { summary: summaryDoc, workspaceState: null };
  }

  // 3. Read /workspaces/{uid} — restore cloud syllabus if present, otherwise push onboarded local state
  const wsRef = doc(db, 'workspaces', uid);
  try {
    const wsSnap = await getDoc(wsRef);
    if (wsSnap.exists()) {
      const ws = wsSnap.data();
      if (ws && ws.onboarded && Array.isArray(ws.topics)) {
        const hydrated: AppState = {
          onboarded: Boolean(ws.onboarded),
          student: ws.student,
          subjects: ws.subjects || [],
          topics: ws.topics || [],
          schedule: ws.schedule || [],
          attempts: ws.attempts || [],
          achievements: ws.achievements || [],
          lastReoptimizationNote: ws.lastReoptimizationNote || undefined,
          focusSessionsCompleted: Number(ws.focusSessionsCompleted || 0),
          focusMinutesTotal: Number(ws.focusMinutesTotal || 0),
        };
        return { summary: summaryDoc, workspaceState: hydrated };
      }
    }

    if (localState.onboarded) {
      const wsPayload = buildSanitizedWorkspacePayload(uid, localState);
      if (!wsSnap.exists()) {
        await setDoc(wsRef, {
          ...wsPayload,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      }
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `workspaces/${uid}`);
  }

  return { summary: summaryDoc, workspaceState: null };
}

/**
 * Persists changes to a signed-in candidate's study workspace and telemetry summary.
 * Uses existence-checked, schema-clean full-document writes while strictly preserving
 * server-authoritative protected fields (ownerUid, createdAt, bonusPoints, banned, banReason, adsEnabled).
 */
export async function syncCandidateWorkspaceToCloud(params: {
  uid: string;
  fallbackName: string;
  state: AppState;
  currentSummary: CandidateSummaryDoc | null;
}): Promise<void> {
  const { uid, fallbackName, state, currentSummary } = params;
  if (currentSummary?.banned) return;

  const candRef = doc(db, 'candidates', uid);
  const wsRef = doc(db, 'workspaces', uid);

  let candSnap;
  try {
    candSnap = await getDoc(candRef);
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `candidates/${uid}`);
  }

  if (!candSnap.exists()) {
    const createSummary = buildSanitizedCandidateSummary({
      ownerUid: uid,
      fallbackName,
      state,
      existingBonusPoints: 0,
      existingBanned: false,
      existingBanReason: '',
      existingAdsEnabled: false,
    });
    try {
      await setDoc(candRef, {
        ...stripUndefinedDeep(createSummary),
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.CREATE, `candidates/${uid}`);
    }
  } else {
    const existingData = candSnap.data();
    if (Boolean(existingData.banned)) {
      return;
    }

    const existingBonusPoints =
      typeof existingData.bonusPoints === 'number' && Number.isFinite(existingData.bonusPoints)
        ? Math.max(0, Math.min(BLUEPRINT_LIMITS.totalBonusPointsMax, existingData.bonusPoints))
        : 0;
    const hasExistingDeductedKey =
      'deductedPoints' in existingData && typeof existingData.deductedPoints === 'number';
    const existingDeductedPoints =
      hasExistingDeductedKey && Number.isFinite(existingData.deductedPoints)
        ? Math.max(0, Math.min(BLUEPRINT_LIMITS.totalBonusPointsMax, existingData.deductedPoints))
        : 0;
    const existingBanReason =
      typeof existingData.banReason === 'string'
        ? existingData.banReason.slice(0, BLUEPRINT_LIMITS.banReasonMax)
        : '';
    const hasExistingAdsKey =
      'adsEnabled' in existingData && typeof existingData.adsEnabled === 'boolean';
    const preservedCreatedAt =
      existingData.createdAt instanceof Timestamp ? existingData.createdAt : serverTimestamp();
    const preservedOwnerUid =
      typeof existingData.ownerUid === 'string' && existingData.ownerUid
        ? existingData.ownerUid
        : uid;

    const baseCleanSummary = buildSanitizedCandidateSummary({
      ownerUid: preservedOwnerUid,
      fallbackName,
      state,
      existingBonusPoints: Math.trunc(existingBonusPoints),
      existingDeductedPoints: Math.trunc(existingDeductedPoints),
      existingBanned: false,
      existingBanReason,
      existingAdsEnabled: hasExistingAdsKey ? Boolean(existingData.adsEnabled) : false,
    });

    const sanitizedSummaryFields: Record<string, unknown> = {
      ...stripUndefinedDeep(baseCleanSummary),
      bonusPoints: existingBonusPoints,
    };
    if (hasExistingDeductedKey) {
      sanitizedSummaryFields.deductedPoints = existingDeductedPoints;
    } else {
      delete sanitizedSummaryFields.deductedPoints;
    }
    if (!hasExistingAdsKey) {
      delete sanitizedSummaryFields.adsEnabled;
    }

    try {
      await setDoc(candRef, {
        ...sanitizedSummaryFields,
        createdAt: preservedCreatedAt,
        updatedAt: serverTimestamp(),
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.UPDATE, `candidates/${uid}`);
    }
  }

  const wsPayload = buildSanitizedWorkspacePayload(uid, state);
  try {
    const snap = await getDoc(wsRef);
    if (!snap.exists()) {
      await setDoc(wsRef, {
        ...wsPayload,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      const existingWs = snap.data();
      const wsCreatedAt =
        existingWs.createdAt instanceof Timestamp ? existingWs.createdAt : serverTimestamp();
      await setDoc(wsRef, {
        ...wsPayload,
        createdAt: wsCreatedAt,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `workspaces/${uid}`);
  }
}

/**
 * Live listener on candidate account summary (for instant ban enforcement & live bonus point drops)
 */
export function subscribeToOwnCandidateSummary(
  uid: string,
  onUpdate: (summary: CandidateSummaryDoc) => void
): Unsubscribe {
  const path = `candidates/${uid}`;
  return onSnapshot(
    doc(db, 'candidates', uid),
    (snap) => {
      if (!snap.exists()) return;
      onUpdate(parseCandidateSummaryFromFirestore(uid, snap.data()));
    },
    (error) => {
      if (isTransientFirestoreOfflineError(error)) {
        if (auth.currentUser) {
          void validateFirebaseUserSession(auth.currentUser, true);
        }
        return;
      }
      handleFirestoreError(error, OperationType.GET, path);
    }
  );
}

/**
 * Live listener on public Global Updates feed
 */
export function subscribeToGlobalUpdates(
  onUpdate: (updates: GlobalUpdateDoc[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'global_updates'),
    where('visibility', '==', 'public'),
    limit(25)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: GlobalUpdateDoc[] = snap.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          authorUid: String(d.authorUid || ''),
          authorName: String(d.authorName || 'SyllabiQ Admin'),
          authorRoleLabel: String(d.authorRoleLabel || 'Admin'),
          title: String(d.title || ''),
          body: String(d.body || ''),
          category: (d.category as GlobalUpdateCategory) || 'feature_update',
          visibility: 'public',
          pinned: Boolean(d.pinned),
          createdAt: timestampToISO(d.createdAt),
          updatedAt: timestampToISO(d.updatedAt),
        };
      });

      list.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.createdAt.localeCompare(a.createdAt);
      });

      onUpdate(list);
    },
    (error) => {
      if (isTransientFirestoreOfflineError(error)) {
        if (auth.currentUser) {
          void validateFirebaseUserSession(auth.currentUser, true);
        }
        return;
      }
      handleFirestoreError(error, OperationType.LIST, 'global_updates');
    }
  );
}

/**
 * Live listener on personal Individual Bonuses granted to a candidate
 */
export function subscribeToCandidateBonuses(
  uid: string,
  onUpdate: (bonuses: IndividualBonusDoc[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'individual_bonuses'),
    where('targetUserId', '==', uid),
    limit(30)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: IndividualBonusDoc[] = snap.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          targetUserId: String(d.targetUserId || ''),
          targetName: String(d.targetName || ''),
          grantedByUid: String(d.grantedByUid || ''),
          grantedByName: String(d.grantedByName || 'Admin'),
          bonusTitle: String(d.bonusTitle || ''),
          bonusType: (d.bonusType as IndividualBonusType) || 'xp_boost',
          pointsAwarded: Number(d.pointsAwarded || 0),
          message: String(d.message || ''),
          acknowledged: Boolean(d.acknowledged),
          createdAt: timestampToISO(d.createdAt),
          updatedAt: timestampToISO(d.updatedAt),
        };
      });
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onUpdate(list);
    },
    (error) => {
      if (isTransientFirestoreOfflineError(error)) {
        if (auth.currentUser) {
          void validateFirebaseUserSession(auth.currentUser, true);
        }
        return;
      }
      handleFirestoreError(error, OperationType.LIST, 'individual_bonuses');
    }
  );
}

export async function acknowledgeIndividualBonusInCloud(bonusId: string): Promise<void> {
  try {
    await updateDoc(doc(db, 'individual_bonuses', bonusId), {
      acknowledged: true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `individual_bonuses/${bonusId}`);
  }
}

// ============================================================================
// Admin & Delegated Sub-Admin Operations
// ============================================================================

export async function publishGlobalUpdateInCloud(params: {
  authorUid: string;
  authorName: string;
  authorRoleLabel: string;
  title: string;
  body: string;
  category: GlobalUpdateCategory;
  pinned: boolean;
}): Promise<void> {
  const updateId = `upd_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  try {
    await setDoc(doc(db, 'global_updates', updateId), {
      authorUid: params.authorUid,
      authorName: sanitizeText(params.authorName, BLUEPRINT_LIMITS.displayNameMax, 'Admin'),
      authorRoleLabel: sanitizeText(params.authorRoleLabel, BLUEPRINT_LIMITS.roleLabelMax, 'Admin'),
      title: sanitizeText(params.title, BLUEPRINT_LIMITS.updateTitleMax, 'Platform Update'),
      body: sanitizeText(params.body, BLUEPRINT_LIMITS.updateBodyMax, ''),
      category: params.category,
      visibility: 'public',
      pinned: Boolean(params.pinned),
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `global_updates/${updateId}`);
  }
}

export async function togglePinGlobalUpdateInCloud(
  updateId: string,
  pinned: boolean
): Promise<void> {
  try {
    await updateDoc(doc(db, 'global_updates', updateId), {
      pinned: Boolean(pinned),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `global_updates/${updateId}`);
  }
}

export async function deleteGlobalUpdateInCloud(updateId: string): Promise<void> {
  try {
    await deleteDoc(doc(db, 'global_updates', updateId));
  } catch (error) {
    handleFirestoreError(error, OperationType.DELETE, `global_updates/${updateId}`);
  }
}

export async function fetchCandidatesForStaff(params: {
  staffUid: string;
  isSuperAdmin: boolean;
}): Promise<CandidateSummaryDoc[]> {
  if (params.isSuperAdmin) {
    try {
      const [candSnap, privSnap] = await Promise.all([
        getDocs(query(collection(db, 'candidates'), limit(50))),
        getDocs(query(collection(db, 'users_private'), limit(50))),
      ]);

      const piiByUid = new Map<
        string,
        { email: string; authProvider: 'google.com' | 'microsoft.com' }
      >();
      for (const pDoc of privSnap.docs) {
        const pd = pDoc.data();
        const uid = String(pd.ownerUid || pDoc.id);
        piiByUid.set(uid, {
          email: String(pd.email || ''),
          authProvider: pd.authProvider === 'microsoft.com' ? 'microsoft.com' : 'google.com',
        });
      }

      const roster: CandidateSummaryDoc[] = candSnap.docs.map((docSnap) => {
        const d = docSnap.data();
        const ownerUid = String(d.ownerUid || docSnap.id);
        const pii = piiByUid.get(ownerUid);
        return parseCandidateSummaryFromFirestore(ownerUid, d, pii);
      });

      // Sync bounded O(1) AdminDigest overview so delegated Sub-Admins also receive full candidate academic + outreach profiles without O(n) list queries
      const digestRef = doc(db, 'admin_digests', 'overview');
      const entries: AdminDigestEntry[] = stripUndefinedDeep(
        roster.slice(0, BLUEPRINT_LIMITS.digestEntriesMaxCount).map((c) => ({
          ownerUid: c.ownerUid,
          displayName: c.displayName,
          email: c.email || c.contactEmail || '',
          contactEmail: c.contactEmail || c.email || '',
          phoneNumber: c.phoneNumber || '',
          notifyGmailOptIn: Boolean(c.notifyGmailOptIn),
          notifyWhatsappOptIn: Boolean(c.notifyWhatsappOptIn),
          institutionType: c.institutionType || 'university',
          boardOrUniversity: c.boardOrUniversity,
          examName: c.examName,
          examDate: c.examDate,
          dailyStudyHours: c.dailyStudyHours ?? 4,
          readinessPercent: c.readinessPercent,
          overallRatingOutOf10: c.overallRatingOutOf10,
          completedChapters: c.completedChapters,
          totalChapters: c.totalChapters,
          attemptsCount: c.attemptsCount,
          focusMinutesLogged: c.focusMinutesLogged,
          bonusPoints: c.bonusPoints,
          deductedPoints: c.deductedPoints ?? 0,
          xpPoints: c.xpPoints ?? 0,
          flexTier: c.flexTier ?? 'Common Slate',
          lastActiveDate: c.lastActiveDate ?? '',
          inactiveDays: c.inactiveDays ?? 0,
          activeLearnerActive: Boolean(c.activeLearnerActive ?? true),
          unlockedBadges: c.unlockedBadges ?? [],
          weakTopics: c.weakTopics ?? [],
          banned: c.banned,
          banReason: c.banReason,
        }))
      );

      const digestSnap = await getDoc(digestRef);
      if (!digestSnap.exists()) {
        await setDoc(digestRef, {
          digestId: 'overview',
          entries,
          updatedByUid: params.staffUid,
          createdAt: serverTimestamp(),
          updatedAt: serverTimestamp(),
        });
      } else {
        await updateDoc(digestRef, {
          entries,
          updatedByUid: params.staffUid,
          updatedAt: serverTimestamp(),
        });
      }

      return roster;
    } catch (error) {
      handleFirestoreError(error, OperationType.LIST, 'candidates');
    }
  }

  // Sub-Admin reads O(1) single-doc AdminDigest containing full academic + outreach profiles
  try {
    const digestSnap = await getDoc(doc(db, 'admin_digests', 'overview'));
    if (!digestSnap.exists()) return [];
    const entries = (digestSnap.data().entries || []) as AdminDigestEntry[];
    return entries.map((e) => ({
      ...e,
      examDate: e.examDate || '',
      completedChapters: e.completedChapters ?? 0,
      totalChapters: e.totalChapters ?? 0,
      focusMinutesLogged: e.focusMinutesLogged ?? 0,
      adsEnabled: false,
    }));
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, 'admin_digests/overview');
  }
}

export async function lookupSingleCandidateForStaff(
  targetUid: string,
  _isSuperAdmin = false
): Promise<CandidateSummaryDoc | null> {
  const cleanId = targetUid.trim();
  if (!cleanId) return null;
  try {
    const snap = await getDoc(doc(db, 'candidates', cleanId));
    if (!snap.exists()) return null;
    const d = snap.data();

    let email: string | undefined;
    let authProvider: 'google.com' | 'microsoft.com' | undefined;
    try {
      const privSnap = await getDoc(doc(db, 'users_private', cleanId));
      if (privSnap.exists()) {
        const pd = privSnap.data();
        email = String(pd.email || '');
        authProvider = pd.authProvider === 'microsoft.com' ? 'microsoft.com' : 'google.com';
      }
    } catch {
      // Fallback to candidate contactEmail if users_private is unavailable
    }

    return parseCandidateSummaryFromFirestore(cleanId, d, { email, authProvider });
  } catch (error) {
    handleFirestoreError(error, OperationType.GET, `candidates/${cleanId}`);
  }
}

export async function setCandidateBanInCloud(params: {
  targetUid: string;
  banned: boolean;
  banReason: string;
}): Promise<void> {
  try {
    await updateDoc(doc(db, 'candidates', params.targetUid), {
      banned: Boolean(params.banned),
      banReason: params.banned
        ? sanitizeText(
            params.banReason,
            BLUEPRINT_LIMITS.banReasonMax,
            'Suspended by platform administrator'
          )
        : '',
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `candidates/${params.targetUid}`);
  }
}

export async function grantIndividualBonusInCloud(params: {
  targetCandidate: CandidateSummaryDoc;
  grantedByUid: string;
  grantedByName: string;
  bonusTitle: string;
  bonusType: IndividualBonusType;
  pointsAwarded: number;
  message: string;
}): Promise<void> {
  const bonusId = `bon_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
  const clampedPoints = clampInt(
    params.pointsAwarded,
    0,
    BLUEPRINT_LIMITS.bonusPointsMaxPerGrant
  );

  const isDeduction = params.bonusType === 'xp_deduction';
  const defaultTitle = isDeduction ? 'Admin XP Deduction Notice' : 'Special Distinction Bonus';
  const defaultMessage = isDeduction
    ? 'XP deducted by platform administrator.'
    : 'Keep pushing!';

  try {
    await setDoc(doc(db, 'individual_bonuses', bonusId), {
      targetUserId: params.targetCandidate.ownerUid,
      targetName: sanitizeText(
        params.targetCandidate.displayName,
        BLUEPRINT_LIMITS.displayNameMax,
        'Scholar'
      ),
      grantedByUid: params.grantedByUid,
      grantedByName: sanitizeText(
        params.grantedByName,
        BLUEPRINT_LIMITS.displayNameMax,
        'SyllabiQ Admin'
      ),
      bonusTitle: sanitizeText(
        params.bonusTitle,
        BLUEPRINT_LIMITS.bonusTitleMax,
        defaultTitle
      ),
      bonusType: params.bonusType,
      pointsAwarded: clampedPoints,
      message: sanitizeText(params.message, BLUEPRINT_LIMITS.bonusMessageMax, defaultMessage),
      acknowledged: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.CREATE, `individual_bonuses/${bonusId}`);
  }

  if (clampedPoints > 0) {
    if (isDeduction) {
      const nextDeducted = clampInt(
        (params.targetCandidate.deductedPoints || 0) + clampedPoints,
        0,
        BLUEPRINT_LIMITS.totalBonusPointsMax
      );
      try {
        await updateDoc(doc(db, 'candidates', params.targetCandidate.ownerUid), {
          deductedPoints: nextDeducted,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(
          error,
          OperationType.UPDATE,
          `candidates/${params.targetCandidate.ownerUid}`
        );
      }
    } else {
      const nextTotal = clampInt(
        (params.targetCandidate.bonusPoints || 0) + clampedPoints,
        0,
        BLUEPRINT_LIMITS.totalBonusPointsMax
      );
      try {
        await updateDoc(doc(db, 'candidates', params.targetCandidate.ownerUid), {
          bonusPoints: nextTotal,
          updatedAt: serverTimestamp(),
        });
      } catch (error) {
        handleFirestoreError(
          error,
          OperationType.UPDATE,
          `candidates/${params.targetCandidate.ownerUid}`
        );
      }
    }
  }
}

export async function fetchStaffInvitesInCloud(): Promise<StaffInviteDoc[]> {
  try {
    const snap = await getDocs(query(collection(db, 'staff_invites'), limit(40)));
    return snap.docs.map((docSnap) => {
      const d = docSnap.data();
      return {
        inviteKey: String(d.inviteKey || docSnap.id),
        targetEmail: String(d.targetEmail || ''),
        adminPhone: String(d.adminPhone || ''),
        displayName: String(d.displayName || 'Sub-Admin'),
        canPostUpdates: Boolean(d.canPostUpdates),
        canGrantBonuses: Boolean(d.canGrantBonuses),
        canBanUsers: Boolean(d.canBanUsers),
        status: d.status === 'revoked' ? 'revoked' : 'active',
        createdByUid: String(d.createdByUid || ''),
        createdAt: timestampToISO(d.createdAt),
        updatedAt: timestampToISO(d.updatedAt),
      };
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.LIST, 'staff_invites');
  }
}

export async function upsertStaffInviteInCloud(params: {
  superAdminUid: string;
  targetEmail: string;
  adminPhone: string;
  displayName: string;
  canPostUpdates: boolean;
  canGrantBonuses: boolean;
  canBanUsers: boolean;
}): Promise<void> {
  const cleanEmail = sanitizeText(
    params.targetEmail.toLowerCase(),
    BLUEPRINT_LIMITS.emailMax,
    ''
  );
  const cleanPhone = sanitizeText(params.adminPhone, BLUEPRINT_LIMITS.phoneMax, '');
  const inviteKey = emailToInviteKey(cleanEmail);
  const invRef = doc(db, 'staff_invites', inviteKey);

  try {
    const existing = await getDoc(invRef);
    if (!existing.exists()) {
      await setDoc(invRef, {
        inviteKey,
        targetEmail: cleanEmail,
        adminPhone: cleanPhone,
        displayName: sanitizeText(
          params.displayName,
          BLUEPRINT_LIMITS.displayNameMax,
          cleanEmail.split('@')[0] || 'Sub-Admin'
        ),
        canPostUpdates: Boolean(params.canPostUpdates),
        canGrantBonuses: Boolean(params.canGrantBonuses),
        canBanUsers: Boolean(params.canBanUsers),
        status: 'active',
        createdByUid: params.superAdminUid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(invRef, {
        adminPhone: cleanPhone,
        displayName: sanitizeText(
          params.displayName,
          BLUEPRINT_LIMITS.displayNameMax,
          'Sub-Admin'
        ),
        canPostUpdates: Boolean(params.canPostUpdates),
        canGrantBonuses: Boolean(params.canGrantBonuses),
        canBanUsers: Boolean(params.canBanUsers),
        status: 'active',
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    handleFirestoreError(error, OperationType.WRITE, `staff_invites/${inviteKey}`);
  }
}

export async function updateStaffInviteStatusOrPermsInCloud(params: {
  inviteKey: string;
  adminPhone: string;
  displayName: string;
  canPostUpdates: boolean;
  canGrantBonuses: boolean;
  canBanUsers: boolean;
  status: 'active' | 'revoked';
}): Promise<void> {
  try {
    await updateDoc(doc(db, 'staff_invites', params.inviteKey), {
      adminPhone: sanitizeText(params.adminPhone, BLUEPRINT_LIMITS.phoneMax, ''),
      displayName: sanitizeText(params.displayName, BLUEPRINT_LIMITS.displayNameMax, 'Sub-Admin'),
      canPostUpdates: Boolean(params.canPostUpdates),
      canGrantBonuses: Boolean(params.canGrantBonuses),
      canBanUsers: Boolean(params.canBanUsers),
      status: params.status,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    handleFirestoreError(error, OperationType.UPDATE, `staff_invites/${params.inviteKey}`);
  }
}

// ============================================================================
// Official Issued Credentials & Non-Admin Verifier Notifications
// ============================================================================

const cloudCredentialSignatures = new Map<string, string>();

export async function registerIssuedCredentialInCloud(
  credential: IssuedCredentialDoc
): Promise<void> {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  const code = sanitizeText(credential.credentialCode, 40, '').toUpperCase();
  if (!code) return;

  const credRef = doc(db, 'issued_credentials', code);
  const candidateName = sanitizeText(
    credential.ownerName,
    BLUEPRINT_LIMITS.displayNameMax,
    'Scholar'
  );
  const boardOrUniversity = sanitizeText(credential.boardOrUniversity, 120, 'University');
  const examName = sanitizeText(credential.examName, 120, 'Final Examinations');
  const title = sanitizeText(credential.title, 120, 'SyllabiQ Verified Credential');
  const metricSummary = sanitizeText(
    credential.subtitleOrMetric,
    200,
    'Verified SyllabiQ Academic Milestone'
  );
  const xpPoints = clampInt(credential.xpPoints, 0, 500000);
  const flexTier = sanitizeText(credential.flexTier, 40, 'Common Slate');
  const issuedDate = sanitizeText(
    credential.issuedDateISO || new Date().toISOString().slice(0, 10),
    20,
    new Date().toISOString().slice(0, 10)
  );

  const signature = JSON.stringify([
    auth.currentUser.uid,
    credential.kind,
    credential.ownerUid,
    candidateName,
    boardOrUniversity,
    examName,
    title,
    metricSummary,
    xpPoints,
    flexTier,
    issuedDate,
  ]);
  if (cloudCredentialSignatures.get(code) === signature) return;
  cloudCredentialSignatures.set(code, signature);

  try {
    const existing = await getDoc(credRef);
    if (!existing.exists()) {
      await setDoc(credRef, {
        credentialCode: code,
        credentialType: credential.kind === 'report_card' ? 'report_card' : 'flexcard',
        ownerUid: credential.ownerUid,
        candidateName,
        boardOrUniversity,
        examName,
        title,
        metricSummary,
        xpPoints,
        flexTier,
        issuedDate,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp(),
      });
    } else {
      await updateDoc(credRef, {
        candidateName,
        boardOrUniversity,
        examName,
        title,
        metricSummary,
        xpPoints,
        flexTier,
        issuedDate,
        updatedAt: serverTimestamp(),
      });
    }
  } catch (error) {
    cloudCredentialSignatures.delete(code);
    if (isTransientFirestoreOfflineError(error)) return;
    handleFirestoreError(error, OperationType.WRITE, `issued_credentials/${code}`);
  }
}

export async function lookupIssuedCredentialInCloud(
  serialCode: string
): Promise<IssuedCredentialDoc | null> {
  const code = sanitizeText(serialCode, 40, '').toUpperCase();
  if (!code || !/^[A-Z0-9_-]+$/.test(code)) return null;

  try {
    const snap = await getDoc(doc(db, 'issued_credentials', code));
    if (!snap.exists()) return null;
    const d = snap.data();
    return {
      credentialCode: String(d.credentialCode || code),
      kind: d.credentialType === 'report_card' ? 'report_card' : 'flexcard',
      ownerUid: String(d.ownerUid || ''),
      ownerName: String(d.candidateName || 'Scholar'),
      boardOrUniversity: String(d.boardOrUniversity || ''),
      examName: String(d.examName || ''),
      title: String(d.title || 'SyllabiQ Credential'),
      subtitleOrMetric: String(d.metricSummary || ''),
      xpPoints: Number(d.xpPoints || 0),
      flexTier: (d.flexTier as FlexCardRarityTier) || 'Common Slate',
      issuedDateISO: String(d.issuedDate || ''),
      createdAt: timestampToISO(d.createdAt),
      updatedAt: timestampToISO(d.updatedAt),
    };
  } catch (error) {
    if (isTransientFirestoreOfflineError(error)) return null;
    return null;
  }
}

export async function recordCredentialVerificationInCloud(params: {
  credential: IssuedCredentialDoc;
  verifierName: string;
  verifierGmail: string;
  verifierPost: VerifierPostRole;
}): Promise<void> {
  if (!auth.currentUser || !auth.currentUser.emailVerified) return;
  const verificationId = `cver_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;

  try {
    await setDoc(doc(db, 'credential_verifications', verificationId), {
      verificationId,
      credentialCode: sanitizeText(params.credential.credentialCode, 40, '').toUpperCase(),
      credentialType: params.credential.kind === 'report_card' ? 'report_card' : 'flexcard',
      targetUserId: params.credential.ownerUid,
      credentialTitle: sanitizeText(params.credential.title, 120, 'SyllabiQ Credential'),
      verifierUid: auth.currentUser.uid,
      verifierName: sanitizeText(params.verifierName, 80, 'Credential Verifier'),
      verifierGmail: sanitizeText(params.verifierGmail.toLowerCase(), 160, ''),
      verifierPost: params.verifierPost,
      verifiedAtDate: new Date().toISOString().slice(0, 10),
      acknowledged: false,
      createdAt: serverTimestamp(),
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (isTransientFirestoreOfflineError(error)) return;
    handleFirestoreError(
      error,
      OperationType.CREATE,
      `credential_verifications/${verificationId}`
    );
  }
}

export function subscribeToCredentialVerifications(
  uid: string,
  onUpdate: (notices: CredentialVerificationNotice[]) => void
): Unsubscribe {
  const q = query(
    collection(db, 'credential_verifications'),
    where('targetUserId', '==', uid),
    limit(25)
  );
  return onSnapshot(
    q,
    (snap) => {
      const list: CredentialVerificationNotice[] = snap.docs.map((docSnap) => {
        const d = docSnap.data();
        return {
          id: docSnap.id,
          targetUserId: String(d.targetUserId || ''),
          credentialCode: String(d.credentialCode || ''),
          credentialKind: d.credentialType === 'report_card' ? 'report_card' : 'flexcard',
          credentialTitle: String(d.credentialTitle || 'SyllabiQ Credential'),
          verifierUid: d.verifierUid ? String(d.verifierUid) : undefined,
          verifierName: String(d.verifierName || ''),
          verifierGmail: String(d.verifierGmail || ''),
          verifierPost: (d.verifierPost as VerifierPostRole) || 'teacher',
          acknowledged: Boolean(d.acknowledged),
          createdAt: timestampToISO(d.createdAt),
        };
      });
      list.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
      onUpdate(list);
    },
    (error) => {
      if (isTransientFirestoreOfflineError(error)) {
        if (auth.currentUser) {
          void validateFirebaseUserSession(auth.currentUser, true);
        }
        return;
      }
      handleFirestoreError(error, OperationType.LIST, 'credential_verifications');
    }
  );
}

export async function acknowledgeCredentialVerificationInCloud(
  verificationId: string
): Promise<void> {
  if (!auth.currentUser || !verificationId.startsWith('cver_')) return;
  try {
    await updateDoc(doc(db, 'credential_verifications', verificationId), {
      acknowledged: true,
      updatedAt: serverTimestamp(),
    });
  } catch (error) {
    if (isTransientFirestoreOfflineError(error)) return;
    handleFirestoreError(
      error,
      OperationType.UPDATE,
      `credential_verifications/${verificationId}`
    );
  }
}
