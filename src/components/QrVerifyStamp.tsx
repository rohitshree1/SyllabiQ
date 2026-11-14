import React, { useMemo } from 'react';
import { createCredentialVerificationQr } from '../utils/qrVerification';

interface QrVerifyStampProps {
  serialCode: string;
  originUrl?: string;
  sizePx?: number;
  darkSurface?: boolean;
  testId?: string;
}

export const QrVerifyStamp: React.FC<QrVerifyStampProps> = ({
  serialCode,
  originUrl,
  sizePx = 88,
  darkSurface = false,
  testId = 'credential-qr-stamp',
}) => {
  const qrData = useMemo(
    () => createCredentialVerificationQr(serialCode, originUrl),
    [serialCode, originUrl]
  );

  const quietModules = 2;
  const viewBoxSize = qrData.matrix.size + quietModules * 2;

  return (
    <div
      data-testid={testId}
      data-verify-url={qrData.verifyUrl}
      className={`inline-flex flex-col items-center rounded-xl border p-2 shrink-0 ${
        darkSurface
          ? 'border-white/20 bg-white text-slate-900'
          : 'border-slate-200 bg-white text-slate-900'
      }`}
    >
      <svg
        width={sizePx}
        height={sizePx}
        viewBox={`0 0 ${viewBoxSize} ${viewBoxSize}`}
        shapeRendering="crispEdges"
        role="img"
        aria-label={`Scannable verification QR code for ${qrData.serialCode}`}
      >
        <rect width={viewBoxSize} height={viewBoxSize} fill="#ffffff" />
        {qrData.matrix.modules.map((row, rIdx) =>
          row.map((isDark, cIdx) =>
            isDark ? (
              <rect
                key={`${rIdx}-${cIdx}`}
                x={cIdx + quietModules}
                y={rIdx + quietModules}
                width={1}
                height={1}
                fill="#0f172a"
              />
            ) : null
          )
        )}
      </svg>
      <span className="mt-1 font-mono tabular-nums text-[10px] font-bold tracking-tight text-slate-800 whitespace-nowrap">
        Scan to Verify
      </span>
    </div>
  );
};
