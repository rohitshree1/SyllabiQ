import React, { useState } from 'react';
import {
  ArrowRight,
  Bell,
  BookOpen,
  Cloud,
  ExternalLink,
  Info,
  Loader2,
  SearchCheck,
  ShieldCheck,
  Sparkles,
} from 'lucide-react';
import { FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID } from '../firebase';
import {
  BOOTSTRAPPED_SUPER_ADMIN_EMAIL,
  type SandboxRolePreviewMode,
} from '../utils/firestoreValidators';
import type { CloudTokenDiagnostic } from '../utils/firebaseConnectionGuard';
import type { GlobalUpdateDoc } from '../types';
import {
  formatPostRoleLabel,
  generateFlexCardSerial,
  generateReportCardSerial,
} from '../utils/verificationAndReferral';
import { t } from '../utils/translations';
import heroDeskImg from '../assets/images/hero_study_desk_1793010659656.jpg';

export type { SandboxRolePreviewMode };

interface LoginEntryScreenProps {
  pinnedUpdate: GlobalUpdateDoc | null;
  isHydratingAuth: boolean;
  referredByCode?: string;
  cloudTokenDiagnostic?: CloudTokenDiagnostic | null;
  onDismissTokenDiagnostic?: () => void;
  onGoogleLogin: () => Promise<void>;
  onMicrosoftLogin: () => Promise<void>;
  onEnterLocalPreview: (
    roleMode: SandboxRolePreviewMode,
    loadDemoSyllabus: boolean,
    previewBanned?: boolean
  ) => void;
  onOpenVerifyModal: (prefillSerial?: string) => void;
  onOpenPrivacyPolicy: () => void;
}

const SHOWCASE_FLEX_SERIAL_1 = generateFlexCardSerial('sandbox-candidate', 'SCHOLAR_FLEX');
const SHOWCASE_FLEX_SERIAL_2 = generateFlexCardSerial('sandbox-candidate', 'PYQ_CRUSHER');
const SHOWCASE_REPORT_SERIAL = generateReportCardSerial('sandbox-candidate', 'ALL');

export const LoginEntryScreen: React.FC<LoginEntryScreenProps> = ({
  pinnedUpdate,
  isHydratingAuth,
  referredByCode,
  cloudTokenDiagnostic,
  onDismissTokenDiagnostic,
  onGoogleLogin,
  onMicrosoftLogin,
  onEnterLocalPreview,
  onOpenVerifyModal,
  onOpenPrivacyPolicy,
}) => {
  const [authLoading, setAuthLoading] = useState<'google' | 'microsoft' | null>(null);
  const [authError, setAuthError] = useState<string>('');
  const [showMicrosoftHelp, setShowMicrosoftHelp] = useState<boolean>(false);
  const [heroImgFailed, setHeroImgFailed] = useState<boolean>(false);

  const handleProviderSignIn = async (provider: 'google' | 'microsoft') => {
    setAuthError('');
    setAuthLoading(provider);
    try {
      if (provider === 'google') {
        await onGoogleLogin();
      } else {
        await onMicrosoftLogin();
      }
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('auth/popup-closed-by-user')) {
        setAuthError(
          'Sign-in popup was closed before completing authentication. Click again when ready.'
        );
      } else if (
        provider === 'microsoft' &&
        (msg.includes('auth/operation-not-allowed') || msg.includes('provider is disabled'))
      ) {
        setAuthError(
          'Microsoft OAuth needs to be toggled ON in your Firebase Console (setup guide expanded below).'
        );
        setShowMicrosoftHelp(true);
      } else {
        setAuthError(msg.replace('Firebase: ', ''));
      }
    } finally {
      setAuthLoading(null);
    }
  };

  return (
    <div className="min-h-screen text-slate-900 flex flex-col">
      {/* Strict 3-Zone Top Bar Contract */}
      <header className="glass-header sticky top-0 z-30 flex items-center justify-between gap-8 px-6 py-4">
        <a
          href="./"
          className="font-display text-lg font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0"
        >
          SyllabiQ
        </a>

        <nav
          aria-label="Platform overview"
          className="hidden md:flex items-center gap-6 text-sm font-medium text-slate-600"
        >
          <a
            href="#about-web-showcase"
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            {t('aboutSyllabiq')}
          </a>
          <a
            href="#flexcards-showcase"
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            {t('rareFlexCards')}
          </a>
          <button
            type="button"
            onClick={() => onOpenVerifyModal()}
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {t('verifySerialNav')}
          </button>
          <a
            href="#admin-governance-note"
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0"
          >
            {t('adminGovernance')}
          </a>
          <button
            type="button"
            onClick={onOpenPrivacyPolicy}
            className="hover:text-slate-900 transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            {t('privacyPolicy')}
          </button>
        </nav>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            disabled={authLoading !== null || isHydratingAuth}
            onClick={() => handleProviderSignIn('google')}
            className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60 whitespace-nowrap shrink-0"
          >
            <Cloud className="h-3.5 w-3.5 text-sky-400" />
            <span>{t('signInWithGoogle')}</span>
          </button>
        </div>
      </header>

      <main className="flex-1 w-full max-w-6xl mx-auto px-5 sm:px-8 py-7 sm:py-10 space-y-8">
        {/* Layered Pre-Login Stage: Full Background Canvas (About SyllabiQ + Collectible FlexCards) with Elevated Google Login on Top */}
        <section
          id="login-panel"
          aria-labelledby="login-gate-heading"
          className="relative rounded-3xl overflow-hidden border border-slate-800/80 bg-slate-950 text-white"
        >
          {/* Atmospheric Background Layer */}
          <div className="absolute inset-0 pointer-events-none">
            {!heroImgFailed ? (
              <img
                src={heroDeskImg}
                alt="Organized academic engineering study desk with syllabus timetable and exam notes"
                referrerPolicy="no-referrer"
                onError={() => setHeroImgFailed(true)}
                className="w-full h-full object-cover opacity-25"
              />
            ) : (
              <div className="w-full h-full bg-gradient-to-br from-slate-950 via-slate-900 to-sky-950 flex items-center justify-center">
                <BookOpen className="h-16 w-16 text-sky-300/20" />
              </div>
            )}
            <div className="absolute inset-0 bg-gradient-to-r from-slate-950/95 via-slate-950/88 to-slate-900/80" />
          </div>

          <div className="relative z-10 p-6 sm:p-8 lg:p-10 grid grid-cols-1 lg:grid-cols-12 gap-8 items-stretch">
            {/* Background Showcase Column: About the Web + Live Collectible Rare FlexCards */}
            <div className="lg:col-span-7 flex flex-col justify-between space-y-6">
              <div className="space-y-3">
                <p className="text-xs font-semibold text-sky-300 tracking-wide">
                  Adaptive Exam &amp; Syllabus Studio · Verifiable XP Credentials
                </p>
                <h2 className="font-display text-2xl sm:text-4xl font-bold tracking-tight text-white leading-tight">
                  Master High-Yield PYQs at peak alertness and mint verifiable Rare FlexCards
                </h2>
                <p className="text-sm text-slate-300 leading-relaxed max-w-2xl">
                  SyllabiQ parses your Board or University syllabus, assigns tough subjects to your
                  sharpest cognitive hours, drills exam speed in compressed timers, and stamps every
                  FlexCard and Report Card with a publicly verifiable serial number.
                </p>

                <div className="pt-1 flex flex-wrap items-center gap-x-3 gap-y-1.5 text-xs text-slate-300">
                  <span>Zero-Ad Study Sanctuary</span>
                  <span aria-hidden="true">·</span>
                  <span>12-Line AI Student Dossier</span>
                  <span aria-hidden="true">·</span>
                  <span>5 Auto-Upgrading Rarity Tiers</span>
                  <span aria-hidden="true">·</span>
                  <span>Anti-Forgery Serial Registry</span>
                </div>
              </div>

              {/* Collectible Rare FlexCards Showcase Layer */}
              <div id="flexcards-showcase" className="space-y-3">
                <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-amber-300 inline-flex items-center gap-1.5">
                    <Sparkles className="h-3.5 w-3.5 shrink-0" />
                    <span>Live Collectible FlexCards &amp; Official Serials</span>
                  </span>
                  <button
                    type="button"
                    onClick={() => onOpenVerifyModal(SHOWCASE_FLEX_SERIAL_1)}
                    className="inline-flex items-center gap-1.5 font-semibold text-sky-300 hover:text-white underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
                  >
                    <SearchCheck className="h-3.5 w-3.5" />
                    <span>Verify Any Card or Report Serial</span>
                  </button>
                </div>

                <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
                  {/* Showcase FlexCard 1: Mythic Sovereign */}
                  <div className="rounded-2xl border border-amber-400/60 bg-slate-900/90 p-4 space-y-2.5">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-semibold text-amber-300">
                        Mythic Sovereign · Top 1%
                      </span>
                      <span className="font-mono tabular-nums font-bold text-white">1,850 XP</span>
                    </div>
                    <div>
                      <p className="font-display text-sm font-bold text-white">
                        Overall Scholar Readiness
                      </p>
                      <p className="text-xs text-slate-300 mt-0.5">
                        DTU B.Tech Scholar · 8.1/10 PYQ Rating
                      </p>
                    </div>
                    <div className="border-t border-white/10 pt-2 flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-mono tabular-nums text-sky-300">
                        {SHOWCASE_FLEX_SERIAL_1}
                      </span>
                      <button
                        type="button"
                        onClick={() => onOpenVerifyModal(SHOWCASE_FLEX_SERIAL_1)}
                        className="font-semibold text-slate-200 hover:text-white underline underline-offset-2 whitespace-nowrap"
                      >
                        Test Serial
                      </button>
                    </div>
                  </div>

                  {/* Showcase FlexCard 2: Epic Amethyst + Report Card */}
                  <div className="rounded-2xl border border-purple-400/50 bg-slate-900/90 p-4 space-y-2.5">
                    <div className="flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-semibold text-purple-300">
                        PYQ Speed-Drill Crusher
                      </span>
                      <span className="font-mono tabular-nums font-bold text-white">8.4 / 10</span>
                    </div>
                    <div>
                      <p className="font-display text-sm font-bold text-white">
                        Verifiable Report Card &amp; Badge
                      </p>
                      <p className="text-xs text-slate-300 mt-0.5">
                        Non-admin checks alert the scholar with Name, Gmail &amp; Post
                      </p>
                    </div>
                    <div className="border-t border-white/10 pt-2 flex items-center justify-between gap-2 text-[11px]">
                      <span className="font-mono tabular-nums text-sky-300">
                        {SHOWCASE_REPORT_SERIAL}
                      </span>
                      <button
                        type="button"
                        onClick={() => onOpenVerifyModal(SHOWCASE_REPORT_SERIAL)}
                        className="font-semibold text-slate-200 hover:text-white underline underline-offset-2 whitespace-nowrap"
                      >
                        Test Report
                      </button>
                    </div>
                  </div>
                </div>

                {pinnedUpdate && (
                  <div className="rounded-xl border border-white/15 bg-slate-900/80 px-4 py-3 text-xs flex flex-wrap items-center justify-between gap-2">
                    <div className="flex items-center gap-2 min-w-0">
                      <Bell className="h-3.5 w-3.5 text-sky-300 shrink-0" />
                      <span className="font-semibold text-white truncate">{pinnedUpdate.title}</span>
                      <span aria-hidden="true" className="text-slate-500">
                        ·
                      </span>
                      <span className="font-semibold text-sky-300 shrink-0">
                        {pinnedUpdate.authorName} ·{' '}
                        {formatPostRoleLabel(pinnedUpdate.authorRoleLabel) ||
                          pinnedUpdate.authorRoleLabel}
                      </span>
                      <span aria-hidden="true" className="text-slate-500">
                        ·
                      </span>
                      <span className="text-slate-300 truncate">{pinnedUpdate.body}</span>
                    </div>
                  </div>
                )}
              </div>
            </div>

            {/* Elevated Foreground Card: Primary Google Login Option on Top */}
            <div className="lg:col-span-5 bg-white text-slate-900 rounded-2xl p-6 sm:p-7 shadow-xl flex flex-col justify-between space-y-5">
              <div className="space-y-4">
                {referredByCode && (
                  <div className="rounded-xl border border-emerald-200 bg-emerald-50/90 px-3.5 py-2.5 text-xs text-emerald-950">
                    Invited via Scholar Referral{' '}
                    <strong className="font-mono">{referredByCode}</strong> — sign in below to link
                    your study roadmap.
                  </div>
                )}

                <div className="space-y-1.5">
                  <p className="text-xs font-semibold text-sky-700">
                    Google Cloud Sign-In · Persistent Workspace
                  </p>
                  <h1
                    id="login-gate-heading"
                    className="font-display text-2xl font-bold tracking-tight text-slate-900"
                  >
                    Sign in with Google to start
                  </h1>
                  <p className="text-xs text-slate-600 leading-relaxed">
                    Restore your syllabus, alertness timetable,{' '}
                    <span className="font-mono tabular-nums">/10</span> PYQ Report Card, AI Student
                    Dossier, and verifiable Rare FlexCards.
                  </p>
                </div>

                {cloudTokenDiagnostic && (
                  <div
                    role="status"
                    data-testid="cloud-token-diagnostic-banner"
                    className="rounded-xl border border-sky-200 bg-sky-50/90 px-4 py-3 text-xs text-slate-800 space-y-2"
                  >
                    <p className="font-semibold text-slate-900">
                      {cloudTokenDiagnostic.kind === 'token_service_disabled'
                        ? 'Cloud Token Refresh Setup Needed (Google Cloud API)'
                        : 'Cloud Session Expired — Sign In Again to Reconnect'}
                    </p>
                    <p className="leading-relaxed text-slate-700">{cloudTokenDiagnostic.summary}</p>
                    <div className="flex flex-wrap items-center gap-2.5">
                      {cloudTokenDiagnostic.kind === 'token_service_disabled' && (
                        <a
                          href={cloudTokenDiagnostic.activationUrl}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="inline-flex items-center gap-1.5 rounded-lg bg-sky-700 px-3 py-1.5 text-xs font-semibold text-white hover:bg-sky-800 transition-colors whitespace-nowrap shrink-0"
                        >
                          <span>Enable Token Service API</span>
                          <ExternalLink className="h-3.5 w-3.5" />
                        </a>
                      )}
                      {onDismissTokenDiagnostic && (
                        <button
                          type="button"
                          onClick={onDismissTokenDiagnostic}
                          className="text-xs font-semibold text-slate-600 hover:text-slate-900 underline underline-offset-4 whitespace-nowrap shrink-0"
                        >
                          Dismiss
                        </button>
                      )}
                    </div>
                  </div>
                )}

                {authError && (
                  <div
                    role="alert"
                    className="rounded-xl border border-amber-200 bg-amber-50/95 px-4 py-3 text-xs font-medium text-amber-900"
                  >
                    ▲ {authError}
                  </div>
                )}

                {/* Primary Google Login Option Elevated on Top */}
                <div className="space-y-2.5">
                  <button
                    type="button"
                    disabled={authLoading !== null || isHydratingAuth}
                    onClick={() => handleProviderSignIn('google')}
                    className="w-full flex items-center justify-center gap-3 rounded-xl bg-slate-900 px-5 py-3.5 text-sm font-semibold text-white transition-colors hover:bg-slate-800 disabled:opacity-60 whitespace-nowrap"
                  >
                    {authLoading === 'google' || isHydratingAuth ? (
                      <Loader2 className="h-4 w-4 animate-spin text-sky-400 shrink-0" />
                    ) : (
                      <svg className="h-4 w-4 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
                        <path
                          fill="#4285F4"
                          d="M23.49 12.27c0-.79-.07-1.54-.19-2.27H12v4.51h6.47c-.29 1.48-1.14 2.73-2.4 3.58v3h3.86c2.26-2.09 3.56-5.17 3.56-8.82z"
                        />
                        <path
                          fill="#34A853"
                          d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.86-3c-1.08.72-2.45 1.16-4.07 1.16-3.13 0-5.78-2.11-6.73-4.96H1.29v3.09C3.26 21.3 7.31 24 12 24z"
                        />
                        <path
                          fill="#FBBC05"
                          d="M5.27 14.29c-.25-.72-.38-1.49-.38-2.29s.13-1.57.38-2.29V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.98-3.09z"
                        />
                        <path
                          fill="#EA4335"
                          d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.98 3.09c.95-2.85 3.6-4.96 6.73-4.96z"
                        />
                      </svg>
                    )}
                    <span>
                      {isHydratingAuth ? 'Checking Cloud Session...' : 'Continue with Google'}
                    </span>
                  </button>

                  <button
                    type="button"
                    disabled={authLoading !== null || isHydratingAuth}
                    onClick={() => handleProviderSignIn('microsoft')}
                    className="w-full flex items-center justify-center gap-3 rounded-xl border border-slate-300 bg-white px-5 py-2.5 text-xs font-semibold text-slate-900 transition-colors hover:bg-slate-50 disabled:opacity-60 whitespace-nowrap"
                  >
                    {authLoading === 'microsoft' ? (
                      <Loader2 className="h-4 w-4 animate-spin text-sky-600 shrink-0" />
                    ) : (
                      <svg className="h-3.5 w-3.5 shrink-0" viewBox="0 0 23 23" aria-hidden="true">
                        <rect x="1" y="1" width="10" height="10" fill="#F25022" />
                        <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
                        <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
                        <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
                      </svg>
                    )}
                    <span>Continue with Microsoft</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => onOpenVerifyModal()}
                    className="w-full flex items-center justify-center gap-2 rounded-xl border border-sky-200 bg-sky-50/85 px-4 py-2.5 text-xs font-semibold text-sky-900 transition-colors hover:bg-sky-100 whitespace-nowrap"
                  >
                    <SearchCheck className="h-3.5 w-3.5 text-sky-700 shrink-0" />
                    <span>Verify FlexCard or Report Card Serial</span>
                  </button>
                </div>

                {/* Admin Role Recognition Notice */}
                <div
                  id="admin-governance-note"
                  className="rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600 space-y-1 leading-relaxed"
                >
                  <p className="font-semibold text-slate-900 inline-flex items-center gap-1.5">
                    <ShieldCheck className="h-3.5 w-3.5 text-sky-600 shrink-0" />
                    <span>Google Admin &amp; Restricted Login Support</span>
                  </p>
                  <p>
                    Super Admin (<span className="font-mono">{BOOTSTRAPPED_SUPER_ADMIN_EMAIL}</span>
                    ) &amp; invited Gmail Admins unlock XP Bonus/Deduction &amp; Outreach tools.
                    Restricted accounts sign in directly to Accountability FlexCard mode.
                  </p>
                </div>

                {/* Expandable Microsoft Azure OAuth Instructions */}
                <div>
                  <button
                    type="button"
                    onClick={() => setShowMicrosoftHelp((v) => !v)}
                    aria-expanded={showMicrosoftHelp}
                    className="inline-flex items-center gap-1.5 text-[11px] font-medium text-slate-500 hover:text-slate-900 transition-colors"
                  >
                    <Info className="h-3.5 w-3.5 text-sky-600 shrink-0" />
                    <span>
                      {showMicrosoftHelp
                        ? 'Hide Microsoft OAuth setup guide'
                        : 'Need Microsoft Sign-In? View 3-step Firebase Console setup'}
                    </span>
                  </button>

                  {showMicrosoftHelp && (
                    <div className="mt-2 rounded-xl border border-slate-200 bg-slate-50 p-3 text-[11px] text-slate-600 space-y-1 leading-relaxed">
                      <p>
                        01. Open Firebase Console (
                        <span className="font-mono">{FIREBASE_PROJECT_ID}</span>) &rarr;{' '}
                        <strong>Authentication &rarr; Sign-in method &rarr; Microsoft</strong>.
                      </p>
                      <p>02. Paste your Azure Entra Application Client ID &amp; Secret.</p>
                      <p>
                        03. Register Redirect URI:{' '}
                        <span className="font-mono text-slate-900 break-all">
                          https://{FIREBASE_AUTH_DOMAIN}/__/auth/handler
                        </span>
                      </p>
                    </div>
                  )}
                </div>
              </div>

              {/* Interactive Local Workspace & Role Preview */}
              <div className="border-t border-slate-200 pt-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2 text-xs">
                  <span className="font-semibold text-slate-800">
                    Interactive Sandbox (Instant Demo)
                  </span>
                  <button
                    type="button"
                    onClick={() => onEnterLocalPreview('none', false, false)}
                    className="font-semibold text-sky-700 hover:underline whitespace-nowrap shrink-0"
                  >
                    New Syllabus Setup &rarr;
                  </button>
                </div>

                <div className="flex flex-wrap items-center gap-1.5">
                  <button
                    type="button"
                    onClick={() => onEnterLocalPreview('none', true, false)}
                    className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-semibold text-slate-800 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
                  >
                    <span>Candidate Workspace</span>
                    <ArrowRight className="h-3.5 w-3.5 text-sky-600" />
                  </button>

                  <button
                    type="button"
                    onClick={() => onEnterLocalPreview('none', true, true)}
                    className="rounded-lg border border-amber-200 bg-amber-50/90 px-3 py-1.5 text-xs font-medium text-amber-950 hover:bg-amber-100 transition-colors whitespace-nowrap shrink-0"
                  >
                    Banned Flex Mode
                  </button>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* About the Web & Positive Outcomes Strip */}
        <section
          id="about-web-showcase"
          aria-label="About SyllabiQ and verifiable credentials"
          className="glass-panel rounded-2xl p-6 sm:p-7 space-y-6"
        >
          <div className="flex flex-col sm:flex-row sm:items-end justify-between gap-4 border-b border-slate-200/80 pb-4">
            <div>
              <p className="text-xs font-semibold text-sky-700">
                About SyllabiQ · Engineered for Measurable Exam Gains
              </p>
              <h2 className="font-display text-xl font-bold text-slate-900">
                Everything inside your distraction-free academic studio
              </h2>
            </div>
            <button
              type="button"
              onClick={() => onOpenVerifyModal(SHOWCASE_FLEX_SERIAL_2)}
              className="inline-flex items-center gap-1.5 text-xs font-semibold text-sky-700 hover:text-sky-900 underline underline-offset-4 whitespace-nowrap shrink-0"
            >
              <span>Check Sample Serial ({SHOWCASE_FLEX_SERIAL_2})</span>
              <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-6 divide-y sm:divide-y-0 sm:divide-x divide-slate-200/80">
            <div className="pt-3 sm:pt-0 sm:pr-4 first:pt-0">
              <p className="font-mono tabular-nums text-xs font-semibold text-sky-700">
                01. Peak Alertness &amp; Templates
              </p>
              <h3 className="mt-1 font-display text-sm font-bold text-slate-900">
                30-Second Cognitive Mapping
              </h3>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                Start with 1-click board/university templates or upload your syllabus; hardest units
                schedule into your sharpest hours with smooth missed-day rebalancing.
              </p>
            </div>

            <div className="pt-3 sm:pt-0 sm:px-4">
              <p className="font-mono tabular-nums text-xs font-semibold text-sky-700">
                02. PYQ Velocity &amp; Mastery
              </p>
              <h3 className="mt-1 font-display text-sm font-bold text-slate-900">
                Compressed /10 &amp; Trend Charts
              </h3>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                Daily past-paper drills compress exam clocks by 35%, plot live Study Mastery Progress
                Over Time charts, and author your AI Student Dossier.
              </p>
            </div>

            <div className="pt-3 sm:pt-0 sm:px-4">
              <p className="font-mono tabular-nums text-xs font-semibold text-sky-700">
                03. QR FlexCards &amp; Profile IDs
              </p>
              <h3 className="mt-1 font-display text-sm font-bold text-slate-900">
                One-Scan Verify &amp; 1-on-1 Chat
              </h3>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                Downloaded FlexCards &amp; Report Cards embed scannable QR serials, 7-day luster
                alerts, and Profile ID lookup for direct World &amp; 1-on-1 Private rooms.
              </p>
            </div>

            <div className="pt-3 sm:pt-0 sm:pl-4">
              <p className="font-mono tabular-nums text-xs font-semibold text-sky-700">
                04. Fair Ethics &amp; Appeals
              </p>
              <h3 className="mt-1 font-display text-sm font-bold text-slate-900">
                XP Recovery &amp; Super Admin Review
              </h3>
              <p className="mt-1 text-xs text-slate-600 leading-relaxed">
                Authorized Admins send mentor outreach or reasoned XP deductions (40% recoverable via
                AI Ethics), with AI-assisted suspension appeals to Super Admin.
              </p>
            </div>
          </div>
        </section>
      </main>

      <footer className="border-t border-slate-200/80 bg-white/70 px-6 py-4">
        <div className="max-w-6xl mx-auto flex flex-col sm:flex-row items-center justify-between gap-3 text-xs text-slate-500">
          <p>SyllabiQ Adaptive Exam &amp; Syllabus Studio · Distraction-Free Zero-Ad Workspace</p>
          <div className="flex flex-wrap items-center gap-4">
            <button
              type="button"
              onClick={() => onOpenVerifyModal()}
              className="font-semibold text-slate-700 hover:text-slate-900 underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Verify Credential Serial
            </button>
            <button
              type="button"
              onClick={onOpenPrivacyPolicy}
              className="font-semibold text-slate-700 hover:text-slate-900 underline underline-offset-4 transition-colors whitespace-nowrap shrink-0"
            >
              Privacy Policy &amp; Candidate Data Usage
            </button>
          </div>
        </div>
      </footer>
    </div>
  );
};
