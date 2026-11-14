/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from 'react';
import { onAuthStateChanged } from 'firebase/auth';
import {
  Award,
  BarChart3,
  Bell,
  CalendarDays,
  ClipboardCheck,
  Cloud,
  Compass,
  Download,
  MessageSquare,
  SearchCheck,
  ShieldCheck,
  UserCircle2,
  Zap,
} from 'lucide-react';
import {
  auth,
  clearCloudTokenDiagnostic,
  CloudOfflineTransportError,
  ensureValidAuthBeforeFirestore,
  subscribeToCloudTokenDiagnostic,
  validateFirebaseUserSession,
} from './firebase';
import {
  isTransientFirestoreOfflineError,
  type CloudTokenDiagnostic,
} from './utils/firebaseConnectionGuard';
import defaultAvatarImg from './assets/images/avatar_student_profile_1793010659413.jpg';
import type {
  Achievement,
  ActiveTab,
  AiStrategyBriefing,
  AppState,
  AuthenticatedAccount,
  AvatarVisibility,
  CandidateSummaryDoc,
  CredentialVerificationNotice,
  GlobalUpdateCategory,
  GlobalUpdateDoc,
  IndividualBonusDoc,
  IndividualBonusType,
  IssuedCredentialDoc,
  LearningStylePreset,
  StaffAccessProfile,
  StaffInviteDoc,
  StudentProfile,
  SubjectProfile,
  TestAttempt,
  TopicItem,
} from './types';
import {
  createDefaultAchievements,
  createDemoSeedState,
  createEmptyAppState,
  createStarterGlobalUpdates,
  createStarterSandboxBonuses,
  createStarterSandboxCandidates,
  createStarterSandboxInvites,
  ensureCompleteAchievementsCatalog,
} from './data/seedData';
import {
  acknowledgeCredentialVerificationInCloud,
  acknowledgeIndividualBonusInCloud,
  deleteGlobalUpdateInCloud,
  fetchCandidatesForStaff,
  fetchStaffInvitesInCloud,
  grantIndividualBonusInCloud,
  hydrateOrBootstrapCandidateCloud,
  lookupSingleCandidateForStaff,
  mapFirebaseUserToAccount,
  publishGlobalUpdateInCloud,
  registerIssuedCredentialInCloud,
  resolveStaffAccessForUser,
  setCandidateBanInCloud,
  signInWithGooglePopup,
  signInWithMicrosoftPopup,
  signOutAccount,
  subscribeToCandidateBonuses,
  subscribeToCredentialVerifications,
  subscribeToGlobalUpdates,
  subscribeToOwnCandidateSummary,
  syncCandidateWorkspaceToCloud,
  togglePinGlobalUpdateInCloud,
  updateStaffInviteStatusOrPermsInCloud,
  upsertSocialProfileInCloud,
  upsertStaffInviteInCloud,
} from './services/cloudService';
import {
  acknowledgeCredentialNotificationApi,
  fetchCredentialNotificationsApi,
  fetchStateFromServer,
  registerCredentialsBatchApi,
  requestAiStrategyBriefing,
  syncStateToServer,
  updateSocialProfileVisibilityApi,
} from './utils/apiClient';
import {
  DEMO_PLACEHOLDER_EMAIL,
  emailToInviteKey,
  filterCandidatePiiForStaff,
  isDemoPlaceholderStudentName,
  isSuperAdminCandidateRecord,
  isSuperAdminEmail,
  resolveAuthenticatedDisplayName,
  resolveSandboxStaffAccess,
  type SandboxRolePreviewMode,
} from './utils/firestoreValidators';
import { downloadTimetablePdf } from './utils/pdfExport';
import {
  applyTestAttemptToState,
  computeDashboardMetrics,
  evaluateAchievements,
  generateTimetable,
  recalculateSubjectScoresOutOf10,
  reoptimizeMissedDay,
} from './utils/studyEngine';
import {
  computeCandidateXpSnapshot,
  getTodayDateISO,
  identifyNeededStudyTopics,
} from './utils/xpAndOutreachEngine';
import {
  generateFlexCardSerial,
  generateReportCardSerial,
  generateScholarProfileId,
  normalizeSerialCode,
} from './utils/verificationAndReferral';
import {
  calculateEthicsRecoveryXp,
  computeSubjectRefreshStatuses,
} from './utils/skillRefreshAndEthics';
import { extractVerifySerialFromSearch } from './utils/qrVerification';
import { OnboardingWizard } from './components/OnboardingWizard';
import { DashboardView } from './components/DashboardView';
import { PlannerView } from './components/PlannerView';
import { DailyTestView } from './components/DailyTestView';
import { AdaptiveRevisionView } from './components/AdaptiveRevisionView';
import { ProfileAndAchievementsView } from './components/ProfileAndAchievementsView';
import { SocialSyllabiQView } from './components/SocialSyllabiQView';
import { AboutAndReferralView } from './components/AboutAndReferralView';
import { FlexShareModal } from './components/FlexShareModal';
import { AuthCloudModal } from './components/AuthCloudModal';
import { UpdatesAndBonusesModal } from './components/UpdatesAndBonusesModal';
import { AdminPanelView } from './components/AdminPanelView';
import { BannedAccountScreen } from './components/BannedAccountScreen';
import { LoginEntryScreen } from './components/LoginEntryScreen';
import { PrivacyPolicyModal } from './components/PrivacyPolicyModal';
import { CredentialVerifyModal } from './components/CredentialVerifyModal';
import { SkillRefreshQuizModal } from './components/SkillRefreshQuizModal';
import { EthicsRecoveryModal } from './components/EthicsRecoveryModal';
import { t } from './utils/translations';

const STORAGE_KEY = 'syllabiq_app_state_v1';

const DEFAULT_CANDIDATE_ACCESS: StaffAccessProfile = resolveSandboxStaffAccess('none');

function normalizeHydratedAppState(rawState: AppState): AppState {
  if (!rawState.onboarded) return rawState;
  const catalog = ensureCompleteAchievementsCatalog(rawState.achievements || []);
  const lastActive = rawState.student?.lastActiveDate || getTodayDateISO();
  const { achievements } = evaluateAchievements(
    catalog,
    rawState.attempts || [],
    rawState.topics || [],
    Boolean(rawState.lastReoptimizationNote),
    rawState.student?.name || 'Scholar',
    {
      lastActiveDate: lastActive,
      focusMinutesTotal: rawState.focusMinutesTotal || 0,
    }
  );
  return {
    ...rawState,
    student: {
      ...rawState.student,
      lastActiveDate: lastActive,
    },
    achievements,
  };
}

function sanitizeStateForAuthenticatedUser(
  rawState: AppState,
  acct: { displayName: string; email?: string; photoURL?: string }
): AppState {
  const realName = resolveAuthenticatedDisplayName({
    displayName: acct.displayName,
    email: acct.email,
  });
  const currentName = rawState.student?.name;
  const replaceName = isDemoPlaceholderStudentName(currentName);
  const resolvedName = replaceName ? realName : currentName;
  const currentEmail = (rawState.student?.email || '').trim();
  const replaceEmail =
    !currentEmail || currentEmail.toLowerCase() === DEMO_PLACEHOLDER_EMAIL;
  const resolvedEmail = replaceEmail ? acct.email || '' : currentEmail;

  const updatedAchievements = Array.isArray(rawState.achievements)
    ? rawState.achievements.map((ach) => ({
        ...ach,
        shareHeadline: ach.shareHeadline
          ? ach.shareHeadline.replace(/\bAarav\s+(Mehta|Sharma)\b/gi, resolvedName)
          : ach.shareHeadline,
      }))
    : [];

  return {
    ...rawState,
    student: {
      ...rawState.student,
      name: resolvedName,
      email: resolvedEmail,
      avatarUrl: rawState.student?.avatarUrl || acct.photoURL || undefined,
    },
    achievements: updatedAchievements,
  };
}

function loadInitialState(): AppState {
  const params = new URLSearchParams(window.location.search);
  const autostart = params.get('autostart') === '1';
  const forceOnboarding = params.get('onboarding') === '1';

  if (forceOnboarding) {
    return createEmptyAppState();
  }

  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (raw) {
      const parsed = JSON.parse(raw) as AppState;
      if (parsed && typeof parsed === 'object' && Array.isArray(parsed.topics)) {
        if (autostart && !parsed.onboarded) {
          return normalizeHydratedAppState(createDemoSeedState());
        }
        return normalizeHydratedAppState(parsed);
      }
    }
  } catch {
    // Ignore malformed storage
  }

  if (autostart) {
    return normalizeHydratedAppState(createDemoSeedState());
  }

  return createEmptyAppState();
}

export default function App() {
  const [appState, setAppState] = useState<AppState>(() => loadInitialState());
  const [activeTab, setActiveTab] = useState<ActiveTab>('dashboard');
  const [preselectedTestDay, setPreselectedTestDay] = useState<string | null>(null);
  const [activeFlexAchievement, setActiveFlexAchievement] = useState<Achievement | null>(null);

  // Cloud Auth & RBAC State
  const [authReady, setAuthReady] = useState(false);
  const [account, setAccount] = useState<AuthenticatedAccount | null>(null);
  const [cloudHydratedUid, setCloudHydratedUid] = useState<string | null>(null);
  const [liveStaffAccess, setLiveStaffAccess] =
    useState<StaffAccessProfile>(DEFAULT_CANDIDATE_ACCESS);
  const [cloudSummary, setCloudSummary] = useState<CandidateSummaryDoc | null>(null);
  const [cloudUpdates, setCloudUpdates] = useState<GlobalUpdateDoc[]>([]);
  const [cloudBonuses, setCloudBonuses] = useState<IndividualBonusDoc[]>([]);
  const [cloudCandidates, setCloudCandidates] = useState<CandidateSummaryDoc[]>([]);
  const [cloudInvites, setCloudInvites] = useState<StaffInviteDoc[]>([]);
  const [isSyncingCloud, setIsSyncingCloud] = useState(false);
  const [isRefreshingRoster, setIsRefreshingRoster] = useState(false);

  // Local Demo Sandbox State (used when not signed into live cloud so all flows remain testable)
  const [hasEnteredLocalSandbox, setHasEnteredLocalSandbox] = useState<boolean>(() => {
    const params = new URLSearchParams(window.location.search);
    return (
      params.get('autostart') === '1' ||
      params.get('bannedPreview') === '1' ||
      params.get('onboarding') === '1'
    );
  });
  const skipServerHydrationRef = useRef<boolean>(
    new URLSearchParams(window.location.search).get('onboarding') === '1'
  );
  const [sandboxBannedPreview, setSandboxBannedPreview] = useState<boolean>(() => {
    const params = new URLSearchParams(window.location.search);
    return params.get('bannedPreview') === '1';
  });
  const [sandboxRoleMode, setSandboxRoleMode] = useState<SandboxRolePreviewMode>('none');
  const [sandboxUpdates, setSandboxUpdates] = useState<GlobalUpdateDoc[]>(() =>
    createStarterGlobalUpdates()
  );
  const [sandboxCandidates, setSandboxCandidates] = useState<CandidateSummaryDoc[]>(() =>
    createStarterSandboxCandidates()
  );
  const [sandboxBonuses, setSandboxBonuses] = useState<IndividualBonusDoc[]>(() =>
    createStarterSandboxBonuses()
  );
  const [sandboxInvites, setSandboxInvites] = useState<StaffInviteDoc[]>(() =>
    createStarterSandboxInvites()
  );

  // Modals & Interactive Verification / Refresh / Ethics States
  const [isAuthModalOpen, setIsAuthModalOpen] = useState(false);
  const [isUpdatesModalOpen, setIsUpdatesModalOpen] = useState(false);
  const [isPrivacyModalOpen, setIsPrivacyModalOpen] = useState(false);
  const [isVerifyModalOpen, setIsVerifyModalOpen] = useState<boolean>(() =>
    Boolean(extractVerifySerialFromSearch(window.location.search))
  );
  const [verifyPrefillSerial, setVerifyPrefillSerial] = useState<string>(
    () => extractVerifySerialFromSearch(window.location.search) || ''
  );
  const [refreshQuizSubjectId, setRefreshQuizSubjectId] = useState<string | null>(null);
  const [ethicsRecoveryBonus, setEthicsRecoveryBonus] = useState<IndividualBonusDoc | null>(null);
  const [verificationNotices, setVerificationNotices] = useState<CredentialVerificationNotice[]>(
    []
  );
  const [sidebarAvatarFailed, setSidebarAvatarFailed] = useState(false);
  const [cloudTokenDiagnostic, setCloudTokenDiagnostic] = useState<CloudTokenDiagnostic | null>(
    null
  );

  useEffect(() => subscribeToCloudTokenDiagnostic(setCloudTokenDiagnostic), []);

  // Capture ?ref=SLQ-REF-... invite links automatically
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const refParam = params.get('ref');
    if (refParam && refParam.trim()) {
      const normalized = normalizeSerialCode(refParam);
      setAppState((prev) => {
        if (prev.student.referredByCode) return prev;
        return {
          ...prev,
          student: {
            ...prev.student,
            referredByCode: normalized,
          },
        };
      });
    }
  }, []);

  const handleOpenVerifyModal = (serial = '') => {
    setVerifyPrefillSerial(serial);
    setIsVerifyModalOpen(true);
  };

  const sidebarAvatarSrc = appState.student.avatarUrl || account?.photoURL || defaultAvatarImg;

  useEffect(() => {
    setSidebarAvatarFailed(false);
  }, [sidebarAvatarSrc]);

  const appStateRef = useRef(appState);
  appStateRef.current = appState;

  const cloudSummaryRef = useRef(cloudSummary);
  cloudSummaryRef.current = cloudSummary;

  const lastAuthenticatedUidRef = useRef<string | null>(null);

  const sandboxStaffAccess: StaffAccessProfile = resolveSandboxStaffAccess(sandboxRoleMode);

  const effectiveStaffAccess = account ? liveStaffAccess : sandboxStaffAccess;

  // Listen to Firebase Auth state changes & hydrate cloud workspace only after verifying usable ID token
  useEffect(() => {
    // Safety fallback so slow or offline Firebase Auth init never leaves login controls disabled
    const authFallbackTimer = window.setTimeout(() => {
      setAuthReady(true);
    }, 1200);

    const unsub = onAuthStateChanged(auth, async (fbUser) => {
      window.clearTimeout(authFallbackTimer);
      if (!fbUser) {
        setAccount(null);
        setCloudHydratedUid(null);
        setLiveStaffAccess(DEFAULT_CANDIDATE_ACCESS);
        setCloudSummary(null);
        setCloudBonuses([]);
        setCloudCandidates([]);
        setCloudInvites([]);
        setAuthReady(true);
        return;
      }

      // Verify ID token can be obtained/refreshed BEFORE touching Firestore
      const verifiedUser = await validateFirebaseUserSession(fbUser);
      if (!verifiedUser) {
        setAccount(null);
        setCloudHydratedUid(null);
        setLiveStaffAccess(DEFAULT_CANDIDATE_ACCESS);
        setCloudSummary(null);
        setCloudBonuses([]);
        setCloudCandidates([]);
        setCloudInvites([]);
        setAuthReady(true);
        return;
      }

      const mapped = mapFirebaseUserToAccount(verifiedUser);
      setAccount(mapped);

      const prevUid = lastAuthenticatedUidRef.current;
      lastAuthenticatedUidRef.current = verifiedUser.uid;
      const switchedAccount = prevUid !== null && prevUid !== verifiedUser.uid;
      const baseLocalState = switchedAccount
        ? createEmptyAppState()
        : sanitizeStateForAuthenticatedUser(appStateRef.current, mapped);
      if (switchedAccount) {
        setAppState(baseLocalState);
      }

      setCloudHydratedUid(null);

      try {
        const staff = await resolveStaffAccessForUser(verifiedUser);
        setLiveStaffAccess(staff);

        if (verifiedUser.emailVerified) {
          setIsSyncingCloud(true);
          const { summary, workspaceState } = await hydrateOrBootstrapCandidateCloud(
            verifiedUser,
            baseLocalState
          );
          setCloudSummary(summary);
          if (workspaceState && workspaceState.onboarded) {
            setAppState(
              normalizeHydratedAppState(
                sanitizeStateForAuthenticatedUser(workspaceState, mapped)
              )
            );
          } else if (staff.tier !== 'none' && !baseLocalState.onboarded) {
            const staffSeed = sanitizeStateForAuthenticatedUser(createDemoSeedState(), mapped);
            setAppState(normalizeHydratedAppState(staffSeed));
          } else if (baseLocalState.onboarded && !switchedAccount) {
            setAppState(normalizeHydratedAppState(baseLocalState));
          }
          if (staff.tier !== 'none') {
            setActiveTab('admin');
          }
          setCloudHydratedUid(verifiedUser.uid);
        }
      } catch (err) {
        if (!(err instanceof CloudOfflineTransportError) && !isTransientFirestoreOfflineError(err)) {
          console.error('Cloud hydration error:', err);
        }
      } finally {
        setIsSyncingCloud(false);
        setAuthReady(true);
      }
    });

    return () => {
      window.clearTimeout(authFallbackTimer);
      unsub();
    };
  }, []);

  // Subscribe to public Global Updates once auth token validation has settled
  useEffect(() => {
    if (!authReady) return;
    let active = true;
    let unsub: (() => void) | null = null;

    ensureValidAuthBeforeFirestore().then(() => {
      if (!active) return;
      unsub = subscribeToGlobalUpdates((updates) => {
        setCloudUpdates(updates);
      });
    });

    return () => {
      active = false;
      if (unsub) unsub();
    };
  }, [authReady]);

  // Subscribe to authenticated candidate's own summary (bans + bonus XP), personal bonuses & credential verifications
  useEffect(() => {
    if (!authReady || !account || !account.emailVerified || cloudHydratedUid !== account.uid) return;

    const unsubSummary = subscribeToOwnCandidateSummary(account.uid, (summary) => {
      if (isSuperAdminEmail(account.email) && summary.banned) {
        setCloudSummary({ ...summary, banned: false, banReason: '' });
        void setCandidateBanInCloud({
          targetUid: account.uid,
          banned: false,
          banReason: '',
        }).catch(() => {});
        return;
      }
      setCloudSummary(summary);
    });
    const unsubBonuses = subscribeToCandidateBonuses(account.uid, (bonuses) => {
      setCloudBonuses(bonuses);
    });
    const unsubVerifications = subscribeToCredentialVerifications(account.uid, (notices) => {
      setVerificationNotices((prev) => {
        const merged = new Map<string, CredentialVerificationNotice>();
        for (const item of [...notices, ...prev]) {
          merged.set(item.id, item);
        }
        return Array.from(merged.values()).sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt)
        );
      });
    });

    return () => {
      unsubSummary();
      unsubBonuses();
      unsubVerifications();
    };
  }, [authReady, account, cloudHydratedUid]);

  // Hydrate from Express fallback if local storage had no onboarded session and user is not logged in
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (
      params.get('autostart') === '1' ||
      params.get('onboarding') === '1' ||
      skipServerHydrationRef.current
    ) {
      return;
    }

    if (!appState.onboarded && !account) {
      fetchStateFromServer().then((remoteState) => {
        if (
          remoteState &&
          remoteState.onboarded &&
          !auth.currentUser &&
          !skipServerHydrationRef.current
        ) {
          setAppState(normalizeHydratedAppState(remoteState));
        }
      });
    }
  }, []);

  // Persist changes to localStorage, Express cache, and Firestore Cloud Workspace (when signed in & hydrated)
  useEffect(() => {
    try {
      window.localStorage.setItem(STORAGE_KEY, JSON.stringify(appState));
    } catch {
      // Ignore quota errors
    }
    const serverSyncTimer = appState.onboarded
      ? window.setTimeout(() => {
          syncStateToServer(appState);
        }, 350)
      : null;

    if (
      account &&
      account.emailVerified &&
      cloudHydratedUid === account.uid &&
      appState.onboarded &&
      !cloudSummaryRef.current?.banned
    ) {
      const cloudTimer = window.setTimeout(() => {
        syncCandidateWorkspaceToCloud({
          uid: account.uid,
          fallbackName: account.displayName,
          state: appState,
          currentSummary: cloudSummaryRef.current,
        }).catch((err) => {
          if (
            !(err instanceof CloudOfflineTransportError) &&
            !isTransientFirestoreOfflineError(err)
          ) {
            console.error('Background cloud workspace sync failed:', err);
          }
        });
      }, 650);
      return () => {
        if (serverSyncTimer !== null) window.clearTimeout(serverSyncTimer);
        window.clearTimeout(cloudTimer);
      };
    }

    return () => {
      if (serverSyncTimer !== null) window.clearTimeout(serverSyncTimer);
    };
  }, [appState, account, cloudHydratedUid]);

  // Refresh Admin Roster when opening the Admin Panel in live hydrated cloud mode
  const handleRefreshAdminRoster = async () => {
    if (!account || cloudHydratedUid !== account.uid || effectiveStaffAccess.tier === 'none') {
      return;
    }
    setIsRefreshingRoster(true);
    try {
      const roster = await fetchCandidatesForStaff({
        staffUid: account.uid,
        isSuperAdmin: effectiveStaffAccess.tier === 'super_admin',
      });
      setCloudCandidates(roster);

      if (effectiveStaffAccess.canManageAdmins) {
        const invites = await fetchStaffInvitesInCloud();
        setCloudInvites(invites);
      }
    } catch (err) {
      if (!(err instanceof CloudOfflineTransportError) && !isTransientFirestoreOfflineError(err)) {
        console.error('Admin roster load error:', err);
      }
    } finally {
      setIsRefreshingRoster(false);
    }
  };

  useEffect(() => {
    if (
      activeTab === 'admin' &&
      account &&
      cloudHydratedUid === account.uid &&
      effectiveStaffAccess.tier !== 'none'
    ) {
      void handleRefreshAdminRoster();
    }
  }, [activeTab, account, cloudHydratedUid, effectiveStaffAccess.tier]);

  // Reset activeTab if user steps out of admin access while viewing Admin Panel
  useEffect(() => {
    if (activeTab === 'admin' && effectiveStaffAccess.tier === 'none') {
      setActiveTab('dashboard');
    }
  }, [activeTab, effectiveStaffAccess.tier]);

  const handleManualCloudSync = async () => {
    if (!account || !account.emailVerified) return;
    setIsSyncingCloud(true);
    try {
      await syncCandidateWorkspaceToCloud({
        uid: account.uid,
        fallbackName: account.displayName,
        state: appState,
        currentSummary: cloudSummary,
      });
    } finally {
      setIsSyncingCloud(false);
    }
  };

  const handleCompleteOnboarding = (payload: {
    student: StudentProfile;
    subjects: SubjectProfile[];
    topics: TopicItem[];
  }) => {
    const todayISO = getTodayDateISO();
    const studentWithActive: StudentProfile = {
      ...payload.student,
      lastActiveDate: payload.student.lastActiveDate || todayISO,
    };
    const schedule = generateTimetable(
      studentWithActive,
      payload.subjects,
      payload.topics,
      todayISO,
      0
    );
    const { achievements } = evaluateAchievements(
      createDefaultAchievements(),
      [],
      payload.topics,
      false,
      studentWithActive.name,
      {
        lastActiveDate: studentWithActive.lastActiveDate,
        focusMinutesTotal: 0,
      }
    );

    const initialState: AppState = {
      onboarded: true,
      student: studentWithActive,
      subjects: payload.subjects,
      topics: payload.topics,
      schedule,
      attempts: [],
      achievements,
      focusSessionsCompleted: 0,
      focusMinutesTotal: 0,
    };

    setAppState(initialState);
    setActiveTab('dashboard');

    requestAiStrategyBriefing({
      state: initialState,
      trigger: 'dashboard_briefing',
    }).then((briefing) => {
      setAppState((prev) => ({ ...prev, aiStrategyBriefing: briefing }));
    });
  };

  const handleLoadDemoWorkspace = () => {
    const rawDemo = createDemoSeedState();
    const customizedDemo = account
      ? sanitizeStateForAuthenticatedUser(rawDemo, account)
      : rawDemo;
    setAppState(normalizeHydratedAppState(customizedDemo));
    setActiveTab('dashboard');
  };

  const handleLogFocusMinutes = (minutes: number) => {
    const todayISO = getTodayDateISO();
    setAppState((prev) => {
      const nextMinutes = (prev.focusMinutesTotal || 0) + minutes;
      const nextStudent = {
        ...prev.student,
        lastActiveDate: todayISO,
      };
      const { achievements } = evaluateAchievements(
        ensureCompleteAchievementsCatalog(prev.achievements),
        prev.attempts,
        prev.topics,
        Boolean(prev.lastReoptimizationNote),
        nextStudent.name,
        {
          lastActiveDate: todayISO,
          focusMinutesTotal: nextMinutes,
        }
      );
      return {
        ...prev,
        student: nextStudent,
        achievements,
        focusSessionsCompleted: (prev.focusSessionsCompleted || 0) + 1,
        focusMinutesTotal: nextMinutes,
      };
    });
  };

  const handleToggleTopicComplete = (topicId: string) => {
    const todayISO = getTodayDateISO();
    setAppState((prev) => {
      const updatedTopics = prev.topics.map((t) => {
        if (t.id !== topicId) return t;
        const nextDone = !t.completed;
        return {
          ...t,
          completed: nextDone,
          completedAt: nextDone ? todayISO : undefined,
          masteryPercent: nextDone ? Math.max(82, t.masteryPercent) : Math.min(45, t.masteryPercent),
        };
      });

      const targetTopic = updatedTopics.find((t) => t.id === topicId);
      const updatedSchedule = prev.schedule.map((day) => ({
        ...day,
        sessions: day.sessions.map((sess) =>
          sess.topicId === topicId
            ? { ...sess, completed: Boolean(targetTopic?.completed) }
            : sess
        ),
      }));

      const nextStudent = {
        ...prev.student,
        lastActiveDate: todayISO,
      };

      const { achievements } = evaluateAchievements(
        ensureCompleteAchievementsCatalog(prev.achievements),
        prev.attempts,
        updatedTopics,
        Boolean(prev.lastReoptimizationNote),
        nextStudent.name,
        {
          lastActiveDate: todayISO,
          focusMinutesTotal: prev.focusMinutesTotal || 0,
        }
      );

      return {
        ...prev,
        student: nextStudent,
        topics: updatedTopics,
        schedule: updatedSchedule,
        achievements,
      };
    });
  };

  const handleToggleSessionComplete = (
    dayDateISO: string,
    sessionId: string,
    topicId: string
  ) => {
    const todayISO = getTodayDateISO();
    setAppState((prev) => {
      let toggledValue = false;
      const updatedSchedule = prev.schedule.map((day) => {
        if (day.dateISO !== dayDateISO) return day;
        return {
          ...day,
          sessions: day.sessions.map((sess) => {
            if (sess.id !== sessionId) return sess;
            toggledValue = !sess.completed;
            return { ...sess, completed: toggledValue };
          }),
        };
      });

      const allSessionsForTopic = updatedSchedule.flatMap((d) =>
        d.sessions.filter((s) => s.topicId === topicId)
      );
      const topicFullyDone =
        allSessionsForTopic.length > 0
          ? allSessionsForTopic.every((s) => s.completed)
          : toggledValue;

      const updatedTopics = prev.topics.map((t) =>
        t.id === topicId
          ? {
              ...t,
              completed: topicFullyDone,
              completedAt: topicFullyDone ? todayISO : undefined,
              masteryPercent: topicFullyDone
                ? Math.max(85, t.masteryPercent)
                : Math.max(35, t.masteryPercent),
            }
          : t
      );

      const nextStudent = {
        ...prev.student,
        lastActiveDate: todayISO,
      };

      const { achievements } = evaluateAchievements(
        ensureCompleteAchievementsCatalog(prev.achievements),
        prev.attempts,
        updatedTopics,
        Boolean(prev.lastReoptimizationNote),
        nextStudent.name,
        {
          lastActiveDate: todayISO,
          focusMinutesTotal: prev.focusMinutesTotal || 0,
        }
      );

      return {
        ...prev,
        student: nextStudent,
        topics: updatedTopics,
        schedule: updatedSchedule,
        achievements,
      };
    });
  };

  const handleMissedDayReoptimize = (missedDateISO: string) => {
    const todayISO = getTodayDateISO();
    const { updatedSchedule, summaryNote } = reoptimizeMissedDay(
      appState.schedule,
      appState.topics,
      appState.subjects,
      appState.student,
      missedDateISO
    );

    const nextStudent = {
      ...appState.student,
      lastActiveDate: todayISO,
    };

    const { achievements } = evaluateAchievements(
      ensureCompleteAchievementsCatalog(appState.achievements),
      appState.attempts,
      appState.topics,
      true,
      nextStudent.name,
      {
        lastActiveDate: todayISO,
        focusMinutesTotal: appState.focusMinutesTotal || 0,
      }
    );

    const nextState: AppState = {
      ...appState,
      student: nextStudent,
      schedule: updatedSchedule,
      achievements,
      lastReoptimizationNote: summaryNote,
    };

    setAppState(nextState);

    requestAiStrategyBriefing({
      state: nextState,
      trigger: 'missed_day_reoptimize',
      missedDateISO,
      redistributionSummary: summaryNote,
    }).then((briefing) => {
      setAppState((prev) => ({
        ...prev,
        aiStrategyBriefing: briefing,
      }));
    });
  };

  const handleSaveAiBriefing = (briefing: AiStrategyBriefing) => {
    setAppState((prev) => ({
      ...prev,
      aiStrategyBriefing: briefing,
    }));
  };

  const handleRecordAttempt = (
    attempt: TestAttempt,
    dayDateISO?: string
  ): Achievement | null => {
    const todayISO = getTodayDateISO();
    const current = appStateRef.current;
    const { nextState, newlyUnlockedFlex } = applyTestAttemptToState(
      current,
      attempt,
      dayDateISO,
      todayISO,
      ensureCompleteAchievementsCatalog(current.achievements)
    );
    appStateRef.current = nextState;
    setAppState(nextState);
    return newlyUnlockedFlex;
  };

  const handleUpdateStudyStyle = (
    learningStyle: LearningStylePreset,
    customStyleFeedback: string
  ) => {
    setAppState((prev) => ({
      ...prev,
      student: {
        ...prev.student,
        learningStyle,
        customStyleFeedback,
      },
    }));
  };

  const handleUpdateStudentContactAndActivity = (patch: {
    email?: string;
    phoneNumber?: string;
    notifyGmailOptIn?: boolean;
    notifyWhatsappOptIn?: boolean;
    lastActiveDate?: string;
    avatarUrl?: string;
    avatarVisibility?: AvatarVisibility;
  }) => {
    const nextStudent: StudentProfile = {
      ...appState.student,
      ...(patch.email !== undefined ? { email: patch.email } : {}),
      ...(patch.phoneNumber !== undefined ? { phoneNumber: patch.phoneNumber } : {}),
      ...(patch.notifyGmailOptIn !== undefined
        ? { notifyGmailOptIn: patch.notifyGmailOptIn }
        : {}),
      ...(patch.notifyWhatsappOptIn !== undefined
        ? { notifyWhatsappOptIn: patch.notifyWhatsappOptIn }
        : {}),
      ...(patch.lastActiveDate !== undefined
        ? { lastActiveDate: patch.lastActiveDate }
        : {}),
      ...(patch.avatarUrl !== undefined ? { avatarUrl: patch.avatarUrl } : {}),
      ...(patch.avatarVisibility !== undefined
        ? { avatarVisibility: patch.avatarVisibility }
        : {}),
    };

    const { achievements: nextAchievements } = evaluateAchievements(
      ensureCompleteAchievementsCatalog(appState.achievements),
      appState.attempts,
      appState.topics,
      Boolean(appState.lastReoptimizationNote),
      nextStudent.name,
      {
        lastActiveDate: nextStudent.lastActiveDate || getTodayDateISO(),
        focusMinutesTotal: appState.focusMinutesTotal || 0,
      }
    );

    const nextStateSnapshot: AppState = {
      ...appState,
      student: nextStudent,
      achievements: nextAchievements,
    };

    const snap = computeCandidateXpSnapshot({
      state: nextStateSnapshot,
      bonusPoints: account
        ? cloudSummary?.bonusPoints ?? 0
        : sandboxCandidates[0]?.bonusPoints ?? 150,
      deductedPoints: account
        ? cloudSummary?.deductedPoints ?? 0
        : sandboxCandidates[0]?.deductedPoints ?? 0,
      recoveredEthicsXp: nextStudent.recoveredEthicsXp ?? 0,
    });

    setAppState((prev) => {
      const mergedStudent: StudentProfile = {
        ...prev.student,
        ...(patch.email !== undefined ? { email: patch.email } : {}),
        ...(patch.phoneNumber !== undefined ? { phoneNumber: patch.phoneNumber } : {}),
        ...(patch.notifyGmailOptIn !== undefined
          ? { notifyGmailOptIn: patch.notifyGmailOptIn }
          : {}),
        ...(patch.notifyWhatsappOptIn !== undefined
          ? { notifyWhatsappOptIn: patch.notifyWhatsappOptIn }
          : {}),
        ...(patch.lastActiveDate !== undefined
          ? { lastActiveDate: patch.lastActiveDate }
          : {}),
        ...(patch.avatarUrl !== undefined ? { avatarUrl: patch.avatarUrl } : {}),
        ...(patch.avatarVisibility !== undefined
          ? { avatarVisibility: patch.avatarVisibility }
          : {}),
      };

      const { achievements } = evaluateAchievements(
        ensureCompleteAchievementsCatalog(prev.achievements),
        prev.attempts,
        prev.topics,
        Boolean(prev.lastReoptimizationNote),
        mergedStudent.name,
        {
          lastActiveDate: mergedStudent.lastActiveDate || getTodayDateISO(),
          focusMinutesTotal: prev.focusMinutesTotal || 0,
        }
      );

      return {
        ...prev,
        student: mergedStudent,
        achievements,
      };
    });

    if (!account) {
      const weak = identifyNeededStudyTopics(nextStateSnapshot.topics, 4);
      setSandboxCandidates((candPrev) =>
        candPrev.map((c, idx) =>
          idx === 0
            ? {
                ...c,
                displayName: nextStudent.name || c.displayName,
                email: nextStudent.email || c.email,
                contactEmail: nextStudent.email || c.contactEmail,
                phoneNumber: nextStudent.phoneNumber ?? c.phoneNumber,
                notifyGmailOptIn: nextStudent.notifyGmailOptIn ?? c.notifyGmailOptIn,
                notifyWhatsappOptIn:
                  nextStudent.notifyWhatsappOptIn ?? c.notifyWhatsappOptIn,
                xpPoints: snap.netXp,
                flexTier: snap.rarity.tier,
                lastActiveDate: nextStudent.lastActiveDate,
                inactiveDays: snap.inactiveDays,
                activeLearnerActive: !snap.activeLearnerDissolved,
                unlockedBadges: nextAchievements.filter((a) => a.unlocked).map((a) => a.title),
                weakTopics: weak,
                avatarUrl: nextStudent.avatarUrl || undefined,
              }
            : c
        )
      );
    }

    if (patch.avatarUrl !== undefined || patch.avatarVisibility !== undefined) {
      const resolvedOwnerKey = account ? account.uid : 'sandbox-candidate';
      const resolvedAvatarUrl =
        nextStudent.avatarUrl || account?.photoURL || defaultAvatarImg;
      const profilePayload = {
        userId: resolvedOwnerKey,
        profileId: generateScholarProfileId(resolvedOwnerKey),
        displayName: nextStudent.name || account?.displayName || 'Scholar',
        avatarUrl: resolvedAvatarUrl,
        avatarVisibility: nextStudent.avatarVisibility ?? 'world',
        flexTier: snap.rarity.tier,
      };
      void updateSocialProfileVisibilityApi(profilePayload);
      if (account?.emailVerified) {
        void upsertSocialProfileInCloud(profilePayload);
      }
    }
  };

  const handleSaveStudentAboutLines = (lines: string[]) => {
    const todayISO = getTodayDateISO();
    setAppState((prev) => ({
      ...prev,
      student: {
        ...prev.student,
        aiAboutLines: lines,
        aiAboutUpdatedAt: todayISO,
      },
    }));
  };

  const handleApplyReferralCode = (code: string) => {
    const normalized = normalizeSerialCode(code);
    if (!normalized) return;
    setAppState((prev) => ({
      ...prev,
      student: {
        ...prev.student,
        referredByCode: normalized,
      },
    }));
  };

  const handleCompleteSkillRefresh = (subjectId: string) => {
    const todayISO = getTodayDateISO();
    setAppState((prev) => {
      const updatedSubjects = prev.subjects.map((subj) =>
        subj.id === subjectId ? { ...subj, lastPracticedDateISO: todayISO } : subj
      );
      const nextStudent: StudentProfile = {
        ...prev.student,
        lastActiveDate: todayISO,
      };
      return {
        ...prev,
        student: nextStudent,
        subjects: updatedSubjects,
      };
    });
    setRefreshQuizSubjectId(null);
  };

  const handleCompleteEthicsRecovery = (bonusId: string, recoveredXp: number) => {
    setAppState((prev) => {
      const existingIds = prev.student.recoveredDeductionIds || [];
      if (existingIds.includes(bonusId)) return prev;
      return {
        ...prev,
        student: {
          ...prev.student,
          recoveredDeductionIds: [...existingIds, bonusId],
          recoveredEthicsXp: (prev.student.recoveredEthicsXp || 0) + Math.max(0, recoveredXp),
        },
      };
    });

    if (account) {
      void acknowledgeIndividualBonusInCloud(bonusId);
    } else {
      setSandboxBonuses((prev) =>
        prev.map((b) => (b.id === bonusId ? { ...b, acknowledged: true } : b))
      );
    }
    setEthicsRecoveryBonus(null);
  };

  const handleResetSyllabusSetup = () => {
    skipServerHydrationRef.current = true;
    setAppState(createEmptyAppState());
    try {
      window.localStorage.removeItem(STORAGE_KEY);
    } catch {
      // Ignore
    }
  };

  // =========================================================================
  // Effective Feeds, Bonuses, Credentials & Admin Handlers
  // =========================================================================

  const ownerKey = account ? account.uid : 'sandbox-candidate';
  const myProfileId = useMemo(() => generateScholarProfileId(ownerKey), [ownerKey]);

  const effectiveGlobalUpdates =
    cloudUpdates.length > 0 ? cloudUpdates : sandboxUpdates;

  const effectivePersonalBonuses = account ? cloudBonuses : sandboxBonuses;

  const effectiveBonusPoints = account
    ? cloudSummary?.bonusPoints ?? 0
    : effectivePersonalBonuses
        .filter((b) => b.bonusType !== 'xp_deduction')
        .reduce((sum, b) => sum + b.pointsAwarded, 0);

  const effectiveDeductedPoints = account
    ? cloudSummary?.deductedPoints ??
      effectivePersonalBonuses
        .filter((b) => b.bonusType === 'xp_deduction')
        .reduce((sum, b) => sum + b.pointsAwarded, 0)
    : effectivePersonalBonuses
        .filter((b) => b.bonusType === 'xp_deduction')
        .reduce((sum, b) => sum + b.pointsAwarded, 0);

  const recoveredDeductionIds = appState.student.recoveredDeductionIds || [];
  const recoveredEthicsXp =
    appState.student.recoveredEthicsXp ??
    effectivePersonalBonuses
      .filter((b) => b.bonusType === 'xp_deduction' && recoveredDeductionIds.includes(b.id))
      .reduce((sum, b) => sum + calculateEthicsRecoveryXp(b.pointsAwarded, false), 0);

  const xpSnapshot = computeCandidateXpSnapshot({
    state: appState,
    bonusPoints: effectiveBonusPoints,
    deductedPoints: effectiveDeductedPoints,
    recoveredEthicsXp,
  });

  const subjectRefreshStatuses = useMemo(
    () =>
      computeSubjectRefreshStatuses({
        subjects: appState.subjects,
        attempts: appState.attempts,
        topics: appState.topics,
        fallbackCreatedAtISO: appState.student.createdAt,
      }),
    [appState.subjects, appState.attempts, appState.topics, appState.student.createdAt]
  );

  const staleSubjects = useMemo(
    () => subjectRefreshStatuses.filter((s) => s.needsRefresh),
    [subjectRefreshStatuses]
  );

  const activeRefreshSubject = useMemo(
    () => appState.subjects.find((s) => s.id === refreshQuizSubjectId) || null,
    [appState.subjects, refreshQuizSubjectId]
  );
  const activeRefreshStatus = useMemo(
    () => subjectRefreshStatuses.find((s) => s.subjectId === refreshQuizSubjectId) || null,
    [subjectRefreshStatuses, refreshQuizSubjectId]
  );

  const issuedFlexCards: IssuedCredentialDoc[] = useMemo(() => {
    const unlocked = appState.achievements.filter((a) => a.unlocked);
    return unlocked.map((ach) => ({
      credentialCode: generateFlexCardSerial(ownerKey, ach.code || ach.id),
      kind: 'flexcard' as const,
      ownerUid: ownerKey,
      ownerName: appState.student.name || account?.displayName || 'Scholar',
      candidateEmail: appState.student.email || account?.email,
      boardOrUniversity:
        appState.student.boardOrUniversity || 'CBSE Class 12 · Engineering Entrance Prep',
      examName: appState.student.examName || 'Final Examinations',
      title: ach.title,
      subtitleOrMetric: ach.metricBadge || ach.description,
      xpPoints: xpSnapshot.netXp,
      flexTier: xpSnapshot.rarity.tier,
      issuedDateISO: ach.unlockedAt || getTodayDateISO(),
    }));
  }, [
    appState.achievements,
    appState.student.name,
    appState.student.email,
    appState.student.boardOrUniversity,
    appState.student.examName,
    account?.email,
    account?.displayName,
    ownerKey,
    xpSnapshot.netXp,
    xpSnapshot.rarity.tier,
  ]);

  const issuedReportCard: IssuedCredentialDoc = useMemo(() => {
    const metrics = computeDashboardMetrics(appStateRef.current);
    return {
      credentialCode: generateReportCardSerial(ownerKey, 'ALL'),
      kind: 'report_card',
      ownerUid: ownerKey,
      ownerName: appState.student.name || account?.displayName || 'Scholar',
      candidateEmail: appState.student.email || account?.email,
      boardOrUniversity:
        appState.student.boardOrUniversity || 'CBSE Class 12 · Engineering Entrance Prep',
      examName: appState.student.examName || 'Final Examinations',
      title: `${appState.student.name || account?.displayName || 'Scholar'} — Official SyllabiQ Report Card`,
      subtitleOrMetric: `${metrics.examReadinessPercent}% Exam Readiness · ${
        metrics.overallScoreOutOf10 !== null ? `${metrics.overallScoreOutOf10}/10` : 'Calibrating'
      }`,
      xpPoints: xpSnapshot.netXp,
      flexTier: xpSnapshot.rarity.tier,
      issuedDateISO: getTodayDateISO(),
    };
  }, [
    appState.topics,
    appState.schedule,
    appState.attempts,
    appState.subjects,
    appState.student.name,
    appState.student.email,
    appState.student.boardOrUniversity,
    appState.student.examName,
    account?.email,
    ownerKey,
    xpSnapshot.netXp,
    xpSnapshot.rarity.tier,
  ]);

  // Register pre-login showcase & demo seed serials once on app boot
  useEffect(() => {
    const todayISO = getTodayDateISO();
    const showcaseDefaults: IssuedCredentialDoc[] = [
      {
        credentialCode: generateFlexCardSerial('sandbox-candidate', 'SCHOLAR_FLEX'),
        kind: 'flexcard',
        ownerUid: 'sandbox-candidate',
        ownerName: 'Aarav Sharma',
        boardOrUniversity: 'CBSE Class 12 · Engineering Entrance Prep',
        examName: 'Spring Term Finals & Entrance Prep',
        title: 'Consistent PYQ Scholar',
        subtitleOrMetric: 'Top-band PYQ Accuracy · Verified Milestone',
        xpPoints: 850,
        flexTier: 'Mythic Sovereign',
        issuedDateISO: todayISO,
      },
      {
        credentialCode: generateFlexCardSerial('sandbox-candidate', 'PYQ_CRUSHER'),
        kind: 'flexcard',
        ownerUid: 'sandbox-candidate',
        ownerName: 'Aarav Sharma',
        boardOrUniversity: 'CBSE Class 12 · Engineering Entrance Prep',
        examName: 'Spring Term Finals & Entrance Prep',
        title: 'High-Yield PYQ Crusher',
        subtitleOrMetric: '80%+ Accuracy on Past-Paper Assessments',
        xpPoints: 850,
        flexTier: 'Epic Amethyst',
        issuedDateISO: todayISO,
      },
      {
        credentialCode: generateReportCardSerial('sandbox-candidate', 'ALL'),
        kind: 'report_card',
        ownerUid: 'sandbox-candidate',
        ownerName: 'Aarav Sharma',
        boardOrUniversity: 'CBSE Class 12 · Engineering Entrance Prep',
        examName: 'Spring Term Finals & Entrance Prep',
        title: 'Aarav Sharma — Official SyllabiQ Report Card',
        subtitleOrMetric: 'Verified Subject Mastery & PYQ Readiness Dossier',
        xpPoints: 850,
        flexTier: 'Mythic Sovereign',
        issuedDateISO: todayISO,
      },
    ];

    const demoUnlockedSeeds = createDemoSeedState()
      .achievements.filter((a) => a.unlocked)
      .map((ach) => ({
        credentialCode: generateFlexCardSerial('sandbox-candidate', ach.code || ach.id),
        kind: 'flexcard' as const,
        ownerUid: 'sandbox-candidate',
        ownerName: 'Aarav Mehta',
        boardOrUniversity: 'Delhi Technological University (DTU)',
        examName: 'B.Tech Sem-IV End-Term Finals',
        title: ach.title,
        subtitleOrMetric: ach.metricBadge || ach.description,
        xpPoints: 850,
        flexTier: 'Epic Amethyst' as const,
        issuedDateISO: ach.unlockedAt || todayISO,
      }));

    const toRegister = appStateRef.current.onboarded
      ? showcaseDefaults.filter((s) => s.credentialCode !== generateReportCardSerial('sandbox-candidate', 'ALL'))
      : [...showcaseDefaults, ...demoUnlockedSeeds];

    void registerCredentialsBatchApi(toRegister);
  }, []);

  // Keep candidate's live issued credentials synchronized when onboarded (deduplicated at API & cloud layer)
  useEffect(() => {
    if (!appState.onboarded) return;
    const liveCreds = [...issuedFlexCards, issuedReportCard];
    void registerCredentialsBatchApi(liveCreds);
    if (account && account.emailVerified) {
      for (const cred of liveCreds) {
        void registerIssuedCredentialInCloud(cred);
      }
    }
  }, [appState.onboarded, issuedFlexCards, issuedReportCard, account]);

  // Keep candidate's verification notices hydrated from server registry
  useEffect(() => {
    const targetIds = account ? [account.uid] : ['sandbox-candidate', 'cand-aarav-01'];
    void fetchCredentialNotificationsApi(targetIds).then((notices) => {
      if (notices.length === 0) return;
      setVerificationNotices((prev) => {
        const merged = new Map<string, CredentialVerificationNotice>();
        for (const item of [...notices, ...prev]) {
          merged.set(item.id, item);
        }
        return Array.from(merged.values()).sort((a, b) =>
          b.createdAt.localeCompare(a.createdAt)
        );
      });
    });
  }, [account, isUpdatesModalOpen]);

  const unclaimedBonusCount = effectivePersonalBonuses.filter(
    (b) => !b.acknowledged
  ).length;
  const unacknowledgedVerificationCount = verificationNotices.filter(
    (n) => !n.acknowledged
  ).length;
  const totalUnreadVaultCount = unclaimedBonusCount + unacknowledgedVerificationCount;

  const handleAcknowledgeVerification = async (notice: CredentialVerificationNotice) => {
    setVerificationNotices((prev) =>
      prev.map((n) => (n.id === notice.id ? { ...n, acknowledged: true } : n))
    );
    await acknowledgeCredentialNotificationApi(notice.id);
    if (account) {
      await acknowledgeCredentialVerificationInCloud(notice.id);
    }
  };

  const handleAcknowledgeBonus = async (bonus: IndividualBonusDoc) => {
    if (account) {
      await acknowledgeIndividualBonusInCloud(bonus.id);
    } else {
      setSandboxBonuses((prev) =>
        prev.map((b) => (b.id === bonus.id ? { ...b, acknowledged: true } : b))
      );
    }

    if (bonus.bonusType === 'xp_deduction') {
      return;
    }

    // Unlock a verified achievement card in the student's gallery when claiming a special bonus
    const achId = `ach-bonus-${bonus.id}`;
    const todayISO = new Date().toISOString().slice(0, 10);
    setAppState((prev) => {
      if (prev.achievements.some((a) => a.id === achId)) return prev;
      const bonusAch: Achievement = {
        id: achId,
        code: 'SPECIAL_ADMIN_BONUS',
        title: bonus.bonusTitle,
        description: bonus.message,
        category: 'mastery',
        unlocked: true,
        unlockedAt: todayISO,
        metricBadge:
          bonus.pointsAwarded > 0 ? `+${bonus.pointsAwarded} Bonus XP` : 'Mentor Citation',
        shareHeadline: `${
          prev.student.name || 'Scholar'
        } earned "${bonus.bonusTitle}" (+${bonus.pointsAwarded} Bonus XP) on SyllabiQ!`,
      };
      return {
        ...prev,
        achievements: [bonusAch, ...prev.achievements],
      };
    });
  };

  const handlePublishGlobalUpdate = async (payload: {
    title: string;
    body: string;
    category: GlobalUpdateCategory;
    pinned: boolean;
  }) => {
    if (account) {
      await publishGlobalUpdateInCloud({
        authorUid: account.uid,
        authorName: account.displayName,
        authorRoleLabel: effectiveStaffAccess.roleLabel,
        ...payload,
      });
      return;
    }

    const nowISO = new Date().toISOString();
    const newDoc: GlobalUpdateDoc = {
      id: `sandbox_upd_${Date.now()}`,
      authorUid: 'sandbox_staff',
      authorName: effectiveStaffAccess.roleLabel,
      authorRoleLabel: effectiveStaffAccess.roleLabel,
      title: payload.title,
      body: payload.body,
      category: payload.category,
      visibility: 'public',
      pinned: payload.pinned,
      createdAt: nowISO,
      updatedAt: nowISO,
    };
    setSandboxUpdates((prev) => {
      const merged = [newDoc, ...prev];
      merged.sort((a, b) => {
        if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
        return b.createdAt.localeCompare(a.createdAt);
      });
      return merged;
    });
  };

  const handleTogglePinUpdate = async (updateId: string, nextPinned: boolean) => {
    if (account && cloudUpdates.some((u) => u.id === updateId)) {
      await togglePinGlobalUpdateInCloud(updateId, nextPinned);
      return;
    }
    setSandboxUpdates((prev) =>
      prev
        .map((u) => (u.id === updateId ? { ...u, pinned: nextPinned } : u))
        .sort((a, b) => {
          if (a.pinned !== b.pinned) return a.pinned ? -1 : 1;
          return b.createdAt.localeCompare(a.createdAt);
        })
    );
  };

  const handleDeleteUpdate = async (updateId: string) => {
    if (account && cloudUpdates.some((u) => u.id === updateId)) {
      await deleteGlobalUpdateInCloud(updateId);
      return;
    }
    setSandboxUpdates((prev) => prev.filter((u) => u.id !== updateId));
  };

  const handleSetCandidateBan = async (
    targetUid: string,
    banned: boolean,
    banReason: string
  ) => {
    if (
      banned &&
      account &&
      (targetUid === account.uid ||
        cloudCandidates.some(
          (c) =>
            c.ownerUid === targetUid &&
            isSuperAdminCandidateRecord(
              c,
              effectiveStaffAccess.tier === 'super_admin' ? account.uid : undefined
            )
        ))
    ) {
      throw new Error('The Primary Super Admin account cannot be suspended.');
    }
    if (account) {
      await setCandidateBanInCloud({ targetUid, banned, banReason });
      await handleRefreshAdminRoster();
      return;
    }
    setSandboxCandidates((prev) =>
      prev.map((c) =>
        c.ownerUid === targetUid ? { ...c, banned, banReason: banned ? banReason : '' } : c
      )
    );
  };

  const handleGrantBonus = async (payload: {
    targetCandidate: CandidateSummaryDoc;
    bonusTitle: string;
    bonusType: IndividualBonusType;
    pointsAwarded: number;
    message: string;
  }) => {
    if (account) {
      await grantIndividualBonusInCloud({
        targetCandidate: payload.targetCandidate,
        grantedByUid: account.uid,
        grantedByName: account.displayName,
        bonusTitle: payload.bonusTitle,
        bonusType: payload.bonusType,
        pointsAwarded: payload.pointsAwarded,
        message: payload.message,
      });
      await handleRefreshAdminRoster();
      return;
    }

    const nowISO = new Date().toISOString();
    const newBonus: IndividualBonusDoc = {
      id: `sandbox_bon_${Date.now()}`,
      targetUserId: payload.targetCandidate.ownerUid,
      targetName: payload.targetCandidate.displayName,
      grantedByUid: 'sandbox_staff',
      grantedByName: effectiveStaffAccess.roleLabel,
      bonusTitle: payload.bonusTitle,
      bonusType: payload.bonusType,
      pointsAwarded: payload.pointsAwarded,
      message: payload.message,
      acknowledged: false,
      createdAt: nowISO,
      updatedAt: nowISO,
    };
    setSandboxBonuses((prev) => [newBonus, ...prev]);
    setSandboxCandidates((prev) =>
      prev.map((c) => {
        if (c.ownerUid !== payload.targetCandidate.ownerUid) return c;
        if (payload.bonusType === 'xp_deduction') {
          return {
            ...c,
            deductedPoints: (c.deductedPoints || 0) + payload.pointsAwarded,
            xpPoints: Math.max(0, (c.xpPoints || 0) - payload.pointsAwarded),
          };
        }
        return {
          ...c,
          bonusPoints: c.bonusPoints + payload.pointsAwarded,
          xpPoints: (c.xpPoints || 0) + payload.pointsAwarded,
        };
      })
    );
  };

  const handleLookupCandidateById = async (uid: string) => {
    if (account) {
      const found = await lookupSingleCandidateForStaff(
        uid,
        effectiveStaffAccess.tier === 'super_admin'
      );
      if (found) {
        setCloudCandidates((prev) => {
          const filtered = prev.filter((c) => c.ownerUid !== found.ownerUid);
          return [found, ...filtered];
        });
      }
    }
  };

  const handleUpsertStaffInvite = async (payload: {
    targetEmail: string;
    adminPhone: string;
    displayName: string;
    canPostUpdates: boolean;
    canGrantBonuses: boolean;
    canBanUsers: boolean;
  }) => {
    if (account) {
      await upsertStaffInviteInCloud({
        superAdminUid: account.uid,
        ...payload,
      });
      await handleRefreshAdminRoster();
      return;
    }

    const nowISO = new Date().toISOString();
    const inviteKey = emailToInviteKey(payload.targetEmail);
    setSandboxInvites((prev) => {
      const exists = prev.some((i) => i.inviteKey === inviteKey);
      if (exists) {
        return prev.map((i) =>
          i.inviteKey === inviteKey
            ? {
                ...i,
                adminPhone: payload.adminPhone,
                displayName: payload.displayName,
                canPostUpdates: payload.canPostUpdates,
                canGrantBonuses: payload.canGrantBonuses,
                canBanUsers: payload.canBanUsers,
                status: 'active',
                updatedAt: nowISO,
              }
            : i
        );
      }
      return [
        {
          inviteKey,
          targetEmail: payload.targetEmail,
          adminPhone: payload.adminPhone,
          displayName: payload.displayName,
          canPostUpdates: payload.canPostUpdates,
          canGrantBonuses: payload.canGrantBonuses,
          canBanUsers: payload.canBanUsers,
          status: 'active',
          createdByUid: 'sandbox_super_admin',
          createdAt: nowISO,
          updatedAt: nowISO,
        },
        ...prev,
      ];
    });
  };

  const handleUpdateStaffInvite = async (payload: {
    inviteKey: string;
    adminPhone: string;
    displayName: string;
    canPostUpdates: boolean;
    canGrantBonuses: boolean;
    canBanUsers: boolean;
    status: 'active' | 'revoked';
  }) => {
    if (account) {
      await updateStaffInviteStatusOrPermsInCloud(payload);
      await handleRefreshAdminRoster();
      return;
    }

    const nowISO = new Date().toISOString();
    setSandboxInvites((prev) =>
      prev.map((i) =>
        i.inviteKey === payload.inviteKey
          ? {
              ...i,
              adminPhone: payload.adminPhone,
              displayName: payload.displayName,
              canPostUpdates: payload.canPostUpdates,
              canGrantBonuses: payload.canGrantBonuses,
              canBanUsers: payload.canBanUsers,
              status: payload.status,
              updatedAt: nowISO,
            }
          : i
      )
    );
  };

  const handleSelectSandboxRole = (_mode: SandboxRolePreviewMode) => {
    // Interactive Sandbox is restricted strictly to Candidate View (no admin/super-admin preview)
    setSandboxBannedPreview(false);
    setSandboxRoleMode('none');
    setHasEnteredLocalSandbox(true);
  };

  const handleEnterLocalPreview = (
    _roleMode: SandboxRolePreviewMode,
    loadDemoSyllabus: boolean,
    previewBanned = false
  ) => {
    setSandboxRoleMode('none');
    setSandboxBannedPreview(Boolean(previewBanned));
    setHasEnteredLocalSandbox(true);
    if (previewBanned) {
      return;
    }
    if (loadDemoSyllabus) {
      if (!appState.onboarded) {
        setAppState(normalizeHydratedAppState(createDemoSeedState()));
      }
      setActiveTab('dashboard');
    } else {
      skipServerHydrationRef.current = true;
      setAppState(createEmptyAppState());
      setActiveTab('dashboard');
    }
  };

  const sandboxBannedCandidate =
    sandboxCandidates.find((c) => c.ownerUid === 'cand-banned-04') ||
    sandboxCandidates.find((c) => c.banned) ||
    null;

  // Immediate lock screen if signed-in non-Super-Admin candidate account is suspended OR Banned Flex Sandbox is active
  if (account && cloudSummary?.banned && effectiveStaffAccess.tier !== 'super_admin') {
    return (
      <>
        <BannedAccountScreen
          account={account}
          summary={cloudSummary}
          onSignOut={signOutAccount}
        />
        <CredentialVerifyModal
          isOpen={isVerifyModalOpen}
          onClose={() => setIsVerifyModalOpen(false)}
          initialSerial={verifyPrefillSerial}
          isStaff={false}
          defaultVerifierName={account.displayName || ''}
          defaultVerifierGmail={account.email || ''}
        />
      </>
    );
  }

  if (!account && sandboxBannedPreview && sandboxBannedCandidate?.banned) {
    return (
      <>
        <BannedAccountScreen
          account={{
            uid: sandboxBannedCandidate.ownerUid,
            email: sandboxBannedCandidate.email || 'rohan.verma.student@gmail.com',
            displayName: sandboxBannedCandidate.displayName,
            emailVerified: true,
            providerId: 'google.com',
          }}
          summary={sandboxBannedCandidate}
          isSandboxPreview={true}
          onExitSandboxPreview={() => {
            setSandboxBannedPreview(false);
            setHasEnteredLocalSandbox(false);
          }}
          onSignOut={async () => {
            setSandboxBannedPreview(false);
            setHasEnteredLocalSandbox(false);
          }}
        />
        <CredentialVerifyModal
          isOpen={isVerifyModalOpen}
          onClose={() => setIsVerifyModalOpen(false)}
          initialSerial={verifyPrefillSerial}
          isStaff={false}
        />
      </>
    );
  }

  const pinnedOrLatestUpdate =
    effectiveGlobalUpdates.find((u) => u.pinned) || effectiveGlobalUpdates[0] || null;

  // Primary Login Panel Entry Gate when website is first opened
  if (!account && !hasEnteredLocalSandbox) {
    return (
      <>
        <LoginEntryScreen
          pinnedUpdate={pinnedOrLatestUpdate}
          isHydratingAuth={!authReady || isSyncingCloud}
          referredByCode={appState.student.referredByCode}
          cloudTokenDiagnostic={cloudTokenDiagnostic}
          onDismissTokenDiagnostic={clearCloudTokenDiagnostic}
          onGoogleLogin={async () => {
            await signInWithGooglePopup();
          }}
          onMicrosoftLogin={async () => {
            await signInWithMicrosoftPopup();
          }}
          onEnterLocalPreview={handleEnterLocalPreview}
          onOpenVerifyModal={handleOpenVerifyModal}
          onOpenPrivacyPolicy={() => setIsPrivacyModalOpen(true)}
        />
        <CredentialVerifyModal
          isOpen={isVerifyModalOpen}
          onClose={() => setIsVerifyModalOpen(false)}
          initialSerial={verifyPrefillSerial}
          isStaff={false}
          onVerifiedNoticeGenerated={(notice) => {
            setVerificationNotices((prev) => [
              notice,
              ...prev.filter((n) => n.id !== notice.id),
            ]);
          }}
        />
        {isPrivacyModalOpen && (
          <PrivacyPolicyModal onClose={() => setIsPrivacyModalOpen(false)} />
        )}
      </>
    );
  }

  if (!appState.onboarded) {
    return (
      <>
        <OnboardingWizard
          account={account}
          pinnedUpdate={pinnedOrLatestUpdate}
          onOpenAuthModal={() => setIsAuthModalOpen(true)}
          onOpenPrivacyPolicy={() => setIsPrivacyModalOpen(true)}
          onCompleteOnboarding={handleCompleteOnboarding}
          onLoadDemoWorkspace={handleLoadDemoWorkspace}
        />

        <AuthCloudModal
          isOpen={isAuthModalOpen}
          onClose={() => setIsAuthModalOpen(false)}
          account={account}
          candidateSummary={cloudSummary}
          staffAccess={effectiveStaffAccess}
          isSyncing={isSyncingCloud}
          cloudTokenDiagnostic={cloudTokenDiagnostic}
          onDismissTokenDiagnostic={clearCloudTokenDiagnostic}
          onGoogleLogin={async () => {
            await signInWithGooglePopup();
          }}
          onMicrosoftLogin={async () => {
            await signInWithMicrosoftPopup();
          }}
          onSignOut={signOutAccount}
          onManualSyncNow={handleManualCloudSync}
          onOpenPrivacyPolicy={() => {
            setIsAuthModalOpen(false);
            setIsPrivacyModalOpen(true);
          }}
          showSandboxPreviewControls={!account}
          onSelectSandboxRole={handleSelectSandboxRole}
          onReturnToLoginPortal={() => setHasEnteredLocalSandbox(false)}
        />

        {isPrivacyModalOpen && (
          <PrivacyPolicyModal onClose={() => setIsPrivacyModalOpen(false)} />
        )}

        <CredentialVerifyModal
          isOpen={isVerifyModalOpen}
          onClose={() => setIsVerifyModalOpen(false)}
          initialSerial={verifyPrefillSerial}
          isStaff={effectiveStaffAccess.tier !== 'none'}
          staffRoleLabel={effectiveStaffAccess.roleLabel}
          defaultVerifierName={account?.displayName || ''}
          defaultVerifierGmail={account?.email || ''}
        />
      </>
    );
  }

  const navItems: Array<{
    id: ActiveTab;
    label: string;
    shortLabel: string;
    icon: React.ComponentType<{ className?: string }>;
  }> = [
    { id: 'dashboard', label: t('nav_dashboard'), shortLabel: t('short_dashboard'), icon: BarChart3 },
    { id: 'planner', label: t('nav_planner'), shortLabel: t('short_planner'), icon: CalendarDays },
    { id: 'daily_test', label: t('nav_daily_test'), shortLabel: t('short_daily_test'), icon: ClipboardCheck },
    { id: 'adaptive_blitz', label: t('nav_adaptive_blitz'), shortLabel: t('short_adaptive_blitz'), icon: Zap },
    { id: 'social', label: t('nav_social'), shortLabel: t('short_social'), icon: MessageSquare },
    { id: 'profile', label: t('nav_profile'), shortLabel: t('short_profile'), icon: UserCircle2 },
    { id: 'achievements', label: t('nav_achievements'), shortLabel: t('short_achievements'), icon: Award },
    { id: 'about', label: t('nav_about'), shortLabel: t('short_about'), icon: Compass },
    ...(effectiveStaffAccess.tier !== 'none'
      ? [
          {
            id: 'admin' as ActiveTab,
            label: t('nav_admin'),
            shortLabel: t('short_admin'),
            icon: ShieldCheck,
          },
        ]
      : []),
  ];

  const activeNavMeta = navItems.find((n) => n.id === activeTab) || navItems[0];

  return (
    <div className="min-h-screen text-slate-900 flex flex-col md:flex-row">
      {/* Desktop Left Frosted-Glass Workspace Sidebar (256px) */}
      <aside className="hidden md:flex md:w-64 md:sticky md:top-0 md:h-screen md:overflow-y-auto md:flex-col md:justify-between glass-sidebar p-5 shrink-0">
        <div>
          <div className="px-2 pb-5 border-b border-slate-200/70">
            <a
              href="./"
              className="font-display text-xl font-bold tracking-tight text-slate-900"
            >
              SyllabiQ
            </a>
            <p className="mt-1 text-xs text-slate-500 truncate">
              {appState.student.boardOrUniversity}
            </p>
          </div>

          <nav aria-label="Workspace navigation" className="mt-5 space-y-1">
            {navItems.map((item) => {
              const Icon = item.icon;
              const isActive = activeTab === item.id;
              return (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => setActiveTab(item.id)}
                  className={`w-full flex items-center gap-3 rounded-xl px-3 py-2.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                    isActive
                      ? 'bg-slate-900 text-white shadow-2xs'
                      : 'text-slate-600 hover:bg-white/75 hover:text-slate-900'
                  }`}
                >
                  <Icon className="h-4 w-4 shrink-0" />
                  <span>{item.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        <div className="border-t border-slate-200/70 pt-4 space-y-2.5">
          <div className="grid grid-cols-2 gap-1.5">
            <button
              type="button"
              onClick={() => setIsUpdatesModalOpen(true)}
              aria-label="Open Vault Updates and Bonuses"
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-2.5 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap"
            >
              <Bell className="h-3.5 w-3.5 text-sky-600 shrink-0" />
              <span>{t('vault')}</span>
              <span aria-hidden="true" className="text-slate-300">
                ·
              </span>
              <span className="font-mono tabular-nums text-[11px] text-sky-700 shrink-0">
                {totalUnreadVaultCount > 0 ? totalUnreadVaultCount : effectiveGlobalUpdates.length}
              </span>
            </button>

            <button
              type="button"
              onClick={() => handleOpenVerifyModal('')}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200/90 bg-white px-2.5 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap"
            >
              <SearchCheck className="h-3.5 w-3.5 text-emerald-700 shrink-0" />
              <span>{t('verifyId')}</span>
            </button>
          </div>

          <button
            type="button"
            onClick={() => setIsAuthModalOpen(true)}
            className="w-full flex items-center gap-2.5 text-left px-2 py-1.5 rounded-lg hover:bg-slate-100/80 transition-colors text-xs text-slate-500"
          >
            <div className="h-9 w-9 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100 flex items-center justify-center">
              {!sidebarAvatarFailed ? (
                <img
                  data-testid="sidebar-candidate-avatar-img"
                  src={sidebarAvatarSrc}
                  alt={`${appState.student.name} profile avatar`}
                  referrerPolicy="no-referrer"
                  onError={() => setSidebarAvatarFailed(true)}
                  className="h-full w-full object-cover"
                />
              ) : (
                <UserCircle2 className="h-5 w-5 text-slate-500" />
              )}
            </div>
            <div className="min-w-0 flex-1 space-y-0.5">
              <p className="font-semibold text-slate-900 truncate">{appState.student.name}</p>
              <p className="font-mono text-[11px] font-semibold text-sky-700 truncate">
                ID: {myProfileId}
              </p>
              <p className="text-[11px] text-sky-700 font-medium truncate">
                {account
                  ? `${account.providerId === 'microsoft.com' ? 'Microsoft' : 'Google'} Cloud Synced`
                  : effectiveStaffAccess.tier !== 'none'
                  ? `${effectiveStaffAccess.roleLabel} (Sandbox)`
                  : 'Sign In · Google / Microsoft'}
              </p>
              <p className="font-mono tabular-nums text-[11px] text-slate-500">
                {xpSnapshot.netXp} XP · {xpSnapshot.rarity.tier}
              </p>
            </div>
          </button>

          <div className="px-2 pt-1 flex items-center justify-between text-[11px] text-slate-500">
            <button
              type="button"
              onClick={() => setIsPrivacyModalOpen(true)}
              className="hover:text-slate-900 underline underline-offset-4 transition-colors whitespace-nowrap"
            >
              {t('privacyPolicy')}
            </button>
            <span className="font-mono tabular-nums">Target {appState.student.examDate}</span>
          </div>
        </div>
      </aside>

      {/* Main Content Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Clean Contextual Top Bar (<= 2 right actions per SaaS Dashboard contract) */}
        <header className="glass-header sticky top-0 z-20 flex items-center justify-between gap-4 px-5 py-3.5">
          <div className="flex items-center gap-2 text-sm min-w-0">
            <span className="md:hidden font-display font-bold text-slate-900 shrink-0">
              SyllabiQ
            </span>
            <span className="md:hidden text-slate-300" aria-hidden="true">
              /
            </span>
            <span className="text-slate-500 hidden sm:inline shrink-0">{t('workspace')}</span>
            <span className="text-slate-300 hidden sm:inline" aria-hidden="true">
              /
            </span>
            <h1 className="font-display font-bold text-slate-900 truncate">
              {activeNavMeta.label}
            </h1>
          </div>

          <div className="flex items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => setIsAuthModalOpen(true)}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-900 transition-colors hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <Cloud className="h-3.5 w-3.5 text-sky-600" />
              <span>
                {account
                  ? account.displayName
                  : effectiveStaffAccess.tier !== 'none'
                  ? effectiveStaffAccess.roleLabel
                  : t('signInCloud')}
              </span>
            </button>

            <button
              type="button"
              onClick={() => downloadTimetablePdf(appState)}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">{t('offlineTimetablePdf')}</span>
              <span className="sm:hidden">{t('pdfShort')}</span>
            </button>
          </div>
        </header>

        {/* Mobile Workspace Navigation (fits 390px cleanly with zero horizontal clipping) */}
        <nav
          aria-label="Mobile workspace navigation"
          className="md:hidden grid grid-cols-4 sm:grid-cols-8 gap-1 border-b border-slate-200 bg-white px-3 py-2"
        >
          {navItems.map((item) => {
            const isActive = activeTab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setActiveTab(item.id)}
                className={`rounded-lg px-2 py-1.5 text-center text-[11px] font-semibold transition-colors whitespace-nowrap truncate ${
                  isActive
                    ? 'bg-slate-900 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 hover:text-slate-900'
                }`}
              >
                {item.shortLabel}
              </button>
            );
          })}
        </nav>

        {/* Active View Viewport */}
        <main className="flex-1 p-5 sm:p-8 max-w-6xl w-full mx-auto space-y-6">
          {activeTab === 'dashboard' && (
            <DashboardView
              state={appState}
              latestUpdate={pinnedOrLatestUpdate}
              unclaimedBonusCount={totalUnreadVaultCount}
              bonusPoints={effectiveBonusPoints}
              xpSnapshot={xpSnapshot}
              subjectRefreshStatuses={subjectRefreshStatuses}
              onStartSkillRefresh={(subjectId) => setRefreshQuizSubjectId(subjectId)}
              onOpenUpdatesModal={() => setIsUpdatesModalOpen(true)}
              onLogFocusMinutes={handleLogFocusMinutes}
              onToggleTopicComplete={handleToggleTopicComplete}
              onNavigateTab={setActiveTab}
              onSaveAiBriefing={handleSaveAiBriefing}
            />
          )}

          {activeTab === 'planner' && (
            <PlannerView
              state={appState}
              subjectRefreshStatuses={subjectRefreshStatuses}
              onStartSkillRefresh={(subjectId) => setRefreshQuizSubjectId(subjectId)}
              onToggleSessionComplete={handleToggleSessionComplete}
              onMissedDayReoptimize={handleMissedDayReoptimize}
              onStartDayTest={(dayISO) => {
                setPreselectedTestDay(dayISO);
                setActiveTab('daily_test');
              }}
              onNavigateTab={setActiveTab}
            />
          )}

          {activeTab === 'daily_test' && (
            <DailyTestView
              state={appState}
              preselectedDayISO={preselectedTestDay}
              onRecordAttempt={handleRecordAttempt}
              onOpenFlexModal={(ach) => setActiveFlexAchievement(ach)}
            />
          )}

          {activeTab === 'adaptive_blitz' && (
            <AdaptiveRevisionView
              state={appState}
              onUpdateStudyStyle={handleUpdateStudyStyle}
              onRecordAttempt={(att) => handleRecordAttempt(att)}
              onOpenFlexModal={(ach) => setActiveFlexAchievement(ach)}
            />
          )}

          {activeTab === 'social' && (
            <SocialSyllabiQView
              state={appState}
              ownerKey={ownerKey}
              isCloudAuthenticated={Boolean(account?.emailVerified)}
              avatarUrl={sidebarAvatarSrc}
              xpSnapshot={xpSnapshot}
              staleSubjects={staleSubjects}
              issuedFlexCards={issuedFlexCards}
              issuedReportCard={issuedReportCard}
              onUpdateAvatarVisibility={(visibility) => {
                handleUpdateStudentContactAndActivity({ avatarVisibility: visibility });
              }}
              onOpenVerifyModal={handleOpenVerifyModal}
              onNavigateAboutRules={() => setActiveTab('about')}
            />
          )}

          {(activeTab === 'profile' || activeTab === 'achievements') && (
            <ProfileAndAchievementsView
              state={appState}
              mode={activeTab === 'achievements' ? 'achievements' : 'profile'}
              ownerKey={ownerKey}
              account={account}
              bonusPoints={effectiveBonusPoints}
              xpSnapshot={xpSnapshot}
              subjectRefreshStatuses={subjectRefreshStatuses}
              onStartSkillRefresh={(subjectId) => setRefreshQuizSubjectId(subjectId)}
              onOpenVerifyModal={handleOpenVerifyModal}
              onSaveStudentAboutLines={handleSaveStudentAboutLines}
              onOpenAuthModal={() => setIsAuthModalOpen(true)}
              onOpenPrivacyPolicy={() => setIsPrivacyModalOpen(true)}
              onOpenFlexModal={(ach) => setActiveFlexAchievement(ach)}
              onResetSyllabusSetup={handleResetSyllabusSetup}
              onUpdateStudentContactAndActivity={handleUpdateStudentContactAndActivity}
            />
          )}

          {activeTab === 'about' && (
            <AboutAndReferralView
              state={appState}
              ownerKey={ownerKey}
              xpSnapshot={xpSnapshot}
              onApplyReferralCode={handleApplyReferralCode}
              onOpenVerifyModal={handleOpenVerifyModal}
              onOpenPrivacyPolicy={() => setIsPrivacyModalOpen(true)}
            />
          )}

          {activeTab === 'admin' && effectiveStaffAccess.tier !== 'none' && (
            <AdminPanelView
              staffAccess={effectiveStaffAccess}
              currentStaffUid={account ? account.uid : 'sandbox_staff'}
              currentStaffName={
                account ? account.displayName : effectiveStaffAccess.roleLabel
              }
              globalUpdates={effectiveGlobalUpdates}
              candidates={filterCandidatePiiForStaff(
                (account ? cloudCandidates : sandboxCandidates).filter(
                  (c) =>
                    !isSuperAdminCandidateRecord(
                      c,
                      effectiveStaffAccess.tier === 'super_admin' ? account?.uid : undefined
                    )
                ),
                effectiveStaffAccess.canSendOutreach
              )}
              staffInvites={account ? cloudInvites : sandboxInvites}
              isRefreshingRoster={isRefreshingRoster}
              onRefreshRoster={handleRefreshAdminRoster}
              onLookupCandidateById={handleLookupCandidateById}
              onPublishGlobalUpdate={handlePublishGlobalUpdate}
              onTogglePinUpdate={handleTogglePinUpdate}
              onDeleteUpdate={handleDeleteUpdate}
              onSetCandidateBan={handleSetCandidateBan}
              onGrantBonus={handleGrantBonus}
              onUpsertStaffInvite={handleUpsertStaffInvite}
              onUpdateStaffInvite={handleUpdateStaffInvite}
              onOpenVerifyModal={handleOpenVerifyModal}
            />
          )}
        </main>
      </div>

      {/* Persistent Cloud Account & Role Preview Modal */}
      <AuthCloudModal
        isOpen={isAuthModalOpen}
        onClose={() => setIsAuthModalOpen(false)}
        account={account}
        candidateSummary={cloudSummary}
        staffAccess={effectiveStaffAccess}
        isSyncing={isSyncingCloud}
        cloudTokenDiagnostic={cloudTokenDiagnostic}
        onDismissTokenDiagnostic={clearCloudTokenDiagnostic}
        onGoogleLogin={async () => {
          await signInWithGooglePopup();
        }}
        onMicrosoftLogin={async () => {
          await signInWithMicrosoftPopup();
        }}
        onSignOut={signOutAccount}
        onManualSyncNow={handleManualCloudSync}
        onOpenPrivacyPolicy={() => {
          setIsAuthModalOpen(false);
          setIsPrivacyModalOpen(true);
        }}
        showSandboxPreviewControls={!account}
        onSelectSandboxRole={handleSelectSandboxRole}
        onReturnToLoginPortal={() => {
          setSandboxBannedPreview(false);
          setHasEnteredLocalSandbox(false);
        }}
      />

      {/* Campus Updates, Bonuses, XP Deductions & Credential Verification Alerts Vault */}
      <UpdatesAndBonusesModal
        isOpen={isUpdatesModalOpen}
        onClose={() => setIsUpdatesModalOpen(false)}
        globalUpdates={effectiveGlobalUpdates}
        personalBonuses={effectivePersonalBonuses}
        verificationNotices={verificationNotices}
        totalBonusPoints={effectiveBonusPoints}
        totalDeductedPoints={effectiveDeductedPoints}
        recoveredDeductionIds={recoveredDeductionIds}
        onAcknowledgeBonus={handleAcknowledgeBonus}
        onOpenEthicsRecovery={(bonus) => {
          setIsUpdatesModalOpen(false);
          setEthicsRecoveryBonus(bonus);
        }}
        onAcknowledgeVerification={handleAcknowledgeVerification}
      />

      {/* Social Achievement Flex Modal */}
      <FlexShareModal
        achievement={activeFlexAchievement}
        student={appState.student}
        ownerKey={ownerKey}
        xpSnapshot={xpSnapshot}
        staleSubjects={staleSubjects}
        onStartSkillRefresh={(subjectId) => {
          setActiveFlexAchievement(null);
          setRefreshQuizSubjectId(subjectId);
        }}
        onOpenVerifyModal={(serialCode) => {
          setActiveFlexAchievement(null);
          handleOpenVerifyModal(serialCode);
        }}
        onClose={() => setActiveFlexAchievement(null)}
      />

      {/* Public & Staff Credential Serial Verification Modal */}
      <CredentialVerifyModal
        isOpen={isVerifyModalOpen}
        onClose={() => setIsVerifyModalOpen(false)}
        initialSerial={verifyPrefillSerial}
        isStaff={effectiveStaffAccess.tier !== 'none'}
        staffRoleLabel={effectiveStaffAccess.roleLabel}
        defaultVerifierName={account?.displayName || ''}
        defaultVerifierGmail={account?.email || ''}
        onVerifiedNoticeGenerated={(notice) => {
          if (
            notice.targetUserId === ownerKey ||
            (!account && notice.targetUserId === 'cand-aarav-01')
          ) {
            setVerificationNotices((prev) => [
              notice,
              ...prev.filter((n) => n.id !== notice.id),
            ]);
          }
        }}
      />

      {/* 60-Day Subject Skill Refresh 3-Question Quiz Modal */}
      <SkillRefreshQuizModal
        isOpen={Boolean(refreshQuizSubjectId && activeRefreshSubject)}
        onClose={() => setRefreshQuizSubjectId(null)}
        subject={activeRefreshSubject}
        topics={appState.topics}
        student={appState.student}
        daysSincePractice={activeRefreshStatus?.daysSincePractice ?? 60}
        onCompleteRefresh={handleCompleteSkillRefresh}
      />

      {/* AI-Generated Academic Integrity & Ethics XP Recovery Modal */}
      <EthicsRecoveryModal
        isOpen={Boolean(ethicsRecoveryBonus)}
        onClose={() => setEthicsRecoveryBonus(null)}
        deductionBonus={ethicsRecoveryBonus}
        alreadyRecovered={
          ethicsRecoveryBonus
            ? recoveredDeductionIds.includes(ethicsRecoveryBonus.id)
            : false
        }
        onCompleteRecovery={handleCompleteEthicsRecovery}
      />

      {/* Comprehensive Candidate Data & Privacy Policy Modal */}
      {isPrivacyModalOpen && (
        <PrivacyPolicyModal onClose={() => setIsPrivacyModalOpen(false)} />
      )}
    </div>
  );
}

