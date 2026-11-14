import React, { useCallback, useEffect, useState } from 'react';
import {
  AlertTriangle,
  Ban,
  Bell,
  Check,
  CheckCircle2,
  Copy,
  ExternalLink,
  FileCheck2,
  Gift,
  Lock,
  Mail,
  MessageSquare,
  MinusCircle,
  Phone,
  Pin,
  Plus,
  RefreshCw,
  Scale,
  Search,
  ShieldCheck,
  Trash2,
  UserCheck,
  UserPlus,
  Users,
} from 'lucide-react';
import {
  decideSuspensionAppealApi,
  fetchSuspensionAppealsApi,
} from '../utils/apiClient';
import { BOOTSTRAPPED_SUPER_ADMIN_EMAIL } from '../utils/firestoreValidators';
import {
  buildOneClickOutreachLinks,
  resolveFlexRarityTier,
  validateAdminContactAssignment,
} from '../utils/xpAndOutreachEngine';
import type {
  CandidateSummaryDoc,
  GlobalUpdateCategory,
  GlobalUpdateDoc,
  IndividualBonusType,
  StaffAccessProfile,
  StaffInviteDoc,
  SuspensionAppealRecord,
} from '../types';

interface AdminPanelViewProps {
  staffAccess: StaffAccessProfile;
  currentStaffUid: string;
  currentStaffName: string;
  globalUpdates: GlobalUpdateDoc[];
  candidates: CandidateSummaryDoc[];
  staffInvites: StaffInviteDoc[];
  isRefreshingRoster: boolean;
  onRefreshRoster: () => Promise<void>;
  onLookupCandidateById: (uid: string) => Promise<void>;
  onPublishGlobalUpdate: (payload: {
    title: string;
    body: string;
    category: GlobalUpdateCategory;
    pinned: boolean;
  }) => Promise<void>;
  onTogglePinUpdate: (updateId: string, nextPinned: boolean) => Promise<void>;
  onDeleteUpdate: (updateId: string) => Promise<void>;
  onSetCandidateBan: (targetUid: string, banned: boolean, banReason: string) => Promise<void>;
  onGrantBonus: (payload: {
    targetCandidate: CandidateSummaryDoc;
    bonusTitle: string;
    bonusType: IndividualBonusType;
    pointsAwarded: number;
    message: string;
  }) => Promise<void>;
  onUpsertStaffInvite: (payload: {
    targetEmail: string;
    adminPhone: string;
    displayName: string;
    canPostUpdates: boolean;
    canGrantBonuses: boolean;
    canBanUsers: boolean;
  }) => Promise<void>;
  onUpdateStaffInvite: (payload: {
    inviteKey: string;
    adminPhone: string;
    displayName: string;
    canPostUpdates: boolean;
    canGrantBonuses: boolean;
    canBanUsers: boolean;
    status: 'active' | 'revoked';
  }) => Promise<void>;
  onOpenVerifyModal?: (serial?: string) => void;
}

const UPDATE_CATEGORIES: Array<{ value: GlobalUpdateCategory; label: string }> = [
  { value: 'exam_alert', label: 'Exam & PYQ Alert' },
  { value: 'feature_update', label: 'Platform Feature Update' },
  { value: 'study_tip', label: 'Study Strategy Note' },
  { value: 'bonus_event', label: 'Special Bonus Event' },
];

const BONUS_TYPES: Array<{ value: IndividualBonusType; label: string; defaultPoints: number }> = [
  { value: 'xp_boost', label: 'XP Readiness Boost', defaultPoints: 200 },
  { value: 'streak_shield', label: 'Missed-Day Streak Shield', defaultPoints: 150 },
  { value: 'custom_badge', label: 'Special Distinction Badge', defaultPoints: 300 },
  { value: 'mentor_note', label: 'Personal Mentor Note', defaultPoints: 50 },
];

export const AdminPanelView: React.FC<AdminPanelViewProps> = ({
  staffAccess,
  currentStaffUid,
  currentStaffName,
  globalUpdates,
  candidates,
  staffInvites,
  isRefreshingRoster,
  onRefreshRoster,
  onLookupCandidateById,
  onPublishGlobalUpdate,
  onTogglePinUpdate,
  onDeleteUpdate,
  onSetCandidateBan,
  onGrantBonus,
  onUpsertStaffInvite,
  onUpdateStaffInvite,
  onOpenVerifyModal,
}) => {
  const [adminSection, setAdminSection] = useState<
    'candidates' | 'updates' | 'team' | 'appeals'
  >('candidates');
  const [statusFeedback, setStatusFeedback] = useState<string>('');
  const [errorFeedback, setErrorFeedback] = useState<string>('');

  // Section 1: Global Updates Form
  const [updTitle, setUpdTitle] = useState('');
  const [updBody, setUpdBody] = useState('');
  const [updCategory, setUpdCategory] = useState<GlobalUpdateCategory>('exam_alert');
  const [updPinned, setUpdPinned] = useState(false);
  const [publishingUpdate, setPublishingUpdate] = useState(false);

  // Section 2: Candidate Profile, One-Click Outreach, Ban & Individual Bonus / XP Deduction State
  const [searchQuery, setSearchQuery] = useState('');
  const [directUidInput, setDirectUidInput] = useState('');
  const [inspectedCandidateUid, setInspectedCandidateUid] = useState<string | null>(
    candidates[0]?.ownerUid || null
  );
  const [customOutreachMessage, setCustomOutreachMessage] = useState<string>('');
  const [copiedOutreach, setCopiedOutreach] = useState<boolean>(false);

  const [selectedCandidateForBonus, setSelectedCandidateForBonus] =
    useState<CandidateSummaryDoc | null>(null);
  const [xpAdjustmentMode, setXpAdjustmentMode] = useState<'award' | 'deduct'>('award');
  const [bonusTitle, setBonusTitle] = useState('');
  const [bonusType, setBonusType] = useState<IndividualBonusType>('xp_boost');
  const [bonusPoints, setBonusPoints] = useState<number>(200);
  const [bonusMessage, setBonusMessage] = useState('');
  const [sendingBonus, setSendingBonus] = useState(false);

  const [selectedCandidateForBan, setSelectedCandidateForBan] =
    useState<CandidateSummaryDoc | null>(null);
  const [banReasonDraft, setBanReasonDraft] = useState('');
  const [savingBan, setSavingBan] = useState(false);

  // Section 3: Delegated Sub-Admin Form (Mandatory Gmail + Phone assigned by Super Admin)
  const [inviteEmail, setInviteEmail] = useState('');
  const [invitePhone, setInvitePhone] = useState('');
  const [inviteName, setInviteName] = useState('');
  const [permUpdates, setPermUpdates] = useState(true);
  const [permBonuses, setPermBonuses] = useState(false);
  const [permBans, setPermBans] = useState(false);
  const [savingInvite, setSavingInvite] = useState(false);

  // Section 4: Suspension Appeals (Super Admin Exclusive Unban Review)
  const [appeals, setAppeals] = useState<SuspensionAppealRecord[]>([]);
  const [loadingAppeals, setLoadingAppeals] = useState(false);
  const [appealDecisionNotes, setAppealDecisionNotes] = useState<Record<string, string>>({});
  const [decidingAppealId, setDecidingAppealId] = useState<string | null>(null);

  const senderAdminEmail = staffAccess.adminEmail || BOOTSTRAPPED_SUPER_ADMIN_EMAIL;
  const senderAdminPhone = staffAccess.adminPhone || '+91 98000 00001';

  const loadAppeals = useCallback(async () => {
    setLoadingAppeals(true);
    try {
      const list = await fetchSuspensionAppealsApi();
      setAppeals(list);
    } finally {
      setLoadingAppeals(false);
    }
  }, []);

  useEffect(() => {
    void loadAppeals();
  }, [loadAppeals]);

  const inspectedCandidate =
    candidates.find((c) => c.ownerUid === inspectedCandidateUid) || candidates[0] || null;

  useEffect(() => {
    if (!inspectedCandidate) {
      setCustomOutreachMessage('');
      return;
    }
    const generated = buildOneClickOutreachLinks({
      candidate: inspectedCandidate,
      adminName: currentStaffName,
      adminEmail: senderAdminEmail,
      adminPhone: senderAdminPhone,
    });
    setCustomOutreachMessage(generated.messageBody);
  }, [
    inspectedCandidate?.ownerUid,
    inspectedCandidate?.inactiveDays,
    inspectedCandidate?.xpPoints,
    currentStaffName,
    senderAdminEmail,
    senderAdminPhone,
  ]);

  const notifySuccess = (msg: string) => {
    setErrorFeedback('');
    setStatusFeedback(msg);
    setTimeout(() => setStatusFeedback(''), 4000);
  };

  const handleCreateUpdate = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffAccess.canPostUpdates) {
      setErrorFeedback('Your Sub-Admin role does not include Global Update permissions.');
      return;
    }
    if (!updTitle.trim() || !updBody.trim()) {
      setErrorFeedback('Please enter both an update headline and announcement message.');
      return;
    }
    setPublishingUpdate(true);
    setErrorFeedback('');
    try {
      await onPublishGlobalUpdate({
        title: updTitle.trim(),
        body: updBody.trim(),
        category: updCategory,
        pinned: updPinned,
      });
      setUpdTitle('');
      setUpdBody('');
      setUpdPinned(false);
      notifySuccess('Global update published to all candidates!');
    } catch (err) {
      setErrorFeedback(err instanceof Error ? err.message : 'Could not publish update.');
    } finally {
      setPublishingUpdate(false);
    }
  };

  const handleSubmitBonus = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedCandidateForBonus) return;
    if (!staffAccess.canGrantBonuses) {
      setErrorFeedback('Your Sub-Admin seat is restricted from adjusting candidate XP.');
      return;
    }
    const isDeduction = xpAdjustmentMode === 'deduct';
    const cleanPoints = Math.max(
      isDeduction ? 10 : 0,
      Math.min(5000, Math.round(Math.abs(Number(bonusPoints) || 0)))
    );

    if (!bonusTitle.trim() || !bonusMessage.trim()) {
      setErrorFeedback(
        isDeduction
          ? 'Please provide an infraction title and a clear message explaining why XP was deducted.'
          : 'Please provide a bonus title and personal encouragement note.'
      );
      return;
    }
    if (isDeduction && bonusMessage.trim().length < 8) {
      setErrorFeedback(
        'Provide a specific explanation (at least 8 characters) so the candidate understands why XP was deducted.'
      );
      return;
    }

    setSendingBonus(true);
    setErrorFeedback('');
    try {
      const effectiveBonusType: IndividualBonusType = isDeduction ? 'xp_deduction' : bonusType;
      await onGrantBonus({
        targetCandidate: selectedCandidateForBonus,
        bonusTitle: bonusTitle.trim(),
        bonusType: effectiveBonusType,
        pointsAwarded: cleanPoints,
        message: bonusMessage.trim(),
      });
      notifySuccess(
        isDeduction
          ? `XP deduction "${bonusTitle.trim()}" (-${cleanPoints} XP) recorded for ${selectedCandidateForBonus.displayName} with reason notice.`
          : `Special bonus "${bonusTitle.trim()}" (+${cleanPoints} XP) sent to ${selectedCandidateForBonus.displayName}!`
      );
      setSelectedCandidateForBonus(null);
      setBonusTitle('');
      setBonusMessage('');
    } catch (err) {
      setErrorFeedback(err instanceof Error ? err.message : 'Failed to adjust candidate XP.');
    } finally {
      setSendingBonus(false);
    }
  };

  const handleConfirmBanChange = async (target: CandidateSummaryDoc, nextBanned: boolean) => {
    if (!nextBanned && staffAccess.tier !== 'super_admin') {
      setErrorFeedback(
        'Suspended accounts can only be unbanned if the Super Admin agrees (via Super Admin review).'
      );
      return;
    }
    if (nextBanned && !staffAccess.canBanUsers) {
      setErrorFeedback('Your Sub-Admin seat does not have account suspension permissions.');
      return;
    }
    setSavingBan(true);
    setErrorFeedback('');
    try {
      await onSetCandidateBan(
        target.ownerUid,
        nextBanned,
        nextBanned
          ? banReasonDraft.trim() || 'Suspended under platform moderation guidelines.'
          : ''
      );
      notifySuccess(
        nextBanned
          ? `Account suspended for ${target.displayName} (restricted to Accountability FlexCard & Appeal Suspension).`
          : `Super Admin approved reinstatement for ${target.displayName}.`
      );
      setSelectedCandidateForBan(null);
      setBanReasonDraft('');
    } catch (err) {
      setErrorFeedback(err instanceof Error ? err.message : 'Could not update ban status.');
    } finally {
      setSavingBan(false);
    }
  };

  const handleDecideAppeal = async (
    appeal: SuspensionAppealRecord,
    decision: 'approved_unbanned' | 'rejected'
  ) => {
    if (staffAccess.tier !== 'super_admin') {
      setErrorFeedback('Only the Super Admin can approve or reject suspension appeals.');
      return;
    }
    setDecidingAppealId(appeal.id);
    setErrorFeedback('');
    try {
      const note = (appealDecisionNotes[appeal.id] || '').trim();
      const res = await decideSuspensionAppealApi({
        appealId: appeal.id,
        staffTier: staffAccess.tier,
        reviewerEmail: senderAdminEmail,
        decision,
        decisionNote: note,
      });
      if (res.error) {
        setErrorFeedback(res.error);
        return;
      }
      if (decision === 'approved_unbanned') {
        await onSetCandidateBan(appeal.ownerUid, false, '');
      }
      await loadAppeals();
      notifySuccess(
        decision === 'approved_unbanned'
          ? `Super Admin approved appeal and unbanned ${appeal.candidateName}.`
          : `Appeal from ${appeal.candidateName} marked as rejected.`
      );
    } catch (err) {
      setErrorFeedback(err instanceof Error ? err.message : 'Failed to process appeal decision.');
    } finally {
      setDecidingAppealId(null);
    }
  };

  const handleCreateSubAdmin = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!staffAccess.canManageAdmins) {
      setErrorFeedback('Only the Super Admin can add or modify Sub-Admin seats.');
      return;
    }
    const contactCheck = validateAdminContactAssignment(inviteEmail, invitePhone);
    if (!contactCheck.valid) {
      setErrorFeedback(
        contactCheck.error || 'Both Admin Gmail and Phone Number are required by Super Admin.'
      );
      return;
    }
    if (!inviteName.trim()) {
      setErrorFeedback('Please enter the admin’s full name or academic desk role.');
      return;
    }
    setSavingInvite(true);
    setErrorFeedback('');
    try {
      await onUpsertStaffInvite({
        targetEmail: contactCheck.normalizedEmail,
        adminPhone: contactCheck.normalizedPhone,
        displayName: inviteName.trim(),
        canPostUpdates: permUpdates,
        canGrantBonuses: permBonuses,
        canBanUsers: permBans,
      });
      setInviteEmail('');
      setInvitePhone('');
      setInviteName('');
      setPermUpdates(true);
      setPermBonuses(false);
      setPermBans(false);
      notifySuccess(
        `Authorized Sub-Admin ${contactCheck.normalizedEmail} (${contactCheck.normalizedPhone})!`
      );
    } catch (err) {
      setErrorFeedback(err instanceof Error ? err.message : 'Could not save Sub-Admin invite.');
    } finally {
      setSavingInvite(false);
    }
  };

  const applySubAdminPreset = (preset: 'updates_only' | 'rewards_mentor' | 'full_mod') => {
    if (preset === 'updates_only') {
      setPermUpdates(true);
      setPermBonuses(false);
      setPermBans(false);
    } else if (preset === 'rewards_mentor') {
      setPermUpdates(true);
      setPermBonuses(true);
      setPermBans(false);
    } else {
      setPermUpdates(true);
      setPermBonuses(true);
      setPermBans(true);
    }
  };

  const filteredCandidates = candidates.filter((c) => {
    const q = searchQuery.trim().toLowerCase();
    if (!q) return true;
    const candEmail = (c.contactEmail || c.email || '').toLowerCase();
    const candPhone = (c.phoneNumber || '').toLowerCase();
    return (
      candEmail.includes(q) ||
      candPhone.includes(q) ||
      c.displayName.toLowerCase().includes(q) ||
      c.boardOrUniversity.toLowerCase().includes(q) ||
      c.examName.toLowerCase().includes(q) ||
      c.ownerUid.toLowerCase().includes(q)
    );
  });

  const activeBansCount = candidates.filter((c) => c.banned).length;
  const decayingCandidatesCount = candidates.filter(
    (c) => (c.inactiveDays ?? 0) >= 3 || c.activeLearnerActive === false
  ).length;
  const activeStaffCount = staffInvites.filter((i) => i.status === 'active').length;

  const activeOutreachLinks = inspectedCandidate
    ? buildOneClickOutreachLinks({
        candidate: inspectedCandidate,
        adminName: currentStaffName,
        adminEmail: senderAdminEmail,
        adminPhone: senderAdminPhone,
        customMessage: customOutreachMessage,
      })
    : null;

  const handleCopyOutreachMessage = async () => {
    if (!activeOutreachLinks) return;
    try {
      await navigator.clipboard.writeText(activeOutreachLinks.messageBody);
    } catch {
      // Clipboard fallback ignored cleanly
    }
    setCopiedOutreach(true);
    setTimeout(() => setCopiedOutreach(false), 2200);
  };

  return (
    <div className="space-y-6">
      {/* Top Admin Command & Assigned Contact Identity Header */}
      <section className="glass-panel rounded-2xl p-6">
        <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-5">
          <div>
            <div className="flex flex-wrap items-center gap-2 text-xs font-semibold text-sky-700">
              <ShieldCheck className="h-4 w-4 shrink-0" />
              <span>
                {staffAccess.roleLabel}
                {staffAccess.isDemoPreview ? ' · Local Sandbox Preview' : ' · Live Cloud Control'}
              </span>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span className="font-mono text-slate-700">{senderAdminEmail}</span>
              <span aria-hidden="true" className="text-slate-300">·</span>
              <span className="font-mono text-slate-700">{senderAdminPhone}</span>
            </div>
            <h2 className="mt-1 font-display text-2xl font-bold text-slate-900">
              Candidate Profiles, One-Click Outreach &amp; Admin Governance
            </h2>
            <p className="mt-1 text-xs text-slate-600">
              Active Permissions:{' '}
              <strong className="text-slate-900">
                1-Click Gmail &amp; WhatsApp Outreach (Enabled for All Admins)
              </strong>{' '}
              ·{' '}
              <strong className="text-slate-900">
                Global Updates ({staffAccess.canPostUpdates ? 'Enabled' : 'Locked'})
              </strong>{' '}
              ·{' '}
              <strong className="text-slate-900">
                Bonuses ({staffAccess.canGrantBonuses ? 'Enabled' : 'Locked'})
              </strong>{' '}
              ·{' '}
              <strong className="text-slate-900">
                Bans ({staffAccess.canBanUsers ? 'Enabled' : 'Locked'})
              </strong>{' '}
              ·{' '}
              <strong className="text-slate-900">
                Sub-Admin Governance ({staffAccess.canManageAdmins ? 'Super Admin' : 'Locked'})
              </strong>
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-6 font-mono tabular-nums text-xs shrink-0">
            <div>
              <p className="text-slate-500">Candidates</p>
              <p className="text-lg font-bold text-slate-900">{candidates.length}</p>
            </div>
            <div>
              <p className="text-slate-500">Needs Check-In</p>
              <p className="text-lg font-bold text-amber-700">{decayingCandidatesCount}</p>
            </div>
            <div>
              <p className="text-slate-500">Updates</p>
              <p className="text-lg font-bold text-sky-700">{globalUpdates.length}</p>
            </div>
            <div>
              <p className="text-slate-500">Suspended</p>
              <p className="text-lg font-bold text-slate-900">{activeBansCount}</p>
            </div>
            <div>
              <p className="text-slate-500">Sub-Admins</p>
              <p className="text-lg font-bold text-slate-900">{activeStaffCount}</p>
            </div>
          </div>
        </div>

        {/* Sub-Navigation */}
        <div className="mt-4 flex flex-wrap items-center justify-between gap-3">
          <div className="flex flex-wrap items-center gap-1 rounded-xl bg-slate-100 p-1">
            <button
              type="button"
              onClick={() => setAdminSection('candidates')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                adminSection === 'candidates'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Users className="h-3.5 w-3.5 text-sky-600" />
              <span>01. Candidate Profiles &amp; 1-Click Outreach</span>
            </button>

            <button
              type="button"
              onClick={() => setAdminSection('updates')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                adminSection === 'updates'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Bell className="h-3.5 w-3.5 text-sky-600" />
              <span>02. Broadcast Updates</span>
            </button>

            <button
              type="button"
              onClick={() => setAdminSection('team')}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                adminSection === 'team'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <UserPlus className="h-3.5 w-3.5 text-sky-600" />
              <span>03. Delegated Admin Team</span>
            </button>

            <button
              type="button"
              onClick={() => {
                setAdminSection('appeals');
                void loadAppeals();
              }}
              className={`inline-flex items-center gap-1.5 rounded-lg px-3.5 py-2 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                adminSection === 'appeals'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Scale className="h-3.5 w-3.5 text-sky-600" />
              <span>
                04. Suspension Appeals (
                {appeals.filter((a) => a.status === 'pending_super_admin').length})
              </span>
            </button>
          </div>

          <div className="flex flex-wrap items-center gap-2 shrink-0">
            {onOpenVerifyModal && (
              <button
                type="button"
                onClick={() => onOpenVerifyModal()}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 whitespace-nowrap shrink-0"
              >
                <FileCheck2 className="h-3.5 w-3.5 text-sky-600" />
                <span>Silent Serial Verify</span>
              </button>
            )}

            <button
              type="button"
              disabled={isRefreshingRoster}
              onClick={async () => {
                await onRefreshRoster();
                await loadAppeals();
              }}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 text-sky-600 ${isRefreshingRoster ? 'animate-spin' : ''}`}
              />
              <span>Refresh Cloud Data</span>
            </button>
          </div>
        </div>

        {statusFeedback && (
          <div
            role="status"
            className="mt-4 rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-2.5 text-xs font-semibold text-emerald-800 inline-flex items-center gap-1.5"
          >
            <CheckCircle2 className="h-4 w-4 shrink-0" />
            <span>{statusFeedback}</span>
          </div>
        )}

        {errorFeedback && (
          <div
            role="alert"
            className="mt-4 rounded-xl border border-red-200 bg-red-50 px-4 py-2.5 text-xs font-semibold text-red-800"
          >
            ✕ {errorFeedback}
          </div>
        )}
      </section>

      {/* SECTION 01: FULL CANDIDATE PROFILES, ONE-CLICK GMAIL/WHATSAPP OUTREACH, BONUSES & BANS */}
      {adminSection === 'candidates' && (
        <div className="space-y-6">
          {/* Selected Candidate Full Academic Profile & Ready One-Click Outreach Panel */}
          {inspectedCandidate && activeOutreachLinks && (
            <section
              aria-label={`Full candidate profile and outreach for ${inspectedCandidate.displayName}`}
              className="glass-panel rounded-2xl p-6 space-y-5"
            >
              <div className="flex flex-col lg:flex-row lg:items-start justify-between gap-4 border-b border-slate-200 pb-4">
                <div className="flex items-start gap-3.5">
                  {inspectedCandidate.avatarUrl && (
                    <img
                      src={inspectedCandidate.avatarUrl}
                      alt={`${inspectedCandidate.displayName} profile portrait`}
                      referrerPolicy="no-referrer"
                      onError={(e) => {
                        e.currentTarget.style.display = 'none';
                      }}
                      className="h-12 w-12 shrink-0 rounded-full border border-slate-200 object-cover mt-0.5"
                    />
                  )}
                  <div className="space-y-1">
                    <div className="flex flex-wrap items-center gap-2 text-xs text-slate-600">
                      <span className="font-semibold text-sky-700">Selected Candidate Profile</span>
                      <span aria-hidden="true">·</span>
                      <span className="font-mono">ID: {inspectedCandidate.ownerUid}</span>
                      <span aria-hidden="true">·</span>
                      <span>
                        {(inspectedCandidate.inactiveDays ?? 0) >= 3 ||
                        inspectedCandidate.activeLearnerActive === false ? (
                          <strong className="text-amber-700">
                            ▲ {inspectedCandidate.inactiveDays ?? 3}d Inactive · Active Learner Dissolved
                          </strong>
                        ) : (
                          <strong className="text-emerald-700">
                            ✓ Active Learner ({inspectedCandidate.inactiveDays ?? 0}d since session)
                          </strong>
                        )}
                      </span>
                    </div>
                    <h3 className="font-display text-xl font-bold text-slate-900">
                      {inspectedCandidate.displayName} · {inspectedCandidate.examName}
                    </h3>
                    <div className="flex flex-wrap items-center gap-3 text-xs text-slate-700 pt-0.5">
                      <span className="inline-flex items-center gap-1 font-mono">
                        <Mail className="h-3.5 w-3.5 text-sky-600 shrink-0" />
                        {inspectedCandidate.contactEmail || inspectedCandidate.email || 'No Gmail provided'}
                      </span>
                      <span aria-hidden="true" className="text-slate-300">·</span>
                      <span className="inline-flex items-center gap-1 font-mono">
                        <Phone className="h-3.5 w-3.5 text-emerald-600 shrink-0" />
                        {inspectedCandidate.phoneNumber || 'No WhatsApp phone provided'}
                      </span>
                      <span aria-hidden="true" className="text-slate-300">·</span>
                      <span>
                        Consent: Gmail{' '}
                        <strong>{inspectedCandidate.notifyGmailOptIn !== false ? 'Opted In' : 'Paused'}</strong>{' '}
                        / WhatsApp{' '}
                        <strong>{inspectedCandidate.notifyWhatsappOptIn !== false ? 'Opted In' : 'Paused'}</strong>
                      </span>
                    </div>
                  </div>
                </div>

                <div className="grid grid-cols-2 sm:grid-cols-4 gap-4 font-mono tabular-nums text-xs shrink-0">
                  <div>
                    <p className="text-slate-500">Board / Univ</p>
                    <p className="font-sans font-semibold text-slate-900 truncate max-w-[140px]">
                      {inspectedCandidate.boardOrUniversity}
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Readiness &amp; /10</p>
                    <p className="font-bold text-slate-900">
                      {inspectedCandidate.readinessPercent}% · {inspectedCandidate.overallRatingOutOf10}/10
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">Chapters &amp; Focus</p>
                    <p className="font-bold text-slate-900">
                      {inspectedCandidate.completedChapters}/{inspectedCandidate.totalChapters} ·{' '}
                      {inspectedCandidate.focusMinutesLogged}m
                    </p>
                  </div>
                  <div>
                    <p className="text-slate-500">XP &amp; FlexCard</p>
                    <p className="font-bold text-sky-700">
                      {inspectedCandidate.xpPoints ?? 0} XP ·{' '}
                      {inspectedCandidate.flexTier ||
                        resolveFlexRarityTier(inspectedCandidate.xpPoints ?? 0).tier}
                    </p>
                  </div>
                </div>
              </div>

              {/* Academic Badges & Priority Syllabus Places + Ready 1-Click Outreach */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
                <div className="lg:col-span-5 space-y-4 text-xs">
                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2">
                    <p className="font-semibold text-slate-900">
                      Academic &amp; Schedule Details
                    </p>
                    <p className="text-slate-600">
                      Target Exam Date:{' '}
                      <span className="font-mono font-semibold text-slate-900">
                        {inspectedCandidate.examDate || 'Not set'}
                      </span>{' '}
                      · Daily Budget:{' '}
                      <span className="font-mono font-semibold text-slate-900">
                        {inspectedCandidate.dailyStudyHours ?? 4.5} hrs/day
                      </span>{' '}
                      · Timed Tests:{' '}
                      <span className="font-mono font-semibold text-slate-900">
                        {inspectedCandidate.attemptsCount}
                      </span>
                    </p>
                    <p className="text-slate-600">
                      Active Achievements:{' '}
                      <strong className="text-slate-900">
                        {inspectedCandidate.unlockedBadges && inspectedCandidate.unlockedBadges.length > 0
                          ? inspectedCandidate.unlockedBadges.join(' · ')
                          : 'None unlocked yet'}
                      </strong>
                    </p>
                  </div>

                  <div className="rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2">
                    <p className="font-semibold text-slate-900">
                      Needed Syllabus Places to Review Next
                    </p>
                    {inspectedCandidate.weakTopics && inspectedCandidate.weakTopics.length > 0 ? (
                      <ul className="space-y-1.5 text-slate-700">
                        {inspectedCandidate.weakTopics.map((topicLine, idx) => (
                          <li key={idx} className="leading-relaxed">
                            <span className="font-mono font-semibold text-sky-700">
                              0{idx + 1}.
                            </span>{' '}
                            {topicLine}
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="text-slate-500">
                        High-yield PYQ chapters and daily compressed timed assessment queue.
                      </p>
                    )}
                  </div>
                </div>

                {/* One-Click Ready Outreach Composer (Available to ALL Admins) */}
                <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-white p-4 space-y-3">
                  <div className="flex flex-wrap items-center justify-between gap-2">
                    <div>
                      <p className="text-xs font-bold text-slate-900 inline-flex items-center gap-1.5">
                        <MessageSquare className="h-3.5 w-3.5 text-sky-600 shrink-0" />
                        <span>
                          One-Click Ready Message (Achievements &amp; Priority Syllabus Places)
                        </span>
                      </p>
                      <p className="text-[11px] text-slate-500">
                        Pre-filled with {inspectedCandidate.displayName}’s XP/achievement status and
                        signed with your admin Gmail ({senderAdminEmail}) &amp; phone ({senderAdminPhone}).
                      </p>
                    </div>

                    <button
                      type="button"
                      onClick={() => {
                        const fresh = buildOneClickOutreachLinks({
                          candidate: inspectedCandidate,
                          adminName: currentStaffName,
                          adminEmail: senderAdminEmail,
                          adminPhone: senderAdminPhone,
                        });
                        setCustomOutreachMessage(fresh.messageBody);
                      }}
                      className="text-xs font-semibold text-sky-700 hover:underline whitespace-nowrap shrink-0"
                    >
                      Reset Default Template
                    </button>
                  </div>

                  <label htmlFor="admin-ready-outreach-textarea" className="sr-only">
                    Ready outreach message for {inspectedCandidate.displayName}
                  </label>
                  <textarea
                    id="admin-ready-outreach-textarea"
                    rows={8}
                    value={customOutreachMessage}
                    onChange={(e) => setCustomOutreachMessage(e.target.value)}
                    className="w-full rounded-lg border border-slate-300 bg-slate-50/50 p-3 text-xs text-slate-900 leading-relaxed focus:border-sky-600 focus:bg-white focus:outline-hidden"
                  />

                  <div className="flex flex-wrap items-center justify-between gap-3 pt-1">
                    <button
                      type="button"
                      onClick={handleCopyOutreachMessage}
                      className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap shrink-0"
                    >
                      {copiedOutreach ? (
                        <>
                          <Check className="h-3.5 w-3.5 text-emerald-600" />
                          <span>Copied Message</span>
                        </>
                      ) : (
                        <>
                          <Copy className="h-3.5 w-3.5" />
                          <span>Copy Message</span>
                        </>
                      )}
                    </button>

                    <div className="flex flex-wrap items-center gap-2.5">
                      {activeOutreachLinks.recipientEmail ? (
                        <a
                          href={activeOutreachLinks.gmailComposeUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0"
                        >
                          <Mail className="h-3.5 w-3.5 text-sky-400" />
                          <span>Send on Gmail (1-Click)</span>
                          <ExternalLink className="h-3 w-3 opacity-80" />
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">No candidate Gmail</span>
                      )}

                      {activeOutreachLinks.whatsappUrl ? (
                        <a
                          href={activeOutreachLinks.whatsappUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-700 whitespace-nowrap shrink-0"
                        >
                          <Phone className="h-3.5 w-3.5" />
                          <span>Send on WhatsApp (1-Click)</span>
                          <ExternalLink className="h-3 w-3 opacity-80" />
                        </a>
                      ) : (
                        <span className="text-xs text-slate-400">No WhatsApp number</span>
                      )}
                    </div>
                  </div>
                </div>
              </div>
            </section>
          )}

          {/* Individual Bonus & XP Deduction Composer Drawer */}
          {selectedCandidateForBonus && (
            <section className="glass-panel rounded-2xl p-6 space-y-4">
              <div className="flex flex-wrap items-center justify-between gap-4 border-b border-slate-200 pb-3">
                <div>
                  <p
                    className={`text-xs font-semibold ${
                      xpAdjustmentMode === 'deduct' ? 'text-amber-800' : 'text-emerald-700'
                    }`}
                  >
                    {xpAdjustmentMode === 'deduct'
                      ? 'Conduct XP Deduction (Candidate Receives Reason & 40% Ethics Recovery Option)'
                      : 'Individual Candidate XP Reward'}
                  </p>
                  <h3 className="font-display text-lg font-bold text-slate-900">
                    {xpAdjustmentMode === 'deduct'
                      ? `Deduct XP from ${selectedCandidateForBonus.displayName}`
                      : `Grant Special Bonus to ${selectedCandidateForBonus.displayName}`}
                  </h3>
                </div>

                <div className="flex items-center gap-3">
                  <div
                    role="group"
                    aria-label="XP adjustment mode"
                    className="flex items-center gap-1 rounded-lg bg-slate-100 p-1"
                  >
                    <button
                      type="button"
                      onClick={() => {
                        setXpAdjustmentMode('award');
                        setBonusPoints(200);
                      }}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        xpAdjustmentMode === 'award'
                          ? 'bg-white text-emerald-800 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Award Bonus (+XP)
                    </button>
                    <button
                      type="button"
                      onClick={() => {
                        setXpAdjustmentMode('deduct');
                        setBonusPoints(100);
                      }}
                      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                        xpAdjustmentMode === 'deduct'
                          ? 'bg-white text-amber-900 shadow-2xs'
                          : 'text-slate-600 hover:text-slate-900'
                      }`}
                    >
                      Deduct XP (-XP)
                    </button>
                  </div>

                  <button
                    type="button"
                    onClick={() => setSelectedCandidateForBonus(null)}
                    className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                  >
                    Cancel
                  </button>
                </div>
              </div>

              <form onSubmit={handleSubmitBonus} className="grid grid-cols-1 md:grid-cols-12 gap-4">
                {xpAdjustmentMode === 'award' ? (
                  <div className="md:col-span-4">
                    <label
                      htmlFor="bonus-type-select"
                      className="block text-xs font-semibold text-slate-700 mb-1.5"
                    >
                      Special Bonus Type
                    </label>
                    <select
                      id="bonus-type-select"
                      value={bonusType}
                      onChange={(e) => {
                        const val = e.target.value as IndividualBonusType;
                        setBonusType(val);
                        const found = BONUS_TYPES.find((b) => b.value === val);
                        if (found) setBonusPoints(found.defaultPoints);
                      }}
                      className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-sky-600 focus:outline-hidden"
                    >
                      {BONUS_TYPES.map((b) => (
                        <option key={b.value} value={b.value}>
                          {b.label}
                        </option>
                      ))}
                    </select>
                  </div>
                ) : (
                  <div className="md:col-span-4">
                    <span className="block text-xs font-semibold text-slate-700 mb-1.5">
                      Moderation Category
                    </span>
                    <div className="rounded-lg border border-amber-200 bg-amber-50/70 px-3 py-2 text-xs font-medium text-amber-900">
                      Minor Conduct / Integrity XP Deduction
                    </div>
                  </div>
                )}

                <div className="md:col-span-5">
                  <label
                    htmlFor="bonus-title-input"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    {xpAdjustmentMode === 'deduct'
                      ? 'Infraction Summary Title'
                      : 'Bonus / Badge Title'}
                  </label>
                  <input
                    id="bonus-title-input"
                    type="text"
                    maxLength={100}
                    value={bonusTitle}
                    onChange={(e) => setBonusTitle(e.target.value)}
                    placeholder={
                      xpAdjustmentMode === 'deduct'
                        ? 'e.g., Rapid Unread Tab-Guessing in Timed PYQ Drill'
                        : 'e.g., Dean’s High-Velocity Scholar Bonus'
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-hidden"
                  />
                </div>

                <div className="md:col-span-3">
                  <label
                    htmlFor="bonus-points-input"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    {xpAdjustmentMode === 'deduct'
                      ? 'XP to Deduct (10–5000)'
                      : 'Bonus XP (0–5000)'}
                  </label>
                  <input
                    id="bonus-points-input"
                    type="number"
                    min={xpAdjustmentMode === 'deduct' ? 10 : 0}
                    max={5000}
                    step={25}
                    value={bonusPoints}
                    onChange={(e) => setBonusPoints(Number(e.target.value))}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono tabular-nums text-xs text-slate-900 focus:border-sky-600 focus:outline-hidden"
                  />
                </div>

                <div className="md:col-span-9">
                  <label
                    htmlFor="bonus-message-input"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    {xpAdjustmentMode === 'deduct'
                      ? `Reason Why XP Was Deducted (Sent to ${selectedCandidateForBonus.displayName})`
                      : `Personal Citation / Note to ${selectedCandidateForBonus.displayName}`}
                  </label>
                  <input
                    id="bonus-message-input"
                    type="text"
                    maxLength={500}
                    value={bonusMessage}
                    onChange={(e) => setBonusMessage(e.target.value)}
                    placeholder={
                      xpAdjustmentMode === 'deduct'
                        ? 'Explain clearly what happened and why XP was deducted (candidate can recover 40% via the AI Ethics module).'
                        : 'e.g., Awarded +200 XP toward your next Rare FlexCard tier!'
                    }
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-hidden"
                  />
                </div>

                <div className="md:col-span-3 flex items-end">
                  <button
                    type="submit"
                    disabled={sendingBonus}
                    className={`w-full inline-flex items-center justify-center gap-1.5 rounded-xl px-4 py-2 text-xs font-semibold text-white transition-colors disabled:opacity-50 whitespace-nowrap ${
                      xpAdjustmentMode === 'deduct'
                        ? 'bg-amber-700 hover:bg-amber-800'
                        : 'bg-emerald-600 hover:bg-emerald-700'
                    }`}
                  >
                    {xpAdjustmentMode === 'deduct' ? (
                      <MinusCircle className="h-3.5 w-3.5" />
                    ) : (
                      <Gift className="h-3.5 w-3.5" />
                    )}
                    <span>
                      {sendingBonus
                        ? 'Saving...'
                        : xpAdjustmentMode === 'deduct'
                        ? 'Apply XP Deduction'
                        : 'Send Individual Bonus'}
                    </span>
                  </button>
                </div>
              </form>
            </section>
          )}

          {/* Ban Confirmation Panel */}
          {selectedCandidateForBan && (
            <section className="glass-panel rounded-2xl p-6">
              <div className="flex items-center justify-between gap-4 border-b border-slate-200 pb-3">
                <div>
                  <p className="text-xs font-semibold text-red-700">Account Moderation</p>
                  <h3 className="font-display text-lg font-bold text-slate-900">
                    Suspend Account: {selectedCandidateForBan.displayName}
                  </h3>
                </div>
                <button
                  type="button"
                  onClick={() => setSelectedCandidateForBan(null)}
                  className="text-xs font-semibold text-slate-600 hover:text-slate-900"
                >
                  Cancel
                </button>
              </div>

              <div className="mt-4 flex flex-col sm:flex-row sm:items-end gap-3">
                <div className="flex-1">
                  <label
                    htmlFor="ban-reason-input"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Suspension Reason (Shown on Candidate Lock Screen)
                  </label>
                  <input
                    id="ban-reason-input"
                    type="text"
                    maxLength={240}
                    value={banReasonDraft}
                    onChange={(e) => setBanReasonDraft(e.target.value)}
                    placeholder="e.g., Automated test script abuse or academic misconduct"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-red-600 focus:outline-hidden"
                  />
                </div>
                <button
                  type="button"
                  disabled={savingBan}
                  onClick={() => handleConfirmBanChange(selectedCandidateForBan, true)}
                  className="inline-flex items-center gap-1.5 rounded-xl bg-red-600 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-red-700 disabled:opacity-50 whitespace-nowrap shrink-0"
                >
                  <Ban className="h-3.5 w-3.5" />
                  <span>{savingBan ? 'Suspending...' : 'Confirm Account Ban'}</span>
                </button>
              </div>
            </section>
          )}

          {/* Candidate Directory Table */}
          <section className="glass-panel rounded-2xl p-6">
            <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 border-b border-slate-200 pb-4">
              <div>
                <h3 className="font-display text-lg font-bold text-slate-900">
                  Complete Candidate Academic, Contact &amp; Achievement Directory
                </h3>
                <p className="mt-0.5 text-xs text-slate-600">
                  All authorized admins can inspect candidate academic stats, Gmail, WhatsApp phone,
                  XP/FlexCard status, and send 1-click ready outreach messages.
                </p>
              </div>

              <div className="flex flex-wrap items-center gap-2">
                <div className="relative">
                  <Search className="h-3.5 w-3.5 text-slate-400 absolute left-3 top-2.5" />
                  <label htmlFor="candidate-search-input" className="sr-only">
                    Filter candidates by name, Gmail, phone, or ID
                  </label>
                  <input
                    id="candidate-search-input"
                    type="text"
                    value={searchQuery}
                    onChange={(e) => setSearchQuery(e.target.value)}
                    placeholder="Filter name, Gmail, phone, exam..."
                    className="rounded-lg border border-slate-300 bg-white pl-8 pr-3 py-1.5 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-hidden"
                  />
                </div>

                <form
                  onSubmit={async (e) => {
                    e.preventDefault();
                    if (!directUidInput.trim()) return;
                    await onLookupCandidateById(directUidInput.trim());
                    setDirectUidInput('');
                  }}
                  className="flex items-center gap-1.5"
                >
                  <label htmlFor="direct-uid-lookup" className="sr-only">
                    Lookup Candidate by UID
                  </label>
                  <input
                    id="direct-uid-lookup"
                    type="text"
                    value={directUidInput}
                    onChange={(e) => setDirectUidInput(e.target.value)}
                    placeholder="Lookup UID..."
                    className="w-32 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 font-mono text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-hidden"
                  />
                  <button
                    type="submit"
                    className="rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                  >
                    Lookup
                  </button>
                </form>
              </div>
            </div>

            {filteredCandidates.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500">
                No candidates match your filter yet.
              </div>
            ) : (
              <div className="mt-4 overflow-x-auto">
                <table className="w-full text-left border-collapse">
                  <thead>
                    <tr className="border-b border-slate-200 text-xs font-semibold text-slate-500">
                      <th className="py-2.5 pr-3 whitespace-nowrap">Candidate · Gmail &amp; Phone</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">Academic Curriculum</th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap">Readiness</th>
                      <th className="py-2.5 px-3 text-right whitespace-nowrap">XP &amp; Tier</th>
                      <th className="py-2.5 px-3 whitespace-nowrap">Activity Pulse</th>
                      <th className="py-2.5 pl-3 text-right whitespace-nowrap">
                        Outreach &amp; Actions
                      </th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-slate-100 text-xs">
                    {filteredCandidates.map((cand) => {
                      const isSelected = inspectedCandidate?.ownerUid === cand.ownerUid;
                      const isDecaying =
                        (cand.inactiveDays ?? 0) >= 3 || cand.activeLearnerActive === false;
                      const candEmail = cand.contactEmail || cand.email || 'Pending Gmail';
                      const candPhone = cand.phoneNumber || 'Pending Phone';

                      return (
                        <tr
                          key={cand.ownerUid}
                          className={`transition-colors ${
                            isSelected ? 'bg-sky-50/50' : 'hover:bg-slate-50/80'
                          }`}
                        >
                          <td className="py-3 pr-3">
                            <p className="font-semibold text-slate-900">{cand.displayName}</p>
                            <p className="font-mono text-[11px] text-sky-800">{candEmail}</p>
                            <p className="font-mono text-[11px] text-slate-600">
                              {candPhone} · ID: {cand.ownerUid}
                            </p>
                          </td>
                          <td className="py-3 px-3 text-slate-700">
                            <p className="font-medium text-slate-900">
                              {cand.boardOrUniversity || 'Onboarding'}
                            </p>
                            <p className="text-[11px] text-slate-500">
                              {cand.examName} · {cand.completedChapters}/{cand.totalChapters} ch
                            </p>
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                            <p className="font-bold text-slate-900">{cand.readinessPercent}%</p>
                            <p className="text-[11px] text-slate-500">
                              {cand.attemptsCount > 0
                                ? `${cand.overallRatingOutOf10}/10`
                                : '—/10'}
                            </p>
                          </td>
                          <td className="py-3 px-3 text-right font-mono tabular-nums whitespace-nowrap">
                            <p className="font-bold text-sky-700">{cand.xpPoints ?? 0} XP</p>
                            <p className="font-sans text-[11px] text-slate-600">
                              {cand.flexTier || resolveFlexRarityTier(cand.xpPoints ?? 0).tier}
                            </p>
                          </td>
                          <td className="py-3 px-3 whitespace-nowrap">
                            {cand.banned ? (
                              <span className="font-semibold text-red-700">Suspended</span>
                            ) : isDecaying ? (
                              <span className="font-semibold text-amber-700">
                                ▲ {cand.inactiveDays ?? 3}d Inactive (Decaying)
                              </span>
                            ) : (
                              <span className="font-semibold text-emerald-700">
                                ✓ Active ({cand.inactiveDays ?? 0}d)
                              </span>
                            )}
                          </td>
                          <td className="py-3 pl-3 text-right">
                            <div className="inline-flex items-center justify-end gap-2">
                              <button
                                type="button"
                                onClick={() => setInspectedCandidateUid(cand.ownerUid)}
                                className={`inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                                  isSelected
                                    ? 'border-slate-900 bg-slate-900 text-white'
                                    : 'border-slate-300 bg-white text-slate-800 hover:bg-slate-50'
                                }`}
                              >
                                <MessageSquare className="h-3.5 w-3.5" />
                                <span>{isSelected ? 'Viewing Profile' : 'Profile & Notify'}</span>
                              </button>

                              <button
                                type="button"
                                disabled={!staffAccess.canGrantBonuses}
                                aria-label={`Adjust XP for ${cand.displayName}`}
                                onClick={() => {
                                  setSelectedCandidateForBan(null);
                                  setXpAdjustmentMode('award');
                                  setSelectedCandidateForBonus(cand);
                                }}
                                className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 bg-emerald-50/80 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-100 disabled:opacity-40 whitespace-nowrap shrink-0"
                              >
                                <Gift className="h-3.5 w-3.5" />
                                <span>XP +/-</span>
                              </button>

                              {cand.banned ? (
                                <button
                                  type="button"
                                  disabled={staffAccess.tier !== 'super_admin' || savingBan}
                                  title={
                                    staffAccess.tier !== 'super_admin'
                                      ? 'Accounts are only unbanned if the Super Admin agrees'
                                      : undefined
                                  }
                                  aria-label={`Unban ${cand.displayName}`}
                                  onClick={() => handleConfirmBanChange(cand, false)}
                                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap shrink-0"
                                >
                                  <UserCheck className="h-3.5 w-3.5 text-emerald-600" />
                                  <span>
                                    {staffAccess.tier === 'super_admin'
                                      ? 'Unban'
                                      : 'Super Admin Only'}
                                  </span>
                                </button>
                              ) : (
                                <button
                                  type="button"
                                  disabled={!staffAccess.canBanUsers}
                                  aria-label={`Ban ${cand.displayName}`}
                                  onClick={() => {
                                    setSelectedCandidateForBonus(null);
                                    setSelectedCandidateForBan(cand);
                                  }}
                                  className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50/80 px-2.5 py-1.5 text-xs font-semibold text-red-800 hover:bg-red-100 disabled:opacity-40 whitespace-nowrap shrink-0"
                                >
                                  <Ban className="h-3.5 w-3.5" />
                                  <span>Ban</span>
                                </button>
                              )}
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </section>
        </div>
      )}

      {/* SECTION 02: BROADCAST GLOBAL UPDATES FOR EVERYONE */}
      {adminSection === 'updates' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <section className="lg:col-span-5 glass-panel rounded-2xl p-6">
            <h3 className="font-display text-lg font-bold text-slate-900">
              Publish Small Update for Everyone
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              Broadcast exam alerts, syllabus updates, PYQ tips, or platform news to every candidate’s
              workspace immediately.
            </p>

            {!staffAccess.canPostUpdates ? (
              <div className="mt-4 glass-inset rounded-xl p-4 text-xs text-slate-600 flex items-center gap-2">
                <Lock className="h-4 w-4 text-slate-400 shrink-0" />
                <span>Your limited Sub-Admin seat has read-only access to Global Updates.</span>
              </div>
            ) : (
              <form onSubmit={handleCreateUpdate} className="mt-4 space-y-4">
                <div>
                  <label
                    htmlFor="admin-update-category"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Update Category
                  </label>
                  <select
                    id="admin-update-category"
                    value={updCategory}
                    onChange={(e) => setUpdCategory(e.target.value as GlobalUpdateCategory)}
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-sky-600 focus:outline-hidden"
                  >
                    {UPDATE_CATEGORIES.map((c) => (
                      <option key={c.value} value={c.value}>
                        {c.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div>
                  <label
                    htmlFor="admin-update-title"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Update Headline
                  </label>
                  <input
                    id="admin-update-title"
                    type="text"
                    maxLength={120}
                    value={updTitle}
                    onChange={(e) => setUpdTitle(e.target.value)}
                    placeholder="e.g., Weekend High-Yield Physics PYQ Challenge Live"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label
                    htmlFor="admin-update-body"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Update Details (Shown to All Students)
                  </label>
                  <textarea
                    id="admin-update-body"
                    rows={4}
                    maxLength={800}
                    value={updBody}
                    onChange={(e) => setUpdBody(e.target.value)}
                    placeholder="Write a clear, helpful announcement related to exams, new question sets, or platform updates..."
                    className="w-full rounded-lg border border-slate-300 bg-white p-3 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-hidden"
                  />
                </div>

                <label className="flex items-center gap-2 text-xs font-medium text-slate-700 cursor-pointer">
                  <input
                    type="checkbox"
                    checked={updPinned}
                    onChange={(e) => setUpdPinned(e.target.checked)}
                    className="rounded border-slate-300 accent-sky-600"
                  />
                  <span>Pin this update to the top of student dashboards</span>
                </label>

                <button
                  type="submit"
                  disabled={publishingUpdate}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-sky-600 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-sky-700 disabled:opacity-50 whitespace-nowrap"
                >
                  <Plus className="h-4 w-4" />
                  <span>{publishingUpdate ? 'Publishing...' : 'Publish Global Update'}</span>
                </button>
              </form>
            )}
          </section>

          <section className="lg:col-span-7 glass-panel rounded-2xl p-6">
            <h3 className="font-display text-lg font-bold text-slate-900">
              Active Global Updates Feed ({globalUpdates.length})
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              Super Admins can pin or remove any update; Updates Sub-Admins can manage updates they
              authored.
            </p>

            <div className="mt-4 divide-y divide-slate-200">
              {globalUpdates.map((upd) => {
                const canModifyThis =
                  staffAccess.tier === 'super_admin' ||
                  (staffAccess.canPostUpdates && upd.authorUid === currentStaffUid);

                return (
                  <article key={upd.id} className="py-4 first:pt-1 space-y-1.5">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex flex-wrap items-center gap-1.5 text-slate-500">
                        {upd.pinned && (
                          <>
                            <span className="font-semibold text-sky-700 inline-flex items-center gap-1">
                              <Pin className="h-3 w-3" />
                              Pinned
                            </span>
                            <span aria-hidden="true">·</span>
                          </>
                        )}
                        <span className="font-medium text-slate-800">{upd.category}</span>
                        <span aria-hidden="true">·</span>
                        <span>
                          {upd.authorName} ({upd.authorRoleLabel})
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">{upd.createdAt.slice(0, 10)}</span>
                      </div>

                      {canModifyThis && (
                        <div className="flex items-center gap-2">
                          <button
                            type="button"
                            aria-label={`${upd.pinned ? 'Unpin' : 'Pin'} update ${upd.title}`}
                            onClick={() => onTogglePinUpdate(upd.id, !upd.pinned)}
                            className="text-xs font-semibold text-sky-700 hover:underline whitespace-nowrap"
                          >
                            {upd.pinned ? 'Unpin' : 'Pin'}
                          </button>
                          <button
                            type="button"
                            aria-label={`Delete update ${upd.title}`}
                            onClick={() => onDeleteUpdate(upd.id)}
                            className="inline-flex items-center gap-1 text-xs font-semibold text-red-700 hover:underline whitespace-nowrap"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            <span>Delete</span>
                          </button>
                        </div>
                      )}
                    </div>

                    <h4 className="font-display text-sm font-bold text-slate-900">{upd.title}</h4>
                    <p className="text-xs text-slate-600 leading-relaxed">{upd.body}</p>
                  </article>
                );
              })}
            </div>
          </section>
        </div>
      )}

      {/* SECTION 03: DELEGATED SUB-ADMIN TEAM WITH MANDATORY GMAIL & PHONE ASSIGNED BY SUPER ADMIN */}
      {adminSection === 'team' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          <section className="lg:col-span-5 glass-panel rounded-2xl p-6">
            <h3 className="font-display text-lg font-bold text-slate-900">
              Assign Admin Gmail &amp; Phone Number (Super Admin)
            </h3>
            <p className="mt-1 text-xs text-slate-600 leading-relaxed">
              Primary Super Admin is{' '}
              <span className="font-mono font-semibold text-slate-900">
                {BOOTSTRAPPED_SUPER_ADMIN_EMAIL}
              </span>
              . Every authorized admin must have both a verified{' '}
              <strong className="text-slate-900">Gmail address</strong> and{' '}
              <strong className="text-slate-900">Phone / WhatsApp number</strong> assigned by the
              Super Admin for 1-click candidate outreach.
            </p>

            {!staffAccess.canManageAdmins ? (
              <div className="mt-4 glass-inset rounded-xl p-4 text-xs text-slate-600 space-y-1.5">
                <p className="font-semibold text-slate-900 inline-flex items-center gap-1.5">
                  <Lock className="h-4 w-4 text-slate-500" />
                  <span>Super Admin Exclusive Governance</span>
                </p>
                <p>
                  You are signed in as a Delegated Admin ({senderAdminEmail} · {senderAdminPhone}).
                  Only Primary Super Admin (<span className="font-mono">{BOOTSTRAPPED_SUPER_ADMIN_EMAIL}</span>)
                  can register or modify admin Gmail &amp; phone assignments.
                </p>
              </div>
            ) : (
              <form onSubmit={handleCreateSubAdmin} className="mt-4 space-y-4">
                <div>
                  <span className="block text-xs font-semibold text-slate-700 mb-1.5">
                    Minimal-to-Maximum Role Presets
                  </span>
                  <div className="flex flex-wrap gap-1.5">
                    <button
                      type="button"
                      onClick={() => applySubAdminPreset('updates_only')}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                    >
                      Minimal Admin (Updates + Outreach)
                    </button>
                    <button
                      type="button"
                      onClick={() => applySubAdminPreset('rewards_mentor')}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                    >
                      Updates + Bonuses + Outreach
                    </button>
                    <button
                      type="button"
                      onClick={() => applySubAdminPreset('full_mod')}
                      className="rounded-lg border border-slate-200 bg-white px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                    >
                      Maximum Sub-Admin
                    </button>
                  </div>
                </div>

                <div>
                  <label
                    htmlFor="subadmin-email-input"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Assigned Admin Gmail Address (Required)
                  </label>
                  <input
                    id="subadmin-email-input"
                    type="email"
                    maxLength={160}
                    value={inviteEmail}
                    onChange={(e) => setInviteEmail(e.target.value)}
                    placeholder="colleague.admin@gmail.com"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label
                    htmlFor="subadmin-phone-input"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Assigned Admin Phone / WhatsApp Number (Required)
                  </label>
                  <input
                    id="subadmin-phone-input"
                    type="tel"
                    maxLength={32}
                    value={invitePhone}
                    onChange={(e) => setInvitePhone(e.target.value)}
                    placeholder="+91 98201 11223"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-hidden"
                  />
                </div>

                <div>
                  <label
                    htmlFor="subadmin-name-input"
                    className="block text-xs font-semibold text-slate-700 mb-1.5"
                  >
                    Admin Full Name &amp; Academic Desk
                  </label>
                  <input
                    id="subadmin-name-input"
                    type="text"
                    maxLength={80}
                    value={inviteName}
                    onChange={(e) => setInviteName(e.target.value)}
                    placeholder="Prof. Neha Sharma (Physics Desk)"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-hidden"
                  />
                </div>

                <fieldset className="glass-inset rounded-xl p-3.5 space-y-2.5 text-xs">
                  <legend className="font-semibold text-slate-900 px-1">
                    Allowed Admin Panel Scopes
                  </legend>

                  <div className="flex items-center justify-between gap-2 text-slate-700">
                    <span>1-Click Gmail &amp; WhatsApp Candidate Outreach</span>
                    <span className="font-semibold text-emerald-700">Always Enabled</span>
                  </div>

                  <label className="flex items-center justify-between gap-2 cursor-pointer">
                    <span className="text-slate-700">Publish &amp; edit Global Updates</span>
                    <input
                      type="checkbox"
                      checked={permUpdates}
                      onChange={(e) => setPermUpdates(e.target.checked)}
                      className="accent-sky-600"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-2 cursor-pointer">
                    <span className="text-slate-700">Award Special Individual Bonuses</span>
                    <input
                      type="checkbox"
                      checked={permBonuses}
                      onChange={(e) => setPermBonuses(e.target.checked)}
                      className="accent-sky-600"
                    />
                  </label>

                  <label className="flex items-center justify-between gap-2 cursor-pointer">
                    <span className="text-slate-700">Ban / Reinstate Candidate Accounts</span>
                    <input
                      type="checkbox"
                      checked={permBans}
                      onChange={(e) => setPermBans(e.target.checked)}
                      className="accent-sky-600"
                    />
                  </label>
                </fieldset>

                <button
                  type="submit"
                  disabled={savingInvite}
                  className="w-full inline-flex items-center justify-center gap-1.5 rounded-xl bg-slate-900 px-4 py-2.5 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-50 whitespace-nowrap"
                >
                  <UserPlus className="h-4 w-4" />
                  <span>
                    {savingInvite ? 'Authorizing...' : 'Authorize Admin Gmail & Phone'}
                  </span>
                </button>
              </form>
            )}
          </section>

          <section className="lg:col-span-7 glass-panel rounded-2xl p-6">
            <h3 className="font-display text-lg font-bold text-slate-900">
              Authorized Admins with Verified Gmail &amp; Phone ({staffInvites.length})
            </h3>
            <p className="mt-1 text-xs text-slate-600">
              Every listed admin can inspect candidate academic profiles and send 1-click Gmail &amp;
              WhatsApp guidance using their Super-Admin-assigned contact credentials.
            </p>

            {staffInvites.length === 0 ? (
              <div className="py-10 text-center text-xs text-slate-500">
                No delegated Sub-Admins added yet. Assign an admin’s Gmail and phone number on the
                left.
              </div>
            ) : (
              <div className="mt-4 divide-y divide-slate-200">
                {staffInvites.map((inv) => (
                  <div
                    key={inv.inviteKey}
                    className="py-4 first:pt-1 flex flex-col gap-3"
                  >
                    <div className="space-y-1">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-900">{inv.displayName}</span>
                        <span aria-hidden="true" className="text-slate-300">
                          ·
                        </span>
                        <span
                          className={`text-xs font-semibold ${
                            inv.status === 'active' ? 'text-emerald-700' : 'text-red-700'
                          }`}
                        >
                          {inv.status === 'active' ? 'Active' : 'Revoked'}
                        </span>
                      </div>
                      <p className="text-xs text-slate-700 font-mono break-all sm:break-normal">
                        Gmail: {inv.targetEmail} · Phone: {inv.adminPhone || 'Assigned on login'}
                      </p>
                      <p className="text-xs text-slate-600">
                        Outreach: <strong>Yes</strong> · Updates:{' '}
                        <strong>{inv.canPostUpdates ? 'Yes' : 'No'}</strong> · Bonuses:{' '}
                        <strong>{inv.canGrantBonuses ? 'Yes' : 'No'}</strong> · Bans:{' '}
                        <strong>{inv.canBanUsers ? 'Yes' : 'No'}</strong>
                      </p>
                    </div>

                    {staffAccess.canManageAdmins && (
                      <div className="flex flex-wrap items-center gap-2">
                        <button
                          type="button"
                          aria-label={`Toggle Updates permission for ${inv.targetEmail}`}
                          onClick={() =>
                            onUpdateStaffInvite({
                              inviteKey: inv.inviteKey,
                              adminPhone: inv.adminPhone || '+91 98000 00000',
                              displayName: inv.displayName,
                              canPostUpdates: !inv.canPostUpdates,
                              canGrantBonuses: inv.canGrantBonuses,
                              canBanUsers: inv.canBanUsers,
                              status: inv.status,
                            })
                          }
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                        >
                          Toggle Updates
                        </button>
                        <button
                          type="button"
                          aria-label={`Toggle Bonuses permission for ${inv.targetEmail}`}
                          onClick={() =>
                            onUpdateStaffInvite({
                              inviteKey: inv.inviteKey,
                              adminPhone: inv.adminPhone || '+91 98000 00000',
                              displayName: inv.displayName,
                              canPostUpdates: inv.canPostUpdates,
                              canGrantBonuses: !inv.canGrantBonuses,
                              canBanUsers: inv.canBanUsers,
                              status: inv.status,
                            })
                          }
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                        >
                          Toggle Bonuses
                        </button>
                        <button
                          type="button"
                          aria-label={`Toggle Bans permission for ${inv.targetEmail}`}
                          onClick={() =>
                            onUpdateStaffInvite({
                              inviteKey: inv.inviteKey,
                              adminPhone: inv.adminPhone || '+91 98000 00000',
                              displayName: inv.displayName,
                              canPostUpdates: inv.canPostUpdates,
                              canGrantBonuses: inv.canGrantBonuses,
                              canBanUsers: !inv.canBanUsers,
                              status: inv.status,
                            })
                          }
                          className="rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 whitespace-nowrap"
                        >
                          Toggle Bans
                        </button>
                        <button
                          type="button"
                          aria-label={`${
                            inv.status === 'active' ? 'Revoke' : 'Restore'
                          } admin access for ${inv.targetEmail}`}
                          onClick={() =>
                            onUpdateStaffInvite({
                              inviteKey: inv.inviteKey,
                              adminPhone: inv.adminPhone || '+91 98000 00000',
                              displayName: inv.displayName,
                              canPostUpdates: inv.canPostUpdates,
                              canGrantBonuses: inv.canGrantBonuses,
                              canBanUsers: inv.canBanUsers,
                              status: inv.status === 'active' ? 'revoked' : 'active',
                            })
                          }
                          className={`rounded-lg px-3 py-1.5 text-xs font-semibold whitespace-nowrap ${
                            inv.status === 'active'
                              ? 'border border-red-200 bg-red-50 text-red-800 hover:bg-red-100'
                              : 'border border-emerald-200 bg-emerald-50 text-emerald-800 hover:bg-emerald-100'
                          }`}
                        >
                          {inv.status === 'active' ? 'Revoke Access' : 'Restore Access'}
                        </button>
                      </div>
                    )}
                  </div>
                ))}
              </div>
            )}
          </section>
        </div>
      )}

      {/* SECTION 04: AUTOMATED AI SUSPENSION APPEALS (SUPER ADMIN EXCLUSIVE UNBAN) */}
      {adminSection === 'appeals' && (
        <section className="glass-panel rounded-2xl p-6 space-y-5">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
            <div className="space-y-1">
              <h3 className="font-display text-lg font-bold text-slate-900">
                Suspension Appeals · AI Interview Summaries &amp; Super Admin Review
              </h3>
              <p className="text-xs text-slate-600">
                Suspended candidates complete an automated AI appeal interview from their restricted
                screen. Accounts are reinstated <strong className="text-slate-900">only if the Super Admin agrees</strong>.
              </p>
            </div>
            <button
              type="button"
              disabled={loadingAppeals}
              onClick={loadAppeals}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
            >
              <RefreshCw
                className={`h-3.5 w-3.5 text-sky-600 ${loadingAppeals ? 'animate-spin' : ''}`}
              />
              <span>Refresh Appeals</span>
            </button>
          </div>

          {staffAccess.tier !== 'super_admin' && (
            <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900 flex items-start gap-2.5">
              <AlertTriangle className="h-4 w-4 text-amber-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold">
                  Delegated Admin Read-Only Access · Super Admin Agreement Required to Unban
                </p>
                <p className="mt-0.5 text-amber-800">
                  You can inspect structured AI appeal summaries below, but only Primary Super Admin (
                  <span className="font-mono">{BOOTSTRAPPED_SUPER_ADMIN_EMAIL}</span>) can approve an
                  appeal and unban an account.
                </p>
              </div>
            </div>
          )}

          {appeals.length === 0 ? (
            <div className="py-10 text-center text-xs text-slate-500">
              No suspension appeals submitted yet. When a banned candidate completes the automated AI
              appeal interview, the structured summary appears here for Super Admin review.
            </div>
          ) : (
            <div className="divide-y divide-slate-200">
              {appeals.map((appeal) => {
                const isPending = appeal.status === 'pending_super_admin';
                const isDeciding = decidingAppealId === appeal.id;
                return (
                  <article key={appeal.id} className="py-5 first:pt-1 space-y-3">
                    <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                      <div className="flex flex-wrap items-center gap-2 text-slate-600">
                        <span className="font-display text-sm font-bold text-slate-900">
                          {appeal.candidateName}
                        </span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono">{appeal.candidateEmail || appeal.ownerUid}</span>
                        <span aria-hidden="true">·</span>
                        <span className="font-mono tabular-nums">
                          {appeal.createdAt.slice(0, 16).replace('T', ' ')}
                        </span>
                      </div>

                      <span
                        className={`font-semibold ${
                          appeal.status === 'approved_unbanned'
                            ? 'text-emerald-700'
                            : appeal.status === 'rejected'
                            ? 'text-red-700'
                            : 'text-amber-800'
                        }`}
                      >
                        {appeal.status === 'approved_unbanned'
                          ? '✓ Approved & Unbanned by Super Admin'
                          : appeal.status === 'rejected'
                          ? '✕ Rejected by Super Admin'
                          : 'Pending Super Admin Decision'}
                      </span>
                    </div>

                    <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 text-xs">
                      <div className="lg:col-span-7 rounded-xl border border-slate-200 bg-slate-50/70 p-4 space-y-2">
                        <p className="text-slate-500">
                          Original Ban Reason:{' '}
                          <strong className="text-slate-900">{appeal.banReason}</strong>
                        </p>
                        <div>
                          <p className="font-semibold text-slate-900">
                            AI Structured Appeal Summary
                          </p>
                          <p className="mt-0.5 text-slate-700 leading-relaxed">
                            {appeal.aiStructuredSummary}
                          </p>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-1">
                          <div>
                            <p className="font-semibold text-slate-800">Root Cause Explained</p>
                            <p className="text-slate-600 leading-relaxed">
                              {appeal.rootCauseAcknowledged || 'See transcript'}
                            </p>
                          </div>
                          <div>
                            <p className="font-semibold text-slate-800">Candidate Commitment</p>
                            <p className="text-slate-600 leading-relaxed">
                              {appeal.candidateCommitment || 'See transcript'}
                            </p>
                          </div>
                        </div>
                      </div>

                      <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white p-4 space-y-2">
                        <p className="font-semibold text-slate-900">
                          Automated Appeal Interview Transcript ({appeal.interviewTranscript.length} turns)
                        </p>
                        <div className="max-h-40 overflow-y-auto space-y-2 pr-1">
                          {appeal.interviewTranscript.map((turn, idx) => (
                            <div key={turn.id || idx} className="text-[11px] leading-relaxed">
                              <span
                                className={`font-semibold ${
                                  turn.role === 'interviewer'
                                    ? 'text-sky-700'
                                    : 'text-slate-900'
                                }`}
                              >
                                {turn.role === 'interviewer'
                                  ? 'AI Interviewer: '
                                  : `${appeal.candidateName}: `}
                              </span>
                              <span className="text-slate-600">{turn.text}</span>
                            </div>
                          ))}
                        </div>
                      </div>
                    </div>

                    {isPending && staffAccess.tier === 'super_admin' && (
                      <div className="flex flex-col sm:flex-row sm:items-center gap-3 pt-1">
                        <input
                          type="text"
                          value={appealDecisionNotes[appeal.id] || ''}
                          onChange={(e) =>
                            setAppealDecisionNotes((prev) => ({
                              ...prev,
                              [appeal.id]: e.target.value,
                            }))
                          }
                          placeholder="Optional Super Admin decision note..."
                          className="flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 placeholder:text-slate-400 focus:border-sky-600 focus:outline-hidden"
                        />
                        <div className="flex items-center gap-2 shrink-0">
                          <button
                            type="button"
                            disabled={isDeciding}
                            onClick={() => handleDecideAppeal(appeal, 'approved_unbanned')}
                            className="inline-flex items-center gap-1.5 rounded-lg bg-emerald-600 px-3.5 py-2 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-50 whitespace-nowrap"
                          >
                            <UserCheck className="h-3.5 w-3.5" />
                            <span>
                              {isDeciding ? 'Processing…' : 'Approve & Unban'}
                            </span>
                          </button>
                          <button
                            type="button"
                            disabled={isDeciding}
                            onClick={() => handleDecideAppeal(appeal, 'rejected')}
                            className="inline-flex items-center gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3.5 py-2 text-xs font-semibold text-red-800 hover:bg-red-100 disabled:opacity-50 whitespace-nowrap"
                          >
                            <Ban className="h-3.5 w-3.5" />
                            <span>Reject Appeal</span>
                          </button>
                        </div>
                      </div>
                    )}

                    {!isPending && appeal.superAdminDecisionNote && (
                      <p className="text-xs text-slate-600">
                        Super Admin Note ({appeal.reviewedByEmail || BOOTSTRAPPED_SUPER_ADMIN_EMAIL}):{' '}
                        <span className="font-medium text-slate-800">{appeal.superAdminDecisionNote}</span>
                      </p>
                    )}
                  </article>
                );
              })}
            </div>
          )}
        </section>
      )}
    </div>
  );
};
