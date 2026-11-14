import test from 'node:test';
import assert from 'node:assert/strict';
import {
  clampAvatarTransform,
  computeSquareCropDrawRect,
  extractStudentInitials,
  MAX_AVATAR_DATA_URL_LENGTH,
  normalizeRotationDeg,
  sanitizeAvatarForCloud,
  validateCustomAvatarSource,
} from './avatarStudio';

test('clampAvatarTransform and normalizeRotationDeg enforce safe zoom, pan, and quarter-turn bounds', () => {
  assert.equal(normalizeRotationDeg(0), 0);
  assert.equal(normalizeRotationDeg(90), 90);
  assert.equal(normalizeRotationDeg(450), 90);
  assert.equal(normalizeRotationDeg(-90), 270);

  const clamped = clampAvatarTransform({
    zoom: 9.5,
    offsetXPercent: -180,
    offsetYPercent: 145,
    rotationDeg: 270,
  });
  assert.equal(clamped.zoom, 3);
  assert.equal(clamped.offsetXPercent, -100);
  assert.equal(clamped.offsetYPercent, 100);
  assert.equal(clamped.rotationDeg, 270);
});

test('computeSquareCropDrawRect covers the full target square for landscape, portrait, and rotated images without margins', () => {
  // 1600x800 wide photo onto 160x160 target at zoom 1 -> drawHeight must be 160, drawWidth must be 320
  const wideAtOne = computeSquareCropDrawRect({
    sourceWidth: 1600,
    sourceHeight: 800,
    targetSize: 160,
    transform: { zoom: 1, offsetXPercent: 100, offsetYPercent: 100, rotationDeg: 0 },
  });
  assert.equal(wideAtOne.drawHeight, 160);
  assert.equal(wideAtOne.drawWidth, 320);
  // Panning X +100% shifts center by +80 (right edge still covers 0..160!), Y slack is 0 so centerY stays 80
  assert.equal(wideAtOne.centerX, 160);
  assert.equal(wideAtOne.centerY, 80);

  // Rotating 90deg swaps effective width/height -> now X slack is 0 and Y slack is 80
  const rotated90 = computeSquareCropDrawRect({
    sourceWidth: 1600,
    sourceHeight: 800,
    targetSize: 160,
    transform: { zoom: 1, offsetXPercent: 100, offsetYPercent: -100, rotationDeg: 90 },
  });
  assert.equal(rotated90.centerX, 80);
  assert.equal(rotated90.centerY, 0);
});

test('extractStudentInitials builds crisp 2-letter academic monograms', () => {
  assert.equal(extractStudentInitials('Aarav Mehta'), 'AM');
  assert.equal(extractStudentInitials('Rohit'), 'RO');
  assert.equal(extractStudentInitials('   '), 'SQ');
});

test('validateCustomAvatarSource allows safe raster data URLs and HTTPS URLs while blocking XSS and oversized strings', () => {
  const validWebp = 'data:image/webp;base64,UklGRh4AAABXRUJQVlA4TBEAAAAvAAAAAAfQ//73v/+BiOh/AAA=';
  const checkWebp = validateCustomAvatarSource(validWebp);
  assert.equal(checkWebp.valid, true);
  assert.equal(checkWebp.sanitized, validWebp);

  const validHttps = validateCustomAvatarSource('https://lh3.googleusercontent.com/a/default-user=s256-c');
  assert.equal(validHttps.valid, true);

  // Reject SVG script or javascript: protocol
  assert.equal(validateCustomAvatarSource('javascript:alert(1)').valid, false);
  assert.equal(
    validateCustomAvatarSource('data:image/svg+xml;base64,PHN2Zz48c2NyaXB0PmFsZXJ0KDEpPC9zY3JpcHQ+PC9zdmc+').valid,
    false
  );

  // Reject oversized base64 payload exceeding cloud budget
  const oversized = `data:image/jpeg;base64,${'A'.repeat(MAX_AVATAR_DATA_URL_LENGTH + 100)}`;
  assert.equal(validateCustomAvatarSource(oversized).valid, false);
  assert.equal(sanitizeAvatarForCloud(oversized), '');
});
