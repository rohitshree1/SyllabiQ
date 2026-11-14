import type {
  AiStrategyBriefing,
  AiStyleAdaptationPreview,
  AiYoutubeRecommendation,
  AppealInterviewMessage,
  AppState,
  AvatarVisibility,
  BanFlexAiDraft,
  CandidateXpSnapshot,
  CredentialVerificationNotice,
  DifficultyTier,
  EthicsRecoveryModule,
  FlexCardRarityTier,
  IntakeChatMessage,
  IntakeExtractedUpdates,
  IssuedCredentialDoc,
  MCQQuestion,
  PostRoleBadge,
  SocialChatMessage,
  SocialConnection,
  SocialDirectoryPeer,
  SocialFlexAttachment,
  SocialVaultGrant,
  StudentProfile,
  SubjectProfile,
  SuspensionAppealRecord,
  TopicItem,
  VaultPermissionScope,
  VerifierPostRole,
} from '../types';
import {
  buildAnalyticalStrategyFallback,
  parseNaturalIntakeFallback,
} from './aiHelpers';
import { buildLocalPYQQuestions } from './questionBank';
import {
  adaptExplanationToStudent,
  computeDashboardMetrics,
  LEARNING_STYLE_LABELS,
  parseSyllabusTextFallback,
} from './studyEngine';
import {
  buildFallbackBanFlexDraft,
  buildFallbackStudentAboutLines,
  normalizeStudentAboutLines,
} from './verificationAndReferral';
import {
  buildFallbackEthicsModule,
  validateSocialMessageConduct,
} from './skillRefreshAndEthics';
import {
  fetchSocialStateLocal,
  postSocialMessageLocal,
  requestOrAcceptSocialConnectionLocal,
  updateSocialProfileVisibilityLocal,
  updateSocialVaultPermissionLocal,
} from './socialLocalFallback';

async function fetchWithTimeout(
  url: string,
  options: RequestInit,
  timeoutMs = 22000
): Promise<Response> {
  const controller = new AbortController();
  const id = globalThis.setTimeout(() => controller.abort(), timeoutMs);
  try {
    return await fetch(url, { ...options, signal: controller.signal });
  } finally {
    globalThis.clearTimeout(id);
  }
}

async function parseJsonSafely<T = Record<string, unknown>>(res: Response): Promise<T | null> {
  const contentType = (res.headers.get('content-type') || '').toLowerCase();
  if (!contentType.includes('application/json')) {
    return null;
  }
  try {
    return (await res.json()) as T;
  } catch {
    return null;
  }
}

export async function parseSyllabusWithAI(params: {
  rawText: string;
  fileData?: { mimeType: string; base64: string; fileName: string } | null;
  boardOrUniversity: string;
  institutionType: 'school' | 'university';
}): Promise<{
  subjects: SubjectProfile[];
  topics: TopicItem[];
  pyqOverview: string;
  advisorGreeting: string;
  usedAi: boolean;
}> {
  try {
    const res = await fetchWithTimeout('/api/syllabus/parse', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (res.ok) {
      const data = await res.json();
      const rawSubjects = data?.parsed?.subjects;
      if (Array.isArray(rawSubjects) && rawSubjects.length > 0) {
        const subjects: SubjectProfile[] = [];
        const topics: TopicItem[] = [];

        rawSubjects.forEach((s: Record<string, unknown>, sIdx: number) => {
          const subjectId = `subj-${sIdx + 1}`;
          const subjectName = String(s.name || `Subject ${sIdx + 1}`);
          subjects.push({
            id: subjectId,
            name: subjectName,
            difficulty: sIdx === 0 ? 'hard' : sIdx === 1 ? 'moderate' : 'easy',
            previousScoreOutOf100: sIdx === 0 ? 62 : sIdx === 1 ? 74 : 82,
            currentRatingOutOf10: null,
            questionsAnswered: 0,
            questionsCorrect: 0,
          });

          const rawTopics = Array.isArray(s.topics) ? s.topics : [];
          rawTopics.forEach((t: Record<string, unknown>, tIdx: number) => {
            const title = String(t.title || `Chapter ${tIdx + 1}`);
            const yieldVal =
              String(t.yieldType || 'high').toLowerCase() === 'low' ? 'low' : 'high';
            topics.push({
              id: `topic-${sIdx + 1}-${tIdx + 1}`,
              subjectId,
              subjectName,
              title,
              estimatedHours: Math.max(1, Math.min(5, Number(t.estimatedHours) || 2)),
              yieldType: yieldVal,
              pyqFrequencyNote: String(
                t.pyqFrequencyNote || `High-frequency ${params.boardOrUniversity} exam topic`
              ),
              classStatus: tIdx === 0 ? 'ongoing' : 'upcoming',
              completed: false,
              masteryPercent: tIdx === 0 ? 35 : 15,
              youtubeQuery: String(
                t.youtubeQuery || `${title} ${subjectName} ${params.boardOrUniversity} lecture PYQ`
              ),
              youtubeTitle: String(
                t.youtubeTitle || `${title} — Complete Concept & PYQ Lecture`
              ),
              youtubeChannelHint: String(t.youtubeChannelHint || 'Curated Academic Lecture'),
              keyConcepts: Array.isArray(t.keyConcepts)
                ? t.keyConcepts.map(String)
                : [`Core principles of ${title}`],
            });
          });
        });

        if (topics.length > 0) {
          const subjectNames = subjects.map((s) => s.name).join(', ');
          return {
            subjects,
            topics,
            pyqOverview: String(
              data?.parsed?.pyqOverview ||
                `Mapped ${topics.length} chapters across ${subjectNames} against ${params.boardOrUniversity} past-paper weightage.`
            ),
            advisorGreeting: String(
              data?.parsed?.advisorGreeting ||
                `I’ve mapped your ${params.boardOrUniversity} syllabus across ${subjectNames}. What’s your name, when do you feel most alert studying, how many hours a day can you comfortably commit, and which of these subjects feels toughest vs. easiest (along with your recent test scores)?`
            ),
            usedAi: true,
          };
        }
      }
    }
  } catch {
    // Graceful fallback to deterministic curriculum parser
  }

  const fallbackSource =
    params.rawText.trim() ||
    (params.fileData?.fileName
      ? `${params.fileData.fileName.replace(/\.[^.]+$/, '')}: Unit 1 Core Foundations, Unit 2 Analytical Problem Solving, Unit 3 Applied Systems & PYQs, Unit 4 Advanced Synthesis`
      : '');
  const parsed = parseSyllabusTextFallback(fallbackSource, params.boardOrUniversity);
  const subjectNames = parsed.subjects.map((s) => s.name).join(', ');

  return {
    ...parsed,
    pyqOverview: `Extracted ${parsed.topics.length} syllabus units across ${subjectNames} calibrated for ${params.boardOrUniversity} PYQ preparation.`,
    advisorGreeting: `I’ve structured your ${params.boardOrUniversity} syllabus (${subjectNames}). Tell me your name, when your mind feels sharpest, how many hours a day you can study comfortably, and which subjects feel easy vs. hard along with your previous test marks!`,
    usedAi: false,
  };
}

export async function sendIntakeChatWithAI(params: {
  messages: IntakeChatMessage[];
  currentDraft: {
    studentName: string;
    examDate: string;
    dailyStudyHours: number;
    alertnessWindow: string;
    learningStyle: string;
    customStyleFeedback: string;
    boardOrUniversity: string;
    subjects: SubjectProfile[];
    topics: TopicItem[];
  };
}): Promise<{
  reply: string;
  readyToBuild: boolean;
  extractedUpdates: IntakeExtractedUpdates;
  usedAi: boolean;
}> {
  try {
    const res = await fetchWithTimeout('/api/intake/chat', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        messages: params.messages.map((m) => ({ role: m.role, text: m.text })),
        currentDraft: params.currentDraft,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.reply) {
        return {
          reply: String(data.reply),
          readyToBuild: Boolean(data.readyToBuild),
          extractedUpdates: (data.extractedUpdates || {}) as IntakeExtractedUpdates,
          usedAi: Boolean(data.aiGenerated),
        };
      }
    }
  } catch {
    // Fallback below
  }

  const lastUserMsg =
    [...params.messages].reverse().find((m) => m.role === 'student')?.text || '';
  const extracted = parseNaturalIntakeFallback(lastUserMsg, params.currentDraft.subjects);
  const effectiveName = extracted.name || params.currentDraft.studentName;

  return {
    reply: effectiveName
      ? `Thanks ${effectiveName}! I’ve updated your profile settings below. Feel free to tell me which chapters are currently going on in your live classes, or review Step 3 to generate your analytical timetable.`
      : 'Got it! Could you also share your name and which subject feels hardest vs. easiest so I can lock in your peak alertness schedule?',
    readyToBuild: Boolean(effectiveName),
    extractedUpdates: extracted,
    usedAi: false,
  };
}

export async function requestAiStrategyBriefing(params: {
  state: AppState;
  trigger: 'dashboard_briefing' | 'missed_day_reoptimize';
  missedDateISO?: string;
  redistributionSummary?: string;
}): Promise<AiStrategyBriefing> {
  const metrics = computeDashboardMetrics(params.state);

  try {
    const res = await fetchWithTimeout('/api/timetable/ai-strategy', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        student: params.state.student,
        subjects: params.state.subjects,
        topics: params.state.topics,
        metricsSummary: {
          examReadinessPercent: metrics.examReadinessPercent,
          completedChapters: metrics.completedChapters,
          totalChapters: metrics.totalChapters,
          highYieldMasteryPercent: metrics.highYieldMasteryPercent,
          overallScoreOutOf10: metrics.overallScoreOutOf10,
        },
        trigger: params.trigger,
        missedDateISO: params.missedDateISO,
        redistributionSummary: params.redistributionSummary,
      }),
    });

    if (res.ok) {
      const data = await res.json();
      if (data?.briefing?.headline) {
        return data.briefing as AiStrategyBriefing;
      }
    }
  } catch {
    // Fallback below
  }

  return buildAnalyticalStrategyFallback(params.state, params.redistributionSummary);
}

export async function generatePYQAssessmentQuestions(params: {
  student: StudentProfile;
  subjects?: SubjectProfile[];
  topics: TopicItem[];
  count: number;
  difficultyTier: DifficultyTier;
  mode: 'daily_target' | 'countdown_blitz';
}): Promise<{
  questions: MCQQuestion[];
  pyqPatternSummary: string;
  usedAi: boolean;
}> {
  try {
    const res = await fetchWithTimeout('/api/questions/generate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.questions) && data.questions.length > 0) {
        const validTopicDefault = params.topics[0];
        const questions: MCQQuestion[] = data.questions.map(
          (q: Record<string, unknown>, idx: number) => {
            const matchedTopic =
              params.topics.find(
                (t) =>
                  t.id === q.topicId ||
                  t.title.toLowerCase() === String(q.topicTitle || '').toLowerCase() ||
                  t.subjectId === q.subjectId
              ) || validTopicDefault;
            const opts =
              Array.isArray(q.options) && q.options.length >= 4
                ? q.options.slice(0, 4).map(String)
                : ['Option A', 'Option B', 'Option C', 'Option D'];
            const cIdx = Number(q.correctIndex);
            return {
              id: `ai-q-${Date.now()}-${idx}`,
              subjectId: String(matchedTopic?.subjectId || q.subjectId || 'subj-1'),
              subjectName: String(matchedTopic?.subjectName || q.subjectName || 'Core Subject'),
              topicId: String(matchedTopic?.id || q.topicId || 'topic-1'),
              topicTitle: String(matchedTopic?.title || q.topicTitle || 'Core Topic'),
              question: String(q.question || ''),
              options: opts,
              correctIndex: cIdx >= 0 && cIdx < 4 ? cIdx : 0,
              difficulty: params.difficultyTier,
              pyqReference: String(
                q.pyqReference || `${params.student.boardOrUniversity} PYQ Pattern`
              ),
              baseExplanation: String(q.baseExplanation || ''),
            };
          }
        );
        return {
          questions,
          pyqPatternSummary: String(
            data.pyqPatternSummary ||
              `Generated live ${params.student.boardOrUniversity} past-paper questions calibrated to ${params.difficultyTier}.`
          ),
          usedAi: true,
        };
      }
    }
  } catch {
    // Fallback to rich local PYQ bank
  }

  return {
    questions: buildLocalPYQQuestions(
      params.topics,
      params.count,
      params.difficultyTier,
      params.student.boardOrUniversity
    ),
    pyqPatternSummary: `Curated ${params.student.boardOrUniversity} PYQ diagnostic set (${params.difficultyTier}).`,
    usedAi: false,
  };
}

export async function requestPersonalizedExplanation(params: {
  question: MCQQuestion;
  selectedIndex: number | null;
  student: StudentProfile;
  subjectMeta?: SubjectProfile;
  followUpQuestion?: string;
}): Promise<{ explanation: string; usedAi: boolean }> {
  const { question, selectedIndex, student, subjectMeta, followUpQuestion } = params;
  const selectedOption =
    selectedIndex !== null && question.options[selectedIndex]
      ? question.options[selectedIndex]
      : 'No answer selected before countdown ended';
  const correctOption = question.options[question.correctIndex];

  try {
    const res = await fetchWithTimeout('/api/tutor/explain', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        question,
        selectedOption,
        correctOption,
        student,
        subjectMeta,
        followUpQuestion,
      }),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.explanation && typeof data.explanation === 'string') {
        return { explanation: data.explanation, usedAi: Boolean(data.aiGenerated) };
      }
    }
  } catch {
    // Fallback to instant personalized style formatter
  }

  return {
    explanation: adaptExplanationToStudent(question, selectedIndex, student),
    usedAi: false,
  };
}

export async function requestAiStyleAdaptation(params: {
  student: StudentProfile;
  sampleTopicTitle?: string;
  sampleSubjectName?: string;
}): Promise<AiStyleAdaptationPreview> {
  try {
    const res = await fetchWithTimeout('/api/tutor/adapt-style', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (res.ok) {
      const data = await res.json();
      if (data?.confirmationNote) {
        return {
          confirmationNote: String(data.confirmationNote),
          sampleDemonstration: String(data.sampleDemonstration || ''),
          usedAi: Boolean(data.aiGenerated),
        };
      }
    }
  } catch {
    // Fallback below
  }

  return {
    confirmationNote: `Saved ${params.student.name}’s preference (${
      LEARNING_STYLE_LABELS[params.student.learningStyle]
    }).`,
    sampleDemonstration: params.student.customStyleFeedback
      ? `All upcoming wrong-answer breakdowns for ${
          params.sampleTopicTitle || 'your syllabus'
        } will follow your note: “${params.student.customStyleFeedback}”.`
      : `Explanations will now use ${LEARNING_STYLE_LABELS[params.student.learningStyle]}.`,
    usedAi: false,
  };
}

export async function curateTopicYoutubeWithAI(params: {
  topic: TopicItem;
  student: StudentProfile;
  subjectDifficulty?: string;
}): Promise<{
  recommendations: AiYoutubeRecommendation[];
  usedAi: boolean;
}> {
  try {
    const res = await fetchWithTimeout('/api/youtube/curate', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.recommendations) && data.recommendations.length > 0) {
        return {
          recommendations: data.recommendations.map((r: Record<string, unknown>) => ({
            title: String(r.title || `${params.topic.title} Lecture`),
            channelOrFormatHint: String(r.channelOrFormatHint || 'Academic Lecture'),
            searchQuery: String(
              r.searchQuery ||
                `${params.topic.title} ${params.topic.subjectName} ${params.student.boardOrUniversity}`
            ),
            durationEstimate: String(r.durationEstimate || '25–40 min'),
            whyRecommended: String(
              r.whyRecommended || 'Matches your PYQ syllabus & study preference.'
            ),
          })),
          usedAi: Boolean(data.aiGenerated),
        };
      }
    }
  } catch {
    // Fallback below
  }

  return {
    recommendations: [
      {
        title: `${params.topic.title} — Concept Intuition & Derivations`,
        channelOrFormatHint: params.topic.youtubeChannelHint,
        searchQuery: params.topic.youtubeQuery,
        durationEstimate: '30–45 min',
        whyRecommended: `Covers core checkpoints: ${params.topic.keyConcepts.slice(0, 2).join(', ')}.`,
      },
      {
        title: `${params.topic.title} — ${params.student.boardOrUniversity} Solved PYQs`,
        channelOrFormatHint: 'Past Paper Numericals Walkthrough',
        searchQuery: `${params.topic.title} ${params.student.boardOrUniversity} previous year questions solved`,
        durationEstimate: '20–35 min',
        whyRecommended: 'Targets actual exam numerical traps and past-paper patterns.',
      },
    ],
    usedAi: false,
  };
}

export async function syncStateToServer(state: AppState): Promise<void> {
  try {
    await fetch('/api/state', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ state }),
    });
  } catch {
    // LocalStorage remains primary client copy if offline
  }
}

export async function fetchStateFromServer(): Promise<AppState | null> {
  try {
    const res = await fetch('/api/state');
    if (res.ok) {
      const data = await res.json();
      if (data?.state && typeof data.state === 'object') {
        return data.state as AppState;
      }
    }
  } catch {
    // Ignore network failures on initial boot
  }
  return null;
}

export async function fetchStudentAboutSummaryAi(params: {
  state: AppState;
  xpSnapshot: CandidateXpSnapshot;
}): Promise<{ lines: string[]; usedAi: boolean }> {
  const fallbackLines = buildFallbackStudentAboutLines(params.state, params.xpSnapshot);
  const metrics = computeDashboardMetrics(params.state);

  try {
    const res = await fetchWithTimeout(
      '/api/student/about-summary',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          student: params.state.student,
          subjects: params.state.subjects,
          topics: params.state.topics,
          metricsSummary: {
            examReadinessPercent: metrics.examReadinessPercent,
            completedChapters: metrics.completedChapters,
            totalChapters: metrics.totalChapters,
            highYieldMasteryPercent: metrics.highYieldMasteryPercent,
            overallScoreOutOf10: metrics.overallScoreOutOf10,
          },
          xpSummary: {
            netXp: params.xpSnapshot.netXp,
            flexTier: params.xpSnapshot.rarity.tier,
            activeLearnerDissolved: params.xpSnapshot.activeLearnerDissolved,
            inactiveDays: params.xpSnapshot.inactiveDays,
          },
          focusMinutesTotal: params.state.focusMinutesTotal ?? 0,
          focusSessionsCompleted: params.state.focusSessionsCompleted ?? 0,
          unlockedBadges: params.state.achievements
            .filter((a) => a.unlocked)
            .map((a) => a.title),
        }),
      },
      16000
    );

    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.lines) && data.lines.length > 0) {
        return {
          lines: normalizeStudentAboutLines(data.lines, fallbackLines),
          usedAi: Boolean(data.aiGenerated),
        };
      }
    }
  } catch {
    // Graceful fallback to deterministic 12-line dossier
  }

  return {
    lines: fallbackLines,
    usedAi: false,
  };
}

export async function fetchBanFlexMessageAi(params: {
  candidateName: string;
  examName: string;
  banReason: string;
  xpPoints: number;
  flexTier: FlexCardRarityTier;
}): Promise<BanFlexAiDraft> {
  const fallback = buildFallbackBanFlexDraft(params);

  try {
    const res = await fetchWithTimeout(
      '/api/moderation/ban-flex-message',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      },
      15000
    );

    if (res.ok) {
      const data = await res.json();
      if (data?.caption && typeof data.caption === 'string') {
        return {
          headline: String(data.headline || fallback.headline),
          caption: String(data.caption || fallback.caption),
          comebackPledge: String(data.comebackPledge || fallback.comebackPledge),
          usedAi: Boolean(data.aiGenerated),
        };
      }
    }
  } catch {
    // Fallback below
  }

  return fallback;
}

const registeredCredentialSignatures = new Map<string, string>();

function buildCredentialSignature(credential: IssuedCredentialDoc): string {
  return JSON.stringify([
    credential.kind,
    credential.ownerUid,
    credential.ownerName,
    credential.boardOrUniversity,
    credential.examName,
    credential.title,
    credential.subtitleOrMetric,
    credential.xpPoints,
    credential.flexTier,
    credential.issuedDateISO,
  ]);
}

export async function registerCredentialsBatchApi(
  credentials: IssuedCredentialDoc[]
): Promise<void> {
  const pending: Array<{ code: string; sig: string; cred: IssuedCredentialDoc }> = [];
  for (const cred of credentials) {
    const code = String(cred.credentialCode || '').trim().toUpperCase();
    if (!code) continue;
    const sig = buildCredentialSignature(cred);
    if (registeredCredentialSignatures.get(code) === sig) continue;
    registeredCredentialSignatures.set(code, sig);
    pending.push({ code, sig, cred });
  }
  if (pending.length === 0) return;

  try {
    const res = await fetch('/api/credentials/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ credentials: pending.map((p) => p.cred) }),
    });
    if (!res.ok) {
      for (const p of pending) registeredCredentialSignatures.delete(p.code);
    }
  } catch {
    for (const p of pending) registeredCredentialSignatures.delete(p.code);
    // Non-blocking mirror sync
  }
}

export async function registerCredentialApi(credential: IssuedCredentialDoc): Promise<void> {
  await registerCredentialsBatchApi([credential]);
}

export async function verifyCredentialApi(params: {
  serialCode: string;
  isStaff: boolean;
  verifierName: string;
  verifierGmail: string;
  verifierPost: VerifierPostRole;
  cloudCredential?: IssuedCredentialDoc | null;
}): Promise<{
  authentic: boolean;
  normalizedSerial: string;
  credential?: IssuedCredentialDoc;
  notifiedOwner: boolean;
  notice?: CredentialVerificationNotice;
  error?: string;
}> {
  try {
    const res = await fetchWithTimeout('/api/credentials/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await parseJsonSafely<Record<string, unknown>>(res);
    if (!res.ok || !data) {
      if (params.cloudCredential && (res.status === 404 || !data)) {
        return {
          authentic: true,
          normalizedSerial: params.cloudCredential.credentialCode,
          credential: params.cloudCredential,
          notifiedOwner: !params.isStaff,
        };
      }
      return {
        authentic: false,
        normalizedSerial: params.serialCode.trim().toUpperCase(),
        notifiedOwner: false,
        error: String(data?.error || 'Verification failed.'),
      };
    }
    return {
      authentic: Boolean(data.authentic),
      normalizedSerial: String(data.normalizedSerial || params.serialCode.trim().toUpperCase()),
      credential: data.credential as IssuedCredentialDoc | undefined,
      notifiedOwner: Boolean(data.notifiedOwner),
      notice: data.notice as CredentialVerificationNotice | undefined,
    };
  } catch {
    if (params.cloudCredential) {
      return {
        authentic: true,
        normalizedSerial: params.cloudCredential.credentialCode,
        credential: params.cloudCredential,
        notifiedOwner: !params.isStaff,
      };
    }
    return {
      authentic: false,
      normalizedSerial: params.serialCode.trim().toUpperCase(),
      notifiedOwner: false,
      error: 'Unable to reach verification service right now.',
    };
  }
}

export async function fetchCredentialNotificationsApi(
  ownerUids: string[]
): Promise<CredentialVerificationNotice[]> {
  const joined = ownerUids
    .map((u) => u.trim())
    .filter(Boolean)
    .join(',');
  if (!joined) return [];

  try {
    const res = await fetch(`/api/credentials/notifications?ownerUid=${encodeURIComponent(joined)}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.notifications)) {
        return data.notifications as CredentialVerificationNotice[];
      }
    }
  } catch {
    // Ignore transient offline state
  }
  return [];
}

export async function acknowledgeCredentialNotificationApi(noticeId: string): Promise<void> {
  try {
    await fetch('/api/credentials/acknowledge', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ noticeId }),
    });
  } catch {
    // Non-blocking
  }
}

export async function sendAppealInterviewTurnApi(params: {
  candidateName: string;
  banReason: string;
  transcript: AppealInterviewMessage[];
}): Promise<{
  interviewerReply: string;
  readyToSubmit: boolean;
  aiStructuredSummary: string;
  rootCauseAcknowledged: string;
  candidateCommitment: string;
  recommendedActionNote: string;
}> {
  try {
    const res = await fetchWithTimeout(
      '/api/moderation/appeal-interview',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      },
      16000
    );
    if (res.ok) {
      const data = await res.json();
      return {
        interviewerReply: String(data.interviewerReply || ''),
        readyToSubmit: Boolean(data.readyToSubmit),
        aiStructuredSummary: String(data.aiStructuredSummary || ''),
        rootCauseAcknowledged: String(data.rootCauseAcknowledged || ''),
        candidateCommitment: String(data.candidateCommitment || ''),
        recommendedActionNote: String(data.recommendedActionNote || ''),
      };
    }
  } catch {
    // Deterministic fallback below
  }

  const candidateTurns = params.transcript.filter((t) => t.role === 'candidate');
  if (candidateTurns.length < 2) {
    return {
      interviewerReply:
        'Thank you. What concrete study and platform conduct safeguard do you pledge to follow if the Super Admin restores your account?',
      readyToSubmit: false,
      aiStructuredSummary: '',
      rootCauseAcknowledged: '',
      candidateCommitment: '',
      recommendedActionNote: '',
    };
  }
  return {
    interviewerReply:
      'Your automated appeal interview is complete. Forward this summary to the Super Admin—accounts are only unbanned if the Super Admin agrees.',
    readyToSubmit: true,
    aiStructuredSummary: `${params.candidateName} appealed "${params.banReason}". Explanation: "${candidateTurns[0]?.text}". Commitment: "${candidateTurns[candidateTurns.length - 1]?.text}".`,
    rootCauseAcknowledged: candidateTurns[0]?.text || '',
    candidateCommitment: candidateTurns[candidateTurns.length - 1]?.text || '',
    recommendedActionNote: 'Forwarded for exclusive Super Admin review.',
  };
}

export async function submitSuspensionAppealApi(
  payload: Omit<SuspensionAppealRecord, 'id' | 'status' | 'createdAt'>
): Promise<SuspensionAppealRecord | null> {
  try {
    const res = await fetchWithTimeout('/api/moderation/appeals/submit', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload),
    });
    if (res.ok) {
      const data = await res.json();
      return (data?.appeal as SuspensionAppealRecord) || null;
    }
  } catch {
    // Ignore
  }
  return null;
}

export async function fetchSuspensionAppealsApi(
  ownerUid?: string
): Promise<SuspensionAppealRecord[]> {
  try {
    const qs = ownerUid ? `?ownerUid=${encodeURIComponent(ownerUid)}` : '';
    const res = await fetch(`/api/moderation/appeals${qs}`);
    if (res.ok) {
      const data = await res.json();
      if (Array.isArray(data?.appeals)) {
        return data.appeals as SuspensionAppealRecord[];
      }
    }
  } catch {
    // Ignore
  }
  return [];
}

export async function decideSuspensionAppealApi(params: {
  appealId: string;
  staffTier: 'none' | 'sub_admin' | 'super_admin';
  reviewerEmail: string;
  decision: 'approved_unbanned' | 'rejected';
  decisionNote?: string;
}): Promise<{ appeal?: SuspensionAppealRecord; error?: string }> {
  try {
    const res = await fetchWithTimeout('/api/moderation/appeals/decide', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(params),
    });
    const data = await parseJsonSafely<Record<string, unknown>>(res);
    if (!res.ok || !data) {
      return { error: String(data?.error || 'Unable to process appeal decision.') };
    }
    return { appeal: data?.appeal as SuspensionAppealRecord };
  } catch {
    return { error: 'Unable to contact appeal moderation service.' };
  }
}

export async function fetchEthicsRecoveryModuleApi(params: {
  bonusId: string;
  infractionTitle: string;
  infractionReason: string;
  deductedPoints: number;
}): Promise<EthicsRecoveryModule> {
  try {
    const res = await fetchWithTimeout(
      '/api/ethics/generate-module',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(params),
      },
      15000
    );
    if (res.ok) {
      const data = await res.json();
      if (data?.module && Array.isArray(data.module.questions)) {
        return data.module as EthicsRecoveryModule;
      }
    }
  } catch {
    // Fallback below
  }
  return buildFallbackEthicsModule(params);
}

export async function fetchSocialSyllabiQStateApi(): Promise<{
  messages: SocialChatMessage[];
  connections: SocialConnection[];
  vaultGrants: SocialVaultGrant[];
  directory: SocialDirectoryPeer[];
  backendAvailable: boolean;
}> {
  try {
    const res = await fetchWithTimeout('/api/social/state', { method: 'GET' }, 4500);
    const data = res.ok ? await parseJsonSafely<Record<string, unknown>>(res) : null;
    if (res.ok && data && (Array.isArray(data.messages) || Array.isArray(data.directory))) {
      const msgs = Array.isArray(data.messages) ? (data.messages as SocialChatMessage[]) : [];
      const dir = Array.isArray(data.directory) ? (data.directory as SocialDirectoryPeer[]) : [];
      return {
        messages: msgs.filter((m) => m.senderIsGmailAccount === true),
        connections: Array.isArray(data.connections) ? (data.connections as SocialConnection[]) : [],
        vaultGrants: Array.isArray(data.vaultGrants) ? (data.vaultGrants as SocialVaultGrant[]) : [],
        directory: dir.filter((d) => d.isGmailAccount === true),
        backendAvailable: true,
      };
    }
  } catch {
    // Fallback below for static hosting / GitHub Pages / offline
  }
  return fetchSocialStateLocal();
}

export async function postSocialMessageApi(payload: {
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
}): Promise<{ message?: SocialChatMessage; error?: string; usedStaticFallback?: boolean }> {
  const validFlex = Boolean(
    payload.flexCard && payload.flexCard.credentialCode && payload.flexCard.title
  );
  const conduct = validateSocialMessageConduct(String(payload.text || ''), validFlex);
  if (!conduct.allowed) {
    return {
      error: conduct.violationReason || 'Message rejected by conduct policy.',
    };
  }

  try {
    const res = await fetchWithTimeout(
      '/api/social/message',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      6000
    );
    const data = await parseJsonSafely<Record<string, unknown>>(res);
    if (res.ok && data?.message) {
      return { message: data.message as SocialChatMessage };
    }
    if (!res.ok && data && typeof data.error === 'string' && data.error.trim()) {
      return { error: data.error };
    }
  } catch {
    // Static host / offline fallback below
  }

  const localResult = postSocialMessageLocal(payload);
  return { ...localResult, usedStaticFallback: true };
}

export async function updateSocialProfileVisibilityApi(payload: {
  userId: string;
  displayName: string;
  avatarUrl?: string;
  avatarVisibility: AvatarVisibility;
  flexTier: FlexCardRarityTier;
  profileId?: string;
  isGmailAccount?: boolean;
  roleBadge?: PostRoleBadge;
}): Promise<void> {
  updateSocialProfileVisibilityLocal(payload);
  try {
    await fetchWithTimeout(
      '/api/social/profile-visibility',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      4500
    );
  } catch {
    // Non-blocking on static hosting
  }
}

export async function requestOrAcceptSocialConnectionApi(payload: {
  action: 'request' | 'accept';
  requesterId?: string;
  requesterName?: string;
  requesterAvatarUrl?: string;
  requesterAvatarVisibility?: AvatarVisibility;
  recipientId?: string;
  recipientName?: string;
  connectionId?: string;
}): Promise<SocialConnection | null> {
  try {
    const res = await fetchWithTimeout(
      '/api/social/connect',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      5000
    );
    const data = res.ok ? await parseJsonSafely<Record<string, unknown>>(res) : null;
    if (res.ok && data?.connection) {
      return data.connection as SocialConnection;
    }
  } catch {
    // Static host fallback below
  }
  return requestOrAcceptSocialConnectionLocal(payload);
}

export async function updateSocialVaultPermissionApi(payload: {
  action: 'request' | 'grant' | 'revoke';
  ownerId: string;
  ownerName: string;
  granteeId: string;
  granteeName: string;
  scope: VaultPermissionScope;
  singleCredentialCode?: string;
  flexCardsSnapshot?: IssuedCredentialDoc[];
  reportCardSnapshot?: IssuedCredentialDoc | null;
}): Promise<SocialVaultGrant | null> {
  try {
    const res = await fetchWithTimeout(
      '/api/social/vault-permission',
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(payload),
      },
      5000
    );
    const data = res.ok ? await parseJsonSafely<Record<string, unknown>>(res) : null;
    if (res.ok && data?.grant) {
      return data.grant as SocialVaultGrant;
    }
  } catch {
    // Static host fallback below
  }
  return updateSocialVaultPermissionLocal(payload);
}
