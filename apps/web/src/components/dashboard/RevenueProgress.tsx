import React from 'react';
import { formatCurrency } from '../../utils/format';

interface RevenueProgressProps {
  currentValue: number;
  outstandingAmount: number;
  targetValue: number;
}

export const RevenueProgress: React.FC<RevenueProgressProps> = ({ 
  currentValue, 
  outstandingAmount,
  targetValue 
}) => {
  const percentage = Math.min(Math.round((currentValue / targetValue) * 100), 100);
  const outstandingPercentage = Math.min(Math.round((outstandingAmount / targetValue) * 100), 100);

  return (
    <div>
      <div className="flex justify-between items-center mb-4">
        <div>
          <h3 className="text-lg font-bold text-white font-['Roboto_Condensed'] uppercase">Revenue Progress</h3>
          <p className="text-sm text-[#9E9E9E] font-['Roboto']">
            <span className="text-[#388E3C] font-medium">{percentage}%</span> of target reached
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-[#9E9E9E] font-['Roboto']">Outstanding Amount</p>
          <p className="text-lg font-bold text-[#5b8fc7] font-['Roboto_Mono']">
            {formatCurrency(outstandingAmount)}
          </p>
        </div>
      </div>

      <div className="h-4 bg-[#1E1E1E] rounded-[4px] overflow-hidden relative">
        {/* Current revenue (green) */}
        <div 
          className="h-full bg-[#388E3C] absolute left-0 top-0 transition-all duration-500"
          style={{ width: `${percentage}%` }}
        />
        {/* Outstanding amount (yellow) */}
        <div 
          className="h-full bg-[#336699] transition-all duration-500 absolute top-0"
          style={{ left: `${percentage}%`, width: `${outstandingPercentage}%` }}
        />
      </div>

      <div className="mt-6 flex justify-between items-center text-sm">
        <div>
          <p className="text-sm text-[#9E9E9E] font-['Roboto']">Current Revenue</p>
          <p className="text-lg font-bold text-[#388E3C] font-['Roboto_Mono']">
            {formatCurrency(currentValue)}
          </p>
        </div>
        <div className="text-right">
          <p className="text-sm text-[#9E9E9E] font-['Roboto']">Target Revenue</p>
          <p className="text-lg font-bold text-white font-['Roboto_Condensed']">
            {formatCurrency(targetValue)}
          </p>
        </div>
      </div>
    </div>
  );
};