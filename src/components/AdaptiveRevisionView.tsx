import React, { useEffect, useRef, useState } from 'react';
import {
  Award,
  Check,
  CheckCircle2,
  Loader2,
  MessageSquareText,
  Sparkles,
  Timer,
  XCircle,
  Zap,
} from 'lucide-react';
import type {
  Achievement,
  AiStyleAdaptationPreview,
  AppState,
  LearningStylePreset,
  MCQQuestion,
  TestAttempt,
} from '../types';
import {
  generatePYQAssessmentQuestions,
  requestAiStyleAdaptation,
  requestPersonalizedExplanation,
} from '../utils/apiClient';
import {
  adaptExplanationToStudent,
  LEARNING_STYLE_LABELS,
  scoreTestAttempt,
} from '../utils/studyEngine';

interface AdaptiveRevisionViewProps {
  state: AppState;
  onUpdateStudyStyle: (style: LearningStylePreset, customFeedback: string) => void;
  onRecordAttempt: (attempt: TestAttempt) => Achievement | null;
  onOpenFlexModal: (achievement: Achievement) => void;
}

const SECONDS_PER_BLITZ_QUESTION = 18;

export const AdaptiveRevisionView: React.FC<AdaptiveRevisionViewProps> = ({
  state,
  onUpdateStudyStyle,
  onRecordAttempt,
  onOpenFlexModal,
}) => {
  const [stylePreset, setStylePreset] = useState<LearningStylePreset>(
    state.student.learningStyle
  );
  const [feedbackDraft, setFeedbackDraft] = useState<string>(
    state.student.customStyleFeedback
  );
  const [styleSavedBanner, setStyleSavedBanner] = useState(false);
  const [adaptingStyleAi, setAdaptingStyleAi] = useState(false);
  const [stylePreview, setStylePreview] = useState<AiStyleAdaptationPreview | null>(null);

  const [blitzPhase, setBlitzPhase] = useState<
    'idle' | 'loading' | 'question' | 'review_step' | 'summary'
  >('idle');
  const [blitzCount, setBlitzCount] = useState<number>(5);
  const [questions, setQuestions] = useState<MCQQuestion[]>([]);
  const [qIdx, setQIdx] = useState(0);
  const [countdown, setCountdown] = useState(SECONDS_PER_BLITZ_QUESTION);
  const [selectedAnswers, setSelectedAnswers] = useState<Array<number | null>>([]);
  const [perQTimes, setPerQTimes] = useState<number[]>([]);
  const [streak, setStreak] = useState(0);
  const [liveWrongExplanation, setLiveWrongExplanation] = useState<string>('');
  const [loadingAiExplain, setLoadingAiExplain] = useState(false);
  const [finalAttempt, setFinalAttempt] = useState<TestAttempt | null>(null);
  const [flexUnlocked, setFlexUnlocked] = useState<Achievement | null>(null);

  const questionShownAtRef = useRef<number>(0);
  const timeoutHandledQuestionRef = useRef<number>(-1);
  const answeredQIdxRef = useRef<number>(-1);
  const currentQIdxRef = useRef<number>(0);
  currentQIdxRef.current = qIdx;
  const blitzRunIdRef = useRef<number>(0);
  const mountedRef = useRef<boolean>(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  useEffect(() => {
    setStylePreset(state.student.learningStyle);
    setFeedbackDraft(state.student.customStyleFeedback);
  }, [state.student.learningStyle, state.student.customStyleFeedback]);

  // Per-question high-speed countdown timer (pure state updater)
  useEffect(() => {
    if (blitzPhase !== 'question') return;
    const id = window.setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, [blitzPhase, qIdx]);

  // Handle per-question timeout cleanly outside state updater
  useEffect(() => {
    if (
      blitzPhase === 'question' &&
      countdown === 0 &&
      timeoutHandledQuestionRef.current !== qIdx
    ) {
      timeoutHandledQuestionRef.current = qIdx;
      void handleAnswerChoice(null);
    }
  }, [blitzPhase, countdown, qIdx]);

  const handleSaveFeedbackStyle = async (e: React.FormEvent) => {
    e.preventDefault();
    const cleanNote = feedbackDraft.trim();
    const updatedStudent = {
      ...state.student,
      learningStyle: stylePreset,
      customStyleFeedback: cleanNote,
    };
    onUpdateStudyStyle(stylePreset, cleanNote);
    setStyleSavedBanner(true);
    setTimeout(() => setStyleSavedBanner(false), 3000);

    // If currently viewing a wrong-answer explanation, re-adapt it immediately via live AI Tutor
    if (blitzPhase === 'review_step' && questions[qIdx]) {
      setLiveWrongExplanation(
        adaptExplanationToStudent(questions[qIdx], selectedAnswers[qIdx] ?? null, updatedStudent)
      );
      setLoadingAiExplain(true);
      const subjMeta = state.subjects.find((s) => s.id === questions[qIdx].subjectId);
      requestPersonalizedExplanation({
        question: questions[qIdx],
        selectedIndex: selectedAnswers[qIdx] ?? null,
        student: updatedStudent,
        subjectMeta: subjMeta,
      })
        .then((res) => setLiveWrongExplanation(res.explanation))
        .finally(() => setLoadingAiExplain(false));
    }

    // Generate live AI teaching persona confirmation & micro-demonstration
    const sampleTopic =
      state.topics.find((t) => t.completed || t.classStatus === 'ongoing') || state.topics[0];
    setAdaptingStyleAi(true);
    try {
      const preview = await requestAiStyleAdaptation({
        student: updatedStudent,
        sampleTopicTitle: sampleTopic?.title,
        sampleSubjectName: sampleTopic?.subjectName,
      });
      setStylePreview(preview);
    } finally {
      setAdaptingStyleAi(false);
    }
  };

  const handleLaunchBlitz = async () => {
    const runId = blitzRunIdRef.current + 1;
    blitzRunIdRef.current = runId;
    setBlitzPhase('loading');
    setFlexUnlocked(null);

    // Prioritize covered/completed syllabus + ongoing class chapters, weighted toward lower mastery
    const coveredPool = state.topics
      .filter((t) => t.completed || t.classStatus === 'covered' || t.classStatus === 'ongoing')
      .sort((a, b) => a.masteryPercent - b.masteryPercent);

    const targetTopics = coveredPool.length > 0 ? coveredPool : state.topics;

    const { questions: generated } = await generatePYQAssessmentQuestions({
      student: {
        ...state.student,
        learningStyle: stylePreset,
        customStyleFeedback: feedbackDraft.trim(),
      },
      subjects: state.subjects,
      topics: targetTopics,
      count: blitzCount,
      difficultyTier: 'Exam Standard',
      mode: 'countdown_blitz',
    });

    if (!mountedRef.current || blitzRunIdRef.current !== runId) return;

    setQuestions(generated);
    setSelectedAnswers(new Array(generated.length).fill(null));
    setPerQTimes(new Array(generated.length).fill(0));
    setQIdx(0);
    setStreak(0);
    setCountdown(SECONDS_PER_BLITZ_QUESTION);
    timeoutHandledQuestionRef.current = -1;
    answeredQIdxRef.current = -1;
    questionShownAtRef.current = Date.now();
    setBlitzPhase('question');
  };

  const handleAnswerChoice = async (choiceIdx: number | null) => {
    const currentQ = questions[qIdx];
    if (!currentQ || answeredQIdxRef.current === qIdx) return;
    answeredQIdxRef.current = qIdx;
    const captureQIdx = qIdx;
    const captureRunId = blitzRunIdRef.current;

    const spent =
      choiceIdx === null
        ? SECONDS_PER_BLITZ_QUESTION
        : Math.max(
            1,
            Math.min(
              SECONDS_PER_BLITZ_QUESTION,
              Math.round((Date.now() - questionShownAtRef.current) / 1000)
            )
          );

    const nextAnswers = [...selectedAnswers];
    nextAnswers[captureQIdx] = choiceIdx;
    setSelectedAnswers(nextAnswers);

    const nextTimes = [...perQTimes];
    nextTimes[captureQIdx] = spent;
    setPerQTimes(nextTimes);

    const isCorrect = choiceIdx === currentQ.correctIndex;
    if (isCorrect) {
      setStreak((s) => s + 1);
      if (captureQIdx + 1 < questions.length) {
        setQIdx(captureQIdx + 1);
        setCountdown(SECONDS_PER_BLITZ_QUESTION);
        questionShownAtRef.current = Date.now();
      } else {
        finalizeBlitz(nextAnswers, nextTimes);
      }
    } else {
      setStreak(0);
      const instantExpl = adaptExplanationToStudent(currentQ, choiceIdx, {
        ...state.student,
        learningStyle: stylePreset,
        customStyleFeedback: feedbackDraft.trim(),
      });
      setLiveWrongExplanation(instantExpl);
      setBlitzPhase('review_step');

      // Also ask server Gemini Tutor to enrich explanation in student's exact words & subject profile
      setLoadingAiExplain(true);
      try {
        const subjMeta = state.subjects.find((s) => s.id === currentQ.subjectId);
        const aiRes = await requestPersonalizedExplanation({
          question: currentQ,
          selectedIndex: choiceIdx,
          student: {
            ...state.student,
            learningStyle: stylePreset,
            customStyleFeedback: feedbackDraft.trim(),
          },
          subjectMeta: subjMeta,
        });
        if (
          mountedRef.current &&
          blitzRunIdRef.current === captureRunId &&
          currentQIdxRef.current === captureQIdx
        ) {
          setLiveWrongExplanation(aiRes.explanation);
        }
      } finally {
        if (mountedRef.current && blitzRunIdRef.current === captureRunId) {
          setLoadingAiExplain(false);
        }
      }
    }
  };

  const handleContinueAfterWrongReview = () => {
    if (qIdx + 1 < questions.length) {
      setQIdx(qIdx + 1);
      setCountdown(SECONDS_PER_BLITZ_QUESTION);
      questionShownAtRef.current = Date.now();
      setBlitzPhase('question');
    } else {
      finalizeBlitz(selectedAnswers, perQTimes);
    }
  };

  const finalizeBlitz = (answersArr: Array<number | null>, timesArr: number[]) => {
    const totalDuration = timesArr.reduce((a, b) => a + b, 0);
    const targetTotalSec = questions.length * SECONDS_PER_BLITZ_QUESTION;

    const attempt = scoreTestAttempt({
      id: `att-blitz-${Date.now()}`,
      mode: 'countdown_blitz',
      dateISO: new Date().toISOString().slice(0, 10),
      difficultyTier: 'Exam Standard',
      durationSeconds: totalDuration,
      targetTimeSeconds: targetTotalSec,
      standardExamTimeSeconds: questions.length * 90,
      questions,
      selectedIndices: answersArr,
      perQuestionTimes: timesArr,
      student: {
        ...state.student,
        learningStyle: stylePreset,
        customStyleFeedback: feedbackDraft.trim(),
      },
    });

    const unlocked = onRecordAttempt(attempt);
    setFinalAttempt(attempt);

    if (unlocked) {
      setFlexUnlocked(unlocked);
    } else if (
      attempt.accuracyPercent >= 75 &&
      attempt.durationSeconds <= attempt.targetTimeSeconds * 0.85
    ) {
      const blitzAch = state.achievements.find((a) => a.id === 'ach-blitz-speed-flex');
      if (blitzAch) {
        setFlexUnlocked({
          ...blitzAch,
          unlocked: true,
          metricBadge: `${attempt.correctCount}/${attempt.totalQuestions} in ${attempt.durationSeconds}s`,
          shareHeadline: `${state.student.name} crushed Adaptive Countdown Blitz (${attempt.correctCount}/${attempt.totalQuestions} correct in ${attempt.durationSeconds}s)!`,
        });
      }
    } else if (attempt.overallScoreOutOf10 >= 8.0) {
      const eightAch = state.achievements.find((a) => a.id === 'ach-eight-plus-flex');
      if (eightAch) {
        setFlexUnlocked({
          ...eightAch,
          unlocked: true,
          metricBadge: `${attempt.overallScoreOutOf10} / 10 Blitz`,
        });
      }
    }

    setBlitzPhase('summary');
  };

  const coveredCount = state.topics.filter(
    (t) => t.completed || t.classStatus === 'covered'
  ).length;

  return (
    <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
      {/* Left 7 Columns: High-Speed Countdown MCQ Arena */}
      <section className="lg:col-span-7 glass-panel rounded-2xl p-6 sm:p-8">
        {blitzPhase === 'idle' && (
          <div className="space-y-5">
            <div>
              <p className="text-xs font-semibold text-sky-700">
                Whole-Covered-Syllabus Active Recall
              </p>
              <h2 className="mt-1 font-display text-2xl font-bold text-slate-900">
                High-Speed Adaptive Countdown MCQ
              </h2>
              <p className="mt-1 text-sm text-slate-600 leading-relaxed">
                Rapid <span className="font-mono tabular-nums">{SECONDS_PER_BLITZ_QUESTION}s</span>{' '}
                countdown per MCQ drawn adaptively across your{' '}
                <strong className="text-slate-900">
                  {coveredCount > 0 ? `${coveredCount} covered chapters` : 'active syllabus'}
                </strong>
                . Miss a question and the clock pauses immediately to explain it in the exact way
                you understand best.
              </p>
            </div>

            <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 border-y border-slate-100 py-4 text-xs">
              <div>
                <p className="text-slate-500">Per-Question Clock</p>
                <p className="mt-1 font-mono tabular-nums text-lg font-bold text-slate-900">
                  {SECONDS_PER_BLITZ_QUESTION} sec
                </p>
              </div>
              <div>
                <p className="text-slate-500">Adaptive Targeting</p>
                <p className="mt-1 font-semibold text-slate-900">Weakest Covered Chapters</p>
              </div>
              <div>
                <p className="text-slate-500">Flex Threshold</p>
                <p className="mt-1 font-mono tabular-nums font-semibold text-sky-700">
                  &ge;75% Accuracy &amp; Fast Pace
                </p>
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
              <div className="flex items-center gap-2">
                <label htmlFor="blitz-count-select" className="text-xs font-medium text-slate-700">
                  Sprint Length:
                </label>
                <select
                  id="blitz-count-select"
                  value={blitzCount}
                  onChange={(e) => setBlitzCount(Number(e.target.value))}
                  className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 font-mono tabular-nums text-xs text-slate-900 focus:border-sky-600 focus:outline-hidden"
                >
                  <option value={5}>5 Rapid MCQs (90s target)</option>
                  <option value={8}>8 Rapid MCQs (144s target)</option>
                  <option value={10}>10 Rapid MCQs (180s target)</option>
                </select>
              </div>

              <button
                type="button"
                onClick={handleLaunchBlitz}
                className="inline-flex items-center gap-2 rounded-lg bg-sky-600 px-5 py-2.5 text-sm font-semibold text-white transition-colors hover:bg-sky-700 whitespace-nowrap shrink-0"
              >
                <Zap className="h-4 w-4" />
                <span>Start Countdown Blitz</span>
              </button>
            </div>
          </div>
        )}

        {blitzPhase === 'loading' && (
          <div className="py-12 text-center">
            <Loader2 className="mx-auto h-8 w-8 animate-spin text-sky-600" />
            <p className="mt-3 font-display text-base font-bold text-slate-900">
              Preparing High-Speed Covered-Syllabus Sprint...
            </p>
          </div>
        )}

        {blitzPhase === 'question' && questions[qIdx] && (
          <div className="space-y-5">
            <div className="flex items-center justify-between gap-3">
              <div className="text-xs text-slate-500">
                <span className="font-semibold text-slate-900">
                  Blitz {qIdx + 1} / {questions.length}
                </span>
                <span aria-hidden="true"> · </span>
                <span>{questions[qIdx].subjectName}</span>
                <span aria-hidden="true"> · </span>
                <span className="font-mono tabular-nums text-emerald-700 font-semibold">
                  Streak: {streak}
                </span>
              </div>

              <div
                className={`inline-flex items-center gap-1.5 font-mono tabular-nums text-sm font-bold ${
                  countdown <= 6 ? 'text-red-600' : 'text-sky-700'
                }`}
              >
                <Timer className="h-4 w-4" />
                <span>{countdown}s</span>
              </div>
            </div>

            {/* Countdown Progress Bar */}
            <div className="h-1.5 w-full overflow-hidden rounded-full bg-slate-100">
              <div
                className={`h-full transition-transform duration-200 origin-left ${
                  countdown <= 6 ? 'bg-red-600' : 'bg-sky-600'
                }`}
                style={{
                  transform: `scaleX(${countdown / SECONDS_PER_BLITZ_QUESTION})`,
                }}
              />
            </div>

            <div>
              <p className="text-xs text-slate-400">{questions[qIdx].topicTitle}</p>
              <h3 className="mt-1 text-base sm:text-lg font-semibold text-slate-900 leading-relaxed">
                {questions[qIdx].question}
              </h3>
            </div>

            <div className="space-y-2.5">
              {questions[qIdx].options.map((opt, idx) => (
                <button
                  key={idx}
                  type="button"
                  onClick={() => handleAnswerChoice(idx)}
                  className="w-full text-left rounded-lg border border-slate-200 bg-white p-3.5 text-sm text-slate-800 transition-colors hover:border-sky-500 hover:bg-sky-50/50 flex items-start gap-3"
                >
                  <span className="font-mono text-xs font-bold text-slate-400 mt-0.5">
                    {String.fromCharCode(65 + idx)}.
                  </span>
                  <span>{opt}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {blitzPhase === 'review_step' && questions[qIdx] && (
          <div className="space-y-4">
            <div className="flex items-center gap-2 text-red-700 text-xs font-semibold">
              <XCircle className="h-4 w-4" />
              <span>Countdown Paused — Personalized Concept Breakdown</span>
            </div>

            <h3 className="text-base font-semibold text-slate-900">
              {questions[qIdx].question}
            </h3>

            <p className="text-xs text-slate-600">
              Correct Answer:{' '}
              <strong className="text-emerald-800">
                {questions[qIdx].options[questions[qIdx].correctIndex]}
              </strong>
            </p>

            <div className="glass-inset rounded-xl p-4 text-xs text-slate-800 leading-relaxed">
              <div className="flex items-center justify-between gap-2 mb-1.5 text-sky-700 font-semibold">
                <span className="inline-flex items-center gap-1">
                  <Sparkles className="h-3.5 w-3.5" />
                  Explained in your saved style ({LEARNING_STYLE_LABELS[stylePreset]})
                </span>
                {loadingAiExplain && <span className="text-slate-400">Refining...</span>}
              </div>
              <p>{liveWrongExplanation}</p>
            </div>

            <p className="text-xs text-slate-500">
              Tip: Not clicking with this explanation? Update the{' '}
              <strong className="text-slate-800">Study Style Feedback Box</strong> on the right and
              watch this explanation adapt immediately!
            </p>

            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleContinueAfterWrongReview}
                className="rounded-lg bg-slate-900 px-5 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                {qIdx + 1 < questions.length ? 'Resume Next Countdown Question' : 'View Blitz Summary'}
              </button>
            </div>
          </div>
        )}

        {blitzPhase === 'summary' && finalAttempt && (
          <div className="space-y-5">
            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-100 pb-4">
              <div>
                <p className="text-xs font-semibold text-sky-700">Countdown Revision Complete</p>
                <h3 className="mt-1 font-display text-2xl font-bold text-slate-900">
                  {finalAttempt.correctCount} / {finalAttempt.totalQuestions} Correct ·{' '}
                  <span className="font-mono tabular-nums text-sky-700">
                    {finalAttempt.overallScoreOutOf10}/10
                  </span>
                </h3>
                <p className="mt-1 text-xs text-slate-500 font-mono tabular-nums">
                  Total Time: {finalAttempt.durationSeconds}s vs {finalAttempt.targetTimeSeconds}s
                  countdown cap (Avg{' '}
                  {(finalAttempt.durationSeconds / Math.max(1, finalAttempt.totalQuestions)).toFixed(
                    1
                  )}
                  s / MCQ)
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2 shrink-0">
                {flexUnlocked && (
                  <button
                    type="button"
                    onClick={() => onOpenFlexModal(flexUnlocked)}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-sky-600 px-4 py-2 text-xs font-semibold text-white hover:bg-sky-700 whitespace-nowrap shrink-0"
                  >
                    <Award className="h-4 w-4" />
                    <span>Flex Countdown Achievement</span>
                  </button>
                )}
                <button
                  type="button"
                  onClick={() => setBlitzPhase('idle')}
                  className="rounded-lg border border-slate-200 px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                >
                  Run Another Blitz
                </button>
              </div>
            </div>

            <div className="divide-y divide-slate-100">
              {finalAttempt.answers.map((ans, idx) => (
                <div key={ans.question.id} className="py-3 text-xs flex items-start gap-2.5">
                  {ans.isCorrect ? (
                    <CheckCircle2 className="h-4 w-4 text-emerald-600 mt-0.5 shrink-0" />
                  ) : (
                    <XCircle className="h-4 w-4 text-red-600 mt-0.5 shrink-0" />
                  )}
                  <div className="min-w-0">
                    <p className="font-semibold text-slate-900">
                      {idx + 1}. {ans.question.question}
                    </p>
                    <p className="mt-0.5 text-slate-500 font-mono tabular-nums">
                      {ans.timeSpentSeconds}s · {ans.question.subjectName}
                    </p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        )}
      </section>

      {/* Right 5 Columns: Live Student Style Feedback Box */}
      <aside className="lg:col-span-5 glass-panel rounded-2xl p-6">
        <div className="flex items-center gap-2 text-sky-700 text-xs font-semibold">
          <MessageSquareText className="h-4 w-4" />
          <span>Adaptive Study &amp; Explanation Style</span>
        </div>

        <h3 className="mt-1.5 font-display text-lg font-bold text-slate-900">
          Tell SyllabiQ How You Understand Best
        </h3>
        <p className="mt-1 text-xs text-slate-600 leading-relaxed">
          Change how AI explains wrong answers and structures revision notes. Your preferences are
          saved to your student profile and applied immediately.
        </p>

        <form onSubmit={handleSaveFeedbackStyle} className="mt-4 space-y-4">
          <div>
            <label
              htmlFor="adaptive-style-preset"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Core Teaching Framework
            </label>
            <select
              id="adaptive-style-preset"
              value={stylePreset}
              onChange={(e) => setStylePreset(e.target.value as LearningStylePreset)}
              className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-sky-600 focus:outline-hidden"
            >
              {(Object.keys(LEARNING_STYLE_LABELS) as LearningStylePreset[]).map((key) => (
                <option key={key} value={key}>
                  {LEARNING_STYLE_LABELS[key]}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label
              htmlFor="student-feedback-box"
              className="block text-xs font-semibold text-slate-700 mb-1.5"
            >
              Custom Feedback Box (Your Own Words)
            </label>
            <textarea
              id="student-feedback-box"
              rows={4}
              value={feedbackDraft}
              onChange={(e) => setFeedbackDraft(e.target.value)}
              placeholder="Example: Explain tough concepts using everyday sports or traffic analogies in 3 short steps before showing equations."
              className="w-full rounded-lg border border-slate-300 bg-white p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-hidden"
            />
          </div>

          <div className="flex items-center justify-between gap-3">
            {styleSavedBanner ? (
              <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                <Check className="h-3.5 w-3.5" />
                Style saved &amp; active!
              </span>
            ) : (
              <span className="text-xs text-slate-400">Saved to {state.student.name}’s profile</span>
            )}

            <button
              type="submit"
              disabled={adaptingStyleAi}
              className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60 whitespace-nowrap shrink-0"
            >
              {adaptingStyleAi ? (
                <>
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  <span>Calibrating AI...</span>
                </>
              ) : (
                <span>Update Study Style</span>
              )}
            </button>
          </div>
        </form>

        {stylePreview && (
          <div className="mt-5 border-t border-slate-100 pt-4 space-y-1.5 text-xs text-slate-700 leading-relaxed">
            <p className="font-semibold text-slate-900 inline-flex items-center gap-1.5">
              <Sparkles className="h-3.5 w-3.5 text-sky-600" />
              <span>AI Tutor Style Recalibrated</span>
            </p>
            <p className="text-slate-600">{stylePreview.confirmationNote}</p>
            {stylePreview.sampleDemonstration && (
              <p className="rounded-lg bg-slate-50 p-3 text-slate-800 border border-slate-100">
                {stylePreview.sampleDemonstration}
              </p>
            )}
          </div>
        )}
      </aside>
    </div>
  );
};
