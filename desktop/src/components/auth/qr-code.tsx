'use client';

import * as React from 'react';

import { qrMatrix } from '@/lib/qr';

interface QrCodeProps {
  value: string;
  /** Accessible description of what the code holds. */
  label: string;
  size?: number;
  className?: string;
}

/** A QR code drawn as one SVG path on a white square. It is dark-on-light in either theme on purpose: scanners expect it, so it ignores the design tokens. */
export function QrCode({ value, label, size = 192, className }: QrCodeProps) {
  const modules = React.useMemo(() => {
    try {
      return qrMatrix(value);
    } catch {
      return null;
    }
  }, [value]);
  if (!modules) return null;

  const quiet = 4;
  const n = modules.length;
  let path = '';
  modules.forEach((row, y) => {
    let x = 0;
    while (x < n) {
      if (!row[x]) {
        x++;
        continue;
      }
      const start = x;
      while (x < n && row[x]) x++;
      path += `M${start + quiet} ${y + quiet}h${x - start}v1h-${x - start}z`;
    }
  });

  return (
    <svg
      role="img"
      aria-label={label}
      viewBox={`0 0 ${n + quiet * 2} ${n + quiet * 2}`}
      width={size}
      height={size}
      shapeRendering="crispEdges"
      className={className}
      data-testid="qr-code"
    >
      <rect width="100%" height="100%" fill="white" />
      <path d={path} fill="black" />
    </svg>
  );
}
