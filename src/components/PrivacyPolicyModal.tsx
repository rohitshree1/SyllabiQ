import React, { useEffect } from 'react';
import { CheckCircle2, Download, Lock, ShieldCheck, X } from 'lucide-react';
import {
  downloadPrivacyPolicyPdf,
  type PrivacyDisclosurePdfItem,
} from '../utils/pdfExport';

interface PrivacyPolicyModalProps {
  onClose: () => void;
}

const DATA_DISCLOSURE_ITEMS: PrivacyDisclosurePdfItem[] = [
  {
    category: '01. Scholar Profile ID, Identity & Photo Visibility',
    exactDataCollected:
      'Unique Scholar Profile ID (SLQ-USR-XXXXXXXX), Full Name / Display Name, Optional Candidate Profile Image (cropped photo, URL, or monogram), Profile Photo Visibility choice (Everyone in World vs. Connected Peers Only), and Account Creation Date.',
    purposeAndUsage:
      'Personalizes your profile, timetable, offline PDF study sheets, and XP FlexCards, lets peers locate your public card in Social SyllabiQ World via your Profile ID, and enforces whether your photo is shown in World or strictly to 1-on-1 connected Private peers.',
    whoCanAccess: 'Candidate, Admins & Permitted Peers',
  },
  {
    category: '02. Authentication & Contact Gmail',
    exactDataCollected:
      'Verified Google or Microsoft OAuth Email, Authentication Provider ID, UID, and Candidate Contact Gmail Address.',
    purposeAndUsage:
      'Secures multi-year cloud workspace backup across devices, prevents identity spoofing, and enables one-click Gmail study & achievement updates from academic admins (never shown in Social SyllabiQ).',
    whoCanAccess: 'Candidate & Authorized Academic Admins',
  },
  {
    category: '03. WhatsApp / Mobile Number',
    exactDataCollected: 'Candidate WhatsApp / Phone Number (optional or provided for mentor alerts).',
    purposeAndUsage:
      'Used strictly by authorized SyllabiQ admins to send direct WhatsApp reminders regarding active/dissolving achievements and priority syllabus chapters needing attention (never exposed in Social SyllabiQ).',
    whoCanAccess: 'Candidate & Authorized Academic Admins',
  },
  {
    category: '04. Notification Consent Preferences',
    exactDataCollected:
      'Gmail Notification Opt-In toggle and WhatsApp Notification Opt-In toggle.',
    purposeAndUsage:
      'Records your explicit preference for receiving achievement milestones, XP decay warnings, and syllabus focus guidance via Gmail and/or WhatsApp. Editable anytime in Profile.',
    whoCanAccess: 'Candidate & Authorized Academic Admins',
  },
  {
    category: '05. Academic, Exam & AI Student Dossier',
    exactDataCollected:
      'Institution Level (School or University), Board / University Name, Target Exam Title, Target Exam Date, and AI-generated 10–15 line "About the Student" performance narrative.',
    purposeAndUsage:
      'Calibrates PYQ chapter weightage, sets daily countdown pacing, and synthesizes a concise 10–15 line academic profile summary on your Profile and official Report Card.',
    whoCanAccess: 'Candidate & Authorized Academic Admins',
  },
  {
    category: '06. Cognitive & Learning Preferences',
    exactDataCollected:
      'Daily Study Hours budget, Peak Alertness Window (Early Morning, Late Morning, Afternoon, Night Owl), Learning Style Preset, and Custom Explanation Note.',
    purposeAndUsage:
      'Schedules high-difficulty chapters inside your peak mental energy hours and tailors post-test wrong-answer explanations to how you learn best.',
    whoCanAccess: 'Candidate (Summary hours visible to Admins)',
  },
  {
    category: '07. Syllabus Chapters, Mastery Analytics & 60-Day Refresh',
    exactDataCollected:
      'Uploaded/pasted syllabus text, PDF/image, or 1-click starter template selection, Subject list, Past Marks, Difficulty ratings, Chapter completion, live Topic Mastery %, and Last-Practiced Subject Date (YYYY-MM-DD).',
    purposeAndUsage:
      'Generates your adaptive study roadmap, plots live Study Mastery Progress Over Time charts on your dashboard, triggers a 7-day Badge Luster warning starting at day 53, flags 60+ day unpracticed subjects with "Skill Refresh Needed", and restores full luster after a 3-question quiz.',
    whoCanAccess: 'Candidate & Authorized Academic Admins',
  },
  {
    category: '08. Timed Assessments & /10 Scores',
    exactDataCollected:
      'Daily PYQ & Countdown Blitz test attempts, selected answers, time spent per question, accuracy %, and per-subject /10 scores.',
    purposeAndUsage:
      'Tracks exam speed under compressed time limits, computes readiness metrics, and automatically unlocks score and speed distinction badges.',
    whoCanAccess: 'Candidate & Authorized Academic Admins',
  },
  {
    category: '09. Deep Focus & 3-Day Activity Window',
    exactDataCollected:
      'Completed focus timer sessions, cumulative focus minutes logged, and Last-Active Study Date (YYYY-MM-DD).',
    purposeAndUsage:
      'Awards focus XP, maintains your automatic Active Learner Pulse badge, and triggers 3-day inactivity dissolution & daily XP decay calculations.',
    whoCanAccess: 'Candidate & Authorized Academic Admins',
  },
  {
    category: '10. XP, Rare FlexCards, QR Codes & Verifiable Serials',
    exactDataCollected:
      'Earned XP, FlexCard Rarity Tier, Issued Credential Serial Numbers (SLQ-FC-XXXXXXXX & SLQ-RC-XXXXXXXX), Embedded Scannable QR Verify Links (?verify=SLQ-...), and Non-Admin Verifier Logs (Verifier Name, Gmail, and Post: Teacher / Company Executive / Student).',
    purposeAndUsage:
      'Embeds scannable QR codes and serials on downloaded FlexCard PNGs and Report Card PDFs so teachers or recruiters can verify authenticity in one scan. Admin checks stay silent; non-admin checks notify the owner with the verifier’s Name, Gmail, and Post.',
    whoCanAccess: 'Public Serial Check (Owner notified on non-admin checks)',
  },
  {
    category: '11. Social SyllabiQ (Direct World & 1-on-1 Private)',
    exactDataCollected:
      'Scholar Profile ID (SLQ-USR-XXXXXXXX), Candidate Display Name, text messages, shared FlexCard attachments, and 1-on-1 Private Connection status (zero group chats or group memberships exist).',
    purposeAndUsage:
      'Enables distraction-free academic communication in World (searchable by Profile ID) and strictly 1-on-1 Private conversations where only names are displayed and only verified FlexCards (never photos, files, or external links) can be shared.',
    whoCanAccess: 'World (App Users) or 1-on-1 Connected Peer',
  },
  {
    category: '12. Private Granular Credential Vault Grants',
    exactDataCollected:
      'Candidate-selected Vault Permission Scope per connected peer (All FlexCards + Report Card, All FlexCards Only, Report Card Only, or Single Specific Credential) and revocation state.',
    purposeAndUsage:
      'Ensures connected peers in Private can only inspect the exact FlexCards and/or Report Card you explicitly allow them to view, revocable in one click.',
    whoCanAccess: 'Explicitly Permitted Connected Peer Only',
  },
  {
    category: '13. XP Deductions & AI Ethics Recovery',
    exactDataCollected:
      'Admin XP Deduction records, mandatory infraction reason message, and Academic Integrity & Ethics module completion status (+40% fractional XP recovery).',
    purposeAndUsage:
      'Provides transparent accountability when conduct or timed-test rules are breached, and lets candidates earn back 40% of deducted XP once by completing a reflective AI Ethics module on what happened and why it was wrong.',
    whoCanAccess: 'Candidate & Authorized Academic Admins',
  },
  {
    category: '14. Suspension Appeals & Super Admin Review',
    exactDataCollected:
      'Account Suspension reason, AI-optimized Accountability FlexCard draft, Automated Appeal Interview transcript, and AI Structured Appeal Summary.',
    purposeAndUsage:
      'Allows restricted candidates to share an Accountability FlexCard or complete a guided AI Appeal Interview forwarded to the Super Admin, who holds exclusive authority to approve an unban.',
    whoCanAccess: 'Candidate & Super Admin (Unban Exclusive)',
  },
  {
    category: '15. Peer Referral Codes',
    exactDataCollected:
      'Personal Candidate Referral Code (SLQ-REF-XXXXXXXX) and optional Linked Classmate Referral Code.',
    purposeAndUsage:
      'Lets scholars invite batchmates to SyllabiQ across WhatsApp, Gmail, LinkedIn, and X without exposing private contact lists.',
    whoCanAccess: 'Candidate & Authorized Academic Admins',
  },
];

export const PrivacyPolicyModal: React.FC<PrivacyPolicyModalProps> = ({ onClose }) => {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/60 p-4 backdrop-blur-xs"
      role="dialog"
      aria-modal="true"
      aria-labelledby="privacy-policy-modal-title"
    >
      <div className="w-full max-w-4xl max-h-[90vh] flex flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white">
        {/* Header */}
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 sm:px-6 py-4 sm:py-5 bg-slate-50/80">
          <div className="flex items-start gap-3 min-w-0 flex-1">
            <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-slate-900 text-white">
              <ShieldCheck className="h-5 w-5 text-sky-400" />
            </div>
            <div className="min-w-0">
              <p className="text-xs font-medium text-slate-500">
                SyllabiQ Transparency &amp; Data Protection Charter
              </p>
              <h2
                id="privacy-policy-modal-title"
                className="font-display text-base sm:text-xl font-bold text-slate-900 leading-snug"
              >
                Candidate Privacy Policy &amp; Complete Data Usage Inventory
              </h2>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={() => downloadPrivacyPolicyPdf(DATA_DISCLOSURE_ITEMS)}
              className="hidden sm:inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5 text-sky-600" />
              <span>Download PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              aria-label="Close Privacy Policy"
              className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-200/70 hover:text-slate-900"
            >
              <X className="h-4 w-4" />
            </button>
          </div>
        </div>

        {/* Scrollable Content */}
        <div className="flex-1 overflow-y-auto px-6 py-5 space-y-6">
          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm text-slate-700 leading-relaxed">
            <p className="font-semibold text-slate-900">
              Plain-Language Commitment: Zero Third-Party Ads · Strict Educational Purpose
            </p>
            <p className="mt-1 text-xs text-slate-600 leading-relaxed">
              SyllabiQ operates completely free of third-party advertising networks, behavioral ad
              trackers, or data brokers. Every piece of information collected from a candidate exists
              solely to build your adaptive exam roadmap and mastery analytics, verify QR &amp;
              serial-backed XP FlexCards and Report Cards, power Profile ID-searchable World and
              1-on-1 Private Social SyllabiQ conversations, support fair ethics XP recovery and
              Super Admin appeals, and enable opt-in mentor check-ins via Gmail or WhatsApp.
            </p>
          </div>

          {/* Complete Itemized Inventory */}
          <div>
            <h3 className="font-display text-base font-bold text-slate-900">
              1. Every Information Item We Collect &amp; Exact Reason We Use It ({DATA_DISCLOSURE_ITEMS.length} Categories)
            </h3>
            <p className="mt-1 text-xs text-slate-500">
              Full field-by-field disclosure covering authentication, contact isolation, syllabus
              mastery analytics, 60-day skill refresh, QR-verifiable serials, Social SyllabiQ 1-on-1
              vault permissions, ethics recovery, and Super Admin appeals.
            </p>

            <div className="mt-3 overflow-x-auto rounded-xl border border-slate-200">
              <table className="w-full text-left border-collapse">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs font-semibold text-slate-700">
                    <th className="py-3 px-4 w-48">Data Category</th>
                    <th className="py-3 px-4 w-64">Exact Information Collected</th>
                    <th className="py-3 px-4">Why We Collect &amp; How We Use It</th>
                    <th className="py-3 px-4 w-44">Access Scope</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-200 text-xs text-slate-600">
                  {DATA_DISCLOSURE_ITEMS.map((row) => (
                    <tr key={row.category} className="hover:bg-slate-50/70 align-top">
                      <td className="py-3 px-4 font-semibold text-slate-900">{row.category}</td>
                      <td className="py-3 px-4 text-slate-700 leading-relaxed">
                        {row.exactDataCollected}
                      </td>
                      <td className="py-3 px-4 text-slate-600 leading-relaxed">
                        {row.purposeAndUsage}
                      </td>
                      <td className="py-3 px-4 text-slate-700 font-medium">{row.whoCanAccess}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          </div>

          {/* Governance, Inactivity & Social Sharing Rules */}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                <Lock className="h-4 w-4 text-sky-600 shrink-0" />
                <span>Zero-Trust PII &amp; Photo Isolation</span>
              </div>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                Other scholars in Social SyllabiQ never see your Gmail or WhatsApp phone number—only
                your name and Profile ID. You decide whether your profile photo is visible to
                Everyone in World or strictly to 1-on-1 connected Private peers.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                <CheckCircle2 className="h-4 w-4 text-emerald-600 shrink-0" />
                <span>Fair Governance &amp; Super Admin Appeals</span>
              </div>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                Minor infractions carry reasoned XP deductions with a 40% AI Ethics recovery path.
                Suspended accounts retain Accountability FlexCard access and an automated AI Appeal
                Interview reviewed exclusively by the Super Admin.
              </p>
            </div>

            <div className="rounded-xl border border-slate-200 p-4">
              <div className="flex items-center gap-2 text-xs font-semibold text-slate-900">
                <ShieldCheck className="h-4 w-4 text-indigo-600 shrink-0" />
                <span>Granular Private Vault &amp; Serials</span>
              </div>
              <p className="mt-2 text-xs text-slate-600 leading-relaxed">
                You control whether a connected peer can view all FlexCards + Report Card, FlexCards
                only, Report Card only, or one individual credential. External non-admin serial checks
                always notify you with the verifier’s Name, Gmail, and Post.
              </p>
            </div>
          </div>
        </div>

        {/* Footer */}
        <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 bg-slate-50 px-4 sm:px-6 py-3.5">
          <p className="text-xs text-slate-500">
            Primary Data Controller &amp; Super Admin Governance · SyllabiQ Academic Platform
          </p>
          <div className="flex flex-wrap items-center gap-2 w-full sm:w-auto">
            <button
              type="button"
              onClick={() => downloadPrivacyPolicyPdf(DATA_DISCLOSURE_ITEMS)}
              className="flex-1 sm:flex-initial inline-flex items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-100 whitespace-nowrap shrink-0"
            >
              <Download className="h-3.5 w-3.5 text-sky-600" />
              <span>Download PDF</span>
            </button>
            <button
              type="button"
              onClick={onClose}
              className="flex-1 sm:flex-initial rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0 text-center"
            >
              Acknowledge &amp; Close
            </button>
          </div>
        </div>
      </div>
    </div>
  );
};

