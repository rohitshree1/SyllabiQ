import React, { useEffect, useMemo, useState } from 'react';
import { CheckCircle2, RefreshCw, Sparkles, X } from 'lucide-react';
import type {
  MCQQuestion,
  StudentProfile,
  SubjectProfile,
  TopicItem,
} from '../types';
import { t } from '../utils/translations';
import { buildLocalPYQQuestions } from '../utils/questionBank';

interface SkillRefreshQuizModalProps {
  isOpen: boolean;
  onClose: () => void;
  subject: SubjectProfile | null;
  topics: TopicItem[];
  student: StudentProfile;
  daysSincePractice: number;
  onCompleteRefresh: (subjectId: string, correctCount: number, totalQuestions: number) => void;
}

export const SkillRefreshQuizModal: React.FC<SkillRefreshQuizModalProps> = ({
  isOpen,
  onClose,
  subject,
  topics,
  student,
  daysSincePractice,
  onCompleteRefresh,
}) => {
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [submitted, setSubmitted] = useState(false);
  const [validationError, setValidationError] = useState('');

  useEffect(() => {
    if (isOpen) {
      setSelectedAnswers({});
      setSubmitted(false);
      setValidationError('');
    }
  }, [isOpen, subject?.id]);

  const questions: MCQQuestion[] = useMemo(() => {
    if (!subject) return [];
    const subjectTopics = topics.filter((t) => t.subjectId === subject.id);
    const fallbackTopics: TopicItem[] =
      subjectTopics.length > 0
        ? subjectTopics
        : [
            {
              id: `refresh-${subject.id}`,
              subjectId: subject.id,
              subjectName: subject.name,
              title: `${subject.name} Core Concepts`,
              estimatedHours: 2,
              yieldType: 'high',
              pyqFrequencyNote: 'Core past-paper verification',
              classStatus: 'covered',
              completed: true,
              masteryPercent: 80,
              youtubeQuery: subject.name,
              youtubeTitle: subject.name,
              youtubeChannelHint: 'Academic Review',
              keyConcepts: ['Core principles & derivations'],
            },
          ];
    return buildLocalPYQQuestions(
      fallbackTopics,
      3,
      'Exam Standard',
      student.boardOrUniversity || 'University'
    );
  }, [subject, topics, student.boardOrUniversity]);

  if (!isOpen || !subject) return null;

  const correctCount = questions.reduce((acc, q) => {
    return acc + (selectedAnswers[q.id] === q.correctIndex ? 1 : 0);
  }, 0);

  const handleSubmitQuiz = (e: React.FormEvent) => {
    e.preventDefault();
    if (Object.keys(selectedAnswers).length < questions.length) {
      setValidationError(
        'Answer all 3 rapid skill-refresh questions to restore full FlexCard badge luster.'
      );
      return;
    }
    setValidationError('');
    setSubmitted(true);
    onCompleteRefresh(subject.id, correctCount, questions.length);
  };

  const handleCloseReset = () => {
    setSelectedAnswers({});
    setSubmitted(false);
    setValidationError('');
    onClose();
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="skill-refresh-modal-title"
    >
      <div className="glass-panel w-full max-w-2xl rounded-2xl p-6 sm:p-7 max-h-[90vh] overflow-y-auto space-y-5">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <p className="text-xs font-semibold text-amber-800">
              {`60-Day Competence Verification · ${daysSincePractice} Days Since Last Practice`}
            </p>
            <h2
              id="skill-refresh-modal-title"
              className="mt-0.5 font-display text-xl font-bold text-slate-900"
            >
              {t('restoreFlexCardLuster', 'en', { subject: subject.name })}
            </h2>
          </div>
          <button
            type="button"
            onClick={handleCloseReset}
            aria-label="Close Skill Refresh Quiz Modal"
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <p className="text-xs text-slate-600 leading-relaxed">
          {t('restoreLusterDesc')}
        </p>

        {!submitted ? (
          <form onSubmit={handleSubmitQuiz} className="space-y-5">
            {questions.map((q, qIdx) => (
              <div
                key={q.id}
                className="rounded-xl border border-slate-200 bg-white/90 p-4 space-y-3"
              >
                <p className="text-xs font-semibold text-slate-900 leading-relaxed">
                  <span className="font-mono tabular-nums text-sky-700 mr-1.5">
                    0{qIdx + 1}.
                  </span>
                  {q.question}
                </p>
                <div className="grid grid-cols-1 gap-2">
                  {q.options.map((opt, optIdx) => {
                    const isSelected = selectedAnswers[q.id] === optIdx;
                    return (
                      <button
                        key={optIdx}
                        type="button"
                        onClick={() => {
                          setSelectedAnswers((prev) => ({ ...prev, [q.id]: optIdx }));
                          setValidationError('');
                        }}
                        className={`text-left rounded-lg border px-3.5 py-2 text-xs transition-colors ${
                          isSelected
                            ? 'border-sky-600 bg-sky-50 font-semibold text-sky-950'
                            : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                        }`}
                      >
                        {opt}
                      </button>
                    );
                  })}
                </div>
              </div>
            ))}

            {validationError && (
              <div
                role="alert"
                className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-900"
              >
                ▲ {validationError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 pt-2 border-t border-slate-200">
              <button
                type="button"
                onClick={handleCloseReset}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
              >
                {t('cancel')}
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                <RefreshCw className="h-3.5 w-3.5 text-sky-400" />
                <span>{t('verifyAndRestoreBadge')}</span>
              </button>
            </div>
          </form>
        ) : (
          <div
            data-testid="skill-refresh-complete-card"
            className="rounded-2xl border border-emerald-200 bg-emerald-50/85 p-5 space-y-3"
          >
            <div className="flex items-center gap-2 text-emerald-900">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <h3 className="font-display text-base font-bold">
                {t('fullLusterRestoredTitle')}
              </h3>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">
              You completed the <strong>{subject.name}</strong> refresh check (
              <span className="font-mono tabular-nums font-semibold">
                {correctCount}/{questions.length}
              </span>{' '}
              correct). Your practice timestamp is now current and the{' '}
              <strong>Skill Refresh Needed</strong> notice has been removed from your FlexCards.
            </p>
            <div className="flex justify-end pt-2">
              <button
                type="button"
                onClick={handleCloseReset}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                <Sparkles className="h-3.5 w-3.5 text-amber-300" />
                <span>{t('returnToPolishedFlex')}</span>
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};
