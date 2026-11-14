import type {
  AiStrategyBriefing,
  AlertnessWindow,
  AppState,
  IntakeExtractedUpdates,
  LearningStylePreset,
  SubjectDifficulty,
  SubjectProfile,
  TopicItem,
} from '../types.ts';
import { ALERTNESS_SLOT_MAP, computeDashboardMetrics } from './studyEngine.ts';

const VALID_ALERTNESS: AlertnessWindow[] = [
  'early_morning',
  'late_morning',
  'afternoon',
  'night_owl',
];

const VALID_LEARNING_STYLES: LearningStylePreset[] = [
  'visual_analogies',
  'step_by_step',
  'exam_shortcuts',
  'first_principles',
];

const VALID_DIFFICULTIES: SubjectDifficulty[] = ['easy', 'moderate', 'hard'];

export function extractJsonFromModelText(raw: string): Record<string, unknown> {
  const trimmed = (raw || '').trim();
  if (!trimmed) return {};

  // Strip ```json ... ``` fences if present
  const fenceRemoved = trimmed
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/i, '')
    .trim();

  try {
    const parsed = JSON.parse(fenceRemoved);
    if (parsed && typeof parsed === 'object' && !Array.isArray(parsed)) {
      return parsed as Record<string, unknown>;
    }
  } catch {
    // Try locating outermost { ... }
    const firstBrace = fenceRemoved.indexOf('{');
    const lastBrace = fenceRemoved.lastIndexOf('}');
    if (firstBrace !== -1 && lastBrace > firstBrace) {
      try {
        const sliced = JSON.parse(fenceRemoved.slice(firstBrace, lastBrace + 1));
        if (sliced && typeof sliced === 'object' && !Array.isArray(sliced)) {
          return sliced as Record<string, unknown>;
        }
      } catch {
        return {};
      }
    }
  }

  return {};
}

export interface IntakeDraftState {
  studentName: string;
  examDate: string;
  dailyStudyHours: number;
  alertnessWindow: AlertnessWindow;
  learningStyle: LearningStylePreset;
  customStyleFeedback: string;
  subjects: SubjectProfile[];
  topics: TopicItem[];
}

export function mergeIntakeUpdatesIntoDraft(
  draft: IntakeDraftState,
  updates: IntakeExtractedUpdates | undefined | null
): {
  nextDraft: IntakeDraftState;
  appliedItems: string[];
} {
  if (!updates || typeof updates !== 'object') {
    return { nextDraft: draft, appliedItems: [] };
  }

  let nextName = draft.studentName;
  let nextExamDate = draft.examDate;
  let nextHours = draft.dailyStudyHours;
  let nextAlertness = draft.alertnessWindow;
  let nextStyle = draft.learningStyle;
  let nextFeedback = draft.customStyleFeedback;
  let nextSubjects = [...draft.subjects];
  let nextTopics = [...draft.topics];
  const appliedItems: string[] = [];

  if (typeof updates.name === 'string' && updates.name.trim().length >= 2) {
    nextName = updates.name.trim();
    appliedItems.push(`Name: ${nextName}`);
  }

  if (typeof updates.examDate === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(updates.examDate.trim())) {
    nextExamDate = updates.examDate.trim();
    appliedItems.push(`Exam Date: ${nextExamDate}`);
  }

  if (typeof updates.dailyStudyHours === 'number' && !Number.isNaN(updates.dailyStudyHours)) {
    const clamped = Math.max(1.5, Math.min(10, Math.round(updates.dailyStudyHours * 2) / 2));
    nextHours = clamped;
    appliedItems.push(`Study Capacity: ${clamped} hrs/day`);
  }

  if (
    typeof updates.alertnessWindow === 'string' &&
    VALID_ALERTNESS.includes(updates.alertnessWindow as AlertnessWindow)
  ) {
    nextAlertness = updates.alertnessWindow as AlertnessWindow;
    appliedItems.push(`Alertness: ${ALERTNESS_SLOT_MAP[nextAlertness].label}`);
  }

  if (
    typeof updates.learningStyle === 'string' &&
    VALID_LEARNING_STYLES.includes(updates.learningStyle as LearningStylePreset)
  ) {
    nextStyle = updates.learningStyle as LearningStylePreset;
  }

  if (
    typeof updates.customStyleFeedback === 'string' &&
    updates.customStyleFeedback.trim().length > 0
  ) {
    nextFeedback = updates.customStyleFeedback.trim();
    appliedItems.push('Saved study style note');
  }

  if (Array.isArray(updates.subjectUpdates) && updates.subjectUpdates.length > 0) {
    nextSubjects = nextSubjects.map((subj) => {
      const match = updates.subjectUpdates?.find((u) => {
        if (u.subjectId && u.subjectId === subj.id) return true;
        if (u.subjectName) {
          const uLower = u.subjectName.toLowerCase();
          const sLower = subj.name.toLowerCase();
          return sLower.includes(uLower) || uLower.includes(sLower);
        }
        return false;
      });
      if (!match) return subj;

      const updatedDiff =
        match.difficulty && VALID_DIFFICULTIES.includes(match.difficulty)
          ? match.difficulty
          : subj.difficulty;

      const updatedScore =
        typeof match.previousScoreOutOf100 === 'number' &&
        !Number.isNaN(match.previousScoreOutOf100)
          ? Math.max(0, Math.min(100, Math.round(match.previousScoreOutOf100)))
          : subj.previousScoreOutOf100;

      appliedItems.push(`${subj.name}: ${updatedDiff} (${updatedScore}/100)`);
      return {
        ...subj,
        difficulty: updatedDiff,
        previousScoreOutOf100: updatedScore,
      };
    });
  }

  if (Array.isArray(updates.ongoingTopicTitles) && updates.ongoingTopicTitles.length > 0) {
    const needles = updates.ongoingTopicTitles
      .map((t) => String(t || '').trim().toLowerCase())
      .filter((t) => t.length >= 3);

    if (needles.length > 0) {
      let matchedCount = 0;
      nextTopics = nextTopics.map((topic) => {
        const lowerTitle = topic.title.toLowerCase();
        const isMatch = needles.some((n) => lowerTitle.includes(n) || n.includes(lowerTitle));
        if (isMatch) {
          matchedCount += 1;
          return { ...topic, classStatus: 'ongoing' };
        }
        return topic;
      });
      if (matchedCount > 0) {
        appliedItems.push(`${matchedCount} class-active chapter(s) synced`);
      }
    }
  }

  return {
    nextDraft: {
      studentName: nextName,
      examDate: nextExamDate,
      dailyStudyHours: nextHours,
      alertnessWindow: nextAlertness,
      learningStyle: nextStyle,
      customStyleFeedback: nextFeedback,
      subjects: nextSubjects,
      topics: nextTopics,
    },
    appliedItems,
  };
}

export function parseNaturalIntakeFallback(
  text: string,
  subjects: SubjectProfile[]
): IntakeExtractedUpdates {
  const updates: IntakeExtractedUpdates = {};
  const lower = text.toLowerCase();

  const nameMatch = text.match(
    /(?:[Ii]\s+am|[Ii]['’]m|[Mm]y\s+name\s+is|[Nn]ame[:\s]+)\s*([A-Z][a-z]+(?:\s+[A-Z][a-z]+)?)/
  );
  if (nameMatch?.[1]) {
    updates.name = nameMatch[1].trim();
  }

  const hoursMatch = lower.match(/(\d+(?:\.\d+)?)\s*(?:hours?|hrs?)/);
  if (hoursMatch?.[1]) {
    updates.dailyStudyHours = Number(hoursMatch[1]);
  }

  if (lower.includes('early morning') || lower.includes('5 am') || lower.includes('6 am')) {
    updates.alertnessWindow = 'early_morning';
  } else if (lower.includes('night') || lower.includes('late')) {
    updates.alertnessWindow = 'night_owl';
  } else if (lower.includes('afternoon')) {
    updates.alertnessWindow = 'afternoon';
  } else if (lower.includes('morning')) {
    updates.alertnessWindow = 'late_morning';
  }

  const subjectUpdates: NonNullable<IntakeExtractedUpdates['subjectUpdates']> = [];
  for (const s of subjects) {
    const sKey = s.name.toLowerCase();
    const firstWord = sKey.split(/\s+/)[0];
    if (lower.includes(sKey) || (firstWord.length >= 4 && lower.includes(firstWord))) {
      // Inspect local clause around the subject mention
      const idx = lower.indexOf(firstWord);
      const windowSlice = lower.slice(Math.max(0, idx - 25), Math.min(lower.length, idx + 65));
      let difficulty: SubjectDifficulty | undefined;
      if (/\b(hard|tough|difficult|weak)\b/.test(windowSlice)) difficulty = 'hard';
      else if (/\b(easy|strong|comfortable|simple)\b/.test(windowSlice)) difficulty = 'easy';
      else if (/\b(moderate|medium|okay|average)\b/.test(windowSlice)) difficulty = 'moderate';

      const scoreMatch = windowSlice.match(/(\d{2,3})\s*(?:\/\s*100|%|marks|score)?/);
      const previousScoreOutOf100 = scoreMatch?.[1] ? Number(scoreMatch[1]) : undefined;

      if (difficulty || previousScoreOutOf100 !== undefined) {
        subjectUpdates.push({
          subjectId: s.id,
          subjectName: s.name,
          difficulty,
          previousScoreOutOf100,
        });
      }
    }
  }
  if (subjectUpdates.length > 0) {
    updates.subjectUpdates = subjectUpdates;
  }

  return updates;
}

export function buildAnalyticalStrategyFallback(
  state: AppState,
  recoveryContext?: string
): AiStrategyBriefing {
  const metrics = computeDashboardMetrics(state);
  const slotInfo = ALERTNESS_SLOT_MAP[state.student.alertnessWindow];
  const hardest =
    [...state.subjects].sort((a, b) => a.previousScoreOutOf100 - b.previousScoreOutOf100)[0] ||
    state.subjects[0];
  const highYieldPending = state.topics.filter((t) => t.yieldType === 'high' && !t.completed);
  const ongoingTopics = state.topics.filter((t) => t.classStatus === 'ongoing' && !t.completed);

  return {
    headline: `${state.student.boardOrUniversity} Readiness at ${metrics.examReadinessPercent}% — Prioritize ${
      hardest ? hardest.name : 'High-Yield Chapters'
    } in ${slotInfo.label} Slots`,
    alertnessStrategy: `Anchor ${
      hardest ? hardest.name : 'your toughest numerical derivations'
    } inside your ${slotInfo.peakRange} peak alertness window while reserving lighter review blocks for secondary slots.`,
    pyqFocusAdvice: `${highYieldPending.length} high-yield ${
      state.student.boardOrUniversity
    } past-paper chapters remain open${
       highYieldPending[0] ? `, led by "${highYieldPending[0].title}"` : ''
    }. Completing these lifts ~70% of expected exam weightage.`,
    classSyncTip:
      ongoingTopics.length > 0
        ? `Keep "${ongoingTopics[0].title}" synchronized with your live lectures this week so class problem-solving doubles as exam revision.`
        : 'All live-class chapters are aligned—use 18s Adaptive Countdown sprints to lock in recall.',
    recoveryNote: recoveryContext || state.lastReoptimizationNote,
    actionableSteps: [
      `Complete today's ${slotInfo.peakRange} peak-focus block before checking passive notes.`,
      `Attempt today's compressed-time PYQ Daily Target aiming for 8.0+/10 accuracy.`,
      `Run a 5-question Adaptive Countdown Blitz on covered chapters to reinforce weak spots.`,
    ],
    generatedAt: new Date().toISOString(),
    usedAi: false,
  };
}
