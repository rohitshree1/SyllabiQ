import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractJsonFromModelText,
  mergeIntakeUpdatesIntoDraft,
  parseNaturalIntakeFallback,
} from './aiHelpers';
import type { SubjectProfile, TopicItem } from '../types';

const mockSubjects: SubjectProfile[] = [
  {
    id: 'subj-1',
    name: 'Physics',
    difficulty: 'moderate',
    previousScoreOutOf100: 70,
    currentRatingOutOf10: null,
    questionsAnswered: 0,
    questionsCorrect: 0,
  },
  {
    id: 'subj-2',
    name: 'Calculus',
    difficulty: 'moderate',
    previousScoreOutOf100: 75,
    currentRatingOutOf10: null,
    questionsAnswered: 0,
    questionsCorrect: 0,
  },
];

const mockTopics: TopicItem[] = [
  {
    id: 'topic-1',
    subjectId: 'subj-1',
    subjectName: 'Physics',
    title: 'Electromagnetic Induction',
    estimatedHours: 2.5,
    yieldType: 'high',
    pyqFrequencyNote: '85% PYQ frequency',
    classStatus: 'upcoming',
    completed: false,
    masteryPercent: 20,
    youtubeQuery: 'EMI lecture',
    youtubeTitle: 'EMI One Shot',
    youtubeChannelHint: 'Physics Galaxy',
    keyConcepts: ['Faraday Law'],
  },
];

test('extractJsonFromModelText cleanly parses raw JSON and fenced markdown JSON', () => {
  const raw = '```json\n{"reply": "Hello Kabir", "readyToBuild": true}\n```';
  const parsed = extractJsonFromModelText(raw);
  assert.equal(parsed.reply, 'Hello Kabir');
  assert.equal(parsed.readyToBuild, true);

  const noisy = 'Here is the output:\n{"score": 9.5}\nHope this helps!';
  assert.equal(extractJsonFromModelText(noisy).score, 9.5);
});

test('mergeIntakeUpdatesIntoDraft updates student profile, subject difficulty, past scores, and class status', () => {
  const { nextDraft, appliedItems } = mergeIntakeUpdatesIntoDraft(
    {
      studentName: '',
      examDate: '2026-11-15',
      dailyStudyHours: 4,
      alertnessWindow: 'late_morning',
      learningStyle: 'step_by_step',
      customStyleFeedback: '',
      subjects: mockSubjects,
      topics: mockTopics,
    },
    {
      name: 'Kabir Mehta',
      dailyStudyHours: 5.5,
      alertnessWindow: 'early_morning',
      customStyleFeedback: 'Use visual sports analogies',
      subjectUpdates: [
        { subjectName: 'Physics', difficulty: 'hard', previousScoreOutOf100: 58 },
        { subjectId: 'subj-2', difficulty: 'easy', previousScoreOutOf100: 91 },
      ],
      ongoingTopicTitles: ['Electromagnetic Induction'],
    }
  );

  assert.equal(nextDraft.studentName, 'Kabir Mehta');
  assert.equal(nextDraft.dailyStudyHours, 5.5);
  assert.equal(nextDraft.alertnessWindow, 'early_morning');
  assert.equal(nextDraft.subjects[0].difficulty, 'hard');
  assert.equal(nextDraft.subjects[0].previousScoreOutOf100, 58);
  assert.equal(nextDraft.subjects[1].difficulty, 'easy');
  assert.equal(nextDraft.subjects[1].previousScoreOutOf100, 91);
  assert.equal(nextDraft.topics[0].classStatus, 'ongoing');
  assert.ok(appliedItems.length >= 5);
});

test('parseNaturalIntakeFallback extracts name, hours, alertness, and subject difficulty/marks offline', () => {
  const extracted = parseNaturalIntakeFallback(
    "I'm Kabir, I feel sharpest in the early morning for 5 hours a day. Physics is hard (58/100) and Calculus is easy 90%.",
    mockSubjects
  );
  assert.equal(extracted.name, 'Kabir');
  assert.equal(extracted.dailyStudyHours, 5);
  assert.equal(extracted.alertnessWindow, 'early_morning');
  assert.equal(extracted.subjectUpdates?.length, 2);
  assert.equal(extracted.subjectUpdates?.[0].difficulty, 'hard');
  assert.equal(extracted.subjectUpdates?.[0].previousScoreOutOf100, 58);
});
