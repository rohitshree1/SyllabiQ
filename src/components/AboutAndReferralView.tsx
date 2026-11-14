import React, { useState } from 'react';
import {
  Check,
  Copy,
  ExternalLink,
  Mail,
  SearchCheck,
  Share2,
  UserPlus,
} from 'lucide-react';
import type { AppState, CandidateXpSnapshot } from '../types';
import {
  buildReferralShareLinks,
  generateReferralCode,
  normalizeSerialCode,
} from '../utils/verificationAndReferral';

interface AboutAndReferralViewProps {
  state: AppState;
  ownerKey: string;
  xpSnapshot: CandidateXpSnapshot;
  onApplyReferralCode: (code: string) => void;
  onOpenVerifyModal: (prefillSerial?: string) => void;
  onOpenPrivacyPolicy: () => void;
}

const POSITIVE_PILLARS: Array<{
  num: string;
  title: string;
  outcomeMetric: string;
  description: string;
}> = [
  {
    num: '01',
    title: 'Peak-Alertness Scheduling & 1-Click Templates',
    outcomeMetric: '30-second starter blueprints matched to peak hours',
    description:
      'Launch in under 30 seconds with 1-click starter syllabus templates (CBSE Class 12 PCM/PCB, ICSE Class 10, GATE CS, B.Tech Core) pre-tagged with PYQ weightage, or upload your own syllabus to schedule toughest subjects in your biological peak hours.',
  },
  {
    num: '02',
    title: 'High-Yield PYQ Prioritization & Mastery Analytics',
    outcomeMetric: 'Live Recharts Study Mastery Progress Over Time',
    description:
      'Every syllabus chapter is classified into High-Yield vs. Low-Yield exam weightage and tracked continuously with interactive Study Mastery Over Time charts, helping you secure the 80%-frequency numericals and derivations first.',
  },
  {
    num: '03',
    title: 'Compressed-Timer Speed Conditioning',
    outcomeMetric: 'Up to 35% faster than standard exam-hall pacing',
    description:
      'Daily PYQ Targets and 18-second Countdown Blitz drills train rapid recall under stricter-than-exam clocks, eliminating final-hour panic and building live /10 subject ratings plus an AI-written Student Performance Dossier.',
  },
  {
    num: '04',
    title: 'Smooth Missed-Day Redistribution',
    outcomeMetric: 'Zero guilt · Proportional multi-day catch-up',
    description:
      'When illness or campus events interrupt a day, SyllabiQ redistributes unfinished chapters smoothly across upcoming days without overloading any single study session.',
  },
  {
    num: '05',
    title: 'QR-Verified FlexCards & 7-Day Luster Warning',
    outcomeMetric: 'Scannable QR · 5 XP Tiers · 60-Day Skill Refresh',
    description:
      'Downloaded FlexCard PNGs and Report Card PDFs embed a scannable QR code linked to ?verify=SLQ-... for instant teacher/recruiter authentication. A 7-day warning flags subjects at day 53 before a 60-day refresh quiz restores full badge luster.',
  },
  {
    num: '06',
    title: 'Social SyllabiQ (World & 1-on-1 Private) & Fair Governance',
    outcomeMetric: 'Profile ID lookup · Direct 1-on-1 Vaults · Appeals',
    description:
      'Search peers in World using their unique Scholar Profile ID (SLQ-USR-...), hold strictly 1-on-1 Private chats (no group clutter) sharing only names and verified FlexCards, control photo/vault visibility, recover 40% of minor XP deductions via AI Ethics, and appeal bans to the Super Admin.',
  },
];

const XP_DEDUCTION_RULES = [
  'Spamming repetitive messages, off-topic chatter, or FlexCard flooding in Social SyllabiQ World or 1-on-1 Private conversations.',
  'Attempting to share external URLs, unverified links, phone numbers, email addresses, or image/file attachments in chat.',
  'Rapid-guessing timed PYQ or Countdown Blitz assessments (< 2 seconds per item repeatedly) to farm raw XP without reading.',
  'Sharing misleading study tips or claiming unverified scores in World or 1-on-1 Private threads without attaching a genuine SLQ-FC serial.',
];

const ACCOUNT_BAN_RULES = [
  'Forging, tampering with, or impersonating another scholar’s SLQ-FC FlexCard serial or SLQ-RC Report Card serial.',
  'Harassment, abusive language, bullying, hate speech, or coercing peers to unlock Private Credential Vault access.',
  'Automated bot scripting, multi-account referral farming, or deliberate exploitation of timed assessment endpoints.',
  'Repeated academic integrity infractions after already completing an AI Academic Integrity & Ethics XP recovery module.',
];

export const AboutAndReferralView: React.FC<AboutAndReferralViewProps> = ({
  state,
  ownerKey,
  xpSnapshot,
  onApplyReferralCode,
  onOpenVerifyModal,
  onOpenPrivacyPolicy,
}) => {
  const [copiedLink, setCopiedLink] = useState(false);
  const [copiedInvite, setCopiedInvite] = useState(false);
  const [friendCodeInput, setFriendCodeInput] = useState(state.student.referredByCode || '');
  const [friendCodeSaved, setFriendCodeSaved] = useState(false);
  const [friendCodeError, setFriendCodeError] = useState('');

  const referralCode =
    state.student.referralCode || generateReferralCode(ownerKey, state.student.name);

  const referralLinks = buildReferralShareLinks({
    referralCode,
    candidateName: state.student.name,
    examName: state.student.examName || state.student.boardOrUniversity,
    originUrl: typeof window !== 'undefined' ? window.location.origin : 'https://syllabiq.app',
  });

  const handleCopyUrl = async () => {
    try {
      await navigator.clipboard.writeText(referralLinks.referralUrl);
    } catch {
      // Ignore iframe clipboard restriction
    }
    setCopiedLink(true);
    setTimeout(() => setCopiedLink(false), 2200);
  };

  const handleCopyInviteMessage = async () => {
    try {
      await navigator.clipboard.writeText(referralLinks.shareMessage);
    } catch {
      // Ignore iframe clipboard restriction
    }
    setCopiedInvite(true);
    setTimeout(() => setCopiedInvite(false), 2200);
  };

  const handleSaveFriendReferral = (e: React.FormEvent) => {
    e.preventDefault();
    setFriendCodeError('');
    const clean = normalizeSerialCode(friendCodeInput);
    if (!clean || clean.length < 6) {
      setFriendCodeError('Enter a valid SyllabiQ referral code (e.g., SLQ-REF-AAR8K2M9).');
      return;
    }
    if (clean === referralCode) {
      setFriendCodeError('You cannot apply your own referral code.');
      return;
    }
    onApplyReferralCode(clean);
    setFriendCodeSaved(true);
    setTimeout(() => setFriendCodeSaved(false), 2500);
  };

  return (
    <div className="space-y-8">
      {/* Editorial Proposition Header */}
      <section className="glass-panel rounded-2xl p-6 sm:p-8">
        <div className="flex flex-col lg:flex-row lg:items-end justify-between gap-6">
          <div className="max-w-3xl space-y-2.5">
            <p className="text-xs font-semibold text-sky-700">
              About SyllabiQ · Built for School Boards &amp; University Finals
            </p>
            <h1 className="font-display text-2xl sm:text-3xl font-bold tracking-tight text-slate-900">
              Why disciplined candidates switch from passive reading to SyllabiQ
            </h1>
            <p className="text-sm text-slate-600 leading-relaxed">
              SyllabiQ combines biological alertness scheduling, past-paper (PYQ) yield analytics,
              live study mastery charts, compressed-timer active recall, Profile ID-searchable World
              and 1-on-1 Private conversations, and QR-verified academic credentials inside a calm,
              zero-advertisement study studio.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-2.5 shrink-0">
            <button
              type="button"
              onClick={() => onOpenVerifyModal()}
              className="inline-flex items-center gap-2 rounded-xl border border-slate-300 bg-white px-4 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <SearchCheck className="h-4 w-4 text-sky-600" />
              <span>Verify Card / Report Serial</span>
            </button>
            <button
              type="button"
              onClick={onOpenPrivacyPolicy}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2.5 text-xs font-medium text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              View &amp; Download Privacy Policy
            </button>
          </div>
        </div>

        {/* Positive Pillars Grid */}
        <div className="mt-8 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6 border-t border-slate-200/80 pt-7">
          {POSITIVE_PILLARS.map((pillar) => (
            <article
              key={pillar.num}
              className="rounded-xl border border-slate-200/85 bg-white/80 p-5 flex flex-col justify-between space-y-3"
            >
              <div className="space-y-1.5">
                <p className="font-mono tabular-nums text-xs font-semibold text-sky-700">
                  {pillar.num}. {pillar.outcomeMetric}
                </p>
                <h2 className="font-display text-base font-bold text-slate-900">
                  {pillar.title}
                </h2>
                <p className="text-xs text-slate-600 leading-relaxed">{pillar.description}</p>
              </div>
            </article>
          ))}
        </div>
      </section>

      {/* Social SyllabiQ (World & Private) & Platform Conduct Charter */}
      <section
        aria-labelledby="conduct-rules-heading"
        className="glass-panel rounded-2xl p-6 sm:p-8 space-y-6"
      >
        <div className="border-b border-slate-200/80 pb-5 space-y-1.5">
          <p className="text-xs font-semibold text-slate-600">
            Academic Integrity &amp; Social SyllabiQ Governance Charter
          </p>
          <h2
            id="conduct-rules-heading"
            className="font-display text-xl sm:text-2xl font-bold text-slate-900"
          >
            World Channel, 1-on-1 Private Chat &amp; Web App Conduct Rules
          </h2>
          <p className="text-xs text-slate-600 leading-relaxed max-w-3xl">
            To keep SyllabiQ safe, distraction-free, and trusted by teachers and employers, Social
            SyllabiQ supports strictly <strong className="text-slate-900">Direct World Communication</strong>{' '}
            (with individual <strong className="text-slate-900">Profile ID lookup</strong>) and{' '}
            <strong className="text-slate-900">1-on-1 Private Conversations</strong> (no group chats),
            displaying <strong className="text-slate-900">only candidate names</strong> and permitting{' '}
            <strong className="text-slate-900">only verified FlexCard attachments</strong> (never
            photos, files, or external links). Below are the exact rules governing XP deductions
            versus account suspension.
          </p>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
          {/* Tier 1: XP Deduction Rules + 40% Ethics Recovery */}
          <div className="rounded-xl border border-amber-200/90 bg-amber-50/45 p-5 space-y-3.5">
            <div className="space-y-1">
              <p className="font-mono tabular-nums text-xs font-semibold text-amber-900">
                01. Minor Infractions · Reasoned Admin XP Deduction (-XP)
              </p>
              <h3 className="font-display text-base font-bold text-slate-900">
                What Causes an XP Deduction &amp; How Recovery Works
              </h3>
            </div>
            <ul className="space-y-2 text-xs text-slate-700 leading-relaxed">
              {XP_DEDUCTION_RULES.map((rule, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="font-mono font-semibold text-amber-800 shrink-0">
                    1.{idx + 1}
                  </span>
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
            <p className="border-t border-amber-200/80 pt-3 text-xs text-amber-950 leading-relaxed">
              <strong>Constructive Recovery Path:</strong> Whenever an admin deducts XP with a
              written reason, you can complete an AI-generated{' '}
              <strong>Academic Integrity &amp; Ethics</strong> module explaining what happened and
              why it was wrong to recover <strong className="font-mono">40%</strong> of the deducted
              XP once per infraction.
            </p>
          </div>

          {/* Tier 2: Account Suspension (Ban) Rules + Super Admin Exclusive Appeal */}
          <div className="rounded-xl border border-red-200/90 bg-red-50/40 p-5 space-y-3.5">
            <div className="space-y-1">
              <p className="font-mono tabular-nums text-xs font-semibold text-red-900">
                02. Severe Violations · Account Suspension (Ban)
              </p>
              <h3 className="font-display text-base font-bold text-slate-900">
                What Causes an Account Ban &amp; Exclusive Super Admin Appeal
              </h3>
            </div>
            <ul className="space-y-2 text-xs text-slate-700 leading-relaxed">
              {ACCOUNT_BAN_RULES.map((rule, idx) => (
                <li key={idx} className="flex items-start gap-2">
                  <span className="font-mono font-semibold text-red-800 shrink-0">
                    2.{idx + 1}
                  </span>
                  <span>{rule}</span>
                </li>
              ))}
            </ul>
            <p className="border-t border-red-200/80 pt-3 text-xs text-red-950 leading-relaxed">
              <strong>Restricted Access &amp; Appeal Suspension:</strong> Suspended accounts are
              locked out of study tabs, tests, and Social SyllabiQ, and can only share an
              AI-optimized Accountability FlexCard or click{' '}
              <strong>&ldquo;Appeal Suspension&rdquo;</strong> to complete an automated AI interview
              forwarded to the <strong>Super Admin</strong>—unbanned strictly if the Super Admin
              agrees.
            </p>
          </div>
        </div>
      </section>

      {/* Candidate Referral Hub */}
      <section
        aria-labelledby="referral-hub-heading"
        className="glass-panel rounded-2xl p-6 sm:p-8 space-y-6"
      >
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200/80 pb-5">
          <div className="space-y-1">
            <p className="text-xs font-semibold text-emerald-700">
              Peer Study Network · Invite Batchmates &amp; Study Partners
            </p>
            <h2
              id="referral-hub-heading"
              className="font-display text-xl sm:text-2xl font-bold text-slate-900"
            >
              Refer Classmates to SyllabiQ
            </h2>
            <p className="text-xs text-slate-600">
              Share your personal invite code so classmates preparing for{' '}
              <strong className="text-slate-900">
                {state.student.examName || state.student.boardOrUniversity}
              </strong>{' '}
              can benchmark PYQ speed and verify FlexCard milestones alongside you.
            </p>
          </div>

          <div className="text-left sm:text-right shrink-0">
            <p className="text-xs text-slate-500">Your Active Standing</p>
            <p className="font-mono tabular-nums text-sm font-bold text-slate-900">
              {xpSnapshot.netXp.toLocaleString()} XP · {xpSnapshot.rarity.tier}
            </p>
          </div>
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6 items-start">
          {/* Left: Personal Referral Code & 1-Click Share */}
          <div className="lg:col-span-7 space-y-4">
            <div className="rounded-xl border border-slate-200 bg-slate-50/85 p-4 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div>
                  <p className="text-xs text-slate-500">Your Personal Referral Code</p>
                  <p
                    data-testid="candidate-referral-code"
                    className="font-mono tabular-nums text-lg font-bold text-slate-900"
                  >
                    {referralLinks.referralCode}
                  </p>
                </div>

                <div className="flex flex-wrap items-center gap-2">
                  <button
                    type="button"
                    onClick={handleCopyUrl}
                    className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-3.5 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
                  >
                    {copiedLink ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-400" />
                        <span>Copied Join Link</span>
                      </>
                    ) : (
                      <>
                        <Copy className="h-3.5 w-3.5 text-sky-400" />
                        <span>Copy Referral Link</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={handleCopyInviteMessage}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3.5 py-2 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
                  >
                    {copiedInvite ? (
                      <>
                        <Check className="h-3.5 w-3.5 text-emerald-600" />
                        <span>Copied Message</span>
                      </>
                    ) : (
                      <>
                        <Share2 className="h-3.5 w-3.5 text-slate-600" />
                        <span>Copy Invite Text</span>
                      </>
                    )}
                  </button>
                </div>
              </div>

              <div className="border-t border-slate-200/80 pt-2.5 text-xs text-slate-600 break-all font-mono">
                {referralLinks.referralUrl}
              </div>
            </div>

            <div className="space-y-2">
              <p className="text-xs font-semibold text-slate-700">
                One-Click Referral Sharing Channels
              </p>
              <div className="grid grid-cols-2 sm:grid-cols-4 gap-2.5">
                <a
                  href={referralLinks.whatsappUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-emerald-200 bg-emerald-50/80 px-3 py-2.5 text-xs font-semibold text-emerald-900 hover:bg-emerald-100 transition-colors whitespace-nowrap"
                >
                  <span>WhatsApp Invite</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
                <a
                  href={referralLinks.gmailComposeUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-sky-200 bg-sky-50/80 px-3 py-2.5 text-xs font-semibold text-sky-900 hover:bg-sky-100 transition-colors whitespace-nowrap"
                >
                  <Mail className="h-3.5 w-3.5" />
                  <span>Gmail Invite</span>
                </a>
                <a
                  href={referralLinks.linkedinUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap"
                >
                  <span>LinkedIn</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
                <a
                  href={referralLinks.xUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center justify-center gap-1.5 rounded-xl border border-slate-200 bg-white px-3 py-2.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap"
                >
                  <span>Post on X</span>
                  <ExternalLink className="h-3 w-3" />
                </a>
              </div>
            </div>
          </div>

          {/* Right: Apply a Classmate's Referral Code */}
          <div className="lg:col-span-5 rounded-xl border border-slate-200 bg-white/90 p-5 space-y-3">
            <div className="flex items-center gap-2 text-slate-900">
              <UserPlus className="h-4 w-4 text-sky-600 shrink-0" />
              <h3 className="font-display text-sm font-bold">
                Invited by a Classmate or Senior?
              </h3>
            </div>
            <p className="text-xs text-slate-600 leading-relaxed">
              Link the referral code shared by your study partner to record their invite on your
              academic profile.
            </p>

            <form onSubmit={handleSaveFriendReferral} className="space-y-2.5">
              <label htmlFor="friend-referral-input" className="sr-only">
                Classmate Referral Code
              </label>
              <div className="flex items-center gap-2">
                <input
                  id="friend-referral-input"
                  type="text"
                  value={friendCodeInput}
                  onChange={(e) => {
                    setFriendCodeInput(e.target.value.toUpperCase());
                    setFriendCodeError('');
                  }}
                  placeholder="SLQ-REF-XXXXXX"
                  className="min-w-0 flex-1 rounded-lg border border-slate-300 bg-white px-3 py-2 font-mono text-xs text-slate-900 focus:border-sky-600 focus:outline-none"
                />
                <button
                  type="submit"
                  className="rounded-lg bg-sky-700 px-3.5 py-2 text-xs font-semibold text-white hover:bg-sky-800 transition-colors whitespace-nowrap shrink-0"
                >
                  Apply Code
                </button>
              </div>

              {friendCodeError && (
                <p role="alert" className="text-xs font-medium text-amber-800">
                  ▲ {friendCodeError}
                </p>
              )}

              {(friendCodeSaved || state.student.referredByCode) && !friendCodeError && (
                <p className="text-xs font-medium text-emerald-700">
                  Linked referrer code:{' '}
                  <span className="font-mono font-bold">
                    {state.student.referredByCode || normalizeSerialCode(friendCodeInput)}
                  </span>
                </p>
              )}
            </form>
          </div>
        </div>
      </section>
    </div>
  );
};
