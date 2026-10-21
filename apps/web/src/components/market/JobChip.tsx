import React from 'react';
import { SIZE_RANGES, type Kind, type Size, jobLabel } from './jobSize';

/** "Medium · Remodel" next to a lead's trade; nothing when the lead has neither. */
export const JobChip: React.FC<{ size?: Size | string; kind?: Kind | string; className?: string }> = ({ size, kind, className = '' }) => {
  const label = jobLabel(size, kind);
  if (!label) return null;
  return (
    <span
      data-job
      title={size ? `${SIZE_RANGES[size as Size]} job` : undefined}
      className={`inline-block align-middle rounded px-1.5 py-0.5 text-[11px] leading-4 bg-[#2A2A2A] text-gray-300 whitespace-nowrap ${className}`}
    >
      {label}
    </span>
  );
};
