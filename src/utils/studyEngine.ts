import type {
  Achievement,
  AlertnessWindow,
  AnsweredQuestionRecord,
  AppState,
  ClassStatus,
  DailyPlan,
  DifficultyTier,
  LearningStylePreset,
  MCQQuestion,
  ScheduledSession,
  StudentProfile,
  SubjectDifficulty,
  SubjectProfile,
  SubjectTestBreakdown,
  TestAttempt,
  TopicItem,
  YieldType,
} from '../types';

export const ALERTNESS_SLOT_MAP: Record<
  AlertnessWindow,
  {
    label: string;
    peakRange: string;
    secondaryRange: string;
    description: string;
  }
> = {
  early_morning: {
    label: 'Early Morning Peak',
    peakRange: '05:30 – 08:00',
    secondaryRange: '17:00 – 19:00',
    description: 'High-difficulty & high-yield syllabus blocks scheduled right after waking.',
  },
  late_morning: {
    label: 'Late Morning Peak',
    peakRange: '09:30 – 12:30',
    secondaryRange: '16:30 – 18:30',
    description: 'Deep problem-solving before noon, lighter revision in late afternoon.',
  },
  afternoon: {
    label: 'Afternoon Focus',
    peakRange: '14:00 – 17:00',
    secondaryRange: '19:30 – 21:00',
    description: 'Core analytical chapters after midday, active recall in early evening.',
  },
  night_owl: {
    label: 'Night Owl Deep Work',
    peakRange: '20:30 – 23:30',
    secondaryRange: '16:00 – 17:30',
    description: 'Quiet late-evening block reserved for toughest board/university concepts.',
  },
};

export const LEARNING_STYLE_LABELS: Record<LearningStylePreset, string> = {
  visual_analogies: 'Visual Intuition & Real-World Analogies',
  step_by_step: 'Structured 3-Step Breakdown',
  exam_shortcuts: 'Exam-Focused PYQ Shortcuts & Elimination',
  first_principles: 'First-Principles Conceptual Derivation',
};

export function buildYoutubeSearchUrl(query: string): string {
  return `https://www.youtube.com/results?search_query=${encodeURIComponent(query)}`;
}

export function computeTopicWeight(topic: TopicItem, subject?: SubjectProfile): number {
  const difficultyMultiplier: Record<SubjectDifficulty, number> = {
    hard: 1.45,
    moderate: 1.15,
    easy: 0.85,
  };
  const classMultiplier: Record<ClassStatus, number> = {
    ongoing: 1.38,
    upcoming: 1.0,
    covered: 0.88,
  };
  const yieldMultiplier: Record<YieldType, number> = {
    high: 1.32,
    low: 0.9,
  };

  const diff = subject ? difficultyMultiplier[subject.difficulty] : 1.15;
  const pastScoreGap = subject
    ? 1 + Math.max(0, 100 - subject.previousScoreOutOf100) / 160
    : 1.15;

  return Number(
    (
      topic.estimatedHours *
      diff *
      pastScoreGap *
      classMultiplier[topic.classStatus] *
      yieldMultiplier[topic.yieldType]
    ).toFixed(3)
  );
}

export function getProgressiveTestConfig(
  dayIndex: number,
  completedDailyTestsCount: number
): {
  questionCount: number;
  difficultyTier: DifficultyTier;
  compressedPerQuestionSec: number;
  standardPerQuestionSec: number;
} {
  const progression = dayIndex + completedDailyTestsCount;
  const standardPerQuestionSec = 90;

  if (progression <= 1) {
    return {
      questionCount: 6,
      difficultyTier: 'Foundation',
      compressedPerQuestionSec: 60,
      standardPerQuestionSec,
    };
  }
  if (progression <= 4) {
    return {
      questionCount: 8,
      difficultyTier: 'Exam Standard',
      compressedPerQuestionSec: 52,
      standardPerQuestionSec,
    };
  }
  if (progression <= 8) {
    return {
      questionCount: 10,
      difficultyTier: 'Advanced PYQ',
      compressedPerQuestionSec: 45,
      standardPerQuestionSec,
    };
  }
  return {
    questionCount: 12,
    difficultyTier: 'Rank Booster',
    compressedPerQuestionSec: 40,
    standardPerQuestionSec,
  };
}

export function addDaysISO(baseISO: string, days: number): string {
  const [y, m, d] = baseISO.split('-').map(Number);
  const dt = new Date(Date.UTC(y, (m || 1) - 1, (d || 1) + days));
  return dt.toISOString().slice(0, 10);
}

export function daysBetweenISO(startISO: string, endISO: string): number {
  const [y1, m1, d1] = startISO.split('-').map(Number);
  const [y2, m2, d2] = endISO.split('-').map(Number);
  const t1 = Date.UTC(y1, (m1 || 1) - 1, d1 || 1);
  const t2 = Date.UTC(y2, (m2 || 1) - 1, d2 || 1);
  return Math.round((t2 - t1) / (1000 * 60 * 60 * 24));
}

export function generateTimetable(
  student: StudentProfile,
  subjects: SubjectProfile[],
  topics: TopicItem[],
  startDateISO: string,
  completedTestsCount = 0
): DailyPlan[] {
  const rawDays = daysBetweenISO(startDateISO, student.examDate);
  const totalDays = Math.max(3, Math.min(45, rawDays > 0 ? rawDays : 14));
  const dailyComfortHours = Math.max(1, Math.min(12, student.dailyStudyHours || 4));
  const slotInfo = ALERTNESS_SLOT_MAP[student.alertnessWindow] || ALERTNESS_SLOT_MAP.early_morning;

  const subjectMap = new Map(subjects.map((s) => [s.id, s]));

  // Sort incomplete topics so ongoing-in-class, hard, low-past-score, and high-yield come first
  const remainingTopics = topics
    .filter((t) => !t.completed)
    .map((topic) => {
      const subj = subjectMap.get(topic.subjectId);
      const priorityScore =
        computeTopicWeight(topic, subj) / Math.max(0.5, topic.estimatedHours);
      return { topic, subj, priorityScore };
    })
    .sort((a, b) => b.priorityScore - a.priorityScore);

  const totalHoursNeeded = remainingTopics.reduce((acc, item) => acc + item.topic.estimatedHours, 0);
  // Target daily study load smoothly covers the entire syllabus within totalDays while respecting comfort hours
  const smoothTargetHoursPerDay = Math.max(
    Math.min(dailyComfortHours, totalHoursNeeded / totalDays || dailyComfortHours),
    Math.min(dailyComfortHours * 1.25, totalHoursNeeded / totalDays)
  );
  const effectiveDailyBudget = Number(Math.max(1.5, smoothTargetHoursPerDay).toFixed(1));

  // Build study chunks (split large topics into ~1.5h–2.0h sessions)
  interface QueueChunk {
    topic: TopicItem;
    durationHours: number;
    isHardOrHighYield: boolean;
  }

  const chunks: QueueChunk[] = [];
  for (const { topic, subj } of remainingTopics) {
    let left = topic.estimatedHours;
    const isHardOrHighYield =
      subj?.difficulty === 'hard' || topic.yieldType === 'high' || topic.classStatus === 'ongoing';
    while (left > 0.05) {
      const slice = left > 2.2 ? 1.5 : Number(left.toFixed(1));
      chunks.push({
        topic,
        durationHours: slice,
        isHardOrHighYield,
      });
      left = Number((left - slice).toFixed(2));
    }
  }

  // If syllabus is small relative to days, append structured PYQ & spaced-repetition revision blocks so all days are covered
  let fallbackIdx = 0;
  const allTopicsPool = topics.length > 0 ? topics : [];
  while (chunks.length < totalDays && allTopicsPool.length > 0) {
    const refTopic = allTopicsPool[fallbackIdx % allTopicsPool.length];
    chunks.push({
      topic: refTopic,
      durationHours: Math.min(1.5, dailyComfortHours * 0.5),
      isHardOrHighYield: refTopic.yieldType === 'high',
    });
    fallbackIdx++;
  }

  const plans: DailyPlan[] = [];
  let chunkCursor = 0;
  const cumulativeCoveredIds = new Set<string>(
    topics.filter((t) => t.completed).map((t) => t.id)
  );

  for (let d = 0; d < totalDays; d++) {
    const dateISO = addDaysISO(startDateISO, d);
    const daySessions: ScheduledSession[] = [];
    let hoursAllocated = 0;
    const remainingDaysCount = totalDays - d;
    const remainingHoursInQueue = chunks
      .slice(chunkCursor)
      .reduce((acc, c) => acc + c.durationHours, 0);
    const dynamicBudget = Math.max(
      effectiveDailyBudget,
      Number((remainingHoursInQueue / remainingDaysCount).toFixed(1))
    );

    let peakUsed = false;

    while (chunkCursor < chunks.length && (hoursAllocated < dynamicBudget - 0.1 || daySessions.length === 0)) {
      const nextChunk = chunks[chunkCursor];
      if (daySessions.length > 0 && hoursAllocated + nextChunk.durationHours > dynamicBudget + 0.6) {
        break;
      }
      const assignPeak = !peakUsed && nextChunk.isHardOrHighYield;
      if (assignPeak || daySessions.length === 0) {
        peakUsed = true;
      }
      daySessions.push({
        id: `sess-${dateISO}-${daySessions.length}`,
        topicId: nextChunk.topic.id,
        subjectId: nextChunk.topic.subjectId,
        subjectName: nextChunk.topic.subjectName,
        topicTitle: nextChunk.topic.title,
        durationHours: nextChunk.durationHours,
        timeSlotLabel:
          daySessions.length === 0
            ? `${slotInfo.peakRange} (Peak Alertness)`
            : `${slotInfo.secondaryRange} (Comfort Slot)`,
        isPeakSlot: daySessions.length === 0,
        yieldType: nextChunk.topic.yieldType,
        classStatus: nextChunk.topic.classStatus,
        youtubeQuery: nextChunk.topic.youtubeQuery,
        youtubeTitle: nextChunk.topic.youtubeTitle,
        youtubeChannelHint: nextChunk.topic.youtubeChannelHint,
        completed: false,
      });
      cumulativeCoveredIds.add(nextChunk.topic.id);
      hoursAllocated = Number((hoursAllocated + nextChunk.durationHours).toFixed(1));
      chunkCursor++;
    }

    const testCfg = getProgressiveTestConfig(d, completedTestsCount);
    const coveredForTest = Array.from(cumulativeCoveredIds);

    plans.push({
      dayIndex: d,
      dateISO,
      missed: false,
      reoptimizedExtraHours: 0,
      totalHours: hoursAllocated,
      sessions: daySessions,
      dailyTestTarget: {
        targetQuestionCount: testCfg.questionCount,
        difficultyTier: testCfg.difficultyTier,
        compressedTimeSeconds: testCfg.questionCount * testCfg.compressedPerQuestionSec,
        standardExamTimeSeconds: testCfg.questionCount * testCfg.standardPerQuestionSec,
        coveredTopicIds: coveredForTest.length > 0 ? coveredForTest : topics.map((t) => t.id),
        completed: false,
      },
    });
  }

  return plans;
}

export function reoptimizeMissedDay(
  currentSchedule: DailyPlan[],
  topics: TopicItem[],
  subjects: SubjectProfile[],
  student: StudentProfile,
  missedDateISO: string
): { updatedSchedule: DailyPlan[]; summaryNote: string } {
  const missedIdx = currentSchedule.findIndex((p) => p.dateISO === missedDateISO);
  if (missedIdx === -1) {
    return {
      updatedSchedule: currentSchedule,
      summaryNote: 'Selected date was not found in the active timetable.',
    };
  }

  const targetDay = currentSchedule[missedIdx];
  const unfinishedSessions = targetDay.sessions.filter((s) => !s.completed);
  const missedHours = Number(
    unfinishedSessions.reduce((acc, s) => acc + s.durationHours, 0).toFixed(1)
  );

  // Past and missed days stay preserved up to missedIdx
  const lockedPrefix = currentSchedule.slice(0, missedIdx + 1).map((day, idx) =>
    idx === missedIdx
      ? {
          ...day,
          missed: true,
          sessions: day.sessions.filter((s) => s.completed),
          totalHours: Number(
            day.sessions
              .filter((s) => s.completed)
              .reduce((a, b) => a + b.durationHours, 0)
              .toFixed(1)
          ),
        }
      : day
  );

  // Determine how much of each topic was already completed or scheduled in locked past non-missed days
  const completedHoursByTopic = new Map<string, number>();
  for (const day of lockedPrefix) {
    for (const sess of day.sessions) {
      if (sess.completed || !day.missed) {
        completedHoursByTopic.set(
          sess.topicId,
          (completedHoursByTopic.get(sess.topicId) || 0) + sess.durationHours
        );
      }
    }
  }

  const remainingTopicsForFuture: TopicItem[] = [];
  for (const t of topics) {
    if (t.completed) continue;
    const alreadyScheduled = completedHoursByTopic.get(t.id) || 0;
    const leftHours = Number(Math.max(0, t.estimatedHours - alreadyScheduled).toFixed(1));
    if (leftHours > 0.1) {
      remainingTopicsForFuture.push({
        ...t,
        estimatedHours: leftHours,
      });
    }
  }

  const nextStartISO = addDaysISO(missedDateISO, 1);
  const futureDaysCount = Math.max(2, currentSchedule.length - (missedIdx + 1));
  const adjustedExamDate =
    daysBetweenISO(nextStartISO, student.examDate) >= 2
      ? student.examDate
      : addDaysISO(nextStartISO, futureDaysCount);

  const regeneratedFuture = generateTimetable(
    {
      ...student,
      examDate: adjustedExamDate,
    },
    subjects,
    remainingTopicsForFuture.length > 0 ? remainingTopicsForFuture : topics.filter((t) => !t.completed),
    nextStartISO
  ).map((futureDay, idx) => {
    const extraPerDay = Number((missedHours / Math.max(1, futureDaysCount)).toFixed(2));
    return {
      ...futureDay,
      dayIndex: missedIdx + 1 + idx,
      reoptimizedExtraHours: extraPerDay,
    };
  });

  const extraMinutesPerDay = Math.round((missedHours * 60) / Math.max(1, regeneratedFuture.length));

  return {
    updatedSchedule: [...lockedPrefix, ...regeneratedFuture],
    summaryNote: `Smoothly redistributed ${missedHours} hrs from ${missedDateISO} across ${regeneratedFuture.length} remaining days (+${extraMinutesPerDay} mins/day), prioritizing High-Yield & Class-Active chapters inside your ${ALERTNESS_SLOT_MAP[student.alertnessWindow].label} slot.`,
  };
}

export function scoreTestAttempt(params: {
  id: string;
  mode: 'daily_target' | 'countdown_blitz';
  dateISO: string;
  dayDateISO?: string;
  difficultyTier: DifficultyTier;
  durationSeconds: number;
  targetTimeSeconds: number;
  standardExamTimeSeconds: number;
  questions: MCQQuestion[];
  selectedIndices: Array<number | null>;
  perQuestionTimes: number[];
  student: StudentProfile;
}): TestAttempt {
  const {
    id,
    mode,
    dateISO,
    dayDateISO,
    difficultyTier,
    durationSeconds,
    targetTimeSeconds,
    standardExamTimeSeconds,
    questions,
    selectedIndices,
    perQuestionTimes,
    student,
  } = params;

  const bySubject = new Map<string, { name: string; correct: number; total: number }>();
  const answers: AnsweredQuestionRecord[] = [];
  let correctCount = 0;

  questions.forEach((q, idx) => {
    const sel = selectedIndices[idx] ?? null;
    const isCorrect = sel === q.correctIndex;
    if (isCorrect) correctCount++;

    const entry = bySubject.get(q.subjectId) || {
      name: q.subjectName,
      correct: 0,
      total: 0,
    };
    entry.total += 1;
    if (isCorrect) entry.correct += 1;
    bySubject.set(q.subjectId, entry);

    answers.push({
      question: q,
      selectedIndex: sel,
      timeSpentSeconds: perQuestionTimes[idx] || Math.round(durationSeconds / Math.max(1, questions.length)),
      isCorrect,
      personalizedExplanation: isCorrect
        ? q.baseExplanation
        : adaptExplanationToStudent(q, sel, student),
    });
  });

  const subjectBreakdown: SubjectTestBreakdown[] = Array.from(bySubject.entries()).map(
    ([subjectId, stats]) => ({
      subjectId,
      subjectName: stats.name,
      correct: stats.correct,
      total: stats.total,
      scoreOutOf10: Number(((stats.correct / Math.max(1, stats.total)) * 10).toFixed(1)),
    })
  );

  const totalQuestions = Math.max(1, questions.length);
  const overallScoreOutOf10 = Number(((correctCount / totalQuestions) * 10).toFixed(1));
  const accuracyPercent = Math.round((correctCount / totalQuestions) * 100);

  return {
    id,
    mode,
    dateISO,
    dayDateISO,
    difficultyTier,
    durationSeconds,
    targetTimeSeconds,
    standardExamTimeSeconds,
    totalQuestions: questions.length,
    correctCount,
    accuracyPercent,
    overallScoreOutOf10,
    subjectBreakdown,
    answers,
    unlockedAchievementIds: [],
  };
}

export function adaptExplanationToStudent(
  question: MCQQuestion,
  selectedIndex: number | null,
  student: StudentProfile
): string {
  const chosenLabel =
    selectedIndex !== null && question.options[selectedIndex]
      ? `You picked "${question.options[selectedIndex]}", whereas the exam-verified answer is "${question.options[question.correctIndex]}".`
      : `Time expired before selecting "${question.options[question.correctIndex]}".`;

  const customDirective = student.customStyleFeedback.trim();
  const customPrefix = customDirective
    ? `[Adapted to your note: "${customDirective}"] `
    : '';

  switch (student.learningStyle) {
    case 'visual_analogies':
      return `${customPrefix}${chosenLabel} Picture the underlying mechanism visually: ${question.baseExplanation} Mental anchor for ${student.boardOrUniversity} exams: link "${question.topicTitle}" to what changes first before computing numbers.`;
    case 'step_by_step':
      return `${customPrefix}${chosenLabel} Step 1: Identify the core rule in ${question.topicTitle}. Step 2: Apply the boundary condition — ${question.baseExplanation} Step 3: Verify units/constraints against ${question.pyqReference}.`;
    case 'exam_shortcuts':
      return `${customPrefix}${chosenLabel} Fast PYQ Elimination Rule: immediately rule out distractors that violate conservation/definition bounds. ${question.baseExplanation}`;
    case 'first_principles':
    default:
      return `${customPrefix}${chosenLabel} From first principles in ${question.subjectName}: ${question.baseExplanation}`;
  }
}

export function recalculateSubjectScoresOutOf10(
  subjects: SubjectProfile[],
  attempts: TestAttempt[]
): { updatedSubjects: SubjectProfile[]; overallSyllabusScoreOutOf10: number | null } {
  const tally = new Map<string, { correct: number; total: number }>();

  for (const att of attempts) {
    for (const sb of att.subjectBreakdown) {
      const prev = tally.get(sb.subjectId) || { correct: 0, total: 0 };
      prev.correct += sb.correct;
      prev.total += sb.total;
      tally.set(sb.subjectId, prev);
    }
  }

  let totalAllCorrect = 0;
  let totalAllQuestions = 0;

  const updatedSubjects = subjects.map((subj) => {
    const stat = tally.get(subj.id);
    if (!stat || stat.total === 0) {
      return {
        ...subj,
        currentRatingOutOf10: null,
        questionsAnswered: 0,
        questionsCorrect: 0,
      };
    }
    totalAllCorrect += stat.correct;
    totalAllQuestions += stat.total;
    return {
      ...subj,
      questionsAnswered: stat.total,
      questionsCorrect: stat.correct,
      currentRatingOutOf10: Number(((stat.correct / stat.total) * 10).toFixed(1)),
    };
  });

  const overallSyllabusScoreOutOf10 =
    totalAllQuestions > 0
      ? Number(((totalAllCorrect / totalAllQuestions) * 10).toFixed(1))
      : null;

  return { updatedSubjects, overallSyllabusScoreOutOf10 };
}

export function evaluateAchievements(
  existing: Achievement[],
  attempts: TestAttempt[],
  topics: TopicItem[],
  reoptimizedAtLeastOnce: boolean,
  studentName: string,
  options?: {
    lastActiveDate?: string;
    referenceDateISO?: string;
    focusMinutesTotal?: number;
  }
): { achievements: Achievement[]; newlyUnlockedIds: string[]; dissolvedIds: string[] } {
  const newlyUnlockedIds: string[] = [];
  const dissolvedIds: string[] = [];
  const nowISO = options?.referenceDateISO || new Date().toISOString().slice(0, 10);

  let inactiveDays = 0;
  if (options?.lastActiveDate) {
    const lastMs = Date.parse(`${options.lastActiveDate.slice(0, 10)}T00:00:00Z`);
    const refMs = Date.parse(`${nowISO.slice(0, 10)}T00:00:00Z`);
    if (!Number.isNaN(lastMs) && !Number.isNaN(refMs)) {
      inactiveDays = Math.max(0, Math.floor((refMs - lastMs) / (1000 * 60 * 60 * 24)));
    }
  }

  const focusMinutesTotal = options?.focusMinutesTotal ?? 0;
  const hasStudyActivity =
    topics.length > 0 || attempts.length > 0 || focusMinutesTotal > 0;
  const isActiveLearner = hasStudyActivity && inactiveDays < 3;

  const highScorerAttempt = attempts.find((a) => a.overallScoreOutOf10 >= 8.0);
  const eliteScorerAttempt = attempts.find((a) => a.overallScoreOutOf10 >= 9.0);
  const blitzSpeedAttempt = attempts.find(
    (a) =>
      a.mode === 'countdown_blitz' &&
      a.accuracyPercent >= 75 &&
      a.durationSeconds <= a.targetTimeSeconds * 0.85
  );
  const highYieldTopics = topics.filter((t) => t.yieldType === 'high');
  const highYieldDone =
    highYieldTopics.length > 0 &&
    highYieldTopics.filter((t) => t.completed).length / highYieldTopics.length >= 0.5;

  const rules: Record<
    string,
    {
      condition: boolean;
      dissolvable?: boolean;
      dissolvedMessage?: string;
      metricBadge?: string;
      shareHeadline?: string;
    }
  > = {
    'ach-active-learner': {
      condition: isActiveLearner,
      dissolvable: true,
      dissolvedMessage:
        inactiveDays >= 3
          ? `Dissolved after ${inactiveDays} inactive days — XP decaying by 40 XP/day until you complete a study session or test.`
          : undefined,
      metricBadge: isActiveLearner
        ? inactiveDays === 0
          ? 'Active Today'
          : `Active · ${3 - inactiveDays}d Shield`
        : `Dissolved · ${inactiveDays}d Inactive`,
      shareHeadline: isActiveLearner
        ? `${studentName} maintains an unbroken Active Learner Pulse on SyllabiQ!`
        : undefined,
    },
    'ach-syllabus-mapped': {
      condition: topics.length > 0,
      metricBadge: `${topics.length} Chapters Indexed`,
      shareHeadline: `${studentName} mapped ${topics.length} syllabus chapters into an alertness-optimized exam plan on SyllabiQ!`,
    },
    'ach-eight-plus-flex': {
      condition: Boolean(highScorerAttempt),
      metricBadge: highScorerAttempt ? `${highScorerAttempt.overallScoreOutOf10} / 10 Score` : '8.0+ / 10',
      shareHeadline: highScorerAttempt
        ? `${studentName} scored ${highScorerAttempt.overallScoreOutOf10}/10 under compressed exam time on SyllabiQ PYQ Target!`
        : undefined,
    },
    'ach-blitz-speed-flex': {
      condition: Boolean(blitzSpeedAttempt),
      metricBadge: blitzSpeedAttempt
        ? `${blitzSpeedAttempt.correctCount}/${blitzSpeedAttempt.totalQuestions} in ${blitzSpeedAttempt.durationSeconds}s`
        : 'Sub-Par Speed',
      shareHeadline: blitzSpeedAttempt
        ? `${studentName} crushed Adaptive Countdown Blitz (${blitzSpeedAttempt.correctCount}/${blitzSpeedAttempt.totalQuestions} correct in just ${blitzSpeedAttempt.durationSeconds}s — beating target time)!`
        : undefined,
    },
    'ach-high-yield-master': {
      condition: highYieldDone,
      metricBadge: '50%+ High-Yield Done',
      shareHeadline: `${studentName} conquered over 50% of High-Yield Board/University PYQ chapters on SyllabiQ!`,
    },
    'ach-resilient-planner': {
      condition: reoptimizedAtLeastOnce,
      metricBadge: 'Zero-Backlog Recovery',
      shareHeadline: `${studentName} dynamically re-optimized their exam roadmap with zero syllabus backlog!`,
    },
    'ach-nine-distinction': {
      condition: Boolean(eliteScorerAttempt),
      metricBadge: eliteScorerAttempt ? `${eliteScorerAttempt.overallScoreOutOf10} / 10 Distinction` : '9.0+ / 10',
      shareHeadline: eliteScorerAttempt
        ? `${studentName} hit Distinction Tier (${eliteScorerAttempt.overallScoreOutOf10}/10) on Advanced PYQ Exam Target!`
        : undefined,
    },
    'ach-focus-marathon': {
      condition: focusMinutesTotal >= 50,
      metricBadge: focusMinutesTotal >= 50 ? `${focusMinutesTotal}m Deep Focus` : '50m Target',
      shareHeadline:
        focusMinutesTotal >= 50
          ? `${studentName} logged ${focusMinutesTotal} minutes of uninterrupted deep exam focus on SyllabiQ!`
          : undefined,
    },
  };

  const updated = existing.map((ach) => {
    const r = rules[ach.id];
    if (!r) return ach;

    if (r.dissolvable && !r.condition && inactiveDays >= 3) {
      if (ach.unlocked) {
        dissolvedIds.push(ach.id);
      }
      return {
        ...ach,
        unlocked: false,
        dissolvable: true,
        dissolvedReason: r.dissolvedMessage,
        metricBadge: r.metricBadge || ach.metricBadge,
      };
    }

    if (r.condition && !ach.unlocked) {
      newlyUnlockedIds.push(ach.id);
      return {
        ...ach,
        unlocked: true,
        unlockedAt: nowISO,
        dissolvedReason: undefined,
        metricBadge: r.metricBadge || ach.metricBadge,
        shareHeadline: r.shareHeadline || ach.shareHeadline,
      };
    }
    if (r.condition && ach.unlocked) {
      return {
        ...ach,
        dissolvedReason: undefined,
        metricBadge: r.metricBadge || ach.metricBadge,
        shareHeadline: r.shareHeadline || ach.shareHeadline,
      };
    }
    return ach;
  });

  return { achievements: updated, newlyUnlockedIds, dissolvedIds };
}

export interface MasteryProgressPoint {
  dateISO: string;
  dateLabel: string;
  overallMasteryPercent: number;
  highYieldMasteryPercent: number;
  lowYieldMasteryPercent: number;
  completedTopicsCount: number;
  totalTopicsCount: number;
}

export interface TopicMasteryPoint {
  id: string;
  topicTitle: string;
  shortTitle: string;
  subjectName: string;
  masteryPercent: number;
  yieldType: YieldType;
  completed: boolean;
}

function formatShortChartDate(dateISO: string, todayISO: string): string {
  if (dateISO === todayISO) return 'Today';
  if (/^\d{4}-\d{2}-\d{2}$/.test(dateISO)) {
    const [, mm, dd] = dateISO.split('-');
    const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    const mIdx = Math.max(0, Math.min(11, Number(mm) - 1));
    return `${months[mIdx]} ${Number(dd)}`;
  }
  return dateISO;
}

export function buildMasteryProgressOverTime(
  topics: TopicItem[],
  schedule: DailyPlan[] = [],
  referenceDateISO?: string
): MasteryProgressPoint[] {
  if (!topics || topics.length === 0) return [];

  const todayISO = (referenceDateISO || new Date().toISOString()).slice(0, 10);
  const dateSet = new Set<string>();

  const completedDates = topics
    .filter((t) => t.completed && t.completedAt)
    .map((t) => String(t.completedAt).slice(0, 10))
    .sort();

  for (const d of completedDates) {
    if (d <= todayISO) dateSet.add(d);
  }

  for (const day of schedule) {
    if (day.dateISO && day.dateISO <= todayISO) {
      dateSet.add(day.dateISO.slice(0, 10));
    }
  }

  dateSet.add(todayISO);

  let sortedDates = Array.from(dateSet).sort();
  if (sortedDates.length === 1) {
    const earliest = addDaysISO(sortedDates[0], -2);
    const mid = addDaysISO(sortedDates[0], -1);
    sortedDates = [earliest, mid, sortedDates[0]];
  } else if (sortedDates.length === 2) {
    const earliest = addDaysISO(sortedDates[0], -1);
    sortedDates = [earliest, ...sortedDates];
  }

  // Keep the timeline crisp (up to 10 chronological checkpoints, always keeping first & Today)
  if (sortedDates.length > 10) {
    const tail = sortedDates.slice(-9);
    sortedDates = [sortedDates[0], ...tail];
  }

  const highYieldTopics = topics.filter((t) => t.yieldType === 'high');
  const lowYieldTopics = topics.filter((t) => t.yieldType === 'low');

  return sortedDates.map((dateISO, idx) => {
    const isLatest = dateISO === todayISO || idx === sortedDates.length - 1;

    const getTopicMasteryAtDate = (t: TopicItem): number => {
      const clampedCurrent = Math.max(0, Math.min(100, Math.round(t.masteryPercent || 0)));
      if (isLatest) {
        return clampedCurrent;
      }
      const doneDate = t.completed ? (t.completedAt || todayISO).slice(0, 10) : null;
      if (doneDate && doneDate <= dateISO) {
        return clampedCurrent;
      }
      if (t.completed) {
        // Prior to its completion date, reflect initial pre-mastery baseline
        return Math.min(28, clampedCurrent);
      }
      // For currently incomplete topics on earlier days, gently scale from baseline to current live mastery
      const ratio = sortedDates.length > 1 ? idx / (sortedDates.length - 1) : 1;
      return Math.round(Math.min(clampedCurrent, 15 + (clampedCurrent - 15) * ratio));
    };

    const avg = (list: TopicItem[]): number => {
      if (list.length === 0) return 0;
      const sum = list.reduce((acc, item) => acc + getTopicMasteryAtDate(item), 0);
      return Math.round(sum / list.length);
    };

    const completedTopicsCount = topics.filter(
      (t) => t.completed && ((t.completedAt || todayISO).slice(0, 10) <= dateISO || isLatest)
    ).length;

    return {
      dateISO,
      dateLabel: idx === 0 && dateISO < todayISO && completedDates.every((d) => d > dateISO)
        ? 'Baseline'
        : formatShortChartDate(dateISO, todayISO),
      overallMasteryPercent: avg(topics),
      highYieldMasteryPercent: avg(highYieldTopics),
      lowYieldMasteryPercent: avg(lowYieldTopics),
      completedTopicsCount,
      totalTopicsCount: topics.length,
    };
  });
}

export function buildTopicMasteryBreakdown(topics: TopicItem[]): TopicMasteryPoint[] {
  return topics.map((t) => {
    const cleanTitle = t.title.trim();
    const shortTitle =
      cleanTitle.length > 22 ? `${cleanTitle.slice(0, 20).trim()}…` : cleanTitle;
    return {
      id: t.id,
      topicTitle: cleanTitle,
      shortTitle,
      subjectName: t.subjectName,
      masteryPercent: Math.max(0, Math.min(100, Math.round(t.masteryPercent || 0))),
      yieldType: t.yieldType,
      completed: Boolean(t.completed),
    };
  });
}

export interface DashboardMetrics {
  examReadinessPercent: number;
  completedChapters: number;
  totalChapters: number;
  targetChaptersToDate: number;
  velocityDelta: number;
  velocityStatus: 'Ahead of Target' | 'On Track' | 'Needs Catch-Up';
  overallScoreOutOf10: number | null;
  highYieldCompleted: number;
  highYieldTotal: number;
  highYieldMasteryPercent: number;
  lowYieldCompleted: number;
  lowYieldTotal: number;
  lowYieldMasteryPercent: number;
  accuracySeries: Array<{
    label: string;
    dateISO: string;
    accuracyPercent: number;
    scoreOutOf10: number;
    mode: string;
  }>;
  velocitySeries: Array<{
    dayLabel: string;
    targetCumulative: number;
    actualCumulative: number;
  }>;
  masteryProgressSeries: MasteryProgressPoint[];
  topicMasteryBreakdown: TopicMasteryPoint[];
}

export function computeDashboardMetrics(
  state: AppState,
  referenceDateISO?: string
): DashboardMetrics {
  const totalChapters = state.topics.length;
  const completedChapters = state.topics.filter((t) => t.completed).length;
  const completionRatio = totalChapters > 0 ? completedChapters / totalChapters : 0;

  const highYield = state.topics.filter((t) => t.yieldType === 'high');
  const lowYield = state.topics.filter((t) => t.yieldType === 'low');

  const highYieldCompleted = highYield.filter((t) => t.completed).length;
  const lowYieldCompleted = lowYield.filter((t) => t.completed).length;

  const highYieldMasteryPercent =
    highYield.length > 0
      ? Math.round(
          highYield.reduce((acc, t) => acc + (t.completed ? Math.max(75, t.masteryPercent) : t.masteryPercent), 0) /
            highYield.length
        )
      : 0;

  const lowYieldMasteryPercent =
    lowYield.length > 0
      ? Math.round(
          lowYield.reduce((acc, t) => acc + (t.completed ? Math.max(70, t.masteryPercent) : t.masteryPercent), 0) /
            lowYield.length
        )
      : 0;

  const { overallSyllabusScoreOutOf10 } = recalculateSubjectScoresOutOf10(
    state.subjects,
    state.attempts
  );

  const todayISO = referenceDateISO || new Date().toISOString().slice(0, 10);
  const elapsedDays = state.schedule.filter((d) => d.dateISO <= todayISO).length || 1;
  const totalPlanDays = Math.max(1, state.schedule.length);
  const targetChaptersToDate = Math.min(
    totalChapters,
    Math.max(1, Math.round((elapsedDays / totalPlanDays) * totalChapters))
  );

  const velocityDelta = completedChapters - targetChaptersToDate;
  const velocityStatus: DashboardMetrics['velocityStatus'] =
    velocityDelta >= 1 ? 'Ahead of Target' : velocityDelta >= -1 ? 'On Track' : 'Needs Catch-Up';

  const testComponent = overallSyllabusScoreOutOf10 !== null ? (overallSyllabusScoreOutOf10 / 10) * 100 : 55;
  const examReadinessPercent = Math.min(
    100,
    Math.round(completionRatio * 40 + highYieldMasteryPercent * 0.35 + testComponent * 0.25)
  );

  const accuracySeries = [...state.attempts]
    .sort((a, b) => a.dateISO.localeCompare(b.dateISO))
    .map((att, idx) => ({
      label: `T${idx + 1}`,
      dateISO: att.dateISO,
      accuracyPercent: att.accuracyPercent,
      scoreOutOf10: att.overallScoreOutOf10,
      mode: att.mode === 'daily_target' ? 'Daily PYQ' : 'Countdown Blitz',
    }));

  const sampleDays = state.schedule.slice(0, Math.min(10, state.schedule.length));
  const velocitySeries = sampleDays.map((day, i) => {
    const targetCum = Number(
      (((i + 1) / Math.max(1, state.schedule.length)) * totalChapters).toFixed(1)
    );
    const completedOnOrBefore = state.topics.filter(
      (t) => t.completed && (!t.completedAt || t.completedAt <= day.dateISO)
    ).length;
    return {
      dayLabel: day.dateISO.slice(5),
      targetCumulative: targetCum,
      actualCumulative:
        day.dateISO <= todayISO ? completedOnOrBefore : completedChapters,
    };
  });

  const masteryProgressSeries = buildMasteryProgressOverTime(
    state.topics,
    state.schedule,
    todayISO
  );
  const topicMasteryBreakdown = buildTopicMasteryBreakdown(state.topics);

  return {
    examReadinessPercent,
    completedChapters,
    totalChapters,
    targetChaptersToDate,
    velocityDelta,
    velocityStatus,
    overallScoreOutOf10: overallSyllabusScoreOutOf10,
    highYieldCompleted,
    highYieldTotal: highYield.length,
    highYieldMasteryPercent,
    lowYieldCompleted,
    lowYieldTotal: lowYield.length,
    lowYieldMasteryPercent,
    accuracySeries,
    velocitySeries,
    masteryProgressSeries,
    topicMasteryBreakdown,
  };
}

export function parseSyllabusTextFallback(
  rawText: string,
  boardOrUniversity: string
): { subjects: SubjectProfile[]; topics: TopicItem[] } {
  const lines = rawText
    .split(/\r?\n/)
    .map((l) => l.trim())
    .filter(Boolean);

  const subjectMap = new Map<string, TopicItem[]>();
  let currentSubject = 'Core Curriculum';

  for (const line of lines) {
    const colonMatch = line.match(/^([A-Za-z0-9 &/+-]{3,40}):\s*(.+)$/);
    if (colonMatch) {
      currentSubject = colonMatch[1].trim();
      const restTopics = colonMatch[2]
        .split(/[,;|]/)
        .map((s) => s.trim())
        .filter(Boolean);
      if (!subjectMap.has(currentSubject)) subjectMap.set(currentSubject, []);
      for (const tName of restTopics) {
        appendTopic(subjectMap, currentSubject, tName, boardOrUniversity);
      }
    } else if (/^(subject|unit|module|course)\s*[-–:]?\s*/i.test(line) || line.endsWith(':')) {
      currentSubject = line.replace(/^(subject|unit|module|course)\s*[-–:]?\s*/i, '').replace(/:$/, '').trim() || currentSubject;
      if (!subjectMap.has(currentSubject)) subjectMap.set(currentSubject, []);
    } else {
      const clean = line.replace(/^[-*•\d.)]+\s*/, '').trim();
      if (clean.length > 2) {
        if (!subjectMap.has(currentSubject)) subjectMap.set(currentSubject, []);
        appendTopic(subjectMap, currentSubject, clean, boardOrUniversity);
      }
    }
  }

  const subjects: SubjectProfile[] = [];
  const topics: TopicItem[] = [];
  let sIdx = 0;

  for (const [subjName, tList] of subjectMap.entries()) {
    if (tList.length === 0) continue;
    const subjectId = `subj-${sIdx + 1}`;
    subjects.push({
      id: subjectId,
      name: subjName,
      difficulty: sIdx === 0 ? 'hard' : sIdx === 1 ? 'moderate' : 'easy',
      previousScoreOutOf100: sIdx === 0 ? 62 : sIdx === 1 ? 74 : 82,
      currentRatingOutOf10: null,
      questionsAnswered: 0,
      questionsCorrect: 0,
    });
    tList.forEach((t, tIdx) => {
      topics.push({
        ...t,
        id: `topic-${sIdx + 1}-${tIdx + 1}`,
        subjectId,
        subjectName: subjName,
      });
    });
    sIdx++;
  }

  return { subjects, topics };
}

function appendTopic(
  subjectMap: Map<string, TopicItem[]>,
  subjectName: string,
  rawTopicTitle: string,
  boardOrUniversity: string
) {
  const list = subjectMap.get(subjectName)!;
  const idx = list.length;
  const isHighYield = idx % 3 !== 2;
  const isOngoing = idx === 0;
  const cleanTitle = rawTopicTitle.slice(0, 80);

  list.push({
    id: `temp-${idx}`,
    subjectId: '',
    subjectName,
    title: cleanTitle,
    estimatedHours: isHighYield ? 2.5 : 1.5,
    yieldType: isHighYield ? 'high' : 'low',
    pyqFrequencyNote: isHighYield
      ? `Appears in ~75% of ${boardOrUniversity || 'recent'} past papers`
      : `Conceptual foundation · ~25% past paper weight`,
    classStatus: isOngoing ? 'ongoing' : 'upcoming',
    completed: false,
    masteryPercent: isOngoing ? 35 : 15,
    youtubeQuery: `${cleanTitle} ${subjectName} ${boardOrUniversity} one shot lecture PYQ`,
    youtubeTitle: `${cleanTitle} — Complete ${subjectName} Concept & PYQ Walkthrough`,
    youtubeChannelHint: `${boardOrUniversity || 'University'} Academic Lecture Series`,
    keyConcepts: [
      `Core definitions & governing equations of ${cleanTitle}`,
      `Standard ${boardOrUniversity || 'Exam'} numerical & multi-step PYQ traps`,
      `Boundary cases & graphical interpretation`,
    ],
  });
}

export function applyTestAttemptToState(
  prev: AppState,
  attempt: TestAttempt,
  dayDateISO?: string,
  todayISO = new Date().toISOString().slice(0, 10),
  catalogAchievements?: Achievement[]
): { nextState: AppState; newlyUnlockedFlex: Achievement | null } {
  const nextAttempts = [...prev.attempts, attempt];
  const practicedSubjectIds = new Set(attempt.answers.map((ans) => ans.question.subjectId));
  const { updatedSubjects: baseUpdatedSubjects } = recalculateSubjectScoresOutOf10(
    prev.subjects,
    nextAttempts
  );
  const updatedSubjects = baseUpdatedSubjects.map((subj) =>
    practicedSubjectIds.has(subj.id)
      ? { ...subj, lastPracticedDateISO: todayISO }
      : subj
  );

  const topicCorrectDelta = new Map<string, number>();
  for (const ans of attempt.answers) {
    topicCorrectDelta.set(
      ans.question.topicId,
      (topicCorrectDelta.get(ans.question.topicId) || 0) + (ans.isCorrect ? 12 : -4)
    );
  }

  const updatedTopics = prev.topics.map((t) => {
    const delta = topicCorrectDelta.get(t.id);
    if (delta === undefined) return t;
    return {
      ...t,
      masteryPercent: Math.max(10, Math.min(100, t.masteryPercent + delta)),
    };
  });

  const updatedSchedule = prev.schedule.map((d) =>
    dayDateISO && d.dateISO === dayDateISO
      ? {
          ...d,
          dailyTestTarget: {
            ...d.dailyTestTarget,
            completed: true,
            attemptId: attempt.id,
          },
        }
      : d
  );

  const nextStudent: StudentProfile = {
    ...prev.student,
    lastActiveDate: todayISO,
  };

  const { achievements, newlyUnlockedIds } = evaluateAchievements(
    catalogAchievements || prev.achievements,
    nextAttempts,
    updatedTopics,
    Boolean(prev.lastReoptimizationNote),
    nextStudent.name,
    {
      lastActiveDate: todayISO,
      focusMinutesTotal: prev.focusMinutesTotal || 0,
    }
  );

  const newlyUnlockedFlex =
    newlyUnlockedIds.length > 0
      ? achievements.find((a) => newlyUnlockedIds.includes(a.id)) || null
      : null;

  return {
    nextState: {
      ...prev,
      student: nextStudent,
      subjects: updatedSubjects,
      topics: updatedTopics,
      schedule: updatedSchedule,
      attempts: nextAttempts,
      achievements,
    },
    newlyUnlockedFlex,
  };
}

