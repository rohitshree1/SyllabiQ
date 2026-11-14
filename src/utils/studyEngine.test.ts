import test from 'node:test';
import assert from 'node:assert/strict';
import { createDemoSeedState, ensureCompleteAchievementsCatalog } from '../data/seedData';
import {
  applyTestAttemptToState,
  buildMasteryProgressOverTime,
  reoptimizeMissedDay,
  scoreTestAttempt,
} from './studyEngine';
import type { MCQQuestion } from '../types';

test('applyTestAttemptToState synchronously updates ratings, mastery, schedule target, and returns newly unlocked FlexCard', () => {
  const baseState = createDemoSeedState();
  const initialAchievements = ensureCompleteAchievementsCatalog(baseState.achievements).map((a) =>
    a.id === 'ach-eight-plus-flex' ? { ...a, unlocked: false, unlockedAt: undefined } : a
  );
  const preAttemptState = {
    ...baseState,
    attempts: [],
    achievements: initialAchievements,
  };

  const targetDay = preAttemptState.schedule.find((d) => !d.missed)!;
  const targetTopic = preAttemptState.topics[0];
  const secondTopic = preAttemptState.topics[1] || preAttemptState.topics[0];

  const questions: MCQQuestion[] = [
    {
      id: 'q1',
      subjectId: targetTopic.subjectId,
      subjectName: targetTopic.subjectName,
      topicId: targetTopic.id,
      topicTitle: targetTopic.title,
      question: 'Sample Q1',
      options: ['A', 'B', 'C', 'D'],
      correctIndex: 0,
      difficulty: 'Exam Standard',
      pyqReference: '2024 PYQ',
      baseExplanation: 'Option A is right.',
    },
    {
      id: 'q2',
      subjectId: secondTopic.subjectId,
      subjectName: secondTopic.subjectName,
      topicId: secondTopic.id,
      topicTitle: secondTopic.title,
      question: 'Sample Q2',
      options: ['A', 'B', 'C', 'D'],
      correctIndex: 1,
      difficulty: 'Exam Standard',
      pyqReference: '2023 PYQ',
      baseExplanation: 'Option B is right.',
    },
    {
      id: 'q3',
      subjectId: targetTopic.subjectId,
      subjectName: targetTopic.subjectName,
      topicId: targetTopic.id,
      topicTitle: targetTopic.title,
      question: 'Sample Q3',
      options: ['A', 'B', 'C', 'D'],
      correctIndex: 2,
      difficulty: 'Exam Standard',
      pyqReference: '2022 PYQ',
      baseExplanation: 'Option C is right.',
    },
  ];

  const todayISO = '2026-10-30';
  const attempt = scoreTestAttempt({
    id: 'att-sync-test-1',
    mode: 'daily_target',
    dateISO: todayISO,
    dayDateISO: targetDay.dateISO,
    difficultyTier: 'Exam Standard',
    durationSeconds: 90,
    targetTimeSeconds: 180,
    standardExamTimeSeconds: 270,
    questions,
    selectedIndices: [0, 1, 2],
    perQuestionTimes: [30, 30, 30],
    student: preAttemptState.student,
  });

  const { nextState, newlyUnlockedFlex } = applyTestAttemptToState(
    preAttemptState,
    attempt,
    targetDay.dateISO,
    todayISO,
    preAttemptState.achievements
  );

  assert.ok(newlyUnlockedFlex, 'Expected newlyUnlockedFlex to be returned synchronously');
  assert.equal(newlyUnlockedFlex.unlocked, true);
  assert.equal(nextState.attempts.length, 1);
  const updatedDay = nextState.schedule.find((d) => d.dateISO === targetDay.dateISO);
  assert.equal(updatedDay?.dailyTestTarget.completed, true);
  assert.equal(updatedDay?.dailyTestTarget.attemptId, 'att-sync-test-1');
  const updatedTopic = nextState.topics.find((t) => t.id === targetTopic.id)!;
  assert.equal(
    updatedTopic.masteryPercent,
    Math.min(100, targetTopic.masteryPercent + 24)
  );
  const updatedSubject = nextState.subjects.find((s) => s.id === targetTopic.subjectId)!;
  assert.equal(updatedSubject.lastPracticedDateISO, todayISO);
  assert.equal(updatedSubject.currentRatingOutOf10, 10);
});

test('reoptimizeMissedDay preserves missed day record and generates recovery schedule', () => {
  const seed = createDemoSeedState();
  const targetDay = seed.schedule[0];
  const { updatedSchedule, summaryNote } = reoptimizeMissedDay(
    seed.schedule,
    seed.topics,
    seed.subjects,
    seed.student,
    targetDay.dateISO
  );
  assert.equal(updatedSchedule[0].missed, true);
  assert.ok(updatedSchedule.length >= 3);
  assert.ok(summaryNote.includes(targetDay.dateISO));
});

test('buildMasteryProgressOverTime produces monotonic checkpoint timeline ending Today', () => {
  const seed = createDemoSeedState();
  const series = buildMasteryProgressOverTime(seed.topics, seed.schedule, '2026-10-30');
  assert.ok(series.length >= 3);
  assert.equal(series[series.length - 1].dateLabel, 'Today');
  for (const pt of series) {
    assert.ok(pt.overallMasteryPercent >= 0 && pt.overallMasteryPercent <= 100);
  }
});
