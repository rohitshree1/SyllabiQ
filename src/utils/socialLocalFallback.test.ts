import test from 'node:test';
import assert from 'node:assert/strict';
import {
  formatPostRoleLabel,
  isBotAccountId,
  isGmailEmail,
  resolvePostRoleBadge,
} from './verificationAndReferral.ts';
import {
  fetchSocialSyllabiQStateApi,
  postSocialMessageApi,
} from './apiClient.ts';
import { validateSocialMessageConduct } from './skillRefreshAndEthics.ts';
import {
  fetchSocialStateLocal,
  postSocialMessageLocal,
  resetSocialMemoryFallbackStoreForTests,
} from './socialLocalFallback.ts';

test('Conduct filter allows ordinary greetings like "hello" while rejecting PII/links', () => {
  const helloCheck = validateSocialMessageConduct('hello', false);
  assert.equal(helloCheck.allowed, true);
  assert.equal(helloCheck.sanitizedText, 'hello');

  const urlCheck = validateSocialMessageConduct('check https://spam.example.com', false);
  assert.equal(urlCheck.allowed, false);

  const emailCheck = validateSocialMessageConduct('ping me at test@gmail.com', false);
  assert.equal(emailCheck.allowed, false);
});

test('Gmail-only & Role Badge helpers classify bots, Gmail emails, Teachers, and Admins cleanly', () => {
  assert.equal(isGmailEmail('rohitshree1973@gmail.com'), true);
  assert.equal(isGmailEmail('Scholar.Test@GMAIL.COM'), true);
  assert.equal(isGmailEmail('student@university.edu'), false);
  assert.equal(isGmailEmail(''), false);

  assert.equal(isBotAccountId('cand-aarav-01'), true);
  assert.equal(isBotAccountId('cand-ananya-02'), true);
  assert.equal(isBotAccountId('sandbox-candidate'), true);
  assert.equal(isBotAccountId('jcVr6p3Om9bFYuaTZnI9FQ1uA2C3'), false);

  assert.equal(formatPostRoleLabel('super_admin'), 'Super Admin');
  assert.equal(formatPostRoleLabel('Minimal Delegated Admin'), 'Delegated Team Admin');
  assert.equal(formatPostRoleLabel('Maximum Delegated Admin'), 'Delegated Team Admin');
  assert.equal(formatPostRoleLabel('teacher'), 'Teacher');
  assert.equal(formatPostRoleLabel('student'), undefined);

  assert.equal(resolvePostRoleBadge({ staffTier: 'super_admin', accountRole: 'teacher' }), 'Super Admin');
  assert.equal(resolvePostRoleBadge({ staffTier: 'sub_admin', accountRole: 'student' }), 'Delegated Team Admin');
  assert.equal(resolvePostRoleBadge({ staffTier: 'none', accountRole: 'teacher' }), 'Teacher');
  assert.equal(resolvePostRoleBadge({ staffTier: 'none', accountRole: 'student' }), undefined);
});

test('Static hosting 405/404 responses start with zero bots, block non-Gmail posts, and preserve role badges', async () => {
  resetSocialMemoryFallbackStoreForTests();
  const originalFetch = globalThis.fetch;
  // Simulate window missing / non-JSON 405 Method Not Allowed returned by GitHub Pages POST
  globalThis.fetch = async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input);
    if (url.includes('/api/social/state')) {
      return new Response('<html>404 Not Found</html>', {
        status: 404,
        headers: { 'Content-Type': 'text/html' },
      });
    }
    if (url.includes('/api/social/message') && init?.method === 'POST') {
      return new Response('<html>405 Not Allowed</html>', {
        status: 405,
        headers: { 'Content-Type': 'text/html' },
      });
    }
    return new Response('Not Found', { status: 404 });
  };

  try {
    const stateRes = await fetchSocialSyllabiQStateApi();
    assert.equal(stateRes.backendAvailable, false);
    // Zero bot/fake peers or bot starter messages exist!
    assert.equal(stateRes.directory.length, 0);
    assert.equal(stateRes.messages.length, 0);

    // Non-Gmail / unverified caller cannot post into World
    const nonGmailRes = await postSocialMessageApi({
      id: 'soc_test_nongmail',
      channelType: 'world',
      channelId: 'world',
      senderId: 'uid_nongmail_1',
      senderName: 'Outlook User',
      senderAvatarVisibility: 'world',
      senderIsGmailAccount: false,
      text: 'hello',
    });
    assert.ok(nonGmailRes.error);
    assert.equal(nonGmailRes.message, undefined);

    // Verified Gmail Teacher CAN post "hello" and preserve Teacher role badge
    const postRes = await postSocialMessageApi({
      id: 'soc_test_hello_1',
      channelType: 'world',
      channelId: 'world',
      senderId: 'uid_real_gmail_1',
      senderName: 'Dr. Neha Verma',
      senderAvatarVisibility: 'world',
      senderIsGmailAccount: true,
      senderRoleBadge: 'Teacher',
      text: 'hello',
    });

    assert.equal(postRes.error, undefined);
    assert.equal(postRes.usedStaticFallback, true);
    assert.equal(postRes.message?.text, 'hello');
    assert.equal(postRes.message?.senderIsGmailAccount, true);
    assert.equal(postRes.message?.senderRoleBadge, 'Teacher');

    // Persisted locally for reloads
    const updatedState = fetchSocialStateLocal();
    assert.ok(
      updatedState.messages.some(
        (m) =>
          m.id === 'soc_test_hello_1' &&
          m.text === 'hello' &&
          m.senderRoleBadge === 'Teacher'
      )
    );

    // Conduct violations still fail explicitly instead of silently persisting
    const badRes = await postSocialMessageApi({
      id: 'soc_test_bad_link',
      channelType: 'world',
      channelId: 'world',
      senderId: 'uid_real_gmail_1',
      senderName: 'Dr. Neha Verma',
      senderAvatarVisibility: 'world',
      senderIsGmailAccount: true,
      text: 'visit https://evil.example.com',
    });
    assert.ok(badRes.error);
    assert.equal(badRes.message, undefined);

    // Direct local fallback also blocks conduct violations
    const directLocalBad = postSocialMessageLocal({
      id: 'soc_test_bad_email',
      channelType: 'world',
      channelId: 'world',
      senderId: 'uid_real_gmail_1',
      senderName: 'Dr. Neha Verma',
      senderAvatarVisibility: 'world',
      senderIsGmailAccount: true,
      text: 'email me at user@gmail.com',
    });
    assert.ok(directLocalBad.error);
  } finally {
    globalThis.fetch = originalFetch;
    resetSocialMemoryFallbackStoreForTests();
  }
});
