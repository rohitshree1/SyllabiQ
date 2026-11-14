import React, { useState } from 'react';
import {
  AlertCircle,
  Award,
  Bell,
  BookOpenCheck,
  Check,
  Gift,
  Pin,
  SearchCheck,
  Sparkles,
  X,
} from 'lucide-react';
import type {
  CredentialVerificationNotice,
  GlobalUpdateDoc,
  IndividualBonusDoc,
} from '../types';
import { formatVerifierPostLabel } from '../utils/verificationAndReferral';
import { calculateEthicsRecoveryXp } from '../utils/skillRefreshAndEthics';

interface UpdatesAndBonusesModalProps {
  isOpen: boolean;
  onClose: () => void;
  globalUpdates: GlobalUpdateDoc[];
  personalBonuses: IndividualBonusDoc[];
  verificationNotices?: CredentialVerificationNotice[];
  totalBonusPoints: number;
  totalDeductedPoints?: number;
  recoveredDeductionIds?: string[];
  onAcknowledgeBonus: (bonus: IndividualBonusDoc) => Promise<void>;
  onOpenEthicsRecovery?: (bonus: IndividualBonusDoc) => void;
  onAcknowledgeVerification?: (notice: CredentialVerificationNotice) => Promise<void>;
}

const CATEGORY_LABELS: Record<GlobalUpdateDoc['category'], string> = {
  exam_alert: 'Exam Alert',
  feature_update: 'Platform Update',
  study_tip: 'Study Strategy',
  bonus_event: 'Bonus Drop',
};

const BONUS_TYPE_LABELS: Record<IndividualBonusDoc['bonusType'], string> = {
  xp_boost: 'XP Readiness Boost',
  xp_deduction: 'Admin XP Deduction',
  streak_shield: 'Missed-Day Streak Shield',
  custom_badge: 'Special Distinction Badge',
  mentor_note: 'Direct Mentor Citation',
};

export const UpdatesAndBonusesModal: React.FC<UpdatesAndBonusesModalProps> = ({
  isOpen,
  onClose,
  globalUpdates,
  personalBonuses,
  verificationNotices = [],
  totalBonusPoints,
  totalDeductedPoints = 0,
  recoveredDeductionIds = [],
  onAcknowledgeBonus,
  onOpenEthicsRecovery,
  onAcknowledgeVerification,
}) => {
  const [activeFeedTab, setActiveFeedTab] = useState<'updates' | 'bonuses' | 'verifications'>(
    'updates'
  );
  const [claimingId, setClaimingId] = useState<string | null>(null);

  if (!isOpen) return null;

  const unclaimedCount = personalBonuses.filter((b) => !b.acknowledged).length;
  const unreadVerificationsCount = verificationNotices.filter((v) => !v.acknowledged).length;

  const handleClaim = async (bonus: IndividualBonusDoc) => {
    setClaimingId(bonus.id);
    try {
      await onAcknowledgeBonus(bonus);
    } finally {
      setClaimingId(null);
    }
  };

  const handleAcknowledgeNotice = async (notice: CredentialVerificationNotice) => {
    if (!onAcknowledgeVerification) return;
    setClaimingId(notice.id);
    try {
      await onAcknowledgeVerification(notice);
    } finally {
      setClaimingId(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="updates-bonuses-title"
    >
      <div className="glass-panel w-full max-w-2xl rounded-2xl p-6 sm:p-7 max-h-[85vh] flex flex-col">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200/80 pb-4 shrink-0">
          <div>
            <p className="text-xs font-semibold text-sky-700">
              Live Broadcasts · XP Awards &amp; Deductions · Verifier Alerts
            </p>
            <h2
              id="updates-bonuses-title"
              className="mt-0.5 font-display text-xl font-bold text-slate-900"
            >
              Campus Updates, XP Ledger &amp; Verifications
            </h2>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Updates and Bonuses Modal"
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-200/60 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Segmented Control */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3 shrink-0">
          <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-200/65 p-1">
            <button
              type="button"
              onClick={() => setActiveFeedTab('updates')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                activeFeedTab === 'updates'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Bell className="h-3.5 w-3.5 text-sky-600" />
              <span>Updates ({globalUpdates.length})</span>
            </button>
            <button
              type="button"
              onClick={() => setActiveFeedTab('bonuses')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                activeFeedTab === 'bonuses'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Gift className="h-3.5 w-3.5 text-emerald-600" />
              <span>
                Bonuses &amp; XP ({personalBonuses.length}
                {unclaimedCount > 0 ? ` · ${unclaimedCount} New` : ''})
              </span>
            </button>
            <button
              type="button"
              onClick={() => setActiveFeedTab('verifications')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                activeFeedTab === 'verifications'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <SearchCheck className="h-3.5 w-3.5 text-sky-700" />
              <span>
                Verifier Checks ({verificationNotices.length}
                {unreadVerificationsCount > 0 ? ` · ${unreadVerificationsCount} New` : ''})
              </span>
            </button>
          </div>

          <div className="flex items-center gap-2 font-mono tabular-nums text-xs font-semibold">
            <span className="text-sky-700">+{totalBonusPoints} XP</span>
            {totalDeductedPoints > 0 && (
              <>
                <span aria-hidden="true" className="text-slate-400">
                  ·
                </span>
                <span className="text-red-700">-{totalDeductedPoints} XP</span>
              </>
            )}
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="mt-4 overflow-y-auto pr-1 space-y-3 flex-1">
          {activeFeedTab === 'updates' ? (
            globalUpdates.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500">
                No platform updates have been published yet.
              </div>
            ) : (
              <div className="divide-y divide-slate-200/75">
                {globalUpdates.map((upd) => (
                  <article key={upd.id} className="py-4 first:pt-1 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500">
                      <div className="flex flex-wrap items-center gap-1.5">
                        {upd.pinned && (
                          <>
                            <span className="inline-flex items-center gap-1 font-semibold text-sky-700">
                              <Pin className="h-3 w-3" />
                              Pinned
                            </span>
                            <span aria-hidden="true">·</span>
                          </>
                        )}
                        <span className="font-semibold text-slate-800">
                          {CATEGORY_LABELS[upd.category]}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {upd.authorName} ({upd.authorRoleLabel})
                        </span>
                      </div>
                      <span className="font-mono tabular-nums text-[11px]">
                        {upd.createdAt.slice(0, 10)}
                      </span>
                    </div>

                    <h3 className="font-display text-base font-bold text-slate-900">
                      {upd.title}
                    </h3>
                    <p className="text-xs text-slate-600 leading-relaxed">{upd.body}</p>
                  </article>
                ))}
              </div>
            )
          ) : activeFeedTab === 'bonuses' ? (
            personalBonuses.length === 0 ? (
              <div className="py-10 text-center space-y-2">
                <Award className="mx-auto h-7 w-7 text-slate-400" />
                <p className="text-sm font-semibold text-slate-800">
                  No individual XP awards or deductions yet
                </p>
                <p className="text-xs text-slate-500 max-w-md mx-auto">
                  Keep completing Daily PYQ Tests and Deep Focus sessions—administrators award
                  special XP boosts or log XP deductions with a reason notice here.
                </p>
              </div>
            ) : (
              <div className="divide-y divide-slate-200/75">
                {personalBonuses.map((bon) => {
                  const isDeduction = bon.bonusType === 'xp_deduction';
                  return (
                    <article key={bon.id} className="py-4 first:pt-1 space-y-2">
                      <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                        <div className="flex flex-wrap items-center gap-1.5 text-slate-600">
                          <span
                            className={`font-semibold inline-flex items-center gap-1 ${
                              isDeduction ? 'text-red-700' : 'text-emerald-700'
                            }`}
                          >
                            {isDeduction ? (
                              <AlertCircle className="h-3.5 w-3.5" />
                            ) : (
                              <Sparkles className="h-3.5 w-3.5" />
                            )}
                            {BONUS_TYPE_LABELS[bon.bonusType]}
                          </span>
                          <span aria-hidden="true">·</span>
                          <span>By {bon.grantedByName}</span>
                          <span aria-hidden="true">·</span>
                          <span className="font-mono tabular-nums">
                            {bon.createdAt.slice(0, 10)}
                          </span>
                        </div>

                        {bon.pointsAwarded > 0 && (
                          <span
                            className={`font-mono tabular-nums font-bold ${
                              isDeduction ? 'text-red-700' : 'text-sky-700'
                            }`}
                          >
                            {isDeduction
                              ? `-${bon.pointsAwarded} XP Deducted`
                              : `+${bon.pointsAwarded} Bonus XP`}
                          </span>
                        )}
                      </div>

                      <h3 className="font-display text-base font-bold text-slate-900">
                        {bon.bonusTitle}
                      </h3>
                      <p className="text-xs text-slate-700 leading-relaxed">
                        {isDeduction ? `Reason: ${bon.message}` : bon.message}
                      </p>

                      <div className="pt-1 flex flex-wrap items-center justify-end gap-2">
                        {isDeduction && onOpenEthicsRecovery && (
                          recoveredDeductionIds.includes(bon.id) ? (
                            <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                              <Check className="h-3.5 w-3.5" />
                              <span>
                                +{calculateEthicsRecoveryXp(bon.pointsAwarded, false)} XP Recovered via Ethics Module
                              </span>
                            </span>
                          ) : (
                            <button
                              type="button"
                              onClick={() => onOpenEthicsRecovery(bon)}
                              className="inline-flex items-center gap-1.5 rounded-lg border border-sky-300 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100 transition-colors whitespace-nowrap shrink-0"
                            >
                              <BookOpenCheck className="h-3.5 w-3.5 text-sky-700" />
                              <span>
                                Recover +{calculateEthicsRecoveryXp(bon.pointsAwarded, false)} XP (Ethics Module)
                              </span>
                            </button>
                          )
                        )}

                        {bon.acknowledged ? (
                          <span className="inline-flex items-center gap-1 text-xs font-semibold text-slate-600">
                            <Check className="h-3.5 w-3.5 text-emerald-600" />
                            {isDeduction ? 'Deduction Acknowledged' : 'Claimed & Added to Profile'}
                          </span>
                        ) : (
                          <button
                            type="button"
                            disabled={claimingId === bon.id}
                            onClick={() => handleClaim(bon)}
                            className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-1.5 text-xs font-semibold text-white transition-colors disabled:opacity-50 whitespace-nowrap shrink-0 ${
                              isDeduction
                                ? 'bg-slate-800 hover:bg-slate-900'
                                : 'bg-sky-600 hover:bg-sky-700'
                            }`}
                          >
                            {isDeduction ? (
                              <span>
                                {claimingId === bon.id
                                  ? 'Saving...'
                                  : 'Acknowledge XP Deduction'}
                              </span>
                            ) : (
                              <>
                                <Gift className="h-3.5 w-3.5" />
                                <span>
                                  {claimingId === bon.id ? 'Claiming...' : 'Claim Special Bonus'}
                                </span>
                              </>
                            )}
                          </button>
                        )}
                      </div>
                    </article>
                  );
                })}
              </div>
            )
          ) : verificationNotices.length === 0 ? (
            <div className="py-10 text-center space-y-2">
              <SearchCheck className="mx-auto h-7 w-7 text-slate-400" />
              <p className="text-sm font-semibold text-slate-800">
                No external FlexCard or Report Card checks yet
              </p>
              <p className="text-xs text-slate-500 max-w-md mx-auto">
                Whenever someone outside the Admin or Super Admin team verifies your FlexCard or
                Report Card serial number, their Name, Gmail address, and Post appear here.
              </p>
            </div>
          ) : (
            <div className="divide-y divide-slate-200/75">
              {verificationNotices.map((notice) => (
                <article
                  key={notice.id}
                  data-testid="verifier-notice-card"
                  className="py-4 first:pt-1 space-y-2"
                >
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-slate-600">
                    <div className="flex flex-wrap items-center gap-1.5">
                      <span className="font-semibold text-sky-700">
                        {notice.credentialKind === 'report_card'
                          ? 'Report Card Verified'
                          : 'FlexCard Verified'}
                      </span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono tabular-nums font-semibold text-slate-900">
                        {notice.credentialCode}
                      </span>
                    </div>
                    <span className="font-mono tabular-nums text-[11px]">
                      {notice.createdAt.slice(0, 10)}
                    </span>
                  </div>

                  <h3 className="font-display text-sm font-bold text-slate-900">
                    {notice.verifierName} checked “{notice.credentialTitle}”
                  </h3>

                  <p className="text-xs text-slate-700 leading-relaxed">
                    Verifier Gmail:{' '}
                    <strong className="font-mono text-slate-900">{notice.verifierGmail}</strong>{' '}
                    <span aria-hidden="true">·</span> Post:{' '}
                    <strong className="text-slate-900">
                      {formatVerifierPostLabel(notice.verifierPost)}
                    </strong>
                  </p>

                  {onAcknowledgeVerification && (
                    <div className="pt-1 flex items-center justify-end">
                      {notice.acknowledged ? (
                        <span className="inline-flex items-center gap-1 text-xs font-semibold text-emerald-700">
                          <Check className="h-3.5 w-3.5" />
                          Reviewed
                        </span>
                      ) : (
                        <button
                          type="button"
                          disabled={claimingId === notice.id}
                          onClick={() => handleAcknowledgeNotice(notice)}
                          className="rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
                        >
                          {claimingId === notice.id ? 'Marking...' : 'Mark as Reviewed'}
                        </button>
                      )}
                    </div>
                  )}
                </article>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
};
