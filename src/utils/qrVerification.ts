import QRCode from 'qrcode';
import { isPlausibleSerialFormat, normalizeSerialCode } from './verificationAndReferral.ts';

export interface QrMatrixData {
  size: number;
  modules: boolean[][];
  encodedText: string;
}

/**
 * Resolves a clean base origin URL without trailing slashes.
 */
export function resolveVerificationOrigin(explicitOrigin?: string): string {
  const candidate =
    explicitOrigin?.trim() ||
    (typeof window !== 'undefined' && window.location?.origin
      ? window.location.origin
      : 'https://syllabiq.app');
  return candidate.replace(/\/+$/, '');
}

/**
 * Builds the canonical scannable verification deep-link (`<origin>/?verify=SLQ-FC-...` or `SLQ-RC-...`)
 * embedded inside exported FlexCard PNGs and Report Card PDFs.
 */
export function buildVerificationDeepLink(serialCode: string, originUrl?: string): string {
  const cleanSerial = normalizeSerialCode(serialCode) || 'SLQ-FC-VERIFIED';
  const baseOrigin = resolveVerificationOrigin(originUrl);
  return `${baseOrigin}/?verify=${encodeURIComponent(cleanSerial)}`;
}

/**
 * Extracts and normalizes a `?verify=SLQ-...` query parameter from a URL search string.
 * Returns null when no `verify` parameter is present.
 */
export function extractVerifySerialFromSearch(search: string): string | null {
  if (!search) return null;
  const rawSearch = search.startsWith('?') ? search : `?${search}`;
  const params = new URLSearchParams(rawSearch);
  const rawVerify = params.get('verify');
  if (!rawVerify || !rawVerify.trim()) return null;
  const normalized = normalizeSerialCode(rawVerify);
  return normalized.length >= 4 ? normalized : null;
}

/**
 * Deterministically generates a standards-compliant ISO/IEC 18004 QR code boolean matrix
 * synchronously in both browser and Node.js runtimes.
 */
export function generateQrMatrix(text: string): QrMatrixData {
  const payload = String(text || '').trim() || 'https://syllabiq.app';
  const qr = QRCode.create(payload, { errorCorrectionLevel: 'M' });
  const size = qr.modules.size;
  const modules: boolean[][] = [];

  for (let row = 0; row < size; row++) {
    const rowArr: boolean[] = [];
    for (let col = 0; col < size; col++) {
      rowArr.push(Boolean(qr.modules.get(row, col)));
    }
    modules.push(rowArr);
  }

  return {
    size,
    modules,
    encodedText: payload,
  };
}

/**
 * Convenience helper producing both the `?verify=...` deep-link and its QR matrix for a serial.
 */
export function createCredentialVerificationQr(
  serialCode: string,
  originUrl?: string
): {
  serialCode: string;
  verifyUrl: string;
  isStandardSerial: boolean;
  matrix: QrMatrixData;
} {
  const normalized = normalizeSerialCode(serialCode);
  const verifyUrl = buildVerificationDeepLink(normalized, originUrl);
  return {
    serialCode: normalized,
    verifyUrl,
    isStandardSerial: isPlausibleSerialFormat(normalized),
    matrix: generateQrMatrix(verifyUrl),
  };
}

/**
 * Draws a high-contrast, camera-scannable QR verification stamp onto an HTML5 2D Canvas
 * (used by FlexCard PNG downloads). Includes a 4-module white quiet zone and serial caption.
 */
export function drawQrVerificationStampOnCanvas(
  ctx: CanvasRenderingContext2D,
  options: {
    serialCode: string;
    originUrl?: string;
    x: number;
    y: number;
    cardWidth?: number;
    accentHex?: string;
  }
): { verifyUrl: string; matrixSize: number } {
  const {
    serialCode,
    originUrl,
    x,
    y,
    cardWidth = 176,
    accentHex = '#38bdf8',
  } = options;

  const { serialCode: cleanSerial, verifyUrl, matrix } = createCredentialVerificationQr(
    serialCode,
    originUrl
  );

  const quietModules = 3;
  const totalGridModules = matrix.size + quietModules * 2;
  const qrBoxSize = cardWidth - 20;
  const cardHeight = qrBoxSize + 54;

  // Crisp white backing card for reliable camera contrast on dark FlexCards
  ctx.save();
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(x, y, cardWidth, cardHeight);

  ctx.strokeStyle = accentHex;
  ctx.lineWidth = 3;
  ctx.strokeRect(x, y, cardWidth, cardHeight);

  const qrOriginX = x + 10;
  const qrOriginY = y + 8;
  const modulePx = qrBoxSize / totalGridModules;

  ctx.fillStyle = '#ffffff';
  ctx.fillRect(qrOriginX, qrOriginY, qrBoxSize, qrBoxSize);

  ctx.fillStyle = '#0f172a';
  for (let r = 0; r < matrix.size; r++) {
    for (let c = 0; c < matrix.size; c++) {
      if (matrix.modules[r][c]) {
        const px = Math.floor(qrOriginX + (c + quietModules) * modulePx);
        const py = Math.floor(qrOriginY + (r + quietModules) * modulePx);
        const pw = Math.ceil(modulePx);
        const ph = Math.ceil(modulePx);
        ctx.fillRect(px, py, pw, ph);
      }
    }
  }

  ctx.fillStyle = '#0f172a';
  ctx.font = '700 12px sans-serif';
  ctx.textAlign = 'center';
  ctx.fillText('SCAN TO VERIFY', x + cardWidth / 2, qrOriginY + qrBoxSize + 16);

  ctx.fillStyle = '#334155';
  ctx.font = '700 10.5px monospace';
  ctx.fillText(cleanSerial.slice(0, 18), x + cardWidth / 2, qrOriginY + qrBoxSize + 32);
  ctx.restore();

  return { verifyUrl, matrixSize: matrix.size };
}
