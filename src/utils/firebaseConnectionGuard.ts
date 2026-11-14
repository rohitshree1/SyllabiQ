export interface CloudTokenDiagnostic {
  kind: 'token_service_disabled' | 'session_expired';
  email?: string;
  projectNumber: string;
  activationUrl: string;
  summary: string;
  detectedAtISO: string;
}

const DEFAULT_SECURE_TOKEN_CONSOLE_BASE =
  'https://console.developers.google.com/apis/api/securetoken.googleapis.com/overview';

export function extractErrorMessage(error: unknown): string {
  if (error instanceof Error) {
    return `${error.name}: ${error.message}`;
  }
  if (typeof error === 'object' && error !== null) {
    const maybeMsg = (error as { message?: unknown; code?: unknown }).message;
    const maybeCode = (error as { code?: unknown }).code;
    if (typeof maybeMsg === 'string') {
      return typeof maybeCode === 'string' ? `${maybeCode}: ${maybeMsg}` : maybeMsg;
    }
  }
  return String(error ?? '');
}

export function extractProjectNumberFromError(
  rawMessage: string,
  fallbackProjectNumber = '572847081710'
): string {
  const fromSlug = rawMessage.match(/in-project-(\d{6,20})/i);
  if (fromSlug?.[1]) return fromSlug[1];

  const fromQuery = rawMessage.match(/[?&]project=(\d{6,20})/i);
  if (fromQuery?.[1]) return fromQuery[1];

  const fromProse = rawMessage.match(/project\s+(\d{6,20})/i);
  if (fromProse?.[1]) return fromProse[1];

  return fallbackProjectNumber;
}

export function buildSecureTokenActivationUrl(projectNumber: string): string {
  const cleanProject = projectNumber.trim() || '572847081710';
  return `${DEFAULT_SECURE_TOKEN_CONSOLE_BASE}?project=${encodeURIComponent(cleanProject)}`;
}

/**
 * Inspects an Auth or Firestore error and returns a structured CloudTokenDiagnostic
 * whenever Firebase token refresh fails (for example when `securetoken.googleapis.com`
 * is disabled on the Google Cloud project or a cached refresh token is revoked/expired).
 */
export function parseFirebaseTokenError(
  error: unknown,
  email?: string,
  fallbackProjectNumber = '572847081710'
): CloudTokenDiagnostic | null {
  const raw = extractErrorMessage(error);
  const lower = raw.toLowerCase();

  const isTokenServiceDisabled =
    lower.includes('token-service-api-has-not-been-used') ||
    lower.includes('securetoken.googleapis.com') ||
    (lower.includes('token service api') && lower.includes('disabled'));

  if (isTokenServiceDisabled) {
    const projectNumber = extractProjectNumberFromError(raw, fallbackProjectNumber);
    const activationUrl = buildSecureTokenActivationUrl(projectNumber);
    const cleanEmail = email?.trim() || undefined;

    return {
      kind: 'token_service_disabled',
      email: cleanEmail,
      projectNumber,
      activationUrl,
      summary: cleanEmail
        ? `Your previous cloud session for ${cleanEmail} expired, and automatic background token refresh requires enabling the Google Cloud Token Service API (securetoken.googleapis.com) on project ${projectNumber}. Sign in again below for an immediate fresh session, or enable the API once in Google Cloud Console.`
        : `Automatic background token refresh requires enabling the Google Cloud Token Service API (securetoken.googleapis.com) on project ${projectNumber}. Sign in again for an immediate fresh session, or enable the API once in Google Cloud Console.`,
      detectedAtISO: new Date().toISOString(),
    };
  }

  const isExpiredOrInvalidAuthSession =
    lower.includes('auth/user-token-expired') ||
    lower.includes('auth/invalid-user-token') ||
    lower.includes('auth/id-token-expired') ||
    lower.includes('auth/user-disabled') ||
    lower.includes('fetching auth token failed');

  if (isExpiredOrInvalidAuthSession) {
    const projectNumber = extractProjectNumberFromError(raw, fallbackProjectNumber);
    const cleanEmail = email?.trim() || undefined;
    return {
      kind: 'session_expired',
      email: cleanEmail,
      projectNumber,
      activationUrl: buildSecureTokenActivationUrl(projectNumber),
      summary: cleanEmail
        ? `Your saved cloud session for ${cleanEmail} expired and needs a quick re-authentication to resume live Firestore sync.`
        : 'Your saved cloud session expired and needs a quick re-authentication to resume live Firestore sync.',
      detectedAtISO: new Date().toISOString(),
    };
  }

  return null;
}

/**
 * Returns true strictly for transient transport/offline/token-refresh failures,
 * while returning false for Firestore security rule (`Missing or insufficient permissions`)
 * or schema errors so genuine security rule issues always surface via `handleFirestoreError`.
 */
export function isTransientFirestoreOfflineError(error: unknown): boolean {
  const raw = extractErrorMessage(error);
  const lower = raw.toLowerCase();

  if (
    lower.includes('missing or insufficient permissions') ||
    lower.includes('permission-denied') ||
    lower.includes('permission_denied')
  ) {
    // Only treat as token-service error if explicitly caused by securetoken API disabled
    return (
      lower.includes('token-service-api-has-not-been-used') ||
      lower.includes('securetoken.googleapis.com')
    );
  }

  return (
    lower.includes('the client is offline') ||
    lower.includes('failed to get document because the client is offline') ||
    lower.includes('could not reach cloud firestore backend') ||
    lower.includes('fetching auth token failed') ||
    lower.includes('token-service-api-has-not-been-used') ||
    lower.includes('securetoken.googleapis.com') ||
    lower.includes('auth/network-request-failed')
  );
}

/**
 * Extracts `stsTokenManager.expirationTime` (epoch ms) from a serialized `User.toJSON()` object.
 */
export function getUserTokenExpirationMs(userJson: unknown): number | null {
  if (!userJson || typeof userJson !== 'object') return null;
  const sts = (userJson as { stsTokenManager?: unknown }).stsTokenManager;
  if (!sts || typeof sts !== 'object') return null;
  const exp = (sts as { expirationTime?: unknown }).expirationTime;
  if (typeof exp === 'number' && Number.isFinite(exp) && exp > 0) {
    return exp;
  }
  if (typeof exp === 'string') {
    const parsed = Number(exp);
    if (Number.isFinite(parsed) && parsed > 0) return parsed;
  }
  return null;
}

export function isTokenExpiredOrExpiringSoon(
  expirationMs: number | null,
  nowMs = Date.now(),
  bufferMs = 60_000
): boolean {
  if (expirationMs === null) return false;
  return expirationMs <= nowMs + bufferMs;
}
