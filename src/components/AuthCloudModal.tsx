import React, { useState } from 'react';
import {
  CheckCircle2,
  Cloud,
  ExternalLink,
  Info,
  Loader2,
  LogOut,
  RefreshCw,
  ShieldCheck,
  X,
} from 'lucide-react';
import { FIREBASE_AUTH_DOMAIN, FIREBASE_PROJECT_ID } from '../firebase';
import type { SandboxRolePreviewMode } from '../utils/firestoreValidators';
import type { CloudTokenDiagnostic } from '../utils/firebaseConnectionGuard';
import type {
  AuthenticatedAccount,
  CandidateSummaryDoc,
  StaffAccessProfile,
} from '../types';

interface AuthCloudModalProps {
  isOpen: boolean;
  onClose: () => void;
  account: AuthenticatedAccount | null;
  candidateSummary: CandidateSummaryDoc | null;
  staffAccess: StaffAccessProfile;
  isSyncing: boolean;
  cloudTokenDiagnostic?: CloudTokenDiagnostic | null;
  onDismissTokenDiagnostic?: () => void;
  onGoogleLogin: () => Promise<void>;
  onMicrosoftLogin: () => Promise<void>;
  onSignOut: () => Promise<void>;
  onManualSyncNow: () => Promise<void>;
  onSelectSandboxRole?: (mode: SandboxRolePreviewMode) => void;
  onReturnToLoginPortal?: () => void;
  onOpenPrivacyPolicy?: () => void;
  showSandboxPreviewControls?: boolean;
}

export const AuthCloudModal: React.FC<AuthCloudModalProps> = ({
  isOpen,
  onClose,
  account,
  candidateSummary,
  staffAccess,
  isSyncing,
  cloudTokenDiagnostic,
  onDismissTokenDiagnostic,
  onGoogleLogin,
  onMicrosoftLogin,
  onSignOut,
  onManualSyncNow,
  onSelectSandboxRole,
  onReturnToLoginPortal,
  onOpenPrivacyPolicy,
  showSandboxPreviewControls = false,
}) => {
  const [authLoading, setAuthLoading] = useState<'google' | 'microsoft' | null>(null);
  const [authError, setAuthError] = useState<string>('');
  const [showMicrosoftSetupHelp, setShowMicrosoftSetupHelp] = useState<boolean>(false);

  if (!isOpen) return null;

  const handleProviderClick = async (provider: 'google' | 'microsoft') => {
    setAuthError('');
    setAuthLoading(provider);
    try {
      if (provider === 'google') {
        await onGoogleLogin();
      } else {
        await onMicrosoftLogin();
      }
      onClose();
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      if (msg.includes('auth/popup-closed-by-user')) {
        setAuthError('Sign-in popup was closed before completion. Click again when ready.');
      } else if (
        provider === 'microsoft' &&
        (msg.includes('auth/operation-not-allowed') || msg.includes('provider is disabled'))
      ) {
        setAuthError(
          'Microsoft Sign-In needs to be toggled ON in your Firebase Console (1-minute setup shown below).'
        );
        setShowMicrosoftSetupHelp(true);
      } else {
        setAuthError(msg.replace('Firebase: ', ''));
      }
    } finally {
      setAuthLoading(null);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/50 p-4 backdrop-blur-sm"
      role="dialog"
      aria-modal="true"
      aria-labelledby="cloud-auth-modal-title"
    >
      <div className="glass-panel w-full max-w-lg rounded-2xl p-6 sm:p-7">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200/80 pb-4">
          <div>
            <p className="text-xs font-semibold text-sky-700">
              Persistent Candidate Cloud Account
            </p>
            <h2
              id="cloud-auth-modal-title"
              className="mt-0.5 font-display text-xl font-bold text-slate-900"
            >
              {account ? 'Cloud Sync & Account Profile' : 'Sign In to Save Your Study Roadmap'}
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Account Modal"
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-200/60 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {cloudTokenDiagnostic && !account && (
          <div
            role="status"
            className="mt-4 rounded-xl border border-sky-200 bg-sky-50/90 px-4 py-3 text-xs text-slate-800 space-y-2"
          >
            <p className="font-semibold text-slate-900">
              {cloudTokenDiagnostic.kind === 'token_service_disabled'
                ? 'Token Service API Required for Auto-Refresh'
                : 'Cloud Session Expired'}
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
            className="mt-4 rounded-xl border border-amber-200 bg-amber-50/90 px-4 py-3 text-xs font-medium text-amber-900"
          >
            ▲ {authError}
          </div>
        )}

        {!account ? (
          <div className="mt-5 space-y-4">
            <p className="text-xs text-slate-600 leading-relaxed">
              Sign in with <strong className="text-slate-900">Google</strong> or{' '}
              <strong className="text-slate-900">Microsoft</strong> so your uploaded syllabus,
              alertness timetable, <span className="font-mono tabular-nums">/10</span> subject
              scores, report cards, and admin bonuses stay permanently backed up—even if you return
              months later.
            </p>

            <div className="space-y-3 pt-1">
              <button
                type="button"
                disabled={authLoading !== null}
                onClick={() => handleProviderClick('google')}
                className="w-full flex items-center justify-center gap-3 rounded-xl border border-slate-300/90 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50 disabled:opacity-60"
              >
                {authLoading === 'google' ? (
                  <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
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
                <span>Continue with Google</span>
              </button>

              <button
                type="button"
                disabled={authLoading !== null}
                onClick={() => handleProviderClick('microsoft')}
                className="w-full flex items-center justify-center gap-3 rounded-xl border border-slate-300/90 bg-white px-4 py-3 text-sm font-semibold text-slate-900 transition-colors hover:bg-slate-50 disabled:opacity-60"
              >
                {authLoading === 'microsoft' ? (
                  <Loader2 className="h-4 w-4 animate-spin text-sky-600" />
                ) : (
                  <svg className="h-4 w-4 shrink-0" viewBox="0 0 23 23" aria-hidden="true">
                    <rect x="1" y="1" width="10" height="10" fill="#F25022" />
                    <rect x="12" y="1" width="10" height="10" fill="#7FBA00" />
                    <rect x="1" y="12" width="10" height="10" fill="#00A4EF" />
                    <rect x="12" y="12" width="10" height="10" fill="#FFB900" />
                  </svg>
                )}
                <span>Continue with Microsoft</span>
              </button>
            </div>

            {/* Microsoft Provider Setup Walkthrough */}
            <div className="border-t border-slate-200/80 pt-3">
              <button
                type="button"
                onClick={() => setShowMicrosoftSetupHelp((v) => !v)}
                aria-expanded={showMicrosoftSetupHelp}
                className="inline-flex items-center gap-1.5 text-xs font-medium text-slate-600 hover:text-slate-900"
              >
                <Info className="h-3.5 w-3.5 text-sky-600" />
                <span>
                  {showMicrosoftSetupHelp
                    ? 'Hide Microsoft Azure OAuth setup instructions'
                    : 'Administrator note: Enabling Microsoft login in Firebase Console'}
                </span>
              </button>

              {showMicrosoftSetupHelp && (
                <div className="glass-inset mt-2.5 rounded-xl p-3.5 text-xs text-slate-600 space-y-1.5 leading-relaxed">
                  <p className="font-semibold text-slate-900">
                    Google Sign-In is pre-enabled. To activate Microsoft Sign-In:
                  </p>
                  <p>
                    01. Open Firebase Console for project{' '}
                    <span className="font-mono text-slate-900">{FIREBASE_PROJECT_ID}</span> &rarr;{' '}
                    <strong>Authentication &rarr; Sign-in method &rarr; Add new provider &rarr; Microsoft</strong>.
                  </p>
                  <p>
                    02. Create a Microsoft Entra (Azure) App Registration and paste its Application
                    (client) ID and Client Secret into Firebase.
                  </p>
                  <p>
                    03. Add this Redirect URI in Azure:{' '}
                    <span className="font-mono text-slate-900 break-all">
                      https://{FIREBASE_AUTH_DOMAIN}/__/auth/handler
                    </span>
                  </p>
                </div>
              )}
            </div>

            {showSandboxPreviewControls && onSelectSandboxRole && (
              <div className="border-t border-slate-200/80 pt-4 space-y-2.5">
                <div className="flex items-center justify-between gap-2">
                  <p className="text-xs font-semibold text-slate-800">
                    Demo Workspace Role Preview (Local Sandbox)
                  </p>
                  {onReturnToLoginPortal && (
                    <button
                      type="button"
                      onClick={() => {
                        onReturnToLoginPortal();
                        onClose();
                      }}
                      className="text-xs font-semibold text-sky-700 hover:underline whitespace-nowrap shrink-0"
                    >
                      &larr; Return to Login Screen
                    </button>
                  )}
                </div>
                <p className="text-xs text-slate-500">
                  Switch between Candidate, Primary Super Admin, Minimal Admin, and Maximum Sub-Admin
                  feature scopes:
                </p>
                <div className="flex flex-wrap items-center gap-2 pt-1">
                  <button
                    type="button"
                    onClick={() => {
                      onSelectSandboxRole('none');
                      onClose();
                    }}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                      staffAccess.tier === 'none'
                        ? 'border-sky-600 bg-sky-50 text-sky-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    Candidate View
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectSandboxRole('super_admin');
                      onClose();
                    }}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                      staffAccess.tier === 'super_admin' && staffAccess.isDemoPreview
                        ? 'border-sky-600 bg-sky-50 text-sky-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    Preview Super Admin
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectSandboxRole('sub_admin_minimal');
                      onClose();
                    }}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                      staffAccess.tier === 'sub_admin' &&
                      !staffAccess.canGrantBonuses &&
                      staffAccess.isDemoPreview
                        ? 'border-sky-600 bg-sky-50 text-sky-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    Preview Minimal Admin
                  </button>
                  <button
                    type="button"
                    onClick={() => {
                      onSelectSandboxRole('sub_admin_maximum');
                      onClose();
                    }}
                    className={`rounded-lg border px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap ${
                      staffAccess.tier === 'sub_admin' &&
                      staffAccess.canBanUsers &&
                      staffAccess.isDemoPreview
                        ? 'border-sky-600 bg-sky-50 text-sky-900'
                        : 'border-slate-200 bg-white text-slate-700 hover:bg-slate-50'
                    }`}
                  >
                    Preview Maximum Sub-Admin
                  </button>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div className="mt-5 space-y-4">
            <div className="glass-inset rounded-xl p-4 space-y-2.5 text-xs">
              <div className="flex items-center justify-between gap-2">
                <div>
                  <p className="text-sm font-bold text-slate-900">{account.displayName}</p>
                  <p className="text-slate-600">{account.email}</p>
                </div>
                <span className="inline-flex items-center gap-1 font-semibold text-emerald-700 whitespace-nowrap">
                  <CheckCircle2 className="h-4 w-4" />
                  <span>Cloud Connected</span>
                </span>
              </div>

              <div className="flex flex-wrap items-center gap-2 border-t border-slate-200/70 pt-2.5 text-slate-600">
                <span>
                  Provider:{' '}
                  <strong className="text-slate-900">
                    {account.providerId === 'microsoft.com' ? 'Microsoft' : 'Google'}
                  </strong>
                </span>
                <span aria-hidden="true">·</span>
                <span>
                  Access:{' '}
                  <strong className="text-slate-900 inline-flex items-center gap-1">
                    {staffAccess.tier !== 'none' && <ShieldCheck className="h-3.5 w-3.5 text-sky-600" />}
                    {staffAccess.roleLabel}
                  </strong>
                </span>
                <span aria-hidden="true">·</span>
                <span className="font-mono tabular-nums">
                  Bonus XP: <strong className="text-sky-700">{candidateSummary?.bonusPoints ?? 0}</strong>
                </span>
              </div>
            </div>

            {!account.emailVerified && (
              <p className="text-xs text-amber-800">
                ▲ Your OAuth email is not yet marked verified by your identity provider; local backup
                remains active until verified.
              </p>
            )}

            <div className="flex flex-wrap items-center justify-between gap-3 pt-2">
              <button
                type="button"
                disabled={isSyncing}
                onClick={onManualSyncNow}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-4 py-2 text-xs font-semibold text-slate-800 transition-colors hover:bg-slate-50 disabled:opacity-50 whitespace-nowrap shrink-0"
              >
                {isSyncing ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-600" />
                ) : (
                  <RefreshCw className="h-3.5 w-3.5 text-sky-600" />
                )}
                <span>{isSyncing ? 'Syncing Cloud...' : 'Sync Workspace Now'}</span>
              </button>

              <button
                type="button"
                onClick={async () => {
                  await onSignOut();
                  onClose();
                }}
                className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white transition-colors hover:bg-slate-800 whitespace-nowrap shrink-0"
              >
                <LogOut className="h-3.5 w-3.5" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        )}

        <div className="mt-5 flex flex-wrap items-center justify-between gap-2 border-t border-slate-200/80 pt-3 text-[11px] text-slate-500">
          <span className="inline-flex items-center gap-1">
            <Cloud className="h-3.5 w-3.5 text-sky-600" />
            Zero-trust Firestore rules &amp; zero third-party ads
          </span>
          <div className="flex items-center gap-3">
            {onOpenPrivacyPolicy && (
              <button
                type="button"
                onClick={onOpenPrivacyPolicy}
                className="font-semibold text-sky-700 hover:underline whitespace-nowrap"
              >
                Privacy Policy
              </button>
            )}
            <span className="font-mono tabular-nums">{FIREBASE_PROJECT_ID}</span>
          </div>
        </div>
      </div>
    </div>
  );
};
