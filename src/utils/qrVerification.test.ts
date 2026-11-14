import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildVerificationDeepLink,
  createCredentialVerificationQr,
  extractVerifySerialFromSearch,
  generateQrMatrix,
} from './qrVerification';
import { generateFlexCardSerial, generateReportCardSerial } from './verificationAndReferral';

test('buildVerificationDeepLink and extractVerifySerialFromSearch round-trip FlexCard and Report Card serials', () => {
  const flexSerial = generateFlexCardSerial('sandbox-candidate', 'EIGHT_PLUS');
  const reportSerial = generateReportCardSerial('sandbox-candidate', 'all');

  const flexUrl = buildVerificationDeepLink(flexSerial, 'https://syllabiq.example.com/');
  assert.equal(flexUrl, `https://syllabiq.example.com/?verify=${flexSerial}`);

  const parsedFlex = extractVerifySerialFromSearch(new URL(flexUrl).search);
  assert.equal(parsedFlex, flexSerial);

  const reportUrl = buildVerificationDeepLink(`  ${reportSerial.toLowerCase()} `, 'http://localhost:3000');
  assert.equal(reportUrl, `http://localhost:3000/?verify=${reportSerial}`);
  assert.equal(extractVerifySerialFromSearch(`?verify=${reportSerial.toLowerCase()}`), reportSerial);

  assert.equal(extractVerifySerialFromSearch('?autostart=1'), null);
  assert.equal(extractVerifySerialFromSearch(''), null);
});

test('createCredentialVerificationQr builds deterministic ISO QR matrix with finder patterns', () => {
  const serial = 'SLQ-FC-8K2M9P4Q';
  const qrA = createCredentialVerificationQr(serial, 'https://syllabiq.app');
  const qrB = createCredentialVerificationQr(serial, 'https://syllabiq.app');

  assert.equal(qrA.isStandardSerial, true);
  assert.equal(qrA.verifyUrl, 'https://syllabiq.app/?verify=SLQ-FC-8K2M9P4Q');
  assert.ok(qrA.matrix.size >= 25);
  assert.equal(qrA.matrix.modules.length, qrA.matrix.size);
  assert.equal(qrA.matrix.modules[0].length, qrA.matrix.size);
  assert.deepEqual(qrA.matrix.modules, qrB.matrix.modules);

  // Top-left 7x7 QR finder pattern outer corners and center must be dark (true)
  assert.equal(qrA.matrix.modules[0][0], true);
  assert.equal(qrA.matrix.modules[0][6], true);
  assert.equal(qrA.matrix.modules[6][0], true);
  assert.equal(qrA.matrix.modules[3][3], true);
  // Inner ring of finder pattern (1,1) must be light (false)
  assert.equal(qrA.matrix.modules[1][1], false);

  const differentQr = generateQrMatrix('https://syllabiq.app/?verify=SLQ-RC-7J3N5T8W');
  assert.notDeepEqual(qrA.matrix.modules, differentQr.modules);
});
