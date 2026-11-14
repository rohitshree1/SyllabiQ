import React, { useEffect, useState } from 'react';
import { CheckCircle2, Loader2, Scale, Send, ShieldCheck, X } from 'lucide-react';
import type {
  AppealInterviewMessage,
  SuspensionAppealRecord,
} from '../types';
import {
  fetchSuspensionAppealsApi,
  sendAppealInterviewTurnApi,
  submitSuspensionAppealApi,
} from '../utils/apiClient';

interface AppealSuspensionModalProps {
  isOpen: boolean;
  onClose: () => void;
  ownerUid: string;
  candidateName: string;
  candidateEmail: string;
  banReason: string;
  onAppealSubmitted?: (appeal: SuspensionAppealRecord) => void;
}

export const AppealSuspensionModal: React.FC<AppealSuspensionModalProps> = ({
  isOpen,
  onClose,
  ownerUid,
  candidateName,
  candidateEmail,
  banReason,
  onAppealSubmitted,
}) => {
  const [transcript, setTranscript] = useState<AppealInterviewMessage[]>([]);
  const [inputText, setInputText] = useState('');
  const [loadingTurn, setLoadingTurn] = useState(false);
  const [readyToSubmit, setReadyToSubmit] = useState(false);
  const [aiStructuredSummary, setAiStructuredSummary] = useState('');
  const [rootCauseAcknowledged, setRootCauseAcknowledged] = useState('');
  const [candidateCommitment, setCandidateCommitment] = useState('');
  const [recommendedActionNote, setRecommendedActionNote] = useState('');
  const [submittingAppeal, setSubmittingAppeal] = useState(false);
  const [existingAppeal, setExistingAppeal] = useState<SuspensionAppealRecord | null>(null);
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    setTranscript([]);
    setInputText('');
    setReadyToSubmit(false);
    setAiStructuredSummary('');
    setRootCauseAcknowledged('');
    setCandidateCommitment('');
    setRecommendedActionNote('');
    setExistingAppeal(null);
    setErrorMsg('');
  }, [ownerUid, banReason]);

  useEffect(() => {
    if (!isOpen) return;
    setErrorMsg('');

    setTranscript((prev) => {
      if (prev.length > 0) return prev;
      return [
        {
          id: 'apl-turn-0',
          role: 'interviewer',
          text: `Hello ${candidateName}. I am SyllabiQ’s Automated Appeal Interviewer. Your account is currently suspended for: “${banReason}”. First, please explain in your own words what happened and any context you want the Super Admin to review.`,
        },
      ];
    });

    let cancelled = false;
    const init = async () => {
      const prior = await fetchSuspensionAppealsApi(ownerUid);
      if (cancelled) return;
      if (prior.length > 0) {
        setExistingAppeal(prior[0]);
      }
    };
    void init();
    return () => {
      cancelled = true;
    };
  }, [isOpen, ownerUid, candidateName, banReason]);

  if (!isOpen) return null;

  const handleSendAnswer = async (e: React.FormEvent) => {
    e.preventDefault();
    const clean = inputText.trim();
    if (!clean) {
      setErrorMsg('Please type your response so the AI Appeal Interviewer can record your explanation.');
      return;
    }
    setErrorMsg('');

    const userMsg: AppealInterviewMessage = {
      id: `apl-cand-${Date.now()}`,
      role: 'candidate',
      text: clean,
    };
    const nextTranscript = [...transcript, userMsg];
    setTranscript(nextTranscript);
    setInputText('');
    setLoadingTurn(true);

    try {
      const aiRes = await sendAppealInterviewTurnApi({
        candidateName,
        banReason,
        transcript: nextTranscript,
      });

      const replyMsg: AppealInterviewMessage = {
        id: `apl-int-${Date.now()}`,
        role: 'interviewer',
        text: aiRes.interviewerReply,
      };
      setTranscript([...nextTranscript, replyMsg]);
      if (aiRes.readyToSubmit) {
        setReadyToSubmit(true);
        setAiStructuredSummary(aiRes.aiStructuredSummary);
        setRootCauseAcknowledged(aiRes.rootCauseAcknowledged);
        setCandidateCommitment(aiRes.candidateCommitment);
        setRecommendedActionNote(aiRes.recommendedActionNote);
      }
    } finally {
      setLoadingTurn(false);
    }
  };

  const handleForwardToSuperAdmin = async () => {
    setSubmittingAppeal(true);
    setErrorMsg('');
    try {
      const submitted = await submitSuspensionAppealApi({
        ownerUid,
        candidateName,
        candidateEmail,
        banReason,
        interviewTranscript: transcript,
        aiStructuredSummary:
          aiStructuredSummary ||
          `${candidateName} completed the automated appeal interview regarding "${banReason}".`,
        rootCauseAcknowledged: rootCauseAcknowledged || 'Candidate provided written explanation.',
        candidateCommitment: candidateCommitment || 'Candidate pledged strict adherence to platform rules.',
        recommendedActionNote:
          recommendedActionNote || 'Awaiting exclusive Super Admin review and unban approval.',
      });

      if (!submitted) {
        setErrorMsg('Unable to submit appeal right now. Please try again.');
        return;
      }

      setExistingAppeal(submitted);
      if (onAppealSubmitted) {
        onAppealSubmitted(submitted);
      }
    } finally {
      setSubmittingAppeal(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/65 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="appeal-suspension-modal-title"
    >
      <div className="glass-panel w-full max-w-2xl rounded-2xl p-6 sm:p-7 max-h-[90vh] flex flex-col gap-5">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4 shrink-0">
          <div>
            <p className="text-xs font-semibold text-sky-700">
              Automated AI Appeal Interview · Exclusive Super Admin Governance
            </p>
            <h2
              id="appeal-suspension-modal-title"
              className="mt-0.5 font-display text-xl font-bold text-slate-900"
            >
              Appeal Account Suspension
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Appeal Suspension Modal"
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="rounded-xl border border-slate-200 bg-slate-50/90 p-3.5 text-xs text-slate-700 flex items-start gap-2.5 shrink-0">
          <ShieldCheck className="h-4 w-4 text-sky-700 shrink-0 mt-0.5" />
          <p className="leading-relaxed">
            <strong>Strict Governance Policy:</strong> Delegated sub-admins cannot lift bans. Your
            automated interview transcript and AI structured summary are forwarded directly to the{' '}
            <strong>Super Admin</strong>, and your account is unbanned <strong>only if the Super Admin agrees</strong>.
          </p>
        </div>

        {existingAppeal && existingAppeal.status === 'pending_super_admin' && (
          <div
            data-testid="appeal-submitted-banner"
            className="rounded-xl border border-emerald-200 bg-emerald-50/85 p-4 space-y-2 shrink-0"
          >
            <div className="flex items-center justify-between gap-2">
              <div className="flex items-center gap-2 text-emerald-900 font-semibold text-xs">
                <CheckCircle2 className="h-4 w-4 shrink-0" />
                <span>Appeal Forwarded to Super Admin Queue</span>
              </div>
              <span className="font-mono tabular-nums text-[11px] text-emerald-800">
                ID: {existingAppeal.id}
              </span>
            </div>
            <p className="text-xs text-slate-700 leading-relaxed">
              {existingAppeal.aiStructuredSummary}
            </p>
          </div>
        )}

        {/* Interview Transcript */}
        <div className="flex-1 overflow-y-auto space-y-3 pr-1 min-h-[200px]">
          {transcript.map((msg) => (
            <div
              key={msg.id}
              className={`rounded-xl p-3.5 text-xs leading-relaxed ${
                msg.role === 'interviewer'
                  ? 'border border-slate-200 bg-white text-slate-800 mr-6'
                  : 'bg-slate-900 text-white ml-6'
              }`}
            >
              <p
                className={`mb-1 text-[11px] font-semibold ${
                  msg.role === 'interviewer' ? 'text-sky-700' : 'text-sky-300'
                }`}
              >
                {msg.role === 'interviewer' ? 'AI Appeal Officer' : candidateName}
              </p>
              <p>{msg.text}</p>
            </div>
          ))}

          {loadingTurn && (
            <div className="rounded-xl border border-slate-200 bg-white p-3.5 text-xs text-slate-600 inline-flex items-center gap-2">
              <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-600" />
              <span>AI Appeal Officer is reviewing your statement...</span>
            </div>
          )}

          {readyToSubmit && (
            <div
              data-testid="appeal-structured-summary-card"
              className="rounded-xl border border-sky-200 bg-sky-50/75 p-4 space-y-2.5 text-xs"
            >
              <div className="flex items-center gap-2 font-semibold text-sky-950">
                <Scale className="h-4 w-4 text-sky-700" />
                <span>Structured Summary Ready for Super Admin Review</span>
              </div>
              <p className="text-slate-800 leading-relaxed">{aiStructuredSummary}</p>
              {candidateCommitment && (
                <p className="text-slate-700">
                  <strong>Recorded Commitment:</strong> {candidateCommitment}
                </p>
              )}
            </div>
          )}
        </div>

        {errorMsg && (
          <div
            role="alert"
            className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2 text-xs font-medium text-amber-900 shrink-0"
          >
            ▲ {errorMsg}
          </div>
        )}

        <div className="border-t border-slate-200 pt-4 space-y-3 shrink-0">
          {!readyToSubmit ? (
            <form onSubmit={handleSendAnswer} className="flex items-center gap-2">
              <label htmlFor="appeal-answer-input" className="sr-only">
                Your Appeal Interview Response
              </label>
              <input
                id="appeal-answer-input"
                type="text"
                value={inputText}
                onChange={(e) => setInputText(e.target.value)}
                disabled={loadingTurn}
                placeholder="Type your honest explanation or corrective commitment..."
                className="min-w-0 flex-1 rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 text-xs text-slate-900 focus:border-sky-600 focus:outline-none"
              />
              <button
                type="submit"
                disabled={loadingTurn}
                className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
              >
                <Send className="h-3.5 w-3.5 text-sky-400" />
                <span>Send Response</span>
              </button>
            </form>
          ) : (
            <div className="flex flex-wrap items-center justify-between gap-3">
              <span className="text-xs text-slate-600">
                Unban takes effect only upon Super Admin approval.
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={onClose}
                  className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
                >
                  Close
                </button>
                <button
                  type="button"
                  disabled={
                    submittingAppeal || existingAppeal?.status === 'pending_super_admin'
                  }
                  onClick={handleForwardToSuperAdmin}
                  className="inline-flex items-center gap-2 rounded-xl bg-sky-700 px-5 py-2.5 text-xs font-semibold text-white hover:bg-sky-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
                >
                  {submittingAppeal ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <Scale className="h-3.5 w-3.5" />
                  )}
                  <span>
                    {existingAppeal?.status === 'pending_super_admin'
                      ? 'Forwarded to Super Admin'
                      : 'Forward Appeal to Super Admin'}
                  </span>
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
