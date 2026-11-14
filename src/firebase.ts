import { initializeApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  OAuthProvider,
  signOut,
  type User,
} from 'firebase/auth';
import { doc, getDocFromServer, getFirestore } from 'firebase/firestore';
import firebaseConfig from '../firebase-applet-config.json';
import {
  extractErrorMessage,
  getUserTokenExpirationMs,
  isTokenExpiredOrExpiringSoon,
  isTransientFirestoreOfflineError,
  parseFirebaseTokenError,
  type CloudTokenDiagnostic,
} from './utils/firebaseConnectionGuard';

const app = initializeApp(firebaseConfig);

/* CRITICAL: Use provisioned named database ID from firebase-applet-config.json */
export const db = getFirestore(app, firebaseConfig.firestoreDatabaseId);
export const auth = getAuth(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({ prompt: 'select_account' });

export const microsoftProvider = new OAuthProvider('microsoft.com');
microsoftProvider.setCustomParameters({ prompt: 'select_account' });

export const FIREBASE_PROJECT_ID = firebaseConfig.projectId;
export const FIREBASE_AUTH_DOMAIN = firebaseConfig.authDomain;
export const FIREBASE_PROJECT_NUMBER = firebaseConfig.messagingSenderId || '572847081710';

export enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

export interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId?: string | null;
    email?: string | null;
    emailVerified?: boolean | null;
    isAnonymous?: boolean | null;
    tenantId?: string | null;
    providerInfo?: {
      providerId?: string | null;
      email?: string | null;
    }[];
  };
}

export class CloudOfflineTransportError extends Error {
  readonly isOfflineTransport = true;
  readonly operationType: OperationType;
  readonly path: string | null;

  constructor(operationType: OperationType, path: string | null, causeMessage: string) {
    super(`Cloud workspace temporarily offline (${operationType} ${path || 'root'}): ${causeMessage}`);
    this.name = 'CloudOfflineTransportError';
    this.operationType = operationType;
    this.path = path;
  }
}

// ============================================================================
// Cloud Token Service Diagnostic & Pre-Firestore Session Guard
// ============================================================================

let latestTokenDiagnostic: CloudTokenDiagnostic | null = null;
const diagnosticListeners = new Set<(diag: CloudTokenDiagnostic | null) => void>();
let proactiveRefreshTimer: ReturnType<typeof setTimeout> | null = null;
let inFlightInitialAuthGuard: Promise<User | null> | null = null;

export function getLatestCloudTokenDiagnostic(): CloudTokenDiagnostic | null {
  return latestTokenDiagnostic;
}

export function reportCloudTokenDiagnostic(diag: CloudTokenDiagnostic | null): void {
  latestTokenDiagnostic = diag;
  for (const listener of diagnosticListeners) {
    listener(diag);
  }
}

export function clearCloudTokenDiagnostic(): void {
  reportCloudTokenDiagnostic(null);
}

export function subscribeToCloudTokenDiagnostic(
  listener: (diag: CloudTokenDiagnostic | null) => void
): () => void {
  diagnosticListeners.add(listener);
  listener(latestTokenDiagnostic);
  return () => {
    diagnosticListeners.delete(listener);
  };
}

function clearProactiveRefreshTimer(): void {
  if (proactiveRefreshTimer !== null) {
    clearTimeout(proactiveRefreshTimer);
    proactiveRefreshTimer = null;
  }
}

function schedulePreExpirySessionCheck(user: User): void {
  clearProactiveRefreshTimer();
  const expMs = getUserTokenExpirationMs(user.toJSON());
  if (!expMs) return;

  // Validate 90 seconds before token expiry so expired tokens never break open Firestore streams
  const delayMs = Math.max(15_000, expMs - Date.now() - 90_000);
  proactiveRefreshTimer = setTimeout(() => {
    if (auth.currentUser && auth.currentUser.uid === user.uid) {
      void validateFirebaseUserSession(auth.currentUser, true);
    }
  }, delayMs);
}

/**
 * Verifies that `user` possesses a usable ID token before any authenticated Firestore
 * operation runs. If `securetoken.googleapis.com` is disabled on the project and the
 * cached 1-hour session has expired, records an actionable diagnostic and signs out
 * cleanly before Firestore opens an offline/broken stream.
 */
export async function validateFirebaseUserSession(
  user: User | null,
  forceRefresh = false
): Promise<User | null> {
  if (!user) {
    clearProactiveRefreshTimer();
    return null;
  }

  const expMs = getUserTokenExpirationMs(user.toJSON());
  const shouldForceRefresh = forceRefresh || isTokenExpiredOrExpiringSoon(expMs, Date.now(), 60_000);

  try {
    await user.getIdToken(shouldForceRefresh);
    schedulePreExpirySessionCheck(user);
    return user;
  } catch (err) {
    clearProactiveRefreshTimer();
    const diag =
      parseFirebaseTokenError(err, user.email || undefined, FIREBASE_PROJECT_NUMBER) || {
        kind: 'session_expired' as const,
        email: user.email || undefined,
        projectNumber: FIREBASE_PROJECT_NUMBER,
        activationUrl: `https://console.developers.google.com/apis/api/securetoken.googleapis.com/overview?project=${FIREBASE_PROJECT_NUMBER}`,
        summary: user.email
          ? `Your saved cloud session for ${user.email} expired and requires signing in again.`
          : 'Your saved cloud session expired and requires signing in again.',
        detectedAtISO: new Date().toISOString(),
      };
    reportCloudTokenDiagnostic(diag);

    try {
      await signOut(auth);
    } catch {
      // Ignore sign-out cleanup errors
    }
    return null;
  }
}

/**
 * Waits for Firebase Auth persistence initialization and validates any restored user
 * before Firestore opens its initial transport channel.
 */
export function ensureValidAuthBeforeFirestore(): Promise<User | null> {
  if (!inFlightInitialAuthGuard) {
    inFlightInitialAuthGuard = (async () => {
      try {
        await auth.authStateReady();
        return await validateFirebaseUserSession(auth.currentUser);
      } catch {
        return null;
      }
    })();
  }
  return inFlightInitialAuthGuard;
}

export function handleFirestoreError(
  error: unknown,
  operationType: OperationType,
  path: string | null
): never {
  const tokenDiag = parseFirebaseTokenError(
    error,
    auth.currentUser?.email || undefined,
    FIREBASE_PROJECT_NUMBER
  );
  if (tokenDiag) {
    reportCloudTokenDiagnostic(tokenDiag);
    void signOut(auth).catch(() => {});
    throw new CloudOfflineTransportError(operationType, path, tokenDiag.summary);
  }

  if (isTransientFirestoreOfflineError(error)) {
    if (auth.currentUser) {
      void validateFirebaseUserSession(auth.currentUser, true);
    }
    throw new CloudOfflineTransportError(operationType, path, extractErrorMessage(error));
  }

  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo:
        auth.currentUser?.providerData?.map((provider) => ({
          providerId: provider.providerId,
          email: provider.email,
        })) || [],
    },
    operationType,
    path,
  };
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

async function testConnection() {
  try {
    await ensureValidAuthBeforeFirestore();
    await getDocFromServer(doc(db, 'test', 'connection'));
  } catch (error) {
    if (error instanceof Error && error.message.includes('the client is offline')) {
      const diag = parseFirebaseTokenError(
        error,
        auth.currentUser?.email || undefined,
        FIREBASE_PROJECT_NUMBER
      );
      if (diag) {
        reportCloudTokenDiagnostic(diag);
        return;
      }
      console.error('Please check your Firebase configuration.');
    }
  }
}

void testConnection();
