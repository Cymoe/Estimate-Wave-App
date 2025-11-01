import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';

interface QuickCreateOption {
  id: string;
  name: string;
  icon: string;
  shortcut: string;
  action: () => void;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
  showInvoiceDrawer: boolean;
  setShowInvoiceDrawer: (value: boolean) => void;
}

export const QuickCreateMenu: React.FC<Props> = ({ isOpen, onClose, showInvoiceDrawer, setShowInvoiceDrawer }) => {
  const navigate = useNavigate();
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const options: QuickCreateOption[] = [
    {
      id: 'sales-mode',
      name: 'Quick Quote',
      icon: '⚡',
      shortcut: '⌘⇧Q',
      action: () => navigate('/sales-mode')
    },
    {
      id: 'estimate',
      name: 'Full Estimate',
      icon: '📋',
      shortcut: '⌘⇧E',
      action: () => navigate('/work')
    },
    {
      id: 'client',
      name: 'Client',
      icon: '👤',
      shortcut: '⌘⇧C',
      action: () => navigate('/clients/new')
    },
    {
      id: 'invoice',
      name: 'Invoice',
      icon: '$',
      shortcut: '⌘⇧I',
      action: () => {
        // Open the drawer
        setShowInvoiceDrawer(true);
        // Then close the menu after a short delay to ensure state updates
        setTimeout(() => onClose(), 100);
      }
    }
  ];

  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (!isOpen) return;

      const gridWidth = 3;
      const itemCount = options.length;

      switch (e.key) {
        case 'ArrowRight':
          e.preventDefault();
          setSelectedIndex(prev => (prev + 1) % itemCount);
          break;

        case 'ArrowLeft':
          e.preventDefault();
          setSelectedIndex(prev => prev <= 0 ? itemCount - 1 : prev - 1);
          break;

        case 'ArrowDown':
          e.preventDefault();
          setSelectedIndex(prev => Math.min(prev + gridWidth, itemCount - 1));
          break;

        case 'ArrowUp':
          e.preventDefault();
          setSelectedIndex(prev => Math.max(prev - gridWidth, 0));
          break;

        case 'Enter':
          e.preventDefault();
          if (selectedIndex >= 0) {
            handleOptionClick(options[selectedIndex]);
          }
          break;

        case 'Escape':
          e.preventDefault();
          onClose();
          break;
      }
    };

    if (isOpen) {
      window.addEventListener('keydown', handleKeyDown);
      setSelectedIndex(0);
    } else {
      setSelectedIndex(-1);
    }

    return () => {
      window.removeEventListener('keydown', handleKeyDown);
    };
  }, [isOpen, options.length, onClose]);

  const handleOptionClick = (option: QuickCreateOption) => {
    option.action();
    // Only close for non-invoice options
    if (option.id !== 'invoice') {
      onClose();
    }
  };

  if (!isOpen) return null;

  return (
    <>
      {/* Backdrop */}
      <div 
        className="fixed inset-0 bg-black/80 backdrop-blur-sm z-[998] transition-all duration-300"
        onClick={onClose}
      />

      {/* Quick Create Menu */}
      <div className="fixed top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[90%] max-w-[480px] bg-[#1a1a1a] border border-[#2a2a2a] rounded-2xl shadow-2xl z-[999] overflow-hidden">
        {/* Header */}
        <div className="p-6 text-center border-b border-[#2a2a2a]">
          <h2 className="text-sm font-semibold uppercase tracking-wider text-gray-400">Create New</h2>
        </div>

        {/* Options Grid */}
        <div className="p-6 grid grid-cols-3 gap-4">
          {options.map((option, index) => (
            <button
              key={option.id}
              onClick={() => handleOptionClick(option)}
              className={`bg-[#0a0a0a] border border-[#2a2a2a] rounded-xl p-6 cursor-pointer transition-all relative overflow-hidden group
                ${selectedIndex === index ? 'border-blue-500' : 'hover:border-[#3a3a3a]'}
                before:content-[''] before:absolute before:inset-x-0 before:top-0 before:h-[3px] before:bg-blue-500 
                before:transform before:-translate-y-full group-hover:before:translate-y-0 before:transition-transform
              `}
              tabIndex={0}
            >
              <div className="w-12 h-12 bg-[#2a2a2a] rounded-xl flex items-center justify-center text-xl mb-3 mx-auto transition-all group-hover:scale-105 group-hover:bg-[#333]">
                {option.icon}
              </div>
              <div className="text-sm font-medium mb-1">{option.name}</div>
              <div className="text-xs text-gray-600">{option.shortcut}</div>
            </button>
          ))}
        </div>

        {/* Footer */}
        <div className="p-4 border-t border-[#2a2a2a] flex justify-center gap-8 text-xs text-gray-600">
          <div className="flex items-center gap-2">
            <span className="bg-[#2a2a2a] px-1.5 py-0.5 rounded text-[11px]">Click</span>
            <span>to create</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-[#2a2a2a] px-1.5 py-0.5 rounded text-[11px]">⌘K</span>
            <span>Quick create</span>
          </div>
          <div className="flex items-center gap-2">
            <span className="bg-[#2a2a2a] px-1.5 py-0.5 rounded text-[11px]">Esc</span>
            <span>Close</span>
          </div>
        </div>
      </div>
      
    </>
  );
}; 