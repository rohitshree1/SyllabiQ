import React, { useEffect, useRef, useState } from 'react';
import { Award, CheckCircle2, Clock, Loader2, Play, Sparkles, XCircle } from 'lucide-react';
import type { Achievement, AppState, MCQQuestion, TestAttempt } from '../types';
import {
  generatePYQAssessmentQuestions,
  requestPersonalizedExplanation,
} from '../utils/apiClient';
import { LEARNING_STYLE_LABELS, scoreTestAttempt } from '../utils/studyEngine';

interface DailyTestViewProps {
  state: AppState;
  preselectedDayISO?: string | null;
  onRecordAttempt: (attempt: TestAttempt, dayDateISO?: string) => Achievement | null;
  onOpenFlexModal: (achievement: Achievement) => void;
}

export const DailyTestView: React.FC<DailyTestViewProps> = ({
  state,
  preselectedDayISO,
  onRecordAttempt,
  onOpenFlexModal,
}) => {
  const defaultDay =
    (preselectedDayISO && state.schedule.find((d) => d.dateISO === preselectedDayISO)) ||
    state.schedule.find((d) => !d.missed && !d.dailyTestTarget.completed) ||
    state.schedule[0];

  const [selectedDayISO, setSelectedDayISO] = useState<string>(defaultDay?.dateISO || '');
  const [phase, setPhase] = useState<'briefing' | 'loading' | 'active' | 'results'>('briefing');
  const [questions, setQuestions] = useState<MCQQuestion[]>([]);
  const [pyqPatternSummary, setPyqPatternSummary] = useState<string>('');
  const [currentIndex, setCurrentIndex] = useState(0);
  const [selectedIndices, setSelectedIndices] = useState<Array<number | null>>([]);
  const [timeLeftSec, setTimeLeftSec] = useState(300);
  const [completedAttempt, setCompletedAttempt] = useState<TestAttempt | null>(null);
  const [flexCandidate, setFlexCandidate] = useState<Achievement | null>(null);
  const [reexplainingIdx, setReexplainingIdx] = useState<number | null>(null);
  const [customExplanations, setCustomExplanations] = useState<Record<number, string>>({});
  const [followUpDrafts, setFollowUpDrafts] = useState<Record<number, string>>({});

  const startTimeRef = useRef<number>(0);
  const questionStartRef = useRef<number>(0);
  const perQuestionTimesRef = useRef<number[]>([]);
  const autoSubmittedRef = useRef<boolean>(false);
  const mountedRef = useRef<boolean>(true);
  const activeRunIdRef = useRef<number>(0);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    if (preselectedDayISO) {
      setSelectedDayISO(preselectedDayISO);
    }
  }, [preselectedDayISO]);

  // Keep selectedDayISO aligned to an existing non-missed schedule day when schedule changes
  useEffect(() => {
    const valid = state.schedule.find((d) => d.dateISO === selectedDayISO && !d.missed);
    if (valid) return;
    const fallback =
      state.schedule.find((d) => !d.missed && !d.dailyTestTarget.completed) ||
      state.schedule.find((d) => !d.missed) ||
      state.schedule[0];
    const nextIso = fallback?.dateISO || '';
    if (nextIso && nextIso !== selectedDayISO) {
      setSelectedDayISO(nextIso);
    }
  }, [state.schedule, selectedDayISO]);

  const activeDayPlan =
    state.schedule.find((d) => d.dateISO === selectedDayISO) || state.schedule[0];
  const targetSpec = activeDayPlan?.dailyTestTarget;

  // Countdown timer during active test (pure state updater)
  useEffect(() => {
    if (phase !== 'active') return;
    const timer = window.setInterval(() => {
      setTimeLeftSec((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(timer);
  }, [phase]);

  // Trigger auto-submission cleanly outside state updater when timer hits 0
  useEffect(() => {
    if (phase === 'active' && timeLeftSec === 0 && !autoSubmittedRef.current) {
      autoSubmittedRef.current = true;
      handleFinishTest(true);
    }
  }, [phase, timeLeftSec]);

  const handleStartTest = async () => {
    if (!activeDayPlan || !targetSpec) return;
    const runId = activeRunIdRef.current + 1;
    activeRunIdRef.current = runId;
    setPhase('loading');
    setCustomExplanations({});
    setReexplainingIdx(null);
    setFlexCandidate(null);
    autoSubmittedRef.current = false;

    // Gather topics scheduled on or before this day + already completed topics
    const coveredSet = new Set(targetSpec.coveredTopicIds);
    state.topics.filter((t) => t.completed).forEach((t) => coveredSet.add(t.id));
    let targetTopics = state.topics.filter((t) => coveredSet.has(t.id));
    if (targetTopics.length === 0) targetTopics = state.topics;

    const { questions: generated, pyqPatternSummary: summaryText } =
      await generatePYQAssessmentQuestions({
        student: state.student,
        subjects: state.subjects,
        topics: targetTopics,
        count: targetSpec.targetQuestionCount,
        difficultyTier: targetSpec.difficultyTier,
        mode: 'daily_target',
      });

    if (!mountedRef.current || activeRunIdRef.current !== runId) return;

    setQuestions(generated);
    setPyqPatternSummary(summaryText);
    setFollowUpDrafts({});
    setSelectedIndices(new Array(generated.length).fill(null));
    perQuestionTimesRef.current = new Array(generated.length).fill(0);
    setCurrentIndex(0);
    setTimeLeftSec(targetSpec.compressedTimeSeconds);
    startTimeRef.current = Date.now();
    questionStartRef.current = Date.now();
    setPhase('active');
  };

  const handleSelectOption = (optionIdx: number) => {
    const elapsed = Math.max(1, Math.round((Date.now() - questionStartRef.current) / 1000));
    perQuestionTimesRef.current[currentIndex] =
      (perQuestionTimesRef.current[currentIndex] || 0) + elapsed;
    questionStartRef.current = Date.now();

    setSelectedIndices((prev) => {
      const next = [...prev];
      next[currentIndex] = optionIdx;
      return next;
    });
  };

  const handleFinishTest = (autoSubmitted = false) => {
    if (!targetSpec || questions.length === 0) return;
    const totalDuration = autoSubmitted
      ? targetSpec.compressedTimeSeconds
      : Math.max(
          1,
          Math.min(
            targetSpec.compressedTimeSeconds,
            Math.round((Date.now() - startTimeRef.current) / 1000)
          )
        );

    const attempt = scoreTestAttempt({
      id: `att-daily-${Date.now()}`,
      mode: 'daily_target',
      dateISO: new Date().toISOString().slice(0, 10),
      dayDateISO: activeDayPlan?.dateISO,
      difficultyTier: targetSpec.difficultyTier,
      durationSeconds: totalDuration,
      targetTimeSeconds: targetSpec.compressedTimeSeconds,
      standardExamTimeSeconds: targetSpec.standardExamTimeSeconds,
      questions,
      selectedIndices,
      perQuestionTimes: perQuestionTimesRef.current,
      student: state.student,
    });

    const unlockedFlex = onRecordAttempt(attempt, activeDayPlan?.dateISO);
    setCompletedAttempt(attempt);
    if (unlockedFlex) {
      setFlexCandidate(unlockedFlex);
    } else if (attempt.overallScoreOutOf10 >= 8.0) {
      const existingEight = state.achievements.find((a) => a.id === 'ach-eight-plus-flex');
      if (existingEight) {
        setFlexCandidate({
          ...existingEight,
          unlocked: true,
          metricBadge: `${attempt.overallScoreOutOf10} / 10 Score`,
          shareHeadline: `${state.student.name} scored ${attempt.overallScoreOutOf10}/10 under compressed exam time on SyllabiQ PYQ Target!`,
        });
      }
    }
    setPhase('results');

    // Automatically request a personalized Gemini AI Tutor explanation for wrong answers (up to first 2 to keep latency snappy)
    const finishRunId = activeRunIdRef.current;
    const wrongIndices = attempt.answers
      .map((a, idx) => (!a.isCorrect ? idx : -1))
      .filter((idx) => idx !== -1)
      .slice(0, 2);

    wrongIndices.forEach((wIdx) => {
      const wrongAns = attempt.answers[wIdx];
      const subjMeta = state.subjects.find((s) => s.id === wrongAns.question.subjectId);
      requestPersonalizedExplanation({
        question: wrongAns.question,
        selectedIndex: wrongAns.selectedIndex,
        student: state.student,
        subjectMeta: subjMeta,
      }).then((res) => {
        if (!mountedRef.current || activeRunIdRef.current !== finishRunId) return;
        if (res.usedAi) {
          setCustomExplanations((prev) => ({ ...prev, [wIdx]: res.explanation }));
        }
      });
    });
  };

  const handleDeepAiExplain = async (qIdx: number, followUpText?: string) => {
    if (!completedAttempt) return;
    const item = completedAttempt.answers[qIdx];
    if (!item) return;
    const explainRunId = activeRunIdRef.current;
    const subjMeta = state.subjects.find((s) => s.id === item.question.subjectId);
    setReexplainingIdx(qIdx);
    try {
      const res = await requestPersonalizedExplanation({
        question: item.question,
        selectedIndex: item.selectedIndex,
        student: state.student,
        subjectMeta: subjMeta,
        followUpQuestion: followUpText?.trim() || undefined,
      });
      if (!mountedRef.current || activeRunIdRef.current !== explainRunId) return;
      setCustomExplanations((prev) => ({ ...prev, [qIdx]: res.explanation }));
      if (followUpText) {
        setFollowUpDrafts((prev) => ({ ...prev, [qIdx]: '' }));
      }
    } finally {
      if (mountedRef.current && activeRunIdRef.current === explainRunId) {
        setReexplainingIdx(null);
      }
    }
  };

  const formatTimer = (sec: number) => {
    const m = Math.floor(sec / 60);
    const s = sec % 60;
    return `${String(m).padStart(2, '0')}:${String(s).padStart(2, '0')}`;
  };

  return (
    <div className="space-y-6">
      {phase === 'briefing' && activeDayPlan && targetSpec && (
        <section className="glass-panel rounded-2xl p-6 sm:p-8">
          <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
            <div>
              <p className="text-xs font-semibold text-sky-700">
                Progressive PYQ Exam Conditioning
              </p>
              <h2 className="mt-1 font-display text-2xl font-bold text-slate-900">
                Daily Compressed-Time Test Target
              </h2>
              <p className="mt-1 text-sm text-slate-600">
                Questions are modeled on{' '}
                <strong className="text-slate-900">{state.student.boardOrUniversity}</strong>{' '}
                Previous Year Questions covering today’s planned study blocks and previously
                covered syllabus.
              </p>
            </div>

            <div className="shrink-0">
              <label htmlFor="daily-test-day-select" className="block text-xs text-slate-500 mb-1">
                Select Target Day
              </label>
              <select
                id="daily-test-day-select"
                value={selectedDayISO}
                onChange={(e) => setSelectedDayISO(e.target.value)}
                className="rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono tabular-nums text-xs text-slate-900 focus:border-sky-600 focus:outline-hidden"
              >
                {state.schedule
                  .filter((d) => !d.missed)
                  .map((d) => (
                    <option key={d.dateISO} value={d.dateISO}>
                      Day {d.dayIndex + 1} ({d.dateISO}) — {d.dailyTestTarget.difficultyTier}
                    </option>
                  ))}
              </select>
            </div>
          </div>

          {/* Progressive Overload Specs */}
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-6 py-6 border-b border-slate-100">
            <div>
              <p className="text-xs text-slate-500">Progressive Question Count</p>
              <p className="mt-1 font-mono tabular-nums text-2xl font-bold text-slate-900">
                {targetSpec.targetQuestionCount} PYQ MCQs
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Toughness Tier: <strong className="text-slate-800">{targetSpec.difficultyTier}</strong>
              </p>
            </div>

            <div>
              <p className="text-xs text-slate-500">Compressed Time Allowance</p>
              <p className="mt-1 font-mono tabular-nums text-2xl font-bold text-sky-700">
                {formatTimer(targetSpec.compressedTimeSeconds)}
              </p>
              <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                {Math.round(
                  (1 - targetSpec.compressedTimeSeconds / targetSpec.standardExamTimeSeconds) * 100
                )}
                % stricter than {formatTimer(targetSpec.standardExamTimeSeconds)} exam pace
              </p>
            </div>

            <div>
              <p className="text-xs text-slate-500">Diagnostic Scoring</p>
              <p className="mt-1 font-mono tabular-nums text-2xl font-bold text-slate-900">
                Per-Subject / 10
              </p>
              <p className="mt-1 text-xs text-slate-500">
                Score 8.0+/10 to unlock Social Achievement Flex
              </p>
            </div>
          </div>

          <div className="mt-5 flex flex-col sm:flex-row sm:items-center justify-between gap-4">
            <div className="text-xs text-slate-600">
              <span className="font-semibold text-slate-900">Wrong-Answer Tutor Mode:</span>{' '}
              {LEARNING_STYLE_LABELS[state.student.learningStyle]}
              {state.student.customStyleFeedback
                ? ` · “${state.student.customStyleFeedback}”`
                : ''}
            </div>

            <button
              type="button"
              onClick={handleStartTest}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-sky-600 px-6 py-3 text-sm font-semibold text-white transition-colors hover:bg-sky-700 whitespace-nowrap shrink-0"
            >
              <Play className="h-4 w-4" />
              <span>Start Timed PYQ Assessment</span>
            </button>
          </div>
        </section>
      )}

      {phase === 'loading' && (
        <section className="glass-panel rounded-2xl p-12 text-center">
          <Loader2 className="mx-auto h-8 w-8 animate-spin text-sky-600" />
          <h2 className="mt-4 font-display text-lg font-bold text-slate-900">
            Synthesizing {state.student.boardOrUniversity} PYQ Paper...
          </h2>
          <p className="mt-1 text-xs text-slate-500">
            Calibrating question toughness ({targetSpec?.difficultyTier}) and compressed exam
            countdown.
          </p>
        </section>
      )}

      {phase === 'active' && questions[currentIndex] && (
        <section className="glass-panel rounded-2xl p-6 sm:p-8">
          {/* Top Timer & Question Counter */}
          <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div>
              <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-500">
                <span className="font-semibold text-slate-900">
                  Question {currentIndex + 1} of {questions.length}
                </span>
                <span aria-hidden="true">·</span>
                <span>{questions[currentIndex].subjectName}</span>
                <span aria-hidden="true">·</span>
                <span>{questions[currentIndex].pyqReference}</span>
              </div>
              <p className="mt-0.5 text-xs text-slate-500">
                Chapter: {questions[currentIndex].topicTitle}
                {pyqPatternSummary ? ` · ${pyqPatternSummary}` : ''}
              </p>
            </div>

            <div
              className={`inline-flex items-center gap-2 rounded-lg border px-3.5 py-2 font-mono tabular-nums text-sm font-bold ${
                timeLeftSec <= 45
                  ? 'border-red-300 bg-red-50 text-red-700'
                  : 'border-slate-200 bg-slate-50 text-slate-900'
              }`}
            >
              <Clock className="h-4 w-4" />
              <span>{formatTimer(timeLeftSec)}</span>
            </div>
          </div>

          {/* Question Stem */}
          <div className="py-6">
            <h3 className="text-base sm:text-lg font-semibold text-slate-900 leading-relaxed">
              {questions[currentIndex].question}
            </h3>

            <div className="mt-5 space-y-2.5" role="radiogroup" aria-label="Question options">
              {questions[currentIndex].options.map((opt, oIdx) => {
                const isSelected = selectedIndices[currentIndex] === oIdx;
                const letter = String.fromCharCode(65 + oIdx);
                return (
                  <button
                    key={oIdx}
                    type="button"
                    role="radio"
                    aria-checked={isSelected}
                    onClick={() => handleSelectOption(oIdx)}
                    className={`w-full text-left rounded-lg border p-3.5 text-sm transition-colors flex items-start gap-3 ${
                      isSelected
                        ? 'border-sky-600 bg-sky-50/70 text-slate-900 font-medium'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    <span className="font-mono text-xs font-bold text-slate-500 mt-0.5">
                      {letter}.
                    </span>
                    <span>{opt}</span>
                  </button>
                );
              })}
            </div>
          </div>

          {/* Navigation Controls */}
          <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
            <div className="flex items-center gap-2">
              <button
                type="button"
                disabled={currentIndex === 0}
                onClick={() => {
                  questionStartRef.current = Date.now();
                  setCurrentIndex((i) => Math.max(0, i - 1));
                }}
                className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap shrink-0"
              >
                Previous
              </button>
              {currentIndex < questions.length - 1 && (
                <button
                  type="button"
                  onClick={() => {
                    questionStartRef.current = Date.now();
                    setCurrentIndex((i) => Math.min(questions.length - 1, i + 1));
                  }}
                  className="rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  Next Question
                </button>
              )}
            </div>

            <button
              type="button"
              onClick={() => handleFinishTest(false)}
              className="rounded-lg bg-slate-900 px-5 py-2 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
            >
              Submit Assessment ({selectedIndices.filter((x) => x !== null).length}/
              {questions.length} Answered)
            </button>
          </div>
        </section>
      )}

      {phase === 'results' && completedAttempt && (
        <section className="space-y-6">
          {/* Scoreboard & Flex Trigger */}
          <div className="glass-panel rounded-2xl p-6 sm:p-8">
            <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 border-b border-slate-100 pb-5">
              <div>
                <p className="text-xs font-semibold text-sky-700">Assessment Diagnostic Complete</p>
                <h2 className="mt-1 font-display text-2xl font-bold text-slate-900">
                  Overall Score:{' '}
                  <span className="font-mono tabular-nums text-sky-700">
                    {completedAttempt.overallScoreOutOf10} / 10
                  </span>{' '}
                  ({completedAttempt.accuracyPercent}%)
                </h2>
                <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                  Completed in {formatTimer(completedAttempt.durationSeconds)} vs{' '}
                  {formatTimer(completedAttempt.targetTimeSeconds)} compressed target ·{' '}
                  {completedAttempt.correctCount}/{completedAttempt.totalQuestions} correct
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2.5 shrink-0">
                {flexCandidate && (
                  <button
                    type="button"
                    onClick={() => onOpenFlexModal(flexCandidate)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2.5 text-xs font-semibold text-white hover:bg-sky-700 whitespace-nowrap shrink-0"
                  >
                    <Award className="h-4 w-4" />
                    <span>Flex {completedAttempt.overallScoreOutOf10}/10 Achievement</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => {
                    activeRunIdRef.current += 1;
                    setReexplainingIdx(null);
                    setPhase('briefing');
                  }}
                  className="rounded-lg border border-slate-200 px-4 py-2.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  New Test Briefing
                </button>
              </div>
            </div>

            {/* Per-Subject Score Out of 10 */}
            <div className="mt-5">
              <h3 className="text-xs font-semibold text-slate-700 mb-3">
                Subject-by-Subject Score (Counted Separately Out of 10 &amp; Saved to Profile)
              </h3>
              <div className="divide-y divide-slate-100 border-y border-slate-100">
                {completedAttempt.subjectBreakdown.map((sb) => (
                  <div
                    key={sb.subjectId}
                    className="py-2.5 flex items-center justify-between text-sm"
                  >
                    <span className="font-medium text-slate-900">{sb.subjectName}</span>
                    <div className="flex items-center gap-4 font-mono tabular-nums text-xs">
                      <span className="text-slate-500">
                        {sb.correct}/{sb.total} correct
                      </span>
                      <span className="font-bold text-slate-900">{sb.scoreOutOf10} / 10</span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Personalized Wrong-Answer & Concept Walkthrough */}
          <div className="glass-panel rounded-2xl p-6">
            <h3 className="font-display text-lg font-bold text-slate-900">
              Personalized Solution Walkthrough (Adapted to {state.student.name}’s Learning Style)
            </h3>
            <p className="mt-0.5 text-xs text-slate-500">
              Wrong answers are explained using your saved profile style:{' '}
              {LEARNING_STYLE_LABELS[state.student.learningStyle]}.
            </p>

            <div className="mt-4 divide-y divide-slate-200">
              {completedAttempt.answers.map((ans, idx) => {
                const explanationText =
                  customExplanations[idx] ||
                  ans.personalizedExplanation ||
                  ans.question.baseExplanation;

                return (
                  <div key={ans.question.id} className="py-5 space-y-2.5">
                    <div className="flex items-start justify-between gap-3">
                      <div className="flex items-start gap-2.5">
                        {ans.isCorrect ? (
                          <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-1 shrink-0" />
                        ) : (
                          <XCircle className="h-4 w-4 text-red-600 mt-1 shrink-0" />
                        )}
                        <div>
                          <p className="text-xs text-slate-500">
                            {ans.question.subjectName} · {ans.question.topicTitle} ·{' '}
                            {ans.question.pyqReference}
                          </p>
                          <p className="mt-0.5 text-sm font-semibold text-slate-900">
                            {idx + 1}. {ans.question.question}
                          </p>
                        </div>
                      </div>

                      <span
                        className={`text-xs font-semibold shrink-0 ${
                          ans.isCorrect ? 'text-emerald-700' : 'text-red-700'
                        }`}
                      >
                        {ans.isCorrect ? '● Correct' : '✕ Needs Review'}
                      </span>
                    </div>

                    <div className="pl-6 text-xs space-y-1">
                      <p className="text-slate-600">
                        Your choice:{' '}
                        <strong className="text-slate-900">
                          {ans.selectedIndex !== null
                            ? ans.question.options[ans.selectedIndex]
                            : 'Unanswered'}
                        </strong>{' '}
                        · Correct answer:{' '}
                        <strong className="text-emerald-800">
                          {ans.question.options[ans.question.correctIndex]}
                        </strong>
                      </p>

                      <div className="mt-2 glass-inset rounded-xl p-3.5 text-slate-700 leading-relaxed space-y-2.5">
                        <p>{explanationText}</p>

                        <div className="flex flex-col sm:flex-row sm:items-center gap-2 pt-1 border-t border-slate-200/70">
                          <label htmlFor={`followup-input-${idx}`} className="sr-only">
                            Ask AI Tutor a follow-up question on Question {idx + 1}
                          </label>
                          <input
                            id={`followup-input-${idx}`}
                            type="text"
                            value={followUpDrafts[idx] || ''}
                            onChange={(e) =>
                              setFollowUpDrafts((prev) => ({
                                ...prev,
                                [idx]: e.target.value,
                              }))
                            }
                            placeholder={`Ask AI Tutor to clarify in ${state.student.name}’s style (e.g., give an everyday analogy)...`}
                            className="flex-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-hidden"
                          />
                          <button
                            type="button"
                            disabled={reexplainingIdx === idx}
                            onClick={() => handleDeepAiExplain(idx, followUpDrafts[idx])}
                            className="inline-flex items-center gap-1.5 rounded-md border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-sky-700 hover:bg-sky-50 disabled:opacity-50 whitespace-nowrap shrink-0 self-start"
                          >
                            <Sparkles className="h-3.5 w-3.5" />
                            <span>
                              {reexplainingIdx === idx
                                ? 'Generating AI Explanation...'
                                : followUpDrafts[idx]?.trim()
                                ? 'Ask AI Tutor'
                                : 'Re-explain with AI Tutor'}
                            </span>
                          </button>
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </section>
      )}
    </div>
  );
};
