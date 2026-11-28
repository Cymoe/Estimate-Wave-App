import React from 'react';

/**
 * How far along a job is: a small ring that fills blue as its schedule tasks
 * are done and closes green once it's complete, with the percent beside it.
 */
export const ProgressRing: React.FC<{ percent: number; size?: number }> = ({ percent, size = 18 }) => {
  const value = Math.min(100, Math.max(0, Math.round(percent)));
  const done = value >= 100;
  const stroke = 2.5;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const label = done ? 'Complete' : `${value}% complete`;
  return (
    <span
      className="flex items-center gap-1.5 flex-shrink-0"
      title={label}
      aria-label={label}
      data-testid="progress-ring"
      data-done={done ? 'true' : 'false'}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(148,163,184,0.25)" strokeWidth={stroke} />
        {value > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={done ? '#22C55E' : '#3B82F6'}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${(value / 100) * circumference} ${circumference}`}
            data-testid="progress-ring-fill"
          />
        )}
      </svg>
      <span className={`${done ? 'text-green-400' : 'text-[#9CA3AF]'} text-xs font-medium tabular-nums leading-tight`}>{value}%</span>
    </span>
  );
};
