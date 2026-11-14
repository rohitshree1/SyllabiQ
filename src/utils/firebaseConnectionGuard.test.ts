import test from 'node:test';
import assert from 'node:assert/strict';
import {
  extractProjectNumberFromError,
  getUserTokenExpirationMs,
  isTokenExpiredOrExpiringSoon,
  isTransientFirestoreOfflineError,
  parseFirebaseTokenError,
} from './firebaseConnectionGuard';

test('parseFirebaseTokenError extracts project 572847081710 and activation URL from production token-service-api error', () => {
  const prodError = new Error(
    'FirebaseError: [code=unknown]: Fetching auth token failed: Firebase: Error (auth/token-service-api-has-not-been-used-in-project-572847081710-before-or-it-is-disabled.-enable-it-by-visiting-https://console.developers.google.com/apis/api/securetoken.googleapis.com/overview?project=572847081710-then-retry.-if-you-enabled-this-api-recently,-wait-a-few-minutes-for-the-action-to-propagate-to-our-systems-and-retry.).'
  );

  const diag = parseFirebaseTokenError(prodError, 'rohitshree1973@gmail.com', '000000');
  assert.ok(diag);
  assert.equal(diag.kind, 'token_service_disabled');
  assert.equal(diag.projectNumber, '572847081710');
  assert.equal(diag.email, 'rohitshree1973@gmail.com');
  assert.equal(
    diag.activationUrl,
    'https://console.developers.google.com/apis/api/securetoken.googleapis.com/overview?project=572847081710'
  );
  assert.match(diag.summary, /rohitshree1973@gmail\.com/);
});

test('isTransientFirestoreOfflineError distinguishes offline/token transport errors from genuine Firestore permission errors', () => {
  assert.equal(
    isTransientFirestoreOfflineError(
      new Error('Failed to get document because the client is offline.')
    ),
    true
  );
  assert.equal(
    isTransientFirestoreOfflineError(
      new Error('Could not reach Cloud Firestore backend. Connection failed 1 times.')
    ),
    true
  );

  // Genuine security rule errors MUST NOT be swallowed as transient offline errors
  assert.equal(
    isTransientFirestoreOfflineError(new Error('Missing or insufficient permissions.')),
    false
  );
  assert.equal(
    isTransientFirestoreOfflineError({
      code: 'permission-denied',
      message: 'Missing or insufficient permissions.',
    }),
    false
  );
});

test('getUserTokenExpirationMs and isTokenExpiredOrExpiringSoon detect expired cached Firebase sessions', () => {
  assert.equal(extractProjectNumberFromError('no number here', '572847081710'), '572847081710');

  const now = 1_793_115_000_000;
  const expiredJson = { stsTokenManager: { expirationTime: now - 5_000 } };
  const freshJson = { stsTokenManager: { expirationTime: now + 3_000_000 } };

  const expMs = getUserTokenExpirationMs(expiredJson);
  const freshMs = getUserTokenExpirationMs(freshJson);

  assert.equal(expMs, now - 5_000);
  assert.equal(isTokenExpiredOrExpiringSoon(expMs, now, 60_000), true);
  assert.equal(isTokenExpiredOrExpiringSoon(freshMs, now, 60_000), false);
});
