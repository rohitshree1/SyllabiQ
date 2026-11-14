export type AppLanguage = 'en';

export type AlertnessWindow = 'early_morning' | 'late_morning' | 'afternoon' | 'night_owl';

export type SubjectDifficulty = 'easy' | 'moderate' | 'hard';

export type ClassStatus = 'ongoing' | 'covered' | 'upcoming';

export type YieldType = 'high' | 'low';

export type DifficultyTier = 'Foundation' | 'Exam Standard' | 'Advanced PYQ' | 'Rank Booster';

export type LearningStylePreset =
  | 'visual_analogies'
  | 'step_by_step'
  | 'exam_shortcuts'
  | 'first_principles';

export type VerifierPostRole = 'teacher' | 'company_executive' | 'student';

export type CredentialKind = 'flexcard' | 'report_card';

export type AvatarVisibility = 'world' | 'connections_only';

export type PostRoleBadge = 'Super Admin' | 'Delegated Team Admin' | 'Teacher';

export interface IssuedCredentialDoc {
  credentialCode: string;
  kind: CredentialKind;
  ownerUid: string;
  ownerName: string;
  candidateEmail?: string;
  boardOrUniversity: string;
  examName: string;
  title: string;
  subtitleOrMetric: string;
  xpPoints: number;
  flexTier: FlexCardRarityTier;
  issuedDateISO: string;
  createdAt?: string;
  updatedAt?: string;
}

export interface CredentialVerificationNotice {
  id: string;
  credentialCode: string;
  credentialKind: CredentialKind;
  targetUserId: string;
  candidateEmail?: string;
  credentialTitle: string;
  verifierUid?: string;
  verifierName: string;
  verifierGmail: string;
  verifierPost: VerifierPostRole;
  acknowledged: boolean;
  createdAt: string;
}

export interface BanFlexAiDraft {
  headline: string;
  caption: string;
  comebackPledge: string;
  usedAi: boolean;
}

export interface AppealInterviewMessage {
  id: string;
  role: 'interviewer' | 'candidate';
  text: string;
}

export interface SuspensionAppealRecord {
  id: string;
  ownerUid: string;
  candidateName: string;
  candidateEmail: string;
  banReason: string;
  interviewTranscript: AppealInterviewMessage[];
  aiStructuredSummary: string;
  rootCauseAcknowledged: string;
  candidateCommitment: string;
  recommendedActionNote: string;
  status: 'pending_super_admin' | 'approved_unbanned' | 'rejected';
  createdAt: string;
  reviewedAt?: string;
  reviewedByEmail?: string;
  superAdminDecisionNote?: string;
}

export interface EthicsQuizQuestion {
  id: string;
  question: string;
  options: string[];
  correctIndex: number;
  explanation: string;
}

export interface EthicsRecoveryModule {
  bonusId: string;
  infractionTitle: string;
  infractionReason: string;
  deductedPoints: number;
  recoverableXp: number;
  whatHappenedSummary: string;
  whyItWasWrong: string;
  corePrinciples: string[];
  questions: EthicsQuizQuestion[];
  usedAi: boolean;
}

export interface SubjectRefreshStatus {
  subjectId: string;
  subjectName: string;
  lastPracticedDateISO: string;
  daysSincePractice: number;
  needsRefresh: boolean;
  approachingRefreshWarning: boolean;
  daysUntilDim: number;
  warningMessage?: string;
}

export type VaultPermissionScope =
  | 'all_flexcards_and_report'
  | 'all_flexcards_only'
  | 'report_card_only'
  | 'single_credential';

export interface SocialFlexAttachment {
  credentialCode: string;
  title: string;
  metricBadge: string;
  xpPoints: number;
  flexTier: FlexCardRarityTier;
  boardOrUniversity: string;
  examName: string;
  needsSkillRefresh?: boolean;
  staleSubjectNames?: string[];
}

export interface SocialChatMessage {
  id: string;
  channelType: 'world' | 'dm';
  channelId: string;
  senderId: string;
  senderName: string;
  senderAvatarUrl?: string;
  senderAvatarVisibility: AvatarVisibility;
  senderIsGmailAccount?: boolean;
  senderRoleBadge?: PostRoleBadge;
  text: string;
  flexCard?: SocialFlexAttachment;
  createdAt: string;
}

export interface SocialConnection {
  id: string;
  requesterId: string;
  requesterName: string;
  requesterAvatarUrl?: string;
  requesterAvatarVisibility: AvatarVisibility;
  recipientId: string;
  recipientName: string;
  recipientAvatarUrl?: string;
  recipientAvatarVisibility: AvatarVisibility;
  status: 'pending' | 'connected';
  createdAt: string;
  updatedAt: string;
}

export interface SocialVaultGrant {
  id: string;
  ownerId: string;
  ownerName: string;
  granteeId: string;
  granteeName: string;
  scope: VaultPermissionScope;
  singleCredentialCode?: string;
  status: 'requested' | 'granted' | 'revoked';
  flexCardsSnapshot: IssuedCredentialDoc[];
  reportCardSnapshot?: IssuedCredentialDoc | null;
  updatedAt: string;
}

export interface SocialDirectoryPeer {
  userId: string;
  profileId?: string;
  displayName: string;
  avatarUrl?: string;
  avatarVisibility: AvatarVisibility;
  flexTier: FlexCardRarityTier;
  isGmailAccount?: boolean;
  roleBadge?: PostRoleBadge;
  online: boolean;
}

export interface StudentProfile {
  name: string;
  profileId?: string;
  accountRole?: 'student' | 'teacher';
  avatarUrl?: string;
  avatarVisibility?: AvatarVisibility;
  email?: string;
  phoneNumber?: string;
  notifyGmailOptIn?: boolean;
  notifyWhatsappOptIn?: boolean;
  lastActiveDate?: string;
  aiAboutLines?: string[];
  aiAboutUpdatedAt?: string;
  referralCode?: string;
  referredByCode?: string;
  recoveredEthicsXp?: number;
  recoveredDeductionIds?: string[];
  institutionType: 'school' | 'university';
  boardOrUniversity: string;
  examName: string;
  examDate: string;
  dailyStudyHours: number;
  alertnessWindow: AlertnessWindow;
  learningStyle: LearningStylePreset;
  customStyleFeedback: string;
  createdAt: string;
}

export interface SubjectProfile {
  id: string;
  name: string;
  difficulty: SubjectDifficulty;
  previousScoreOutOf100: number;
  currentRatingOutOf10: number | null;
  questionsAnswered: number;
  questionsCorrect: number;
  lastPracticedDateISO?: string;
}

export interface TopicItem {
  id: string;
  subjectId: string;
  subjectName: string;
  title: string;
  estimatedHours: number;
  yieldType: YieldType;
  pyqFrequencyNote: string;
  classStatus: ClassStatus;
  completed: boolean;
  completedAt?: string;
  masteryPercent: number;
  youtubeQuery: string;
  youtubeTitle: string;
  youtubeChannelHint: string;
  keyConcepts: string[];
}

export interface ScheduledSession {
  id: string;
  topicId: string;
  subjectId: string;
  subjectName: string;
  topicTitle: string;
  durationHours: number;
  timeSlotLabel: string;
  isPeakSlot: boolean;
  yieldType: YieldType;
  classStatus: ClassStatus;
  youtubeQuery: string;
  youtubeTitle: string;
  youtubeChannelHint: string;
  completed: boolean;
}

export interface DailyTestTargetSpec {
  targetQuestionCount: number;
  difficultyTier: DifficultyTier;
  compressedTimeSeconds: number;
  standardExamTimeSeconds: number;
  coveredTopicIds: string[];
  completed: boolean;
  attemptId?: string;
}

export interface DailyPlan {
  dayIndex: number;
  dateISO: string;
  missed: boolean;
  reoptimizedExtraHours: number;
  totalHours: number;
  sessions: ScheduledSession[];
  dailyTestTarget: DailyTestTargetSpec;
}

export interface MCQQuestion {
  id: string;
  subjectId: string;
  subjectName: string;
  topicId: string;
  topicTitle: string;
  question: string;
  options: string[];
  correctIndex: number;
  difficulty: DifficultyTier;
  pyqReference: string;
  baseExplanation: string;
}

export interface AnsweredQuestionRecord {
  question: MCQQuestion;
  selectedIndex: number | null;
  timeSpentSeconds: number;
  isCorrect: boolean;
  personalizedExplanation?: string;
}

export interface SubjectTestBreakdown {
  subjectId: string;
  subjectName: string;
  correct: number;
  total: number;
  scoreOutOf10: number;
}

export interface TestAttempt {
  id: string;
  mode: 'daily_target' | 'countdown_blitz';
  dateISO: string;
  dayDateISO?: string;
  difficultyTier: DifficultyTier;
  durationSeconds: number;
  targetTimeSeconds: number;
  standardExamTimeSeconds: number;
  totalQuestions: number;
  correctCount: number;
  accuracyPercent: number;
  overallScoreOutOf10: number;
  subjectBreakdown: SubjectTestBreakdown[];
  answers: AnsweredQuestionRecord[];
  unlockedAchievementIds: string[];
}

export type FlexCardRarityTier =
  | 'Common Slate'
  | 'Uncommon Emerald'
  | 'Rare Sapphire'
  | 'Epic Amethyst'
  | 'Mythic Sovereign';

export interface FlexCardRarityInfo {
  tier: FlexCardRarityTier;
  minXp: number;
  nextTier?: FlexCardRarityTier;
  nextTierXp?: number;
  progressPercent: number;
  badgeLabel: string;
  accentHex: string;
  secondaryHex: string;
  cardBgGradient: string;
  borderClass: string;
  textAccentClass: string;
  dropRateLabel: string;
}

export interface CandidateXpSnapshot {
  earnedRawXp: number;
  bonusXp: number;
  adminDeductionXp: number;
  recoveredEthicsXp: number;
  decayPenaltyXp: number;
  netXp: number;
  inactiveDays: number;
  activeLearnerDissolved: boolean;
  rarity: FlexCardRarityInfo;
}

export interface Achievement {
  id: string;
  code: string;
  title: string;
  description: string;
  category: 'score_flex' | 'speed_flex' | 'consistency' | 'mastery';
  unlocked: boolean;
  unlockedAt?: string;
  metricBadge?: string;
  shareHeadline?: string;
  xpReward?: number;
  dissolvable?: boolean;
  dissolvedReason?: string;
}

export interface IntakeChatMessage {
  id: string;
  role: 'advisor' | 'student';
  text: string;
  appliedSummary?: string;
}

export interface IntakeExtractedUpdates {
  name?: string;
  examDate?: string;
  dailyStudyHours?: number;
  alertnessWindow?: AlertnessWindow;
  learningStyle?: LearningStylePreset;
  customStyleFeedback?: string;
  subjectUpdates?: Array<{
    subjectId?: string;
    subjectName?: string;
    difficulty?: SubjectDifficulty;
    previousScoreOutOf100?: number;
  }>;
  ongoingTopicTitles?: string[];
}

export interface AiStrategyBriefing {
  headline: string;
  alertnessStrategy: string;
  pyqFocusAdvice: string;
  classSyncTip: string;
  recoveryNote?: string;
  actionableSteps: string[];
  generatedAt: string;
  usedAi: boolean;
}

export interface AiYoutubeRecommendation {
  title: string;
  channelOrFormatHint: string;
  searchQuery: string;
  durationEstimate: string;
  whyRecommended: string;
}

export interface AiStyleAdaptationPreview {
  confirmationNote: string;
  sampleDemonstration: string;
  usedAi: boolean;
}

export type GlobalUpdateCategory =
  | 'exam_alert'
  | 'feature_update'
  | 'study_tip'
  | 'bonus_event';

export type IndividualBonusType =
  | 'xp_boost'
  | 'xp_deduction'
  | 'streak_shield'
  | 'custom_badge'
  | 'mentor_note';

export interface CandidateSummaryDoc {
  ownerUid: string;
  displayName: string;
  avatarUrl?: string;
  email?: string;
  contactEmail?: string;
  phoneNumber?: string;
  notifyGmailOptIn?: boolean;
  notifyWhatsappOptIn?: boolean;
  authProvider?: 'google.com' | 'microsoft.com';
  institutionType?: 'school' | 'university';
  boardOrUniversity: string;
  examName: string;
  examDate: string;
  dailyStudyHours?: number;
  readinessPercent: number;
  overallRatingOutOf10: number;
  completedChapters: number;
  totalChapters: number;
  attemptsCount: number;
  focusMinutesLogged: number;
  bonusPoints: number;
  deductedPoints?: number;
  xpPoints?: number;
  flexTier?: FlexCardRarityTier;
  lastActiveDate?: string;
  inactiveDays?: number;
  activeLearnerActive?: boolean;
  unlockedBadges?: string[];
  weakTopics?: string[];
  banned: boolean;
  banReason: string;
  adsEnabled?: boolean;
  createdAt?: string;
  updatedAt?: string;
}

export interface GlobalUpdateDoc {
  id: string;
  authorUid: string;
  authorName: string;
  authorRoleLabel: string;
  title: string;
  body: string;
  category: GlobalUpdateCategory;
  visibility: 'public';
  pinned: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface IndividualBonusDoc {
  id: string;
  targetUserId: string;
  targetName: string;
  grantedByUid: string;
  grantedByName: string;
  grantedByRoleLabel?: string;
  bonusTitle: string;
  bonusType: IndividualBonusType;
  pointsAwarded: number;
  message: string;
  acknowledged: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface StaffInviteDoc {
  inviteKey: string;
  targetEmail: string;
  adminPhone: string;
  displayName: string;
  canPostUpdates: boolean;
  canGrantBonuses: boolean;
  canBanUsers: boolean;
  status: 'active' | 'revoked';
  createdByUid: string;
  createdAt: string;
  updatedAt: string;
}

export interface StaffMemberDoc {
  userId: string;
  inviteKey: string;
  displayName: string;
  adminEmail?: string;
  adminPhone?: string;
  role: 'sub_admin';
  canPostUpdates: boolean;
  canGrantBonuses: boolean;
  canBanUsers: boolean;
  active: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface AdminDigestEntry {
  ownerUid: string;
  displayName: string;
  avatarUrl?: string;
  email?: string;
  contactEmail?: string;
  phoneNumber?: string;
  notifyGmailOptIn?: boolean;
  notifyWhatsappOptIn?: boolean;
  institutionType?: 'school' | 'university';
  boardOrUniversity: string;
  examName: string;
  examDate?: string;
  dailyStudyHours?: number;
  readinessPercent: number;
  overallRatingOutOf10: number;
  completedChapters?: number;
  totalChapters?: number;
  attemptsCount: number;
  focusMinutesLogged?: number;
  bonusPoints: number;
  deductedPoints?: number;
  xpPoints?: number;
  flexTier?: FlexCardRarityTier;
  lastActiveDate?: string;
  inactiveDays?: number;
  activeLearnerActive?: boolean;
  unlockedBadges?: string[];
  weakTopics?: string[];
  banned: boolean;
  banReason: string;
}

export interface AdminDigestDoc {
  digestId: string;
  entries: AdminDigestEntry[];
  updatedByUid: string;
  createdAt: string;
  updatedAt: string;
}

export interface StaffAccessProfile {
  tier: 'none' | 'sub_admin' | 'super_admin';
  roleLabel: string;
  adminEmail?: string;
  adminPhone?: string;
  canPostUpdates: boolean;
  canGrantBonuses: boolean;
  canBanUsers: boolean;
  canManageAdmins: boolean;
  canSendOutreach: boolean;
  isDemoPreview?: boolean;
}

export interface AuthenticatedAccount {
  uid: string;
  email: string;
  displayName: string;
  photoURL?: string;
  providerId: 'google.com' | 'microsoft.com';
  emailVerified: boolean;
}

export interface AppState {
  onboarded: boolean;
  student: StudentProfile;
  subjects: SubjectProfile[];
  topics: TopicItem[];
  schedule: DailyPlan[];
  attempts: TestAttempt[];
  achievements: Achievement[];
  lastReoptimizationNote?: string;
  aiStrategyBriefing?: AiStrategyBriefing;
  focusSessionsCompleted?: number;
  focusMinutesTotal?: number;
}

export type ActiveTab =
  | 'dashboard'
  | 'planner'
  | 'daily_test'
  | 'adaptive_blitz'
  | 'social'
  | 'profile'
  | 'achievements'
  | 'about'
  | 'admin';

