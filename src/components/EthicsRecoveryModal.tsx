import React, { useEffect, useRef, useState } from 'react';
import { BookOpenCheck, CheckCircle2, Loader2, ShieldCheck, X } from 'lucide-react';
import type { EthicsRecoveryModule, IndividualBonusDoc } from '../types';
import { fetchEthicsRecoveryModuleApi } from '../utils/apiClient';
import { buildFallbackEthicsModule } from '../utils/skillRefreshAndEthics';

interface EthicsRecoveryModalProps {
  isOpen: boolean;
  onClose: () => void;
  deductionBonus: IndividualBonusDoc | null;
  alreadyRecovered: boolean;
  onCompleteRecovery: (bonusId: string, recoveredXp: number) => void;
}

export const EthicsRecoveryModal: React.FC<EthicsRecoveryModalProps> = ({
  isOpen,
  onClose,
  deductionBonus,
  alreadyRecovered,
  onCompleteRecovery,
}) => {
  const [moduleData, setModuleData] = useState<EthicsRecoveryModule | null>(null);
  const [loadingModule, setLoadingModule] = useState(false);
  const [selectedAnswers, setSelectedAnswers] = useState<Record<string, number>>({});
  const [pledgeChecked, setPledgeChecked] = useState(false);
  const [completed, setCompleted] = useState(false);
  const [formError, setFormError] = useState('');
  const hasInteractedRef = useRef(false);

  useEffect(() => {
    if (!isOpen || !deductionBonus) return;
    hasInteractedRef.current = false;
    setSelectedAnswers({});
    setPledgeChecked(false);
    setCompleted(alreadyRecovered);
    setFormError('');

    const fallback = buildFallbackEthicsModule({
      bonusId: deductionBonus.id,
      infractionTitle: deductionBonus.bonusTitle,
      infractionReason: deductionBonus.message,
      deductedPoints: deductionBonus.pointsAwarded,
    });
    setModuleData(fallback);

    let cancelled = false;
    setLoadingModule(true);
    void fetchEthicsRecoveryModuleApi({
      bonusId: deductionBonus.id,
      infractionTitle: deductionBonus.bonusTitle,
      infractionReason: deductionBonus.message,
      deductedPoints: deductionBonus.pointsAwarded,
    })
      .then((res) => {
        if (cancelled) return;
        const normalizedQuestions = res.questions.map((q, idx) => ({
          ...q,
          id: `eth-q-${idx + 1}`,
        }));
        setModuleData((prevMod) => ({
          ...res,
          questions: hasInteractedRef.current && prevMod ? prevMod.questions : normalizedQuestions,
        }));
      })
      .finally(() => {
        if (!cancelled) setLoadingModule(false);
      });

    return () => {
      cancelled = true;
    };
  }, [isOpen, deductionBonus, alreadyRecovered]);

  if (!isOpen || !deductionBonus || !moduleData) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');

    if (Object.keys(selectedAnswers).length < moduleData.questions.length) {
      setFormError('Please answer all 3 Academic Integrity reflection questions.');
      return;
    }

    const wrongIdx = moduleData.questions.findIndex(
      (q) => selectedAnswers[q.id] !== q.correctIndex
    );
    if (wrongIdx !== -1) {
      setFormError(
        `Question 0${wrongIdx + 1} needs another look—review the principle above and select the ethical academic practice.`
      );
      return;
    }

    if (!pledgeChecked) {
      setFormError('Please confirm your Academic Integrity & Conduct pledge before claiming XP recovery.');
      return;
    }

    setCompleted(true);
    onCompleteRecovery(deductionBonus.id, moduleData.recoverableXp);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="ethics-recovery-modal-title"
    >
      <div className="glass-panel w-full max-w-2xl rounded-2xl p-6 sm:p-7 max-h-[90vh] overflow-y-auto space-y-5">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <p className="text-xs font-semibold text-sky-700">
              AI-Generated Academic Integrity &amp; Ethics Module · Fractional XP Recovery
            </p>
            <h2
              id="ethics-recovery-modal-title"
              className="mt-0.5 font-display text-xl font-bold text-slate-900"
            >
              Understand the Infraction &amp; Recover +{moduleData.recoverableXp} XP
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Academic Integrity Module"
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Lesson Card: What Happened & Why It Was Wrong */}
        <section className="rounded-xl border border-slate-200 bg-slate-50/85 p-4 space-y-3 text-xs">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold text-slate-900">
              Infraction Case Study: {moduleData.infractionTitle}
            </span>
            {loadingModule ? (
              <span className="inline-flex items-center gap-1 text-sky-700 font-medium">
                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                Tailoring with AI...
              </span>
            ) : (
              <span className="font-mono tabular-nums font-bold text-red-700">
                -{moduleData.deductedPoints} XP Deducted · +{moduleData.recoverableXp} XP Recoverable (40%)
              </span>
            )}
          </div>

          <div className="space-y-1.5 border-t border-slate-200/80 pt-2.5 text-slate-700 leading-relaxed">
            <p>
              <strong className="text-slate-900">What Happened:</strong>{' '}
              {moduleData.whatHappenedSummary}
            </p>
            <p>
              <strong className="text-slate-900">Why It Was Wrong:</strong>{' '}
              {moduleData.whyItWasWrong}
            </p>
          </div>

          <div className="border-t border-slate-200/80 pt-2.5 space-y-1">
            <p className="font-semibold text-slate-900">Core SyllabiQ Integrity Standards</p>
            <ul className="space-y-1 text-slate-600">
              {moduleData.corePrinciples.map((p, idx) => (
                <li key={idx}>
                  <span className="font-mono tabular-nums text-sky-700 font-semibold mr-1.5">
                    0{idx + 1}.
                  </span>
                  {p}
                </li>
              ))}
            </ul>
          </div>
        </section>

        {completed ? (
          <div
            data-testid="ethics-recovery-complete-banner"
            className="rounded-2xl border border-emerald-200 bg-emerald-50/85 p-5 space-y-2.5"
          >
            <div className="flex items-center gap-2 text-emerald-900">
              <CheckCircle2 className="h-5 w-5 shrink-0" />
              <h3 className="font-display text-base font-bold">
                Recovered +{moduleData.recoverableXp} XP via Academic Integrity Module
              </h3>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">
              Thank you for completing the reflection on “{moduleData.infractionTitle}”. Your
              fractional recovery of{' '}
              <strong className="font-mono tabular-nums text-slate-900">
                +{moduleData.recoverableXp} XP
              </strong>{' '}
              has been credited back to your net XP and FlexCard rarity tier.
            </p>
            <div className="flex justify-end pt-1">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors"
              >
                Done
              </button>
            </div>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            {moduleData.questions.map((q, qIdx) => (
              <div
                key={q.id}
                className="rounded-xl border border-slate-200 bg-white/95 p-4 space-y-2.5"
              >
                <p className="text-xs font-semibold text-slate-900 leading-relaxed">
                  <span className="font-mono tabular-nums text-sky-700 mr-1.5">
                    0{qIdx + 1}.
                  </span>
                  {q.question}
                </p>
                <div className="space-y-1.5">
                  {q.options.map((opt, optIdx) => {
                    const selected = selectedAnswers[q.id] === optIdx;
                    return (
                      <button
                        key={optIdx}
                        type="button"
                        onClick={() => {
                          hasInteractedRef.current = true;
                          setSelectedAnswers((prev) => ({ ...prev, [q.id]: optIdx }));
                          setFormError('');
                        }}
                        className={`w-full text-left rounded-lg border px-3 py-2 text-xs transition-colors ${
                          selected
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

            <label className="flex items-start gap-2.5 rounded-xl border border-slate-200 bg-slate-50 p-3.5 text-xs text-slate-800 cursor-pointer">
              <input
                type="checkbox"
                checked={pledgeChecked}
                onChange={(e) => {
                  setPledgeChecked(e.target.checked);
                  setFormError('');
                }}
                className="mt-0.5 h-4 w-4 rounded border-slate-300 text-sky-700 focus:ring-sky-600"
              />
              <span className="leading-relaxed">
                I understand why this infraction led to an XP deduction and commit to single-tab
                closed-book PYQ assessments and respectful, FlexCard-only Social SyllabiQ conduct.
              </span>
            </label>

            {formError && (
              <div
                role="alert"
                className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-900"
              >
                ▲ {formError}
              </div>
            )}

            <div className="flex items-center justify-end gap-2.5 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                <BookOpenCheck className="h-4 w-4 text-emerald-400" />
                <span>Complete Ethics Module (+{moduleData.recoverableXp} XP)</span>
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
};
