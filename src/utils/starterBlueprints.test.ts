import test from 'node:test';
import assert from 'node:assert/strict';
import {
  STARTER_SYLLABUS_BLUEPRINTS,
  materializeStarterBlueprint,
} from './starterBlueprints';
import { generateTimetable } from './studyEngine';
import type { StudentProfile } from '../types';

test('STARTER_SYLLABUS_BLUEPRINTS covers CBSE 12 PCM/PCB, ICSE 10, GATE CS, and B.Tech Core with PYQ weights', () => {
  const labels = STARTER_SYLLABUS_BLUEPRINTS.map((b) => b.shortLabel);
  assert.ok(labels.includes('CBSE Class 12 PCM'));
  assert.ok(labels.includes('CBSE Class 12 PCB'));
  assert.ok(labels.includes('ICSE Class 10'));
  assert.ok(labels.includes('GATE CS'));
  assert.ok(labels.includes('B.Tech Semester Core'));

  for (const bp of STARTER_SYLLABUS_BLUEPRINTS) {
    const materialized = materializeStarterBlueprint(bp.id, '2026-10-29');
    assert.ok(materialized, `Blueprint ${bp.id} should materialize`);
    assert.ok(materialized.subjects.length >= 3);
    assert.ok(materialized.topics.length >= 8);
    assert.ok(materialized.topics.some((t) => t.yieldType === 'high'));
    assert.ok(
      materialized.topics.every((t) => t.pyqFrequencyNote.includes('% PYQ Weight')),
      `Every chapter in ${bp.id} must carry a PYQ weightage tag`
    );

    const student: StudentProfile = {
      name: 'Riya Verma',
      institutionType: bp.institutionType,
      boardOrUniversity: bp.boardOrUniversity,
      examName: bp.examName,
      examDate: '2026-11-14',
      dailyStudyHours: bp.recommendedDailyHours,
      alertnessWindow: bp.recommendedAlertness,
      learningStyle: bp.recommendedLearningStyle,
      customStyleFeedback: '',
      createdAt: '2026-10-29',
    };

    const schedule = generateTimetable(
      student,
      materialized.subjects,
      materialized.topics,
      '2026-10-29',
      0
    );
    assert.ok(schedule.length >= 10);
    assert.ok(schedule[0].sessions.length >= 1);
  }

  assert.equal(materializeStarterBlueprint('non-existent-blueprint'), null);
});
