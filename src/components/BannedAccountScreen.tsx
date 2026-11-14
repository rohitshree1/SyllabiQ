import React, { useEffect, useState } from 'react';
import {
  Check,
  Copy,
  Download,
  Loader2,
  LogOut,
  RefreshCw,
  Scale,
  ShieldAlert,
  Sparkles,
} from 'lucide-react';
import type {
  AuthenticatedAccount,
  BanFlexAiDraft,
  CandidateSummaryDoc,
  FlexCardRarityTier,
  IssuedCredentialDoc,
  SuspensionAppealRecord,
} from '../types';
import { resolveFlexRarityTier } from '../utils/xpAndOutreachEngine';
import {
  buildFallbackBanFlexDraft,
  generateFlexCardSerial,
} from '../utils/verificationAndReferral';
import {
  fetchBanFlexMessageAi,
  fetchSuspensionAppealsApi,
  registerCredentialApi,
} from '../utils/apiClient';
import { registerIssuedCredentialInCloud } from '../services/cloudService';
import {
  buildVerificationDeepLink,
  drawQrVerificationStampOnCanvas,
} from '../utils/qrVerification';
import { AppealSuspensionModal } from './AppealSuspensionModal';
import { QrVerifyStamp } from './QrVerifyStamp';

interface BannedAccountScreenProps {
  account: AuthenticatedAccount;
  summary: CandidateSummaryDoc;
  isSandboxPreview?: boolean;
  onExitSandboxPreview?: () => void;
  onSignOut: () => Promise<void>;
}

export const BannedAccountScreen: React.FC<BannedAccountScreenProps> = ({
  account,
  summary,
  isSandboxPreview = false,
  onExitSandboxPreview,
  onSignOut,
}) => {
  const xpPoints = Math.max(0, summary.xpPoints ?? 0);
  const rarity = resolveFlexRarityTier(xpPoints);
  const flexTier: FlexCardRarityTier = summary.flexTier || rarity.tier;
  const effectiveReason =
    summary.banReason?.trim() ||
    'Suspended under academic integrity and study workspace policy review.';
  const candidateName = summary.displayName || account.displayName || 'Scholar';
  const examName = summary.examName || summary.boardOrUniversity || 'Final Examinations';
  const serialCode = generateFlexCardSerial(
    summary.ownerUid || account.uid || 'sandbox-candidate',
    'BAN_REFLECTION'
  );

  const initialDraft = buildFallbackBanFlexDraft({
    candidateName,
    examName,
    banReason: effectiveReason,
    xpPoints,
    flexTier,
  });

  const [draft, setDraft] = useState<BanFlexAiDraft>(initialDraft);
  const [customCaption, setCustomCaption] = useState<string>(initialDraft.caption);
  const [regenerating, setRegenerating] = useState<boolean>(false);
  const [copied, setCopied] = useState<boolean>(false);
  const [instaReady, setInstaReady] = useState<boolean>(false);
  const [appealModalOpen, setAppealModalOpen] = useState<boolean>(false);
  const [latestAppeal, setLatestAppeal] = useState<SuspensionAppealRecord | null>(null);

  const loadAiOptimizedMessage = async () => {
    setRegenerating(true);
    try {
      const generated = await fetchBanFlexMessageAi({
        candidateName,
        examName,
        banReason: effectiveReason,
        xpPoints,
        flexTier,
      });
      setDraft(generated);
      setCustomCaption(generated.caption);
    } finally {
      setRegenerating(false);
    }
  };

  useEffect(() => {
    void loadAiOptimizedMessage();
    void fetchSuspensionAppealsApi(summary.ownerUid || account.uid).then((list) => {
      if (list.length > 0) setLatestAppeal(list[0]);
    });
  }, [summary.banReason, summary.ownerUid, account.uid]);

  useEffect(() => {
    const cred: IssuedCredentialDoc = {
      credentialCode: serialCode,
      kind: 'flexcard',
      ownerUid: summary.ownerUid || account.uid || 'sandbox-candidate',
      ownerName: candidateName,
      boardOrUniversity: summary.boardOrUniversity || 'University',
      examName,
      title: draft.headline || 'Accountability & Comeback FlexCard',
      subtitleOrMetric: `Restricted Standing · Reason: ${effectiveReason.slice(0, 90)}`,
      xpPoints,
      flexTier,
      issuedDateISO: new Date().toISOString().slice(0, 10),
    };
    void registerCredentialApi(cred);
    void registerIssuedCredentialInCloud(cred);
  }, [serialCode, draft.headline, effectiveReason, xpPoints, flexTier]);

  const verifyDeepLink = buildVerificationDeepLink(serialCode);
  const fullShareText = `${customCaption.trim()} · [Verify Serial: ${serialCode} · ${verifyDeepLink}]`;
  const encodedShareText = encodeURIComponent(fullShareText);
  const encodedOrigin = encodeURIComponent(verifyDeepLink);

  const handleCopyCaption = async () => {
    try {
      await navigator.clipboard.writeText(fullShareText);
    } catch {
      // Ignore iframe clipboard restriction
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2200);
  };

  const handleDownloadPng = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 640;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(0.6, '#1e293b');
    grad.addColorStop(1, '#7f1d1d');
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = '#f59e0b';
    ctx.lineWidth = 4;
    ctx.strokeRect(36, 36, canvas.width - 72, canvas.height - 72);

    ctx.fillStyle = '#fbbf24';
    ctx.font = '700 21px sans-serif';
    ctx.fillText(
      `SYLLABIQ ACCOUNTABILITY FLEXCARD · ${flexTier.toUpperCase()} (${xpPoints} XP)`,
      76,
      100,
      920
    );

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 36px sans-serif';
    ctx.fillText(draft.headline.slice(0, 52), 76, 172, 720);

    ctx.fillStyle = '#fca5a5';
    ctx.font = '600 21px sans-serif';
    ctx.fillText(`Restriction Reason: ${effectiveReason.slice(0, 68)}`, 76, 230, 720);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '500 21px sans-serif';
    ctx.fillText(`Candidate: ${candidateName} · ${examName}`, 76, 298, 720);
    ctx.fillText(draft.comebackPledge.slice(0, 72), 76, 344, 720);

    ctx.fillStyle = '#f59e0b';
    ctx.fillRect(76, 444, 540, 56);
    ctx.fillStyle = '#0f172a';
    ctx.font = '700 20px monospace';
    ctx.fillText(`OFFICIAL SERIAL: ${serialCode}`, 98, 480, 500);

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '500 15px monospace';
    ctx.fillText(`One-Scan Verify: ${verifyDeepLink}`, 76, 542, 720);

    drawQrVerificationStampOnCanvas(ctx, {
      serialCode,
      x: 836,
      y: 318,
      cardWidth: 176,
      accentHex: '#f59e0b',
    });

    const link = document.createElement('a');
    link.download = `SyllabiQ-Accountability-FlexCard-${serialCode}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handleInstagramExport = async () => {
    handleDownloadPng();
    await handleCopyCaption();
    setInstaReady(true);
  };

  return (
    <div
      data-testid="banned-flex-only-screen"
      className="min-h-screen bg-slate-50 text-slate-900 flex flex-col justify-between p-5 sm:p-8"
    >
      <header className="max-w-4xl w-full mx-auto flex flex-wrap items-center justify-between gap-4 pb-5 border-b border-slate-200">
        <div>
          <p className="text-xs font-semibold text-red-700">
            Restricted Account Standing · FlexCard-Only Login Access
          </p>
          <h1 className="font-display text-xl sm:text-2xl font-bold text-slate-900">
            SyllabiQ — Restricted Candidate Portal
          </h1>
        </div>

        <div className="flex items-center gap-2.5">
          {isSandboxPreview && onExitSandboxPreview && (
            <button
              type="button"
              onClick={onExitSandboxPreview}
              className="rounded-xl border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-100 transition-colors whitespace-nowrap shrink-0"
            >
              Exit Banned Preview
            </button>
          )}
          <button
            type="button"
            onClick={onSignOut}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            <LogOut className="h-3.5 w-3.5" />
            <span>Sign Out</span>
          </button>
        </div>
      </header>

      <main className="max-w-4xl w-full mx-auto my-6 space-y-6 flex-1">
        {/* Administrator Restriction Notice */}
        <section className="glass-panel rounded-2xl p-6 space-y-4 border border-red-200/90">
          <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
            <div className="flex items-start gap-3 text-red-800">
              <ShieldAlert className="h-6 w-6 shrink-0 mt-0.5" />
              <div className="space-y-1">
                <p className="text-xs font-semibold">
                  Study Planner, Timed PYQ Tests &amp; Workspace Editing Disabled
                </p>
                <h2 className="font-display text-lg font-bold text-slate-900">
                  Signed in as {candidateName} ({account.email || 'Restricted Account'})
                </h2>
                <p className="text-xs text-slate-600 leading-relaxed">
                  While your account is restricted, study schedules, quizzes, and Social SyllabiQ
                  remain locked. You may share your Accountability FlexCard below or launch an
                  automated AI Appeal Interview—accounts are unbanned only if the Super Admin agrees.
                </p>
              </div>
            </div>

            <button
              type="button"
              onClick={() => setAppealModalOpen(true)}
              className="inline-flex items-center justify-center gap-2 rounded-xl bg-sky-700 px-4 py-2.5 text-xs font-semibold text-white hover:bg-sky-800 transition-colors whitespace-nowrap shrink-0"
            >
              <Scale className="h-4 w-4" />
              <span>Appeal Suspension</span>
            </button>
          </div>

          <div className="rounded-xl border border-red-200 bg-red-50/70 p-4 text-xs space-y-1">
            <p className="font-semibold text-red-950">Administrator Restriction Reason</p>
            <p data-testid="banned-reason-text" className="text-slate-800 font-medium">
              {effectiveReason}
            </p>
          </div>

          {latestAppeal && (
            <div className="rounded-xl border border-sky-200 bg-sky-50/75 p-3.5 text-xs text-slate-800 flex flex-wrap items-center justify-between gap-2">
              <span>
                <strong>Appeal Status:</strong>{' '}
                {latestAppeal.status === 'pending_super_admin'
                  ? 'Pending Exclusive Super Admin Review'
                  : latestAppeal.status === 'approved_unbanned'
                  ? 'Approved by Super Admin'
                  : 'Declined by Super Admin'}
              </span>
              <span className="font-mono tabular-nums text-[11px] text-sky-900">
                {latestAppeal.id}
              </span>
            </div>
          )}
        </section>

        {/* AI-Optimized Accountability FlexCard Studio */}
        <section className="glass-panel rounded-2xl p-6 sm:p-7 space-y-5">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <p className="text-xs font-semibold text-sky-700">
                AI-Optimized Accountability &amp; Reset FlexCard
              </p>
              <h2 className="font-display text-lg font-bold text-slate-900">
                Share Your Transparency &amp; Comeback Card
              </h2>
            </div>

            <button
              type="button"
              disabled={regenerating}
              onClick={loadAiOptimizedMessage}
              className="inline-flex items-center gap-1.5 rounded-xl border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
            >
              {regenerating ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-600" />
              ) : (
                <RefreshCw className="h-3.5 w-3.5 text-sky-600" />
              )}
              <span>
                {regenerating ? 'Optimizing with AI...' : 'Regenerate AI Message'}
              </span>
            </button>
          </div>

          {/* Visual Card */}
          <div className="rounded-2xl border-2 border-amber-400/80 bg-slate-950 p-6 text-white space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3 text-xs">
              <div className="flex items-center gap-1.5 font-semibold text-amber-300">
                <Sparkles className="h-3.5 w-3.5 shrink-0" />
                <span>{flexTier}</span>
                <span aria-hidden="true">·</span>
                <span>Restricted Standing FlexCard</span>
              </div>
              <span
                data-testid="banned-flex-serial"
                className="font-mono tabular-nums font-bold text-sky-300"
              >
                Serial: {serialCode}
              </span>
            </div>

            <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
              <div className="space-y-1.5 min-w-0 flex-1">
                <p className="text-xs text-slate-300">
                  {candidateName} · {summary.boardOrUniversity || 'University'} · {examName} ·{' '}
                  <span className="font-mono tabular-nums font-semibold text-white">
                    {xpPoints.toLocaleString()} XP
                  </span>
                </p>
                <h3 className="font-display text-xl font-bold text-white">{draft.headline}</h3>
                <p className="text-xs text-amber-200/95 leading-relaxed">
                  Restriction Context: “{effectiveReason}”
                </p>
              </div>
              <QrVerifyStamp
                serialCode={serialCode}
                sizePx={78}
                darkSurface
                testId="banned-flex-qr-stamp"
              />
            </div>

            <p className="border-t border-white/10 pt-3 text-xs text-slate-200 leading-relaxed">
              {draft.comebackPledge}
            </p>
          </div>

          {/* AI-Optimized Caption Editor */}
          <div className="space-y-1.5">
            <label
              htmlFor="banned-ai-caption"
              className="block text-xs font-semibold text-slate-800"
            >
              AI-Optimized Share Message (Based on Restriction Reason)
            </label>
            <textarea
              id="banned-ai-caption"
              rows={3}
              value={customCaption}
              onChange={(e) => setCustomCaption(e.target.value)}
              className="w-full rounded-xl border border-slate-300 bg-white p-3 text-xs text-slate-800 leading-relaxed focus:border-sky-600 focus:outline-none"
            />
          </div>

          {/* Allowed Social Sharing Controls */}
          <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
            <a
              href={`https://wa.me/?text=${encodedShareText}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center rounded-xl border border-emerald-200 bg-emerald-50 px-3 py-2.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 transition-colors whitespace-nowrap"
            >
              WhatsApp
            </a>
            <a
              href={`https://www.linkedin.com/sharing/share-offsite/?url=${encodedOrigin}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center rounded-xl border border-sky-200 bg-sky-50 px-3 py-2.5 text-xs font-semibold text-sky-900 hover:bg-sky-100 transition-colors whitespace-nowrap"
            >
              LinkedIn
            </a>
            <button
              type="button"
              onClick={handleInstagramExport}
              className="flex items-center justify-center rounded-xl border border-pink-200 bg-pink-50 px-3 py-2.5 text-xs font-semibold text-pink-900 hover:bg-pink-100 transition-colors whitespace-nowrap"
            >
              Instagram Card
            </button>
            <a
              href={`https://twitter.com/intent/tweet?text=${encodedShareText}`}
              target="_blank"
              rel="noopener noreferrer"
              className="flex items-center justify-center rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              Post on X
            </a>
            <button
              type="button"
              onClick={handleDownloadPng}
              className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Save PNG</span>
            </button>
          </div>

          {instaReady && (
            <p className="text-xs font-medium text-pink-900">
              Accountability FlexCard PNG downloaded &amp; AI message copied for Instagram.
            </p>
          )}

          <div className="flex items-center justify-end border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={handleCopyCaption}
              className="inline-flex items-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-400" />
                  <span>Copied Message + Serial</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5 text-sky-400" />
                  <span>Copy AI Flex Message</span>
                </>
              )}
            </button>
          </div>
        </section>
      </main>

      <footer className="max-w-4xl w-full mx-auto pt-4 border-t border-slate-200 text-xs text-slate-500 flex items-center justify-between">
        <span>SyllabiQ Moderation &amp; Verifiable Credential Governance</span>
        <span className="font-mono tabular-nums">{serialCode}</span>
      </footer>

      <AppealSuspensionModal
        isOpen={appealModalOpen}
        onClose={() => setAppealModalOpen(false)}
        ownerUid={summary.ownerUid || account.uid || 'sandbox-candidate'}
        candidateName={candidateName}
        candidateEmail={account.email || summary.contactEmail || ''}
        banReason={effectiveReason}
        onAppealSubmitted={(apl) => setLatestAppeal(apl)}
      />
    </div>
  );
};
