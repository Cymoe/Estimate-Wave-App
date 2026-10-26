import React, { useState, useEffect } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface SlideOutDrawerProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  width?: 'sm' | 'md' | 'lg' | 'xl';
}

/**
 * A panel that slides in from the right over the whole screen. It renders
 * into document.body so no page container (or its stacking) can put it
 * under the right nav or the + button.
 */
export const SlideOutDrawer: React.FC<SlideOutDrawerProps> = ({
  isOpen,
  onClose,
  title,
  children,
  width = 'md'
}) => {
  const [isClosing, setIsClosing] = useState(false);
  // Slides in: the closed position paints first, then it moves.
  const [shown, setShown] = useState(false);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 300);
  };

  useEffect(() => {
    if (!isOpen) {
      setShown(false);
      return;
    }
    let inner = 0;
    const outer = requestAnimationFrame(() => {
      inner = requestAnimationFrame(() => setShown(true));
    });
    return () => {
      cancelAnimationFrame(outer);
      cancelAnimationFrame(inner);
    };
  }, [isOpen]);

  // Esc closes it.
  useEffect(() => {
    if (!isOpen) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        handleClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen]);

  const widthClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl'
  };

  if (!isOpen) {
    return null;
  }

  const open = shown && !isClosing;
  return createPortal(
    <div className="fixed inset-0 z-[11000] flex justify-end" role="dialog" aria-label={title}>
      {/* Backdrop with blur and darker opacity */}
      <div
        className={`fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-300 ${open ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleClose}
      />

      {/* Drawer */}
      <div className={`relative w-full ${widthClasses[width]} bg-[#121212] h-[100dvh] shadow-2xl border-l border-[#333333] transform transition-transform duration-300 flex flex-col ${
        open ? 'translate-x-0' : 'translate-x-full'
      }`}>
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-[#333333] flex-shrink-0">
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <button
            onClick={handleClose}
            aria-label="Close"
            className="p-1 hover:bg-[#333333] rounded-[4px] transition-colors"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {children}
        </div>
      </div>
    </div>,
    document.body,
  );
};
