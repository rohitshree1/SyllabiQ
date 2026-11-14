import test from 'node:test';
import assert from 'node:assert/strict';
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

test('Static hosting 405/404 responses fallback cleanly without false "Message rejected by conduct policy."', async () => {
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
    assert.ok(stateRes.directory.length >= 3);
    assert.ok(stateRes.messages.length >= 2);

    const postRes = await postSocialMessageApi({
      id: 'soc_test_hello_1',
      channelType: 'world',
      channelId: 'world',
      senderId: 'sandbox-candidate',
      senderName: 'Aarav Mehta',
      senderAvatarVisibility: 'world',
      text: 'hello',
    });

    assert.equal(postRes.error, undefined);
    assert.equal(postRes.usedStaticFallback, true);
    assert.equal(postRes.message?.text, 'hello');

    // Persisted locally for reloads
    const updatedState = fetchSocialStateLocal();
    assert.ok(updatedState.messages.some((m) => m.id === 'soc_test_hello_1' && m.text === 'hello'));

    // Conduct violations still fail explicitly instead of silently persisting
    const badRes = await postSocialMessageApi({
      id: 'soc_test_bad_link',
      channelType: 'world',
      channelId: 'world',
      senderId: 'sandbox-candidate',
      senderName: 'Aarav Mehta',
      senderAvatarVisibility: 'world',
      text: 'visit https://evil.example.com',
    });
    assert.ok(badRes.error);
    assert.equal(badRes.message, undefined);

    // Direct local fallback also blocks conduct violations
    const directLocalBad = postSocialMessageLocal({
      id: 'soc_test_bad_email',
      channelType: 'world',
      channelId: 'world',
      senderId: 'sandbox-candidate',
      senderName: 'Aarav Mehta',
      senderAvatarVisibility: 'world',
      text: 'email me at user@gmail.com',
    });
    assert.ok(directLocalBad.error);
  } finally {
    globalThis.fetch = originalFetch;
    resetSocialMemoryFallbackStoreForTests();
  }
});
