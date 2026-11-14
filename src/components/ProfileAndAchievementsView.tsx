import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  Award,
  Camera,
  Check,
  CheckCircle2,
  Cloud,
  Copy,
  Download,
  Eye,
  EyeOff,
  FileCheck2,
  Lock,
  RefreshCw,
  RotateCcw,
  Share2,
  ShieldCheck,
  Sparkles,
  User,
} from 'lucide-react';
import type {
  Achievement,
  AppState,
  AuthenticatedAccount,
  AvatarVisibility,
  CandidateXpSnapshot,
  IssuedCredentialDoc,
  SubjectRefreshStatus,
} from '../types';
import { fetchStudentAboutSummaryAi, registerCredentialApi } from '../utils/apiClient';
import { registerIssuedCredentialInCloud } from '../services/cloudService';
import { downloadReportCardPdf } from '../utils/pdfExport';
import {
  ALERTNESS_SLOT_MAP,
  LEARNING_STYLE_LABELS,
  recalculateSubjectScoresOutOf10,
} from '../utils/studyEngine';
import {
  buildFallbackStudentAboutLines,
  generateFlexCardSerial,
  generateReportCardSerial,
  generateScholarProfileId,
  normalizeStudentAboutLines,
} from '../utils/verificationAndReferral';
import {
  FLEX_RARITY_MILESTONES,
  getTodayDateISO,
  shiftDateISO,
} from '../utils/xpAndOutreachEngine';
import avatarImg from '../assets/images/avatar_student_profile_1793010659413.jpg';
import { ProfilePhotoStudio } from './ProfilePhotoStudio';
import { QrVerifyStamp } from './QrVerifyStamp';

interface ProfileAndAchievementsViewProps {
  state: AppState;
  mode: 'profile' | 'achievements';
  ownerKey?: string;
  account?: AuthenticatedAccount | null;
  bonusPoints?: number;
  xpSnapshot: CandidateXpSnapshot;
  subjectRefreshStatuses?: SubjectRefreshStatus[];
  onStartSkillRefresh?: (subjectId: string) => void;
  onOpenVerifyModal?: (serial?: string) => void;
  onSaveStudentAboutLines?: (lines: string[]) => void;
  onOpenAuthModal?: () => void;
  onOpenPrivacyPolicy: () => void;
  onOpenFlexModal: (achievement: Achievement) => void;
  onResetSyllabusSetup: () => void;
  onUpdateStudentContactAndActivity?: (patch: {
    email?: string;
    phoneNumber?: string;
    notifyGmailOptIn?: boolean;
    notifyWhatsappOptIn?: boolean;
    lastActiveDate?: string;
    avatarUrl?: string;
    avatarVisibility?: AvatarVisibility;
    accountRole?: 'student' | 'teacher';
  }) => void;
}

export const ProfileAndAchievementsView: React.FC<ProfileAndAchievementsViewProps> = ({
  state,
  mode,
  ownerKey,
  account,
  bonusPoints = 0,
  xpSnapshot,
  subjectRefreshStatuses = [],
  onStartSkillRefresh,
  onOpenVerifyModal,
  onSaveStudentAboutLines,
  onOpenAuthModal,
  onOpenPrivacyPolicy,
  onOpenFlexModal,
  onResetSyllabusSetup,
  onUpdateStudentContactAndActivity,
}) => {
  const [avatarFailed, setAvatarFailed] = useState(false);
  const [isPhotoStudioOpen, setIsPhotoStudioOpen] = useState(false);
  const [reportSubjectFilter, setReportSubjectFilter] = useState<string>('all');
  const [reportTimeFilter, setReportTimeFilter] = useState<'all' | 'today' | '7d' | '30d'>('all');

  const resolvedAvatarSrc = state.student.avatarUrl || account?.photoURL || avatarImg;

  useEffect(() => {
    setAvatarFailed(false);
  }, [resolvedAvatarSrc]);

  const [contactEmail, setContactEmail] = useState(state.student.email || account?.email || '');
  const [phoneNumber, setPhoneNumber] = useState(state.student.phoneNumber || '');
  const [notifyGmailOptIn, setNotifyGmailOptIn] = useState(
    state.student.notifyGmailOptIn ?? true
  );
  const [notifyWhatsappOptIn, setNotifyWhatsappOptIn] = useState(
    state.student.notifyWhatsappOptIn ?? true
  );
  const [prefsSavedBanner, setPrefsSavedBanner] = useState(false);

  useEffect(() => {
    setContactEmail(state.student.email || account?.email || '');
    setPhoneNumber(state.student.phoneNumber || '');
    setNotifyGmailOptIn(state.student.notifyGmailOptIn ?? true);
    setNotifyWhatsappOptIn(state.student.notifyWhatsappOptIn ?? true);
  }, [
    state.student.email,
    state.student.phoneNumber,
    state.student.notifyGmailOptIn,
    state.student.notifyWhatsappOptIn,
    account?.email,
  ]);

  const { updatedSubjects, overallSyllabusScoreOutOf10 } = recalculateSubjectScoresOutOf10(
    state.subjects,
    state.attempts
  );

  const handleSaveContactPrefs = (e: React.FormEvent) => {
    e.preventDefault();
    if (!onUpdateStudentContactAndActivity) return;
    onUpdateStudentContactAndActivity({
      email: contactEmail.trim(),
      phoneNumber: phoneNumber.trim(),
      notifyGmailOptIn,
      notifyWhatsappOptIn,
    });
    setPrefsSavedBanner(true);
    setTimeout(() => setPrefsSavedBanner(false), 2600);
  };

  const handleSetInactivityOffsetDays = (daysAgo: number) => {
    if (!onUpdateStudentContactAndActivity) return;
    const today = getTodayDateISO();
    const targetLastActive = shiftDateISO(today, -Math.max(0, daysAgo));
    onUpdateStudentContactAndActivity({ lastActiveDate: targetLastActive });
  };

  // Filter attempts for Report Card
  const nowMs = Date.now();
  const filteredAttempts = state.attempts.filter((att) => {
    if (reportSubjectFilter !== 'all') {
      const hasSubj = att.subjectBreakdown.some((sb) => sb.subjectId === reportSubjectFilter);
      if (!hasSubj) return false;
    }

    if (reportTimeFilter === 'today') {
      return att.dateISO === new Date().toISOString().slice(0, 10);
    }
    if (reportTimeFilter === '7d') {
      const diffDays = (nowMs - new Date(att.dateISO).getTime()) / (1000 * 60 * 60 * 24);
      return diffDays <= 7.5;
    }
    if (reportTimeFilter === '30d') {
      const diffDays = (nowMs - new Date(att.dateISO).getTime()) / (1000 * 60 * 60 * 24);
      return diffDays <= 30.5;
    }
    return true;
  });

  const selectedSubjectLabel =
    reportSubjectFilter === 'all'
      ? 'All Subjects'
      : state.subjects.find((s) => s.id === reportSubjectFilter)?.name || 'Selected Subject';

  const selectedTimeframeLabel =
    reportTimeFilter === 'all'
      ? 'All Time'
      : reportTimeFilter === 'today'
      ? 'Today'
      : reportTimeFilter === '7d'
      ? 'Last 7 Days'
      : 'Last 30 Days';

  const [copiedProfileId, setCopiedProfileId] = useState(false);

  const effectiveOwnerKey = ownerKey || account?.uid || 'sandbox-candidate';
  const myProfileId = state.student.profileId || generateScholarProfileId(effectiveOwnerKey);
  const staleSubjects = subjectRefreshStatuses.filter((s) => s.needsRefresh);
  const warningSubjects = subjectRefreshStatuses.filter((s) => s.approachingRefreshWarning);
  const avatarVisibility: AvatarVisibility = state.student.avatarVisibility || 'world';

  const fallbackAboutLines = buildFallbackStudentAboutLines(state, xpSnapshot);
  const resolvedAboutLines = normalizeStudentAboutLines(
    state.student.aiAboutLines,
    fallbackAboutLines
  );

  const [isGeneratingAbout, setIsGeneratingAbout] = useState(false);
  const [aboutStatusNote, setAboutStatusNote] = useState<string | null>(null);

  const handleRegenerateStudentAbout = async () => {
    setIsGeneratingAbout(true);
    setAboutStatusNote(null);
    try {
      const result = await fetchStudentAboutSummaryAi({ state, xpSnapshot });
      onSaveStudentAboutLines?.(result.lines);
      setAboutStatusNote(
        result.usedAi
          ? `Updated ${result.lines.length}-line AI performance narrative.`
          : `Refreshed ${result.lines.length}-line performance narrative from latest telemetry.`
      );
    } finally {
      setIsGeneratingAbout(false);
    }
  };

  const reportCardSerial = generateReportCardSerial(effectiveOwnerKey, reportSubjectFilter);

  useEffect(() => {
    if (!reportCardSerial) return;
    const issuedReport: IssuedCredentialDoc = {
      credentialCode: reportCardSerial,
      kind: 'report_card',
      ownerUid: effectiveOwnerKey,
      ownerName: state.student.name || 'Scholar',
      candidateEmail: state.student.email || account?.email,
      boardOrUniversity: state.student.boardOrUniversity || 'University',
      examName: state.student.examName || 'Final Examinations',
      title: `${state.student.name || 'Scholar'} — Official SyllabiQ Report Card (${selectedSubjectLabel})`,
      subtitleOrMetric:
        overallSyllabusScoreOutOf10 !== null
          ? `${overallSyllabusScoreOutOf10}/10 Aggregate · ${filteredAttempts.length} Timed PYQ Tests`
          : `${selectedSubjectLabel} · Verified Academic Dossier`,
      xpPoints: xpSnapshot.netXp,
      flexTier: xpSnapshot.rarity.tier,
      issuedDateISO: getTodayDateISO(),
    };
    void registerCredentialApi(issuedReport);
    if (account && account.emailVerified) {
      void registerIssuedCredentialInCloud(issuedReport);
    }
  }, [
    reportCardSerial,
    effectiveOwnerKey,
    state.student.name,
    state.student.email,
    state.student.boardOrUniversity,
    state.student.examName,
    account,
    selectedSubjectLabel,
    overallSyllabusScoreOutOf10,
    filteredAttempts.length,
    xpSnapshot.netXp,
    xpSnapshot.rarity.tier,
  ]);

  if (mode === 'achievements') {
    const unlockedCount = state.achievements.filter((a) => a.unlocked).length;
    const {
      rarity,
      netXp,
      earnedRawXp,
      bonusXp,
      adminDeductionXp: deductedXp,
      recoveredEthicsXp,
      decayPenaltyXp,
      inactiveDays,
      activeLearnerDissolved,
    } = xpSnapshot;

    return (
      <div className="space-y-6">
        {/* XP & Collectible FlexCard Rarity Milestone Anchor */}
        <section className="glass-prism-dark rounded-2xl p-6 text-white">
          <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-5">
            <div className="space-y-1.5">
              <div className={`flex flex-wrap items-center gap-2 text-xs font-semibold ${rarity.textAccentClass}`}>
                <Sparkles className="h-4 w-4 shrink-0" />
                <span>{rarity.badgeLabel}</span>
                <span aria-hidden="true">·</span>
                <span>{rarity.dropRateLabel}</span>
              </div>
              <h2 className="font-display text-2xl font-bold text-white">
                {netXp} XP · {rarity.tier} FlexCard Tier
              </h2>
              <p className="text-xs text-slate-300 leading-relaxed max-w-2xl">
                XP upgrades your collectible FlexCard rarity automatically across 5 milestones. Share
                unlocked badges on WhatsApp, LinkedIn, Instagram, X, and Reddit.
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-5 font-mono tabular-nums text-xs text-slate-300 shrink-0">
              <div>
                <p className="text-slate-400">Study &amp; Badges</p>
                <p className="text-base font-bold text-white">+{earnedRawXp} XP</p>
              </div>
              <div>
                <p className="text-slate-400">Mentor Bonus</p>
                <p className="text-base font-bold text-sky-300">+{bonusXp} XP</p>
              </div>
              {(deductedXp > 0 || recoveredEthicsXp > 0) && (
                <div>
                  <p className="text-slate-400">Conduct / Recovery</p>
                  <p className="text-base font-bold text-amber-300">
                    -{deductedXp} / +{recoveredEthicsXp} XP
                  </p>
                </div>
              )}
              <div>
                <p className="text-slate-400">Inactivity Decay</p>
                <p className={`text-base font-bold ${decayPenaltyXp > 0 ? 'text-amber-300' : 'text-emerald-300'}`}>
                  {decayPenaltyXp > 0 ? `-${decayPenaltyXp} XP` : '0 XP'}
                </p>
              </div>
            </div>
          </div>

          {/* Milestone Progress Bar */}
          <div className="mt-5 space-y-2">
            <div className="flex items-center justify-between text-xs text-slate-300">
              <span>
                {rarity.nextTier && rarity.nextTierXp
                  ? `Progress to ${rarity.nextTier} (${rarity.nextTierXp} XP)`
                  : 'Highest Collectible Rarity Unlocked (Mythic Sovereign)'}
              </span>
              <span className="font-mono tabular-nums font-semibold text-white">
                {rarity.progressPercent}%
              </span>
            </div>
            <div className="h-2 w-full overflow-hidden rounded-full bg-slate-800">
              <div
                className="h-full rounded-full bg-sky-400 transition-transform duration-150 origin-left"
                style={{ transform: `scaleX(${Math.max(0.02, rarity.progressPercent / 100)})` }}
              />
            </div>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2 pt-2 text-[11px] font-mono tabular-nums text-slate-400">
              {FLEX_RARITY_MILESTONES.map((m) => {
                const reached = netXp >= m.minXp;
                return (
                  <div
                    key={m.tier}
                    className={reached ? 'text-white font-semibold' : 'text-slate-500'}
                  >
                    {reached ? '✓ ' : ''}
                    {m.tier} ({m.minXp}+)
                  </div>
                );
              })}
            </div>
          </div>
        </section>

        {/* 3-Day Inactivity Dissolution & Daily XP Decay Monitor */}
        <section className="glass-panel rounded-2xl p-6 space-y-4">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold">
                {activeLearnerDissolved ? (
                  <span className="inline-flex items-center gap-1.5 text-amber-800">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>
                      Active Learner Dissolved · {inactiveDays} Days Inactive (-{decayPenaltyXp} XP Decayed)
                    </span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-emerald-700">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>
                      Active Learner Protected · {inactiveDays === 0 ? 'Studied Today' : `${inactiveDays}d Since Last Session`} (3-Day Shield Active)
                    </span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Staying inactive for <strong className="text-slate-900">3 or more days</strong> dissolves
                your Active Learner Pulse badge and decays earned XP by{' '}
                <span className="font-mono tabular-nums font-semibold">40 XP/day</span>. Completing any
                chapter, focus sprint, or timed PYQ drill immediately restores your active streak.
              </p>
            </div>

            {onUpdateStudentContactAndActivity && (
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                <div
                  role="group"
                  aria-label="Activity window check"
                  className="flex items-center gap-1 rounded-lg bg-slate-100 p-1"
                >
                  <button
                    type="button"
                    onClick={() => handleSetInactivityOffsetDays(0)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      inactiveDays === 0
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Active Today
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetInactivityOffsetDays(4)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      inactiveDays === 4
                        ? 'bg-white text-amber-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Test 4d Inactive
                  </button>
                  <button
                    type="button"
                    onClick={() => handleSetInactivityOffsetDays(6)}
                    className={`rounded-md px-3 py-1.5 text-xs font-medium transition-colors whitespace-nowrap shrink-0 ${
                      inactiveDays >= 6
                        ? 'bg-white text-amber-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Test 6d Inactive
                  </button>
                </div>

                {activeLearnerDissolved && (
                  <button
                    type="button"
                    onClick={() => handleSetInactivityOffsetDays(0)}
                    className="rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
                  >
                    Log Study Activity Now
                  </button>
                )}
              </div>
            )}
          </div>
        </section>

        {/* 60-Day Subject Competence & 7-Day Proactive Luster Warning */}
        <section className="glass-panel rounded-2xl p-6 space-y-3">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4">
            <div className="space-y-1">
              <div className="flex items-center gap-2 text-xs font-semibold">
                {staleSubjects.length > 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-amber-800">
                    <RefreshCw className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>
                      Skill Refresh Needed on {staleSubjects.length}{' '}
                      {staleSubjects.length === 1 ? 'Subject' : 'Subjects'} (60+ Days Unpracticed)
                    </span>
                  </span>
                ) : warningSubjects.length > 0 ? (
                  <span className="inline-flex items-center gap-1.5 text-amber-800">
                    <AlertTriangle className="h-4 w-4 text-amber-600 shrink-0" />
                    <span>
                      7-Day Luster Warning · {warningSubjects[0].warningMessage}
                    </span>
                  </span>
                ) : (
                  <span className="inline-flex items-center gap-1.5 text-emerald-700">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                    <span>Full FlexCard Luster Active · All Subjects Practiced Within 60 Days</span>
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 leading-relaxed">
                Employers and faculty see up-to-date subject competence on your FlexCards. SyllabiQ
                alerts you <span className="font-mono tabular-nums font-semibold">7 days early</span>{' '}
                (at 53 days) before any subject crosses 60 days unpracticed and dims your badge.
              </p>
            </div>

            {(staleSubjects.length > 0 || warningSubjects.length > 0) && onStartSkillRefresh && (
              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {[...staleSubjects, ...warningSubjects].map((st) => (
                  <button
                    key={st.subjectId}
                    type="button"
                    onClick={() => onStartSkillRefresh(st.subjectId)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                  >
                    <RefreshCw className="h-3.5 w-3.5 text-sky-400" />
                    <span>
                      Quick Sprint: {st.subjectName} ({st.daysSincePractice}d)
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        </section>

        {/* Automatic Achievements & Social Flex Gallery */}
        <section className="glass-panel rounded-2xl p-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <h3 className="font-display text-xl font-bold text-slate-900">
                Automatic Achievements &amp; Rare Social Flex Cards
              </h3>
              <p className="mt-1 text-xs text-slate-600">
                Every unlocked FlexCard carries a unique cryptographic serial verifiable by teachers,
                recruiters, and peers.
              </p>
            </div>
            <div className="flex items-center gap-3 shrink-0">
              {onOpenVerifyModal && (
                <button
                  type="button"
                  onClick={() => onOpenVerifyModal()}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  <FileCheck2 className="h-3.5 w-3.5 text-sky-600" />
                  <span>Verify Any Serial</span>
                </button>
              )}
              <div className="font-mono tabular-nums text-xs font-semibold text-sky-700">
                {unlockedCount} / {state.achievements.length} Active Badges
              </div>
            </div>
          </div>

          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 gap-4">
            {state.achievements.map((ach) => {
              const isDissolved = Boolean(ach.dissolvedReason);
              const flexSerial = generateFlexCardSerial(effectiveOwnerKey, ach.code);
              return (
                <div
                  key={ach.id}
                  className={`rounded-xl border p-5 flex flex-col justify-between gap-4 ${
                    ach.unlocked
                      ? 'border-slate-200 bg-white'
                      : isDissolved
                      ? 'border-amber-200 bg-amber-50/40'
                      : 'border-slate-200 bg-slate-50/70 opacity-85'
                  }`}
                >
                  <div>
                    <div className="flex items-center justify-between gap-2 text-xs">
                      <span
                        className={
                          ach.unlocked
                            ? 'font-semibold text-emerald-700'
                            : isDissolved
                            ? 'font-semibold text-amber-800'
                            : 'font-medium text-slate-500'
                        }
                      >
                        {ach.unlocked
                          ? `✓ Unlocked ${ach.unlockedAt || ''}`
                          : isDissolved
                          ? '▲ Dissolved due to Inactivity'
                          : 'Locked Milestone'}
                      </span>
                      <span className="font-mono tabular-nums text-slate-600">
                        {ach.metricBadge} · +{ach.xpReward ?? 60} XP
                      </span>
                    </div>

                    <h4 className="mt-2 font-display text-base font-bold text-slate-900 flex items-center gap-2">
                      {ach.unlocked ? (
                        <Award className="h-4 w-4 text-sky-600 shrink-0" />
                      ) : (
                        <Lock className="h-4 w-4 text-slate-400 shrink-0" />
                      )}
                      <span>{ach.title}</span>
                    </h4>
                    <p className="mt-1 text-xs text-slate-600 leading-relaxed">{ach.description}</p>

                    {ach.unlocked && (
                      <div className="mt-2.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-[11px] text-slate-500">
                        <span className="font-mono tabular-nums font-semibold text-slate-700">
                          Serial: {flexSerial}
                        </span>
                        {onOpenVerifyModal && (
                          <>
                            <span aria-hidden="true">·</span>
                            <button
                              type="button"
                              onClick={() => onOpenVerifyModal(flexSerial)}
                              className="font-semibold text-sky-700 hover:underline whitespace-nowrap"
                            >
                              Verify Serial
                            </button>
                          </>
                        )}
                        {staleSubjects.length > 0 && (
                          <>
                            <span aria-hidden="true">·</span>
                            <span className="font-medium text-amber-800">
                              Skill Refresh Needed ({staleSubjects[0].subjectName} ·{' '}
                              {staleSubjects[0].daysSincePractice}d)
                            </span>
                          </>
                        )}
                      </div>
                    )}

                    {ach.dissolvedReason && (
                      <p className="mt-2 text-xs font-medium text-amber-900">
                        {ach.dissolvedReason}
                      </p>
                    )}
                  </div>

                  <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3">
                    <span className="text-[11px] font-mono tabular-nums text-slate-500">
                      Card Tier: {rarity.tier}
                    </span>
                    <div className="flex items-center gap-2">
                      {ach.unlocked && staleSubjects.length > 0 && onStartSkillRefresh && (
                        <button
                          type="button"
                          onClick={() => onStartSkillRefresh(staleSubjects[0].subjectId)}
                          className="inline-flex items-center gap-1 rounded-lg border border-amber-300 bg-amber-50/70 px-2.5 py-1.5 text-xs font-semibold text-amber-900 hover:bg-amber-100/80 transition-colors whitespace-nowrap shrink-0"
                        >
                          <RefreshCw className="h-3 w-3" />
                          <span>Refresh Skill (3-Q)</span>
                        </button>
                      )}
                      {ach.unlocked && netXp > 0 ? (
                        <button
                          type="button"
                          onClick={() => onOpenFlexModal(ach)}
                          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0"
                        >
                          <Share2 className="h-3.5 w-3.5 text-sky-400" />
                          <span>Flex Rare Card</span>
                        </button>
                      ) : (
                        <span className="text-xs text-slate-400">
                          {isDissolved
                            ? 'Resume study to restore badge'
                            : 'Complete milestone to Flex'}
                        </span>
                      )}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </div>
    );
  }

  const slotInfo = ALERTNESS_SLOT_MAP[state.student.alertnessWindow];

  return (
    <div className="space-y-6">
      {/* Student Profile & Whole-Syllabus / Per-Subject /10 Ratings */}
      <section className="glass-panel rounded-2xl p-6">
        <div className="border-b border-slate-200 pb-5 space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="flex items-center gap-4 min-w-0 flex-1">
              <button
                type="button"
                onClick={() => setIsPhotoStudioOpen((prev) => !prev)}
                aria-label="Customize profile image"
                className="group relative h-16 w-16 shrink-0 overflow-hidden rounded-full border border-slate-200 bg-slate-100 flex items-center justify-center focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-sky-600"
              >
                {!avatarFailed ? (
                  <img
                    data-testid="profile-header-avatar-img"
                    src={resolvedAvatarSrc}
                    alt={`${state.student.name} student profile portrait`}
                    referrerPolicy="no-referrer"
                    onError={() => setAvatarFailed(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <User className="h-7 w-7 text-slate-500" />
                )}
                <span className="pointer-events-none absolute inset-0 flex items-center justify-center bg-slate-900/55 opacity-0 transition-opacity duration-150 group-hover:opacity-100">
                  <Camera className="h-5 w-5 text-white" />
                </span>
              </button>

              <div className="min-w-0">
                <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1">
                  <h2 className="font-display text-xl font-bold text-slate-900 inline-flex items-center gap-2">
                    <span>{state.student.name}</span>
                    {state.student.accountRole === 'teacher' && (
                      <span
                        data-testid="profile-teacher-role-label"
                        className="font-sans text-xs font-semibold text-indigo-700"
                      >
                        · Teacher
                      </span>
                    )}
                  </h2>
                  <button
                    type="button"
                    onClick={async () => {
                      try {
                        await navigator.clipboard?.writeText(myProfileId);
                      } catch {
                        // Ignore clipboard fallback
                      }
                      setCopiedProfileId(true);
                      setTimeout(() => setCopiedProfileId(false), 2000);
                    }}
                    title="Copy Scholar Profile ID for World search"
                    className="inline-flex items-center gap-1 font-mono text-xs font-semibold text-sky-700 hover:text-sky-900 transition-colors"
                  >
                    <span>ID: {myProfileId}</span>
                    {copiedProfileId ? (
                      <Check className="h-3 w-3 text-emerald-600" />
                    ) : (
                      <Copy className="h-3 w-3 text-slate-400" />
                    )}
                  </button>
                </div>
                <div className="mt-1 flex flex-wrap items-center gap-1.5 text-xs text-slate-600">
                  <span>{state.student.boardOrUniversity}</span>
                  <span aria-hidden="true">·</span>
                  <span>{state.student.examName}</span>
                  <span aria-hidden="true">·</span>
                  <span className="font-mono tabular-nums">Exam: {state.student.examDate}</span>
                </div>
                <p className="mt-1 text-xs text-slate-500">
                  Alertness: {slotInfo.label} ({slotInfo.peakRange}) · Style:{' '}
                  {LEARNING_STYLE_LABELS[state.student.learningStyle]} ·{' '}
                  <span className="font-mono tabular-nums text-sky-700 font-semibold">
                    {xpSnapshot.netXp} XP ({xpSnapshot.rarity.tier})
                  </span>{' '}
                  ·{' '}
                  <span className="font-mono tabular-nums text-slate-700">
                    +{bonusPoints} Admin Bonus
                  </span>
                </p>
              </div>
            </div>

            <div className="text-left sm:text-right shrink-0">
              <p className="text-xs text-slate-500">Whole-Syllabus Rating</p>
              <p className="font-mono tabular-nums text-2xl font-bold text-sky-700">
                {overallSyllabusScoreOutOf10 !== null
                  ? `${overallSyllabusScoreOutOf10} / 10`
                  : '— / 10'}
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 pt-1">
            <button
              type="button"
              onClick={() => setIsPhotoStudioOpen((prev) => !prev)}
              aria-expanded={isPhotoStudioOpen}
              className={`inline-flex items-center gap-1.5 rounded-lg border px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                isPhotoStudioOpen
                  ? 'border-slate-900 bg-slate-900 text-white'
                  : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
              }`}
            >
              <Camera className={`h-3.5 w-3.5 ${isPhotoStudioOpen ? 'text-sky-400' : 'text-sky-600'}`} />
              <span>{state.student.avatarUrl ? 'Edit Photo' : 'Change Photo'}</span>
            </button>

            {onOpenAuthModal && (
              <button
                type="button"
                onClick={onOpenAuthModal}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <Cloud className="h-3.5 w-3.5 text-sky-600" />
                <span>{account ? 'Cloud Synced' : 'Connect Google / Microsoft'}</span>
              </button>
            )}

            <button
              type="button"
              onClick={onOpenPrivacyPolicy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <ShieldCheck className="h-3.5 w-3.5 text-sky-600" />
              <span>Privacy Policy</span>
            </button>

            <button
              type="button"
              onClick={onResetSyllabusSetup}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
            >
              <RotateCcw className="h-3.5 w-3.5" />
              <span>Upload New Syllabus</span>
            </button>

            {onUpdateStudentContactAndActivity && (
              <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto sm:ml-auto">
                <div
                  role="group"
                  aria-label="Account role for World and community posts"
                  className="inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1"
                >
                  <button
                    type="button"
                    data-testid="role-toggle-student"
                    onClick={() =>
                      onUpdateStudentContactAndActivity({ accountRole: 'student' })
                    }
                    className={`inline-flex items-center justify-center rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      (state.student.accountRole || 'student') === 'student'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Student
                  </button>
                  <button
                    type="button"
                    data-testid="role-toggle-teacher"
                    onClick={() =>
                      onUpdateStudentContactAndActivity({ accountRole: 'teacher' })
                    }
                    className={`inline-flex items-center justify-center rounded-md px-2.5 py-1.5 text-xs font-medium transition-colors whitespace-nowrap ${
                      state.student.accountRole === 'teacher'
                        ? 'bg-white text-indigo-700 font-semibold shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    Teacher
                  </button>
                </div>

                <div
                  role="group"
                  aria-label="Social SyllabiQ profile photo visibility"
                  className="grid grid-cols-2 sm:inline-flex items-center gap-1 rounded-lg bg-slate-100 p-1 w-full sm:w-auto"
                >
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateStudentContactAndActivity({ avatarVisibility: 'world' })
                    }
                    className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 sm:px-3 py-1.5 text-xs font-medium transition-colors sm:whitespace-nowrap ${
                      avatarVisibility === 'world'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <Eye className="h-3.5 w-3.5 text-sky-600 shrink-0" />
                    <span className="truncate">Photo: Everyone</span>
                  </button>
                  <button
                    type="button"
                    onClick={() =>
                      onUpdateStudentContactAndActivity({ avatarVisibility: 'connections_only' })
                    }
                    className={`inline-flex items-center justify-center gap-1.5 rounded-md px-2.5 sm:px-3 py-1.5 text-xs font-medium transition-colors sm:whitespace-nowrap ${
                      avatarVisibility === 'connections_only'
                        ? 'bg-white text-slate-900 shadow-2xs'
                        : 'text-slate-600 hover:text-slate-900'
                    }`}
                  >
                    <EyeOff className="h-3.5 w-3.5 text-slate-600 shrink-0" />
                    <span className="truncate">Photo: 1-on-1 Only</span>
                  </button>
                </div>
              </div>
            )}
          </div>
        </div>

        {/* Custom Profile Image Studio (Upload + Crop, Direct URL, Monograms) */}
        {isPhotoStudioOpen && (
          <ProfilePhotoStudio
            studentName={state.student.name}
            currentAvatarUrl={state.student.avatarUrl}
            account={account}
            onSaveAvatar={(avatarUrl) => {
              onUpdateStudentContactAndActivity?.({ avatarUrl });
            }}
            onClose={() => setIsPhotoStudioOpen(false)}
          />
        )}

        {/* 10–15 Line AI-Written "About the Student" Performance & Discipline Dossier */}
        <div className="mt-5 rounded-xl border border-slate-200 bg-white p-5 space-y-3">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-3">
            <div>
              <h3 className="font-display text-sm font-bold text-slate-900">
                About the Student · AI Performance &amp; Study Dossier
              </h3>
              <p className="mt-0.5 text-xs text-slate-500">
                <span className="font-mono tabular-nums font-semibold text-slate-700">
                  {resolvedAboutLines.length} lines
                </span>
                <span aria-hidden="true"> · </span>
                <span>
                  Synthesized from past baseline marks, timed PYQ scores, alertness window, and focus
                  discipline
                </span>
              </p>
            </div>
            <button
              type="button"
              disabled={isGeneratingAbout}
              onClick={handleRegenerateStudentAbout}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
            >
              <Sparkles className="h-3.5 w-3.5 text-sky-600" />
              <span>{isGeneratingAbout ? 'Writing Dossier…' : 'Regenerate with AI'}</span>
            </button>
          </div>

          {aboutStatusNote && (
            <p className="text-xs font-medium text-sky-700">{aboutStatusNote}</p>
          )}

          <ol
            data-testid="profile-student-about-lines"
            className="space-y-1.5 text-xs leading-relaxed text-slate-700"
          >
            {resolvedAboutLines.map((line, idx) => (
              <li key={idx} className="flex items-baseline gap-2.5">
                <span className="font-mono tabular-nums text-[11px] text-slate-400 select-none shrink-0">
                  {String(idx + 1).padStart(2, '0')}.
                </span>
                <span>{line}</span>
              </li>
            ))}
          </ol>
        </div>

        {/* Candidate Contact & Gmail / WhatsApp Notification Preferences */}
        <form
          onSubmit={handleSaveContactPrefs}
          className="mt-5 rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-3"
        >
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div>
              <h3 className="text-sm font-bold text-slate-900">
                Gmail &amp; WhatsApp Mentor Notification Preferences
              </h3>
              <p className="text-xs text-slate-500">
                Receive achievement alerts, 3-day XP decay reminders, and priority syllabus chapter
                recommendations from verified SyllabiQ admins.
              </p>
            </div>
            <button
              type="button"
              onClick={onOpenPrivacyPolicy}
              className="text-xs font-semibold text-sky-700 hover:underline whitespace-nowrap shrink-0"
            >
              Full Data &amp; Privacy Disclosure &rarr;
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div>
              <label
                htmlFor="profile-gmail-input"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                Candidate Gmail Address
              </label>
              <input
                id="profile-gmail-input"
                type="email"
                value={contactEmail}
                onChange={(e) => setContactEmail(e.target.value)}
                placeholder="candidate@gmail.com"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-sky-600 focus:outline-hidden"
              />
            </div>

            <div>
              <label
                htmlFor="profile-whatsapp-input"
                className="block text-xs font-semibold text-slate-700 mb-1"
              >
                WhatsApp / Mobile Number
              </label>
              <input
                id="profile-whatsapp-input"
                type="tel"
                value={phoneNumber}
                onChange={(e) => setPhoneNumber(e.target.value)}
                placeholder="+91 98765 43210"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-sky-600 focus:outline-hidden"
              />
            </div>
          </div>

          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 pt-1">
            <div className="flex flex-col sm:flex-row sm:items-center gap-4 text-xs text-slate-700">
              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyGmailOptIn}
                  onChange={(e) => setNotifyGmailOptIn(e.target.checked)}
                  className="rounded border-slate-300 accent-sky-600"
                />
                <span>Allow Gmail achievement &amp; syllabus updates</span>
              </label>

              <label className="inline-flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={notifyWhatsappOptIn}
                  onChange={(e) => setNotifyWhatsappOptIn(e.target.checked)}
                  className="rounded border-slate-300 accent-sky-600"
                />
                <span>Allow WhatsApp active-streak &amp; syllabus updates</span>
              </label>
            </div>

            <div className="flex items-center gap-3 shrink-0">
              {prefsSavedBanner && (
                <span className="text-xs font-semibold text-emerald-700">
                  ✓ Preferences saved
                </span>
              )}
              <button
                type="submit"
                className="rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                Save Notification Settings
              </button>
            </div>
          </div>
        </form>

        {/* Individual Subject Scores Out of 10 */}
        <div className="mt-6">
          <h3 className="text-sm font-bold text-slate-900">
            Subject-by-Subject Score Out of 10 &amp; 60-Day Competence Currency
          </h3>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                  <th className="py-2.5 pr-3">Subject</th>
                  <th className="py-2.5 px-3">Student Difficulty</th>
                  <th className="py-2.5 px-3 text-right">Baseline Past Marks</th>
                  <th className="py-2.5 px-3 text-right">PYQs Answered</th>
                  <th className="py-2.5 px-3">60-Day Competence</th>
                  <th className="py-2.5 pl-3 text-right">Current Score / 10</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-sm">
                {updatedSubjects.map((subj) => {
                  const refreshInfo = subjectRefreshStatuses.find(
                    (st) => st.subjectId === subj.id
                  );
                  return (
                    <tr key={subj.id}>
                      <td className="py-3 pr-3 font-medium text-slate-900">{subj.name}</td>
                      <td className="py-3 px-3 text-xs capitalize text-slate-600">
                        {subj.difficulty}
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-xs text-slate-600">
                        {subj.previousScoreOutOf100}/100
                      </td>
                      <td className="py-3 px-3 text-right font-mono tabular-nums text-xs text-slate-600">
                        {subj.questionsCorrect}/{subj.questionsAnswered}
                      </td>
                      <td className="py-3 px-3 text-xs">
                        {refreshInfo?.needsRefresh ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-amber-800">
                              Skill Refresh Needed ({refreshInfo.daysSincePractice}d)
                            </span>
                            {onStartSkillRefresh && (
                              <button
                                type="button"
                                onClick={() => onStartSkillRefresh(subj.id)}
                                className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50/70 px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 whitespace-nowrap shrink-0"
                              >
                                <RefreshCw className="h-3 w-3" />
                                <span>Refresh (3-Q)</span>
                              </button>
                            )}
                          </div>
                        ) : refreshInfo?.approachingRefreshWarning ? (
                          <div className="flex flex-wrap items-center gap-2">
                            <span className="font-medium text-amber-800">
                              ▲ {refreshInfo.daysSincePractice}d · Dims in {refreshInfo.daysUntilDim}d
                            </span>
                            {onStartSkillRefresh && (
                              <button
                                type="button"
                                onClick={() => onStartSkillRefresh(subj.id)}
                                className="inline-flex items-center gap-1 rounded-md border border-amber-300 bg-amber-50/70 px-2 py-1 text-[11px] font-semibold text-amber-900 hover:bg-amber-100 whitespace-nowrap shrink-0"
                              >
                                <RefreshCw className="h-3 w-3" />
                                <span>Quick Sprint</span>
                              </button>
                            )}
                          </div>
                        ) : (
                          <span className="text-emerald-700 font-medium">
                            Up-to-date
                            {refreshInfo ? ` (${refreshInfo.daysSincePractice}d ago)` : ''}
                          </span>
                        )}
                      </td>
                      <td className="py-3 pl-3 text-right font-mono tabular-nums text-sm font-bold text-slate-900">
                        {subj.currentRatingOutOf10 !== null ? (
                          <span
                            className={
                              subj.currentRatingOutOf10 >= 8
                                ? 'text-emerald-700'
                                : 'text-slate-900'
                            }
                          >
                            {subj.currentRatingOutOf10} / 10
                          </span>
                        ) : (
                          <span className="text-slate-400 text-xs font-normal">Pending test</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </div>
      </section>

      {/* Filterable Report Card & PDF Download */}
      <section className="glass-panel rounded-2xl p-6 space-y-5">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
          <div className="flex items-start gap-4 min-w-0">
            <QrVerifyStamp
              serialCode={reportCardSerial}
              sizePx={72}
              testId="report-card-qr-stamp"
            />
            <div className="space-y-1 min-w-0">
              <h3 className="font-display text-lg font-bold text-slate-900">
                Official Test Report Card &amp; Scannable QR PDF Export
              </h3>
              <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                <span>Official Verification Serial:</span>
                <span
                  data-testid="report-card-serial-code"
                  className="font-mono tabular-nums font-bold text-slate-900"
                >
                  {reportCardSerial}
                </span>
                {onOpenVerifyModal && (
                  <>
                    <span aria-hidden="true">·</span>
                    <button
                      type="button"
                      onClick={() => onOpenVerifyModal(reportCardSerial)}
                      className="inline-flex items-center gap-1 font-semibold text-sky-700 hover:underline whitespace-nowrap"
                    >
                      <FileCheck2 className="h-3.5 w-3.5" />
                      <span>Verify Report Card</span>
                    </button>
                  </>
                )}
              </div>
              <p className="text-xs text-slate-500 leading-relaxed">
                Downloaded Report Card PDFs embed a scannable QR stamp (<span className="font-mono">?verify={reportCardSerial}</span>) for 1-scan authenticity checks. Non-admin checks notify {state.student.name} with the verifier&apos;s Name, Gmail, and Post.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <label htmlFor="report-subject-select" className="sr-only">
              Filter report card by subject
            </label>
            <select
              id="report-subject-select"
              value={reportSubjectFilter}
              onChange={(e) => setReportSubjectFilter(e.target.value)}
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-sky-600 focus:outline-hidden"
            >
              <option value="all">All Subjects</option>
              {state.subjects.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </select>

            <label htmlFor="report-time-select" className="sr-only">
              Filter report card by time range
            </label>
            <select
              id="report-time-select"
              value={reportTimeFilter}
              onChange={(e) =>
                setReportTimeFilter(e.target.value as 'all' | 'today' | '7d' | '30d')
              }
              className="rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-800 focus:border-sky-600 focus:outline-hidden"
            >
              <option value="all">All Time</option>
              <option value="today">Today</option>
              <option value="7d">Last 7 Days</option>
              <option value="30d">Last 30 Days</option>
            </select>

            <button
              type="button"
              onClick={() =>
                downloadReportCardPdf(
                  state,
                  filteredAttempts,
                  selectedSubjectLabel,
                  selectedTimeframeLabel,
                  {
                    reportSerialCode: reportCardSerial,
                    studentAboutLines: resolvedAboutLines,
                  }
                )
              }
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Download Report Card PDF</span>
            </button>
          </div>
        </div>

        {/* Report Card Embedded 10–15 Line Student Narrative */}
        <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <h4 className="text-xs font-bold text-slate-900">
              Official Report Card Student Summary ({resolvedAboutLines.length} Lines · AI Performance
              Evaluation)
            </h4>
            <span className="font-mono tabular-nums text-[11px] text-slate-500">
              Included in Exported PDF · {reportCardSerial}
            </span>
          </div>
          <div
            data-testid="report-card-student-about-lines"
            className="space-y-1 text-xs leading-relaxed text-slate-700"
          >
            {resolvedAboutLines.map((line, idx) => (
              <p key={idx}>{line}</p>
            ))}
          </div>
        </div>

        {filteredAttempts.length === 0 ? (
          <div className="py-10 text-center text-xs text-slate-500">
            No completed tests match <strong>{selectedSubjectLabel}</strong> in{' '}
            <strong>{selectedTimeframeLabel}</strong>.
          </div>
        ) : (
          <div className="mt-4 overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                  <th className="py-2.5 pr-3">Date</th>
                  <th className="py-2.5 px-3">Assessment Mode</th>
                  <th className="py-2.5 px-3">Subject Breakdown (/10)</th>
                  <th className="py-2.5 px-3 text-right">Time vs. Cap</th>
                  <th className="py-2.5 pl-3 text-right">Overall / 10</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 text-xs">
                {filteredAttempts.map((att) => (
                  <tr key={att.id} className="hover:bg-slate-50/70">
                    <td className="py-3 pr-3 font-mono tabular-nums text-slate-700">
                      {att.dateISO}
                    </td>
                    <td className="py-3 px-3 font-medium text-slate-900">
                      {att.mode === 'daily_target'
                        ? `Daily PYQ (${att.difficultyTier})`
                        : 'Countdown Blitz'}
                    </td>
                    <td className="py-3 px-3 text-slate-600">
                      {att.subjectBreakdown
                        .map((sb) => `${sb.subjectName}: ${sb.scoreOutOf10}/10`)
                        .join(' · ')}
                    </td>
                    <td className="py-3 px-3 text-right font-mono tabular-nums text-slate-600">
                      {att.durationSeconds}s / {att.targetTimeSeconds}s
                    </td>
                    <td className="py-3 pl-3 text-right font-mono tabular-nums font-bold text-slate-900">
                      {att.overallScoreOutOf10} / 10
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
};
