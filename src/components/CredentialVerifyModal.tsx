import React, { useEffect, useState } from 'react';
import {
  AlertTriangle,
  CheckCircle2,
  Loader2,
  SearchCheck,
  ShieldCheck,
  X,
} from 'lucide-react';
import type {
  CredentialVerificationNotice,
  IssuedCredentialDoc,
  VerifierPostRole,
} from '../types';
import {
  formatVerifierPostLabel,
  generateFlexCardSerial,
  generateReportCardSerial,
  validateVerifierSubmission,
} from '../utils/verificationAndReferral';
import { verifyCredentialApi } from '../utils/apiClient';
import {
  lookupIssuedCredentialInCloud,
  recordCredentialVerificationInCloud,
} from '../services/cloudService';

interface CredentialVerifyModalProps {
  isOpen: boolean;
  onClose: () => void;
  initialSerial?: string;
  isStaff: boolean;
  staffRoleLabel?: string;
  defaultVerifierName?: string;
  defaultVerifierGmail?: string;
  onVerifiedNoticeGenerated?: (notice: CredentialVerificationNotice) => void;
}

const SAMPLE_FLEX_SERIAL = generateFlexCardSerial('sandbox-candidate', 'SCHOLAR_FLEX');
const SAMPLE_REPORT_SERIAL = generateReportCardSerial('sandbox-candidate', 'ALL');

export const CredentialVerifyModal: React.FC<CredentialVerifyModalProps> = ({
  isOpen,
  onClose,
  initialSerial = '',
  isStaff,
  staffRoleLabel,
  defaultVerifierName = '',
  defaultVerifierGmail = '',
  onVerifiedNoticeGenerated,
}) => {
  const [serialInput, setSerialInput] = useState(initialSerial);
  const [verifierName, setVerifierName] = useState(defaultVerifierName);
  const [verifierGmail, setVerifierGmail] = useState(defaultVerifierGmail);
  const [verifierPost, setVerifierPost] = useState<VerifierPostRole>('teacher');
  const [submitting, setSubmitting] = useState(false);
  const [formError, setFormError] = useState('');
  const [result, setResult] = useState<{
    checkedSerial: string;
    authentic: boolean;
    credential?: IssuedCredentialDoc | null;
    notifiedOwner: boolean;
  } | null>(null);

  useEffect(() => {
    if (isOpen) {
      setSerialInput(initialSerial);
      setVerifierName((prev) => prev || defaultVerifierName);
      setVerifierGmail((prev) => prev || defaultVerifierGmail);
      setFormError('');
      setResult(null);
    }
  }, [isOpen, initialSerial, defaultVerifierName, defaultVerifierGmail]);

  if (!isOpen) return null;

  const handleVerifySubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setFormError('');
    setResult(null);

    const validation = validateVerifierSubmission({
      serialInput,
      isStaff,
      verifierName,
      verifierGmail,
      verifierPost,
    });

    if (!validation.valid) {
      setFormError(validation.error || 'Invalid verification request.');
      return;
    }

    setSubmitting(true);
    const cleanSerial = validation.normalizedSerial;

    try {
      // 1. Check local/in-memory server registry
      const localCheck = await verifyCredentialApi({
        serialCode: cleanSerial,
        verifierName: validation.normalizedName,
        verifierGmail: validation.normalizedGmail,
        verifierPost: validation.normalizedPost,
        isStaff,
      });

      let foundDoc: IssuedCredentialDoc | null = localCheck.credential || null;

      // 2. Fallback check to Cloud Firestore if local mock did not find it
      if (!foundDoc) {
        foundDoc = await lookupIssuedCredentialInCloud(cleanSerial);
        if (foundDoc && !isStaff && validation.normalizedGmail) {
          await recordCredentialVerificationInCloud({
            credential: foundDoc,
            verifierName: validation.normalizedName,
            verifierGmail: validation.normalizedGmail,
            verifierPost: validation.normalizedPost,
          });
          if (onVerifiedNoticeGenerated) {
            onVerifiedNoticeGenerated({
              id: `cver_${Date.now()}`,
              targetUserId: foundDoc.ownerUid,
              credentialCode: foundDoc.credentialCode,
              credentialKind: foundDoc.kind,
              credentialTitle: foundDoc.title,
              verifierName: validation.normalizedName,
              verifierGmail: validation.normalizedGmail,
              verifierPost: validation.normalizedPost,
              acknowledged: false,
              createdAt: new Date().toISOString(),
            });
          }
        }
      } else if (localCheck.notice && onVerifiedNoticeGenerated) {
        onVerifiedNoticeGenerated(localCheck.notice);
      }

      setResult({
        checkedSerial: cleanSerial,
        authentic: Boolean(foundDoc),
        credential: foundDoc,
        notifiedOwner: !isStaff && Boolean(foundDoc),
      });
    } catch {
      setFormError('Failed to contact verification registry. Please check your network.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="credential-verify-title"
      className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-xs"
    >
      <div className="w-full max-w-xl rounded-3xl bg-white p-6 shadow-2xl space-y-5 max-h-[90vh] overflow-y-auto">
        <div className="flex items-start justify-between gap-4 border-b border-slate-200 pb-4">
          <div>
            <p className="text-xs font-semibold text-sky-700">
              Anti-Forgery Credential Authentication
            </p>
            <h2
              id="credential-verify-title"
              className="mt-0.5 font-display text-xl font-bold text-slate-900"
            >
              Verify FlexCard or Report Card Serial
            </h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close Credential Verification Modal"
            className="rounded-lg p-2 text-slate-500 transition-colors hover:bg-slate-100 hover:text-slate-900"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleVerifySubmit} className="space-y-4">
          <div className="space-y-1.5">
            <label
              htmlFor="verify-serial-input"
              className="block text-xs font-semibold text-slate-800"
            >
              Unique Credential Serial Code
            </label>
            <input
              id="verify-serial-input"
              type="text"
              value={serialInput}
              onChange={(e) => {
                setSerialInput(e.target.value.toUpperCase());
                setFormError('');
              }}
              placeholder="e.g. SLQ-FC-8K2M9P4Q or SLQ-RC-7J3N5T8W"
              className="w-full rounded-xl border border-slate-300 bg-white px-3.5 py-2.5 font-mono tabular-nums text-sm text-slate-900 focus:border-sky-600 focus:outline-hidden"
            />
            <div className="flex flex-wrap items-center gap-2 pt-1 text-[11px] text-slate-500">
              <span>Quick test serials:</span>
              <button
                type="button"
                onClick={() => {
                  setSerialInput(SAMPLE_FLEX_SERIAL);
                  setResult(null);
                  setFormError('');
                }}
                className="font-mono font-semibold text-sky-700 hover:underline whitespace-nowrap"
              >
                Valid FlexCard ({SAMPLE_FLEX_SERIAL})
              </button>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() => {
                  setSerialInput(SAMPLE_REPORT_SERIAL);
                  setResult(null);
                  setFormError('');
                }}
                className="font-mono font-semibold text-sky-700 hover:underline whitespace-nowrap"
              >
                Valid Report Card ({SAMPLE_REPORT_SERIAL})
              </button>
              <span aria-hidden="true">·</span>
              <button
                type="button"
                onClick={() => {
                  setSerialInput('SLQ-FC-FAKE9999');
                  setResult(null);
                  setFormError('');
                }}
                className="font-mono font-semibold text-slate-600 hover:underline whitespace-nowrap"
              >
                Fake Serial (SLQ-FC-FAKE9999)
              </button>
            </div>
          </div>

          {isStaff ? (
            <div className="rounded-xl border border-sky-200 bg-sky-50/75 p-3.5 text-xs text-slate-700 flex items-start gap-2.5">
              <ShieldCheck className="h-4 w-4 text-sky-700 shrink-0 mt-0.5" />
              <div>
                <p className="font-semibold text-slate-900">
                  Staff Verification Mode ({staffRoleLabel || 'Administrator'})
                </p>
                <p className="mt-0.5 leading-relaxed">
                  Because you are signed in as an Admin or Super Admin, serial checks run silently without requesting your Gmail or Post and without sending a verifier alert to the candidate.
                </p>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-slate-200 bg-slate-50/80 p-4 space-y-3.5">
              <div className="space-y-0.5">
                <p className="text-xs font-semibold text-slate-900">
                  Verifier Identity Declaration (Required for Non-Admins)
                </p>
                <p className="text-[11px] text-slate-600 leading-relaxed">
                  When a teacher, employer, or peer verifies credentials, SyllabiQ logs their full name, verified @gmail.com address, and post, and notifies the scholar in their Vault alerts.
                </p>
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div className="space-y-1">
                  <label
                    htmlFor="verifier-name-input"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Your Full Name
                  </label>
                  <input
                    id="verifier-name-input"
                    type="text"
                    value={verifierName}
                    onChange={(e) => setVerifierName(e.target.value)}
                    placeholder="e.g. Dr. Ritu Sharma"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-sky-600 focus:outline-hidden"
                  />
                </div>

                <div className="space-y-1">
                  <label
                    htmlFor="verifier-gmail-input"
                    className="block text-xs font-semibold text-slate-700"
                  >
                    Your Gmail Address (@gmail.com)
                  </label>
                  <input
                    id="verifier-gmail-input"
                    type="email"
                    value={verifierGmail}
                    onChange={(e) => setVerifierGmail(e.target.value)}
                    placeholder="name@gmail.com"
                    className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-sky-600 focus:outline-hidden"
                  />
                </div>
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="verifier-post-select"
                  className="block text-xs font-semibold text-slate-700"
                >
                  What is your post / relationship?
                </label>
                <select
                  id="verifier-post-select"
                  value={verifierPost}
                  onChange={(e) => setVerifierPost(e.target.value as VerifierPostRole)}
                  className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs font-medium text-slate-900 focus:border-sky-600 focus:outline-hidden"
                >
                  <option value="teacher">Teacher / Professor / Faculty</option>
                  <option value="company_executive">Company Executive / Recruiter / Employer</option>
                  <option value="student">Student / Peer Scholar</option>
                </select>
              </div>
            </div>
          )}

          {formError && (
            <div
              role="alert"
              className="rounded-xl border border-amber-200 bg-amber-50 px-3.5 py-2.5 text-xs font-medium text-amber-900"
            >
              ▲ {formError}
            </div>
          )}

          <div className="flex items-center justify-end gap-2.5 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="rounded-xl border border-slate-200 bg-white px-4 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              Close
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-xl bg-slate-900 px-5 py-2.5 text-xs font-semibold text-white hover:bg-slate-800 disabled:opacity-60 transition-colors whitespace-nowrap shrink-0"
            >
              {submitting ? (
                <Loader2 className="h-3.5 w-3.5 animate-spin text-sky-400" />
              ) : (
                <SearchCheck className="h-3.5 w-3.5 text-sky-400" />
              )}
              <span>{submitting ? 'Checking Official Registry...' : 'Verify Credential Serial'}</span>
            </button>
          </div>
        </form>

        {result && (
          <div
            data-testid="credential-verify-result"
            className={`rounded-2xl border p-5 space-y-3 ${
              result.authentic && result.credential
                ? 'border-emerald-200 bg-emerald-50/75 text-slate-900'
                : 'border-red-200 bg-red-50/80 text-slate-900'
            }`}
          >
            {result.authentic && result.credential ? (
              <>
                <div className="flex items-start justify-between gap-3">
                  <div className="flex items-center gap-2 text-emerald-800">
                    <CheckCircle2 className="h-5 w-5 shrink-0" />
                    <div>
                      <p className="text-xs font-semibold">
                        {result.credential.kind === 'report_card'
                          ? 'Official Verified Genuine SyllabiQ Report Card'
                          : 'Official Verified Genuine SyllabiQ FlexCard'}
                      </p>
                      <h3 className="font-display text-base font-bold text-slate-900">
                        {result.credential.title}
                      </h3>
                    </div>
                  </div>
                  <span className="font-mono tabular-nums text-xs font-bold text-emerald-900">
                    {result.checkedSerial}
                  </span>
                </div>

                <div className="border-t border-emerald-200/80 pt-3 grid grid-cols-1 sm:grid-cols-2 gap-2.5 text-xs text-slate-700">
                  <div>
                    <span className="text-slate-500">Issued to:</span>{' '}
                    <strong className="text-slate-900">{result.credential.ownerName}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Institution:</span>{' '}
                    <strong className="text-slate-900">
                      {result.credential.boardOrUniversity}
                    </strong>
                  </div>
                  <div>
                    <span className="text-slate-500">Target Exam:</span>{' '}
                    <strong className="text-slate-900">{result.credential.examName}</strong>
                  </div>
                  <div>
                    <span className="text-slate-500">XP &amp; Tier:</span>{' '}
                    <strong className="font-mono tabular-nums text-slate-900">
                      {result.credential.xpPoints.toLocaleString()} XP ·{' '}
                      {result.credential.flexTier}
                    </strong>
                  </div>
                  <div className="sm:col-span-2">
                    <span className="text-slate-500">Verified Metric:</span>{' '}
                    <strong className="font-mono tabular-nums text-slate-900">
                      {result.credential.subtitleOrMetric}
                    </strong>{' '}
                    <span aria-hidden="true">·</span>{' '}
                    <span className="font-mono tabular-nums text-slate-500">
                      Issued {result.credential.issuedDateISO}
                    </span>
                  </div>
                </div>

                <p className="border-t border-emerald-200/80 pt-2.5 text-[11px] text-emerald-900">
                  {result.notifiedOwner
                    ? `Verification logged: ${verifierName.trim()} (${verifierGmail
                        .trim()
                        .toLowerCase()} · ${formatVerifierPostLabel(
                        verifierPost
                      )}) has been sent to ${result.credential.ownerName}'s SyllabiQ notifications.`
                    : 'Silent Admin check complete — no notification was sent to the candidate.'}
                </p>
              </>
            ) : (
              <div className="flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-red-700 shrink-0 mt-0.5" />
                <div className="space-y-1">
                  <p className="text-xs font-semibold text-red-800">
                    Unverified or Forged Serial ({result.checkedSerial})
                  </p>
                  <p className="text-xs text-slate-700 leading-relaxed">
                    No FlexCard or Report Card with serial{' '}
                    <span className="font-mono font-bold text-slate-900">
                      {result.checkedSerial}
                    </span>{' '}
                    was issued by SyllabiQ. Please verify the spelling on the card or treat the
                    shared image/PDF as unauthenticated.
                  </p>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
