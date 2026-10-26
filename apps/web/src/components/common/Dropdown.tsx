import React, { useState, useRef, useEffect } from 'react';

interface DropdownItem {
  label: React.ReactNode;
  onClick: (event: React.MouseEvent<HTMLButtonElement>) => void;
  className?: string;
}

interface DropdownProps {
  trigger: React.ReactNode;
  items: DropdownItem[];
}

export const Dropdown: React.FC<DropdownProps> = ({ trigger, items }) => {
  const [isOpen, setIsOpen] = useState(false);
  const dropdownRef = useRef<HTMLDivElement>(null);
  const triggerRef = useRef<HTMLDivElement>(null);
  const [dropdownPosition, setDropdownPosition] = useState({ top: 0, left: 0 });

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
        setIsOpen(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  useEffect(() => {
    if (isOpen && triggerRef.current) {
      const rect = triggerRef.current.getBoundingClientRect();
      const windowWidth = window.innerWidth;
      
      // Calculate left position to ensure dropdown stays within viewport
      let leftPos = rect.right - 150;
      if (leftPos + 192 > windowWidth) { // 192px = dropdown width (w-48 = 12rem = 192px)
        leftPos = windowWidth - 200; // Keep 8px margin from right edge
      }
      if (leftPos < 8) { // Keep 8px margin from left edge
        leftPos = 8;
      }
      
      setDropdownPosition({
        top: rect.bottom + window.scrollY,
        left: leftPos + window.scrollX,
      });
    }
  }, [isOpen]);

  return (
    <div className="relative" ref={dropdownRef}>
      <div ref={triggerRef} onClick={() => setIsOpen(!isOpen)}>{trigger}</div>
      {isOpen && (
        <div 
          className="fixed w-48 rounded-[4px] shadow-lg bg-[#1E1E1E] border border-[#333333] z-[11000]"
          style={{ 
            top: `${dropdownPosition.top}px`, 
            left: `${dropdownPosition.left}px`,
          }}
        >
          <div className="py-1" role="menu" aria-orientation="vertical">
            {items.map((item, index) => (
              typeof item.label === 'string' && item.label === '' ? (
                <div
                  key={index}
                  className={item.className || ''}
                  style={{ height: '1px', background: '#333333', margin: '4px 0' }}
                  aria-hidden="true"
                />
              ) : (
                <button
                  key={index}
                  onClick={(e) => {
                    item.onClick(e);
                    setIsOpen(false);
                  }}
                  className={`block w-full text-left px-4 py-3 text-sm font-['Roboto'] uppercase tracking-wider ${
                    item.className ||
                    'text-[#FFFFFF] hover:bg-[#333333] hover:text-[#5b8fc7]'
                  }`}
                  role="menuitem"
                >
                  {typeof item.label === 'string' ? item.label.toUpperCase() : item.label}
                </button>
              )
            ))}
          </div>
        </div>
      )}
    </div>
  );
};