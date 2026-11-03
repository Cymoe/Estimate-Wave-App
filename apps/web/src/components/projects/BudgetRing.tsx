import React from 'react';

/** Blue while there's room, amber from 90%, red past the budget. */
function budgetTone(percent: number): 'ok' | 'near' | 'over' {
  if (percent > 100) return 'over';
  if (percent >= 90) return 'near';
  return 'ok';
}

const COLORS = { ok: '#3B82F6', near: '#F59E0B', over: '#EF4444' } as const;
const TEXT = { ok: 'text-[#9CA3AF]', near: 'text-amber-400', over: 'text-red-400' } as const;

/**
 * How much of a project's budget is spent: a small ring that fills as money
 * goes out (closed and red once it's over), with the exact percent beside it.
 */
export const BudgetRing: React.FC<{ percent: number; size?: number }> = ({ percent, size = 18 }) => {
  const value = Math.max(0, Math.round(percent));
  const tone = budgetTone(value);
  const stroke = 2.5;
  const r = (size - stroke) / 2;
  const circumference = 2 * Math.PI * r;
  const filled = (Math.min(value, 100) / 100) * circumference;
  return (
    <span
      className="flex items-center gap-1.5 flex-shrink-0"
      title={`${value}% of the budget spent`}
      aria-label={`${value}% of the budget spent`}
      data-testid="budget-ring"
      data-tone={tone}
    >
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden="true" className="-rotate-90">
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(148,163,184,0.25)" strokeWidth={stroke} />
        {value > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={COLORS[tone]}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={`${filled} ${circumference}`}
            data-testid="budget-ring-fill"
          />
        )}
      </svg>
      <span className={`${TEXT[tone]} text-xs font-medium tabular-nums leading-tight`}>{value}%</span>
    </span>
  );
};
