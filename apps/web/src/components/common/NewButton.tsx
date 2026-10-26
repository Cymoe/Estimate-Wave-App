import React from 'react';

interface NewButtonProps {
  label: string;
  onClick: () => void;
  color?: 'yellow' | 'blue' | 'danger' | 'ghost';
  className?: string;
}

export const NewButton: React.FC<NewButtonProps> = ({
  label,
  onClick,
  color = 'yellow',
  className = '',
}) => {
  const colorStyles = {
    yellow: 'bg-[#336699] hover:bg-opacity-90 text-white',
    blue: 'bg-[#336699] hover:bg-opacity-80 text-white',
    danger: 'bg-[#D32F2F] hover:bg-opacity-80 text-white',
    ghost:
      'bg-transparent border-l-2 border-[#336699] text-gray-400 hover:text-white hover:bg-[#232323] font-\'Roboto_Condensed\' text-base h-11 px-6 rounded-md transition-colors',
  }[color];

  return (
    <button
      onClick={onClick}
      className={`flex items-center gap-2 ${color === 'ghost' ? '' : 'h-7 px-3 -mt-0.5 rounded font-medium uppercase text-sm tracking-wide'} ${colorStyles} ${className}`}
    >
      <span className={
        color === 'ghost' 
          ? 'text-[#336699] text-xl font-bold leading-none' 
          : color === 'yellow'
          ? 'text-[#336699] text-base font-bold leading-none'
          : 'text-base font-bold leading-none'
      }>+</span> {label}
    </button>
  );
}; 