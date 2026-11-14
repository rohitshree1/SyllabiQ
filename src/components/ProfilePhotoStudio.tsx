import React, { useEffect, useRef, useState } from 'react';
import {
  Check,
  ImagePlus,
  Link2,
  RotateCw,
  Trash2,
  Upload,
  User,
  X,
} from 'lucide-react';
import type { AuthenticatedAccount } from '../types';
import {
  clampAvatarTransform,
  DEFAULT_AVATAR_TRANSFORM,
  exportCompactAvatarDataUrl,
  generateMonogramAvatarDataUrl,
  MONOGRAM_PALETTES,
  normalizeRotationDeg,
  renderCroppedAvatarToCanvas,
  validateCustomAvatarSource,
  type AvatarCropTransform,
} from '../utils/avatarStudio';
import defaultAvatarImg from '../assets/images/avatar_student_profile_1793010659413.jpg';
import crestAvatarImg from '../assets/images/emblem_academic_excellence_1793010660964.jpg';

type StudioTab = 'upload' | 'url' | 'presets';

interface ProfilePhotoStudioProps {
  studentName: string;
  currentAvatarUrl?: string;
  account?: AuthenticatedAccount | null;
  onSaveAvatar: (avatarUrl: string) => void;
  onClose: () => void;
}

export const ProfilePhotoStudio: React.FC<ProfilePhotoStudioProps> = ({
  studentName,
  currentAvatarUrl,
  account,
  onSaveAvatar,
  onClose,
}) => {
  const [activeTab, setActiveTab] = useState<StudioTab>('upload');
  const [loadedImageEl, setLoadedImageEl] = useState<HTMLImageElement | null>(null);
  const [uploadedFileName, setUploadedFileName] = useState<string>('');
  const [transform, setTransform] = useState<AvatarCropTransform>(DEFAULT_AVATAR_TRANSFORM);
  const [isDraggingOver, setIsDraggingOver] = useState(false);

  const [urlInput, setUrlInput] = useState<string>(() =>
    currentAvatarUrl && /^https?:\/\//i.test(currentAvatarUrl) ? currentAvatarUrl : ''
  );
  const [urlPreviewError, setUrlPreviewError] = useState(false);

  const [selectedPresetUrl, setSelectedPresetUrl] = useState<string>('');
  const [errorMsg, setErrorMsg] = useState<string>('');
  const [savedNotice, setSavedNotice] = useState<string>('');

  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const previewCanvasRef = useRef<HTMLCanvasElement | null>(null);
  const dragPointerRef = useRef<{
    active: boolean;
    startX: number;
    startY: number;
    baseOffsetX: number;
    baseOffsetY: number;
  }>({
    active: false,
    startX: 0,
    startY: 0,
    baseOffsetX: 0,
    baseOffsetY: 0,
  });

  // Re-render live crop canvas whenever loaded image or framing transform changes
  useEffect(() => {
    if (activeTab !== 'upload' || !loadedImageEl || !previewCanvasRef.current) return;
    renderCroppedAvatarToCanvas(previewCanvasRef.current, loadedImageEl, transform, 160);
  }, [activeTab, loadedImageEl, transform]);

  const loadFileIntoCropper = (file: File) => {
    setErrorMsg('');
    setSavedNotice('');

    if (!file.type.startsWith('image/')) {
      setErrorMsg('Please choose a valid image file (JPG, PNG, WebP, or GIF).');
      return;
    }
    if (file.size > 15 * 1024 * 1024) {
      setErrorMsg('Please select an image smaller than 15 MB.');
      return;
    }

    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      if (!result) {
        setErrorMsg('Could not read the selected image file.');
        return;
      }
      const img = new Image();
      img.onload = () => {
        setLoadedImageEl(img);
        setUploadedFileName(file.name);
        setTransform(DEFAULT_AVATAR_TRANSFORM);
        setActiveTab('upload');
      };
      img.onerror = () => {
        setErrorMsg('Unsupported or corrupted image file. Try a standard JPG, PNG, or WebP photo.');
      };
      img.src = result;
    };
    reader.onerror = () => {
      setErrorMsg('Failed to read image from device.');
    };
    reader.readAsDataURL(file);
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      loadFileIntoCropper(file);
    }
    e.target.value = '';
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDraggingOver(false);
    const file = e.dataTransfer.files?.[0];
    if (file) {
      loadFileIntoCropper(file);
    }
  };

  const handleCanvasPointerDown = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!loadedImageEl) return;
    e.currentTarget.setPointerCapture(e.pointerId);
    dragPointerRef.current = {
      active: true,
      startX: e.clientX,
      startY: e.clientY,
      baseOffsetX: transform.offsetXPercent,
      baseOffsetY: transform.offsetYPercent,
    };
  };

  const handleCanvasPointerMove = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!dragPointerRef.current.active || !loadedImageEl) return;
    const dx = e.clientX - dragPointerRef.current.startX;
    const dy = e.clientY - dragPointerRef.current.startY;
    const next = clampAvatarTransform({
      ...transform,
      offsetXPercent: dragPointerRef.current.baseOffsetX + dx * 1.35,
      offsetYPercent: dragPointerRef.current.baseOffsetY + dy * 1.35,
    });
    setTransform(next);
  };

  const handleCanvasPointerUp = () => {
    dragPointerRef.current.active = false;
  };

  const handleApplyCurrentSelection = () => {
    setErrorMsg('');
    setSavedNotice('');

    if (activeTab === 'upload') {
      if (!loadedImageEl) {
        setErrorMsg('Choose or drop an image file first to frame and save your photo.');
        return;
      }
      const dataUrl = exportCompactAvatarDataUrl(loadedImageEl, transform);
      const check = validateCustomAvatarSource(dataUrl);
      if (!check.valid) {
        setErrorMsg(check.error || 'Unable to process image.');
        return;
      }
      onSaveAvatar(check.sanitized);
      setSavedNotice('Custom profile photo framed and saved.');
      return;
    }

    if (activeTab === 'url') {
      const trimmed = urlInput.trim();
      if (!trimmed) {
        setErrorMsg('Enter an https:// image link or choose another tab.');
        return;
      }
      if (urlPreviewError) {
        setErrorMsg('That image URL could not be loaded. Check the link and try again.');
        return;
      }
      const check = validateCustomAvatarSource(trimmed);
      if (!check.valid) {
        setErrorMsg(check.error || 'Invalid image URL.');
        return;
      }
      onSaveAvatar(check.sanitized);
      setSavedNotice('Custom profile image link saved.');
      return;
    }

    if (activeTab === 'presets') {
      if (!selectedPresetUrl) {
        setErrorMsg('Select a monogram or studio portrait option below first.');
        return;
      }
      onSaveAvatar(selectedPresetUrl === '__DEFAULT__' ? '' : selectedPresetUrl);
      setSavedNotice('Profile portrait updated.');
    }
  };

  const handleRemoveCustomPhoto = () => {
    setErrorMsg('');
    setLoadedImageEl(null);
    setUploadedFileName('');
    setUrlInput('');
    setSelectedPresetUrl('');
    onSaveAvatar('');
    setSavedNotice('Restored default profile portrait.');
  };

  const resolvedActivePreviewUrl = currentAvatarUrl || defaultAvatarImg;

  return (
    <div
      data-testid="profile-photo-studio"
      className="mt-5 border-b border-slate-200 pb-6 space-y-4"
    >
      {/* Studio Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h3 className="font-display text-base font-bold text-slate-900">
            Custom Profile Photo Studio
          </h3>
          <p className="text-xs text-slate-500">
            Upload and crop any photo from your device, link an image URL, or craft an academic
            initials portrait.
          </p>
        </div>

        <div className="flex items-center gap-2 shrink-0">
          <div
            role="tablist"
            aria-label="Profile image source options"
            className="flex items-center gap-1 rounded-lg bg-slate-100 p-1"
          >
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'upload'}
              onClick={() => {
                setActiveTab('upload');
                setErrorMsg('');
              }}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'upload'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Upload className="h-3.5 w-3.5" />
              <span>Upload &amp; Crop</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'url'}
              onClick={() => {
                setActiveTab('url');
                setErrorMsg('');
              }}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'url'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <Link2 className="h-3.5 w-3.5" />
              <span>Image Link</span>
            </button>
            <button
              type="button"
              role="tab"
              aria-selected={activeTab === 'presets'}
              onClick={() => {
                setActiveTab('presets');
                setErrorMsg('');
              }}
              className={`inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 ${
                activeTab === 'presets'
                  ? 'bg-white text-slate-900 shadow-2xs'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              <User className="h-3.5 w-3.5" />
              <span>Monograms</span>
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            aria-label="Close Profile Photo Studio"
            className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 hover:text-slate-900 transition-colors"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      </div>

      {/* Tab 1: Device Upload + Interactive Zoom / Pan / Rotate Cropper */}
      {activeTab === 'upload' && (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
          <div className="lg:col-span-6 flex flex-col justify-between">
            <input
              ref={fileInputRef}
              id="profile-photo-file-input"
              type="file"
              accept="image/jpeg,image/png,image/webp,image/gif"
              onChange={handleFileInputChange}
              className="sr-only"
            />

            <div
              onDragOver={(e) => {
                e.preventDefault();
                setIsDraggingOver(true);
              }}
              onDragLeave={() => setIsDraggingOver(false)}
              onDrop={handleDrop}
              className={`flex-1 rounded-xl border border-dashed p-5 flex flex-col items-center justify-center text-center transition-colors ${
                isDraggingOver
                  ? 'border-sky-600 bg-sky-50/60'
                  : 'border-slate-300 bg-slate-50/70'
              }`}
            >
              <ImagePlus className="h-7 w-7 text-sky-600 mb-2" />
              <p className="text-xs font-semibold text-slate-900">
                {uploadedFileName
                  ? `Selected: ${uploadedFileName}`
                  : 'Drop your photo here or choose an image from your device'}
              </p>
              <p className="mt-1 text-[11px] text-slate-500 max-w-sm">
                Supports JPG, PNG, WebP, and GIF up to 15 MB. Cropped cleanly on your device for
                instant profile &amp; cloud sync.
              </p>

              <button
                type="button"
                onClick={() => fileInputRef.current?.click()}
                className="mt-3.5 inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
              >
                <Upload className="h-3.5 w-3.5" />
                <span>{loadedImageEl ? 'Choose Different Image' : 'Choose Image from Device'}</span>
              </button>
            </div>
          </div>

          {/* Framing & Live Preview Column */}
          <div className="lg:col-span-6 flex flex-col sm:flex-row items-center gap-5 rounded-xl border border-slate-200 bg-slate-50/50 p-4">
            <div className="flex flex-col items-center gap-2 shrink-0">
              {loadedImageEl ? (
                <canvas
                  ref={previewCanvasRef}
                  width={160}
                  height={160}
                  onPointerDown={handleCanvasPointerDown}
                  onPointerMove={handleCanvasPointerMove}
                  onPointerUp={handleCanvasPointerUp}
                  onPointerCancel={handleCanvasPointerUp}
                  aria-label="Interactive square profile crop preview — drag to reposition"
                  className="h-28 w-28 rounded-full border-2 border-slate-900/15 shadow-xs cursor-grab active:cursor-grabbing touch-none"
                />
              ) : (
                <div className="h-28 w-28 rounded-full border border-slate-200 bg-white overflow-hidden flex items-center justify-center">
                  <img
                    src={resolvedActivePreviewUrl}
                    alt={`${studentName} current avatar`}
                    referrerPolicy="no-referrer"
                    className="h-full w-full object-cover"
                  />
                </div>
              )}
              <span className="text-[11px] text-slate-500">
                {loadedImageEl ? 'Drag photo to pan' : 'Current photo'}
              </span>
            </div>

            <div className="flex-1 w-full space-y-2.5">
              <div>
                <div className="flex items-center justify-between text-xs text-slate-700 mb-1">
                  <label htmlFor="avatar-zoom-range" className="font-semibold">
                    Zoom
                  </label>
                  <span className="font-mono tabular-nums text-slate-500">
                    {transform.zoom.toFixed(2)}x
                  </span>
                </div>
                <input
                  id="avatar-zoom-range"
                  type="range"
                  min={1}
                  max={3}
                  step={0.05}
                  disabled={!loadedImageEl}
                  value={transform.zoom}
                  onChange={(e) =>
                    setTransform((prev) =>
                      clampAvatarTransform({ ...prev, zoom: Number(e.target.value) })
                    )
                  }
                  className="w-full accent-sky-600 disabled:opacity-40"
                />
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <div className="flex items-center justify-between text-[11px] text-slate-600 mb-1">
                    <label htmlFor="avatar-panx-range" className="font-medium">
                      Horizontal
                    </label>
                    <span className="font-mono tabular-nums">{transform.offsetXPercent}%</span>
                  </div>
                  <input
                    id="avatar-panx-range"
                    type="range"
                    min={-100}
                    max={100}
                    step={2}
                    disabled={!loadedImageEl}
                    value={transform.offsetXPercent}
                    onChange={(e) =>
                      setTransform((prev) =>
                        clampAvatarTransform({
                          ...prev,
                          offsetXPercent: Number(e.target.value),
                        })
                      )
                    }
                    className="w-full accent-sky-600 disabled:opacity-40"
                  />
                </div>

                <div>
                  <div className="flex items-center justify-between text-[11px] text-slate-600 mb-1">
                    <label htmlFor="avatar-pany-range" className="font-medium">
                      Vertical
                    </label>
                    <span className="font-mono tabular-nums">{transform.offsetYPercent}%</span>
                  </div>
                  <input
                    id="avatar-pany-range"
                    type="range"
                    min={-100}
                    max={100}
                    step={2}
                    disabled={!loadedImageEl}
                    value={transform.offsetYPercent}
                    onChange={(e) =>
                      setTransform((prev) =>
                        clampAvatarTransform({
                          ...prev,
                          offsetYPercent: Number(e.target.value),
                        })
                      )
                    }
                    className="w-full accent-sky-600 disabled:opacity-40"
                  />
                </div>
              </div>

              <div className="flex flex-wrap items-center gap-2 pt-1">
                <button
                  type="button"
                  disabled={!loadedImageEl}
                  onClick={() =>
                    setTransform((prev) => ({
                      ...prev,
                      rotationDeg: normalizeRotationDeg(prev.rotationDeg + 90),
                    }))
                  }
                  className="inline-flex items-center gap-1.5 rounded-lg border border-slate-300 bg-white px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                  <RotateCw className="h-3.5 w-3.5" />
                  <span>Rotate 90°</span>
                </button>
                <button
                  type="button"
                  disabled={!loadedImageEl}
                  onClick={() => setTransform(DEFAULT_AVATAR_TRANSFORM)}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-medium text-slate-600 hover:bg-slate-50 disabled:opacity-40 whitespace-nowrap shrink-0"
                >
                  Center Frame
                </button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* Tab 2: Direct HTTPS Image Link or Connected Google/Microsoft Account Photo */}
      {activeTab === 'url' && (
        <div className="flex flex-col sm:flex-row items-start sm:items-center gap-5 rounded-xl border border-slate-200 bg-slate-50/60 p-4">
          <div className="h-20 w-20 shrink-0 rounded-full border border-slate-200 bg-white overflow-hidden flex items-center justify-center">
            {urlInput.trim() && !urlPreviewError ? (
              <img
                src={urlInput.trim()}
                alt="Custom URL avatar preview"
                referrerPolicy="no-referrer"
                onError={() => setUrlPreviewError(true)}
                className="h-full w-full object-cover"
              />
            ) : (
              <User className="h-7 w-7 text-slate-400" />
            )}
          </div>

          <div className="flex-1 w-full space-y-2.5">
            <div>
              <label
                htmlFor="profile-custom-image-url"
                className="block text-xs font-semibold text-slate-800 mb-1"
              >
                Paste Direct Image URL (HTTPS)
              </label>
              <input
                id="profile-custom-image-url"
                type="url"
                value={urlInput}
                onChange={(e) => {
                  setUrlInput(e.target.value);
                  setUrlPreviewError(false);
                  setErrorMsg('');
                }}
                placeholder="https://example.com/my-profile-photo.jpg"
                className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-xs text-slate-900 focus:border-sky-600 focus:outline-hidden"
              />
            </div>

            {account?.photoURL && (
              <div className="flex flex-wrap items-center gap-2">
                <button
                  type="button"
                  onClick={() => {
                    setUrlInput(account.photoURL || '');
                    setUrlPreviewError(false);
                    setErrorMsg('');
                  }}
                  className="inline-flex items-center gap-1.5 rounded-lg border border-sky-200 bg-sky-50 px-3 py-1.5 text-xs font-semibold text-sky-900 hover:bg-sky-100 whitespace-nowrap shrink-0"
                >
                  <span>
                    Use My {account.providerId === 'microsoft.com' ? 'Microsoft' : 'Google'} Account
                    Photo
                  </span>
                </button>
              </div>
            )}
          </div>
        </div>
      )}

      {/* Tab 3: Initials Monograms & Studio Portraits */}
      {activeTab === 'presets' && (
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-6 gap-3">
          {MONOGRAM_PALETTES.map((palette) => {
            const monoUrl = generateMonogramAvatarDataUrl(studentName, palette);
            const isSelected = selectedPresetUrl === monoUrl;
            return (
              <button
                key={palette.id}
                type="button"
                onClick={() => {
                  setSelectedPresetUrl(monoUrl);
                  setErrorMsg('');
                }}
                className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition-colors ${
                  isSelected
                    ? 'border-sky-600 bg-sky-50/50'
                    : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100/70'
                }`}
              >
                <img
                  src={monoUrl}
                  alt={`${studentName} ${palette.label} monogram`}
                  className="h-14 w-14 rounded-full object-cover"
                />
                <span className="text-xs font-semibold text-slate-800 whitespace-nowrap">
                  {palette.label}
                </span>
              </button>
            );
          })}

          <button
            type="button"
            onClick={() => {
              setSelectedPresetUrl('__DEFAULT__');
              setErrorMsg('');
            }}
            className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition-colors ${
              selectedPresetUrl === '__DEFAULT__'
                ? 'border-sky-600 bg-sky-50/50'
                : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100/70'
            }`}
          >
            <img
              src={defaultAvatarImg}
              alt="Default scholar portrait"
              referrerPolicy="no-referrer"
              className="h-14 w-14 rounded-full object-cover"
            />
            <span className="text-xs font-semibold text-slate-800 whitespace-nowrap">
              Scholar Default
            </span>
          </button>

          <button
            type="button"
            onClick={() => {
              setSelectedPresetUrl(crestAvatarImg);
              setErrorMsg('');
            }}
            className={`flex flex-col items-center gap-2 rounded-xl border p-3 text-center transition-colors ${
              selectedPresetUrl === crestAvatarImg
                ? 'border-sky-600 bg-sky-50/50'
                : 'border-slate-200 bg-slate-50/50 hover:bg-slate-100/70'
            }`}
          >
            <img
              src={crestAvatarImg}
              alt="Academic crest avatar"
              referrerPolicy="no-referrer"
              className="h-14 w-14 rounded-full object-cover"
            />
            <span className="text-xs font-semibold text-slate-800 whitespace-nowrap">
              Honors Crest
            </span>
          </button>
        </div>
      )}

      {/* Feedback & Action Footer */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-t border-slate-100 pt-3">
        <div className="min-h-5 flex items-center text-xs">
          {errorMsg ? (
            <span className="font-medium text-red-700" role="alert">
              {errorMsg}
            </span>
          ) : savedNotice ? (
            <span className="inline-flex items-center gap-1.5 font-semibold text-emerald-700">
              <Check className="h-3.5 w-3.5" />
              <span>{savedNotice}</span>
            </span>
          ) : (
            <span className="text-slate-500">
              Saved profile images appear across your Profile, Workspace Sidebar, and Rare FlexCards.
            </span>
          )}
        </div>

        <div className="flex flex-wrap items-center gap-2.5 shrink-0">
          {Boolean(currentAvatarUrl) && (
            <button
              type="button"
              onClick={handleRemoveCustomPhoto}
              className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3.5 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50 transition-colors whitespace-nowrap shrink-0"
            >
              <Trash2 className="h-3.5 w-3.5 text-slate-500" />
              <span>Remove Custom Photo</span>
            </button>
          )}

          <button
            type="button"
            onClick={handleApplyCurrentSelection}
            className="inline-flex items-center gap-1.5 rounded-lg bg-slate-900 px-4 py-2 text-xs font-semibold text-white hover:bg-slate-800 transition-colors whitespace-nowrap shrink-0"
          >
            <Check className="h-3.5 w-3.5 text-sky-400" />
            <span>Save Profile Image</span>
          </button>
        </div>
      </div>
    </div>
  );
};
