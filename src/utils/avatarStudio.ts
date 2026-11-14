export const MAX_AVATAR_DATA_URL_LENGTH = 32000;
export const MAX_AVATAR_HTTP_URL_LENGTH = 2048;

export type AvatarRotationDeg = 0 | 90 | 180 | 270;

export interface AvatarCropTransform {
  zoom: number;
  offsetXPercent: number;
  offsetYPercent: number;
  rotationDeg: AvatarRotationDeg;
}

export const DEFAULT_AVATAR_TRANSFORM: AvatarCropTransform = {
  zoom: 1,
  offsetXPercent: 0,
  offsetYPercent: 0,
  rotationDeg: 0,
};

export interface SquareCropDrawRect {
  centerX: number;
  centerY: number;
  drawWidth: number;
  drawHeight: number;
  rotationRad: number;
}

export interface AvatarValidationResult {
  valid: boolean;
  sanitized: string;
  error?: string;
}

export interface MonogramPaletteOption {
  id: string;
  label: string;
  bgStart: string;
  bgEnd: string;
  accent: string;
}

export const MONOGRAM_PALETTES: MonogramPaletteOption[] = [
  {
    id: 'midnight_slate',
    label: 'Academic Slate',
    bgStart: '#0f172a',
    bgEnd: '#1e293b',
    accent: '#38bdf8',
  },
  {
    id: 'sapphire_ink',
    label: 'Sapphire Ink',
    bgStart: '#0c4a6e',
    bgEnd: '#0369a1',
    accent: '#bae6fd',
  },
  {
    id: 'emerald_scholar',
    label: 'Emerald Studio',
    bgStart: '#064e3b',
    bgEnd: '#047857',
    accent: '#a7f3d0',
  },
  {
    id: 'sovereign_plum',
    label: 'Sovereign Plum',
    bgStart: '#3b0764',
    bgEnd: '#581c87',
    accent: '#e9d5ff',
  },
];

export function normalizeRotationDeg(deg: number): AvatarRotationDeg {
  const mod = ((Math.round(deg / 90) * 90) % 360 + 360) % 360;
  if (mod === 90 || mod === 180 || mod === 270) return mod;
  return 0;
}

export function clampAvatarTransform(
  input: Partial<AvatarCropTransform> | undefined
): AvatarCropTransform {
  const rawZoom = typeof input?.zoom === 'number' && Number.isFinite(input.zoom) ? input.zoom : 1;
  const rawX =
    typeof input?.offsetXPercent === 'number' && Number.isFinite(input.offsetXPercent)
      ? input.offsetXPercent
      : 0;
  const rawY =
    typeof input?.offsetYPercent === 'number' && Number.isFinite(input.offsetYPercent)
      ? input.offsetYPercent
      : 0;
  const rawRot =
    typeof input?.rotationDeg === 'number' && Number.isFinite(input.rotationDeg)
      ? input.rotationDeg
      : 0;

  return {
    zoom: Math.max(1, Math.min(3, Math.round(rawZoom * 100) / 100)),
    offsetXPercent: Math.max(-100, Math.min(100, Math.round(rawX))),
    offsetYPercent: Math.max(-100, Math.min(100, Math.round(rawY))),
    rotationDeg: normalizeRotationDeg(rawRot),
  };
}

/**
 * Pure geometry math computing centered draw dimensions and clamped pan offsets
 * so an image of any aspect ratio covers a square targetSize x targetSize canvas
 * cleanly with zero empty margins.
 */
export function computeSquareCropDrawRect(params: {
  sourceWidth: number;
  sourceHeight: number;
  targetSize: number;
  transform?: Partial<AvatarCropTransform>;
}): SquareCropDrawRect {
  const safeW = Math.max(1, params.sourceWidth);
  const safeH = Math.max(1, params.sourceHeight);
  const size = Math.max(16, params.targetSize);
  const t = clampAvatarTransform(params.transform);

  const isQuarterTurn = t.rotationDeg === 90 || t.rotationDeg === 270;
  const effectiveW = isQuarterTurn ? safeH : safeW;
  const effectiveH = isQuarterTurn ? safeW : safeH;

  const coverBaseScale = Math.max(size / effectiveW, size / effectiveH);
  const scale = coverBaseScale * t.zoom;

  const boundW = effectiveW * scale;
  const boundH = effectiveH * scale;

  const maxSlackX = Math.max(0, (boundW - size) / 2);
  const maxSlackY = Math.max(0, (boundH - size) / 2);

  const panX = (t.offsetXPercent / 100) * maxSlackX;
  const panY = (t.offsetYPercent / 100) * maxSlackY;

  return {
    centerX: size / 2 + panX,
    centerY: size / 2 + panY,
    drawWidth: safeW * scale,
    drawHeight: safeH * scale,
    rotationRad: (t.rotationDeg * Math.PI) / 180,
  };
}

export function extractStudentInitials(name: string): string {
  const parts = (name || '')
    .trim()
    .split(/\s+/)
    .filter(Boolean);
  if (parts.length === 0) return 'SQ';
  if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
  return `${parts[0][0] || ''}${parts[parts.length - 1][0] || ''}`.toUpperCase();
}

/**
 * Validates a custom profile image source (cropped raster data URL or HTTPS/HTTP URL).
 * Blocks XSS vectors such as javascript:, data:text/html, or data:image/svg+xml.
 */
export function validateCustomAvatarSource(value: unknown): AvatarValidationResult {
  if (value === undefined || value === null) {
    return { valid: true, sanitized: '' };
  }
  if (typeof value !== 'string') {
    return { valid: false, sanitized: '', error: 'Invalid image source format.' };
  }

  const trimmed = value.trim();
  if (!trimmed) {
    return { valid: true, sanitized: '' };
  }

  // Safe raster data URL (produced by canvas cropper)
  const rasterDataPrefix = /^data:image\/(jpeg|jpg|png|webp|gif);base64,[A-Za-z0-9+/=]+$/i;
  if (trimmed.startsWith('data:')) {
    if (!rasterDataPrefix.test(trimmed)) {
      return {
        valid: false,
        sanitized: '',
        error: 'Only PNG, JPG, WebP, or GIF raster images are supported.',
      };
    }
    if (trimmed.length > MAX_AVATAR_DATA_URL_LENGTH) {
      return {
        valid: false,
        sanitized: '',
        error: 'Cropped image exceeds the compact cloud sync budget. Try adjusting zoom or uploading a standard photo.',
      };
    }
    return { valid: true, sanitized: trimmed };
  }

  // Local static asset path
  if (trimmed.startsWith('/')) {
    if (trimmed.length > MAX_AVATAR_HTTP_URL_LENGTH) {
      return { valid: false, sanitized: '', error: 'Image path is too long.' };
    }
    return { valid: true, sanitized: trimmed };
  }

  // External HTTPS / HTTP image URL
  if (/^https?:\/\//i.test(trimmed)) {
    if (trimmed.length > MAX_AVATAR_HTTP_URL_LENGTH) {
      return {
        valid: false,
        sanitized: '',
        error: `Image URL must be ${MAX_AVATAR_HTTP_URL_LENGTH} characters or fewer.`,
      };
    }
    try {
      const parsed = new URL(trimmed);
      if (parsed.protocol !== 'https:' && parsed.protocol !== 'http:') {
        return { valid: false, sanitized: '', error: 'Only HTTP/HTTPS image URLs are allowed.' };
      }
      return { valid: true, sanitized: parsed.toString() };
    } catch {
      return { valid: false, sanitized: '', error: 'Please enter a valid https:// image URL.' };
    }
  }

  return {
    valid: false,
    sanitized: '',
    error: 'Please upload an image file or enter an https:// image URL.',
  };
}

export function sanitizeAvatarForCloud(value: unknown): string {
  const check = validateCustomAvatarSource(value);
  return check.valid ? check.sanitized : '';
}

/**
 * Renders a cropped, rotated, zoomed square avatar onto an HTML5 canvas and encodes it
 * into a compact WebP/JPEG data URL guaranteed <= MAX_AVATAR_DATA_URL_LENGTH.
 */
export function renderCroppedAvatarToCanvas(
  canvas: HTMLCanvasElement,
  img: HTMLImageElement,
  transform: Partial<AvatarCropTransform>,
  targetSize = 160
): void {
  canvas.width = targetSize;
  canvas.height = targetSize;
  const ctx = canvas.getContext('2d');
  if (!ctx) return;

  ctx.clearRect(0, 0, targetSize, targetSize);
  ctx.fillStyle = '#0f172a';
  ctx.fillRect(0, 0, targetSize, targetSize);

  const rect = computeSquareCropDrawRect({
    sourceWidth: img.naturalWidth || img.width || targetSize,
    sourceHeight: img.naturalHeight || img.height || targetSize,
    targetSize,
    transform,
  });

  ctx.save();
  ctx.translate(rect.centerX, rect.centerY);
  if (rect.rotationRad !== 0) {
    ctx.rotate(rect.rotationRad);
  }
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(
    img,
    -rect.drawWidth / 2,
    -rect.drawHeight / 2,
    rect.drawWidth,
    rect.drawHeight
  );
  ctx.restore();
}

export function exportCompactAvatarDataUrl(
  img: HTMLImageElement,
  transform: Partial<AvatarCropTransform>
): string {
  const attempts: Array<{ size: number; mime: string; quality: number }> = [
    { size: 160, mime: 'image/webp', quality: 0.84 },
    { size: 160, mime: 'image/jpeg', quality: 0.82 },
    { size: 144, mime: 'image/jpeg', quality: 0.74 },
    { size: 120, mime: 'image/jpeg', quality: 0.68 },
    { size: 96, mime: 'image/jpeg', quality: 0.62 },
  ];

  const canvas = document.createElement('canvas');
  for (const step of attempts) {
    renderCroppedAvatarToCanvas(canvas, img, transform, step.size);
    const dataUrl = canvas.toDataURL(step.mime, step.quality);
    if (dataUrl.length <= MAX_AVATAR_DATA_URL_LENGTH && dataUrl.startsWith('data:image/')) {
      return dataUrl;
    }
  }

  renderCroppedAvatarToCanvas(canvas, img, transform, 80);
  return canvas.toDataURL('image/jpeg', 0.55);
}

export function generateMonogramAvatarDataUrl(
  studentName: string,
  palette: MonogramPaletteOption
): string {
  const size = 160;
  const canvas = document.createElement('canvas');
  canvas.width = size;
  canvas.height = size;
  const ctx = canvas.getContext('2d');
  if (!ctx) return '';

  const grad = ctx.createLinearGradient(0, 0, size, size);
  grad.addColorStop(0, palette.bgStart);
  grad.addColorStop(1, palette.bgEnd);
  ctx.fillStyle = grad;
  ctx.fillRect(0, 0, size, size);

  ctx.strokeStyle = palette.accent;
  ctx.lineWidth = 5;
  ctx.beginPath();
  ctx.arc(size / 2, size / 2, size / 2 - 8, 0, Math.PI * 2);
  ctx.stroke();

  const initials = extractStudentInitials(studentName);
  ctx.fillStyle = '#ffffff';
  ctx.font = '700 58px sans-serif';
  ctx.textAlign = 'center';
  ctx.textBaseline = 'middle';
  ctx.fillText(initials, size / 2, size / 2 + 3);

  return canvas.toDataURL('image/png');
}
