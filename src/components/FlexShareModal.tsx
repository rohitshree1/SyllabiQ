import React, { useEffect, useState } from 'react';
import {
  Award,
  Check,
  Clock,
  Copy,
  Download,
  RefreshCw,
  SearchCheck,
  Share2,
  Sparkles,
  X,
} from 'lucide-react';
import type {
  Achievement,
  CandidateXpSnapshot,
  IssuedCredentialDoc,
  StudentProfile,
  SubjectRefreshStatus,
} from '../types';
import { resolveFlexRarityTier } from '../utils/xpAndOutreachEngine';
import { generateFlexCardSerial } from '../utils/verificationAndReferral';
import { registerCredentialApi } from '../utils/apiClient';
import { registerIssuedCredentialInCloud } from '../services/cloudService';
import {
  buildVerificationDeepLink,
  drawQrVerificationStampOnCanvas,
} from '../utils/qrVerification';
import { QrVerifyStamp } from './QrVerifyStamp';
import emblemImg from '../assets/images/emblem_academic_excellence_1793010660964.jpg';

interface FlexShareModalProps {
  achievement: Achievement | null;
  student: StudentProfile;
  ownerKey?: string;
  xpSnapshot?: CandidateXpSnapshot;
  staleSubjects?: SubjectRefreshStatus[];
  onStartSkillRefresh?: (subjectId: string) => void;
  onOpenVerifyModal?: (serialCode: string) => void;
  onClose: () => void;
}

export const FlexShareModal: React.FC<FlexShareModalProps> = ({
  achievement,
  student,
  ownerKey = 'sandbox-candidate',
  xpSnapshot,
  staleSubjects = [],
  onStartSkillRefresh,
  onOpenVerifyModal,
  onClose,
}) => {
  const [copied, setCopied] = useState(false);
  const [instaReady, setInstaReady] = useState(false);
  const [imgError, setImgError] = useState(false);

  const cardVisualSrc = student.avatarUrl || emblemImg;
  const netXp = xpSnapshot?.netXp ?? 0;
  const rarity = xpSnapshot?.rarity ?? resolveFlexRarityTier(netXp);
  const flexSerialCode = achievement
    ? generateFlexCardSerial(ownerKey, achievement.code || achievement.id || 'SCHOLAR_FLEX')
    : '';

  useEffect(() => {
    setImgError(false);
  }, [cardVisualSrc]);

  useEffect(() => {
    setCopied(false);
    setInstaReady(false);
  }, [achievement?.id]);

  useEffect(() => {
    if (!achievement?.unlocked || !flexSerialCode) return;
    const issued: IssuedCredentialDoc = {
      credentialCode: flexSerialCode,
      kind: 'flexcard',
      ownerUid: ownerKey,
      ownerName: student.name || 'Scholar',
      boardOrUniversity: student.boardOrUniversity || 'University',
      examName: student.examName || 'Final Examinations',
      title: achievement.title,
      subtitleOrMetric: achievement.metricBadge || 'Verified SyllabiQ Distinction',
      xpPoints: netXp,
      flexTier: rarity.tier,
      issuedDateISO: achievement.unlockedAt || new Date().toISOString().slice(0, 10),
    };
    void registerCredentialApi(issued);
    void registerIssuedCredentialInCloud(issued);
  }, [
    achievement?.unlocked,
    achievement?.title,
    achievement?.metricBadge,
    achievement?.unlockedAt,
    flexSerialCode,
    ownerKey,
    student.name,
    student.boardOrUniversity,
    student.examName,
    netXp,
    rarity.tier,
  ]);

  if (!achievement) return null;

  const canFlexShare = achievement.unlocked && netXp > 0;

  const baseHeadline =
    achievement.shareHeadline ||
    `${student.name || 'Scholar'} unlocked "${achievement.title}" (${
      achievement.metricBadge || 'Top Distinction'
    }) preparing for ${student.examName || student.boardOrUniversity} on SyllabiQ!`;

  const verifyDeepLink = buildVerificationDeepLink(flexSerialCode);
  const shareMessage = `${baseHeadline} · [${rarity.tier} FlexCard · ${netXp} XP · Official Serial: ${flexSerialCode} · Verify: ${verifyDeepLink}]`;
  const encodedText = encodeURIComponent(shareMessage);
  const shareUrl = encodeURIComponent(verifyDeepLink);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(shareMessage);
    } catch {
      // Clipboard fallback ignored cleanly in restricted iframes
    }
    setCopied(true);
    setTimeout(() => setCopied(false), 2400);
  };

  const handleNativeShare = async () => {
    if (!canFlexShare) return;
    if (navigator.share) {
      try {
        await navigator.share({
          title: `SyllabiQ ${rarity.tier} FlexCard — ${achievement.title}`,
          text: shareMessage,
          url: verifyDeepLink,
        });
      } catch {
        // User dismissed native share sheet
      }
    } else {
      await handleCopy();
    }
  };

  const handleDownloadCardPng = () => {
    const canvas = document.createElement('canvas');
    canvas.width = 1080;
    canvas.height = 640;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const grad = ctx.createLinearGradient(0, 0, canvas.width, canvas.height);
    grad.addColorStop(0, '#0f172a');
    grad.addColorStop(0.55, '#1e293b');
    grad.addColorStop(1, rarity.secondaryHex);
    ctx.fillStyle = grad;
    ctx.fillRect(0, 0, canvas.width, canvas.height);

    ctx.strokeStyle = rarity.accentHex;
    ctx.lineWidth = 4;
    ctx.strokeRect(36, 36, canvas.width - 72, canvas.height - 72);

    ctx.fillStyle = rarity.accentHex;
    ctx.font = '700 22px sans-serif';
    ctx.fillText(
      `SYLLABIQ COLLECTIBLE FLEXCARD · ${rarity.tier.toUpperCase()} (${netXp} XP)`,
      78,
      104,
      924
    );

    ctx.fillStyle = '#ffffff';
    ctx.font = '700 44px sans-serif';
    ctx.fillText(achievement.title, 78, 184, 720);

    ctx.fillStyle = '#e2e8f0';
    ctx.font = '600 28px monospace';
    ctx.fillText(
      `${achievement.metricBadge || 'Verified Distinction'} · ${rarity.dropRateLabel}`,
      78,
      244,
      720
    );

    ctx.fillStyle = '#cbd5e1';
    ctx.font = '500 23px sans-serif';
    ctx.fillText(
      `Candidate: ${student.name || 'Candidate'} · ${student.boardOrUniversity}`,
      78,
      324,
      720
    );
    ctx.fillText(
      `Target Exam: ${student.examName || 'Academic Finals'} · ${
        achievement.unlockedAt || new Date().toISOString().slice(0, 10)
      }`,
      78,
      366,
      720
    );

    if (staleSubjects.length > 0) {
      ctx.fillStyle = '#fbbf24';
      ctx.font = '600 18px sans-serif';
      ctx.fillText(
        `Skill Refresh Needed (60d+ unpracticed): ${staleSubjects
          .map((s) => s.subjectName)
          .join(', ')
          .slice(0, 52)}`,
        78,
        408,
        720
      );
    }

    ctx.fillStyle = rarity.accentHex;
    ctx.fillRect(78, 444, 430, 56);
    ctx.fillStyle = '#0f172a';
    ctx.font = '700 19px sans-serif';
    ctx.fillText(`Verified XP Achievement · ${rarity.tier}`, 98, 479, 390);

    ctx.fillStyle = '#f8fafc';
    ctx.font = '700 20px monospace';
    ctx.fillText(`SERIAL: ${flexSerialCode}`, 78, 536, 720);

    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 15px monospace';
    ctx.fillText(`One-Scan Verify: ${verifyDeepLink}`, 78, 568, 720);

    drawQrVerificationStampOnCanvas(ctx, {
      serialCode: flexSerialCode,
      x: 836,
      y: 318,
      cardWidth: 176,
      accentHex: rarity.accentHex,
    });

    const link = document.createElement('a');
    link.download = `SyllabiQ-${rarity.tier.replace(/\s+/g, '-')}-${flexSerialCode}.png`;
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  const handlePrepareInstagramShare = async () => {
    if (!canFlexShare) return;
    handleDownloadCardPng();
    await handleCopy();
    setInstaReady(true);
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="flex-modal-title"
    >
      <div className="glass-panel w-full max-w-2xl rounded-2xl p-6 sm:p-7 max-h-[92vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <p className="text-xs font-semibold text-sky-700">
              XP-Minted Collectible Achievement Card · {rarity.badgeLabel}
            </p>
            <h2 id="flex-modal-title" className="font-display text-xl font-bold text-slate-900">
              Flex Your Rare Exam Achievement
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Flex Share Modal"
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Rare Collectible FlexCard Preview */}
        <div
          className={`mt-5 overflow-hidden rounded-2xl border-2 ${
            staleSubjects.length > 0 ? 'border-slate-500/80 opacity-95' : rarity.borderClass
          } bg-slate-950 p-6 text-white`}
        >
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-white/10 pb-3 text-xs">
            <div className={`flex items-center gap-1.5 font-semibold ${rarity.textAccentClass}`}>
              <Sparkles className="h-3.5 w-3.5 shrink-0" />
              <span>{rarity.badgeLabel}</span>
              <span aria-hidden="true">·</span>
              <span>{rarity.dropRateLabel}</span>
            </div>
            <div className="flex items-center gap-2 font-mono tabular-nums text-xs">
              <span
                data-testid="flexcard-serial-code"
                className="font-bold text-sky-300"
              >
                {flexSerialCode}
              </span>
              <span aria-hidden="true" className="text-slate-500">
                ·
              </span>
              <span className="font-bold text-white">{netXp} XP</span>
            </div>
          </div>

          {staleSubjects.length > 0 ? (
            <div
              data-testid="flexcard-skill-refresh-badge"
              className="mt-3 rounded-xl border border-amber-400/35 bg-amber-950/40 px-3.5 py-2.5 flex flex-wrap items-center justify-between gap-2 text-xs text-amber-200"
            >
              <div className="flex items-center gap-2">
                <Clock className="h-3.5 w-3.5 text-amber-300 shrink-0" />
                <span>
                  <strong>Skill Refresh Needed</strong> ·{' '}
                  {staleSubjects
                    .map((s) => `${s.subjectName} (${s.daysSincePractice}d unpracticed)`)
                    .join(', ')}
                </span>
              </div>
              {onStartSkillRefresh && (
                <button
                  type="button"
                  onClick={() => onStartSkillRefresh(staleSubjects[0].subjectId)}
                  className="inline-flex items-center gap-1.5 rounded-lg bg-amber-400 px-3 py-1 text-[11px] font-bold text-slate-950 hover:bg-amber-300 transition-colors whitespace-nowrap shrink-0"
                >
                  <RefreshCw className="h-3 w-3" />
                  <span>Restore Luster (3-Q Quiz)</span>
                </button>
              )}
            </div>
          ) : (
            <div
              data-testid="flexcard-full-luster-status"
              className="mt-3 text-[11px] text-emerald-300 font-medium"
            >
              Up-to-Date Subject Competence · Full Badge Luster Active (All subjects practiced within 60 days)
            </div>
          )}

          <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
            <div className="flex items-center gap-4 min-w-0 flex-1">
              <div className="h-20 w-20 shrink-0 overflow-hidden rounded-xl border border-white/15 bg-slate-900 flex items-center justify-center">
                {!imgError ? (
                  <img
                    data-testid="flexcard-avatar-img"
                    src={cardVisualSrc}
                    alt={
                      student.avatarUrl
                        ? `${student.name || 'Candidate'} FlexCard portrait`
                        : 'Academic excellence crest'
                    }
                    referrerPolicy="no-referrer"
                    onError={() => setImgError(true)}
                    className="h-full w-full object-cover"
                  />
                ) : (
                  <Award className="h-9 w-9 text-sky-400" />
                )}
              </div>
              <div className="min-w-0 flex-1">
                <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-300">
                  <span>SyllabiQ Verified</span>
                  <span aria-hidden="true">·</span>
                  <span className={`font-mono tabular-nums font-semibold ${rarity.textAccentClass}`}>
                    {achievement.metricBadge || 'Distinction'}
                  </span>
                </div>
                <h3 className="mt-1 font-display text-xl font-bold text-white">
                  {achievement.title}
                </h3>
                <p className="mt-1 text-xs text-slate-300 leading-relaxed">
                  {student.name || 'Candidate'} · {student.boardOrUniversity} ·{' '}
                  {student.examName || 'Finals'}
                </p>
                <p className="mt-1 font-mono tabular-nums text-[11px] text-sky-300 truncate">
                  One-scan QR embedded on PNG: ?verify={flexSerialCode}
                </p>
              </div>
            </div>

            <QrVerifyStamp
              serialCode={flexSerialCode}
              sizePx={80}
              darkSurface
              testId="flexcard-qr-stamp"
            />
          </div>

          <p className="mt-4 border-t border-white/10 pt-3 text-xs text-slate-200 leading-relaxed">
            “{shareMessage}”
          </p>

          {rarity.nextTier && rarity.nextTierXp && (
            <div className="mt-4 pt-3 border-t border-white/10 flex items-center justify-between gap-4 text-[11px] text-slate-300">
              <span>
                Next FlexCard Rarity Upgrade: <strong className="text-white">{rarity.nextTier}</strong>
              </span>
              <span className="font-mono tabular-nums">
                {Math.max(0, rarity.nextTierXp - netXp)} XP to upgrade
              </span>
            </div>
          )}
        </div>

        {!canFlexShare ? (
          <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-xs text-amber-900">
            ▲ Social Flex sharing requires an unlocked achievement and active XP (&gt; 0 XP). Complete
            a study chapter, focus session, or timed PYQ drill to restore XP and unlock sharing.
          </div>
        ) : (
          <div className="mt-5 space-y-3">
            <p className="text-xs font-semibold text-slate-700">
              Share your {rarity.tier} FlexCard across social media
            </p>
            <div className="grid grid-cols-2 sm:grid-cols-5 gap-2.5">
              <a
                href={`https://wa.me/?text=${encodedText}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center rounded-lg border border-emerald-200 bg-emerald-50/70 px-3 py-2.5 text-xs font-semibold text-emerald-900 transition-colors hover:bg-emerald-100 whitespace-nowrap"
              >
                WhatsApp
              </a>
              <a
                href={`https://www.linkedin.com/sharing/share-offsite/?url=${shareUrl}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center rounded-lg border border-sky-200 bg-sky-50/70 px-3 py-2.5 text-xs font-semibold text-sky-900 transition-colors hover:bg-sky-100 whitespace-nowrap"
              >
                LinkedIn
              </a>
              <button
                type="button"
                onClick={handlePrepareInstagramShare}
                className="flex items-center justify-center rounded-lg border border-pink-200 bg-pink-50/70 px-3 py-2.5 text-xs font-semibold text-pink-900 transition-colors hover:bg-pink-100 whitespace-nowrap"
              >
                Instagram Card
              </button>
              <a
                href={`https://twitter.com/intent/tweet?text=${encodedText}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap"
              >
                Post on X
              </a>
              <a
                href={`https://www.reddit.com/submit?title=${encodedText}`}
                target="_blank"
                rel="noopener noreferrer"
                className="flex items-center justify-center rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 whitespace-nowrap"
              >
                Reddit
              </a>
            </div>

            {instaReady && (
              <div className="rounded-xl border border-pink-200 bg-pink-50/60 px-4 py-3 flex flex-wrap items-center justify-between gap-3 text-xs text-pink-950">
                <span>
                  Rare FlexCard PNG downloaded &amp; caption copied for your Instagram Story or Post.
                </span>
                <a
                  href="https://www.instagram.com/"
                  target="_blank"
                  rel="noopener noreferrer"
                  className="rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white hover:bg-slate-800 whitespace-nowrap shrink-0"
                >
                  Open Instagram &rarr;
                </a>
              </div>
            )}
          </div>
        )}

        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 pt-4">
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              disabled={!canFlexShare}
              onClick={handleCopy}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              {copied ? (
                <>
                  <Check className="h-3.5 w-3.5 text-emerald-600" />
                  <span>Copied Flex Caption</span>
                </>
              ) : (
                <>
                  <Copy className="h-3.5 w-3.5" />
                  <span>Copy Caption</span>
                </>
              )}
            </button>
            <button
              type="button"
              disabled={!canFlexShare}
              onClick={handleDownloadCardPng}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 px-3.5 py-2 text-xs font-medium text-slate-700 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5" />
              <span>Save Rare PNG</span>
            </button>
            {onOpenVerifyModal && (
              <button
                type="button"
                onClick={() => onOpenVerifyModal(flexSerialCode)}
                className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50/80 px-3.5 py-2 text-xs font-semibold text-sky-900 transition-colors hover:bg-sky-100 whitespace-nowrap shrink-0"
              >
                <SearchCheck className="h-3.5 w-3.5 text-sky-700" />
                <span>Verify Serial</span>
              </button>
            )}
          </div>

          <button
            type="button"
            disabled={!canFlexShare}
            onClick={handleNativeShare}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap shrink-0"
          >
            <Share2 className="h-3.5 w-3.5 text-sky-400" />
            <span>Share Achievement</span>
          </button>
        </div>
      </div>
    </div>
  );
};
