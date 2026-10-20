import React, { useEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { X } from 'lucide-react';

interface ModalProps {
  isOpen: boolean;
  onClose: () => void;
  title: string;
  children: React.ReactNode;
  size?: 'sm' | 'md' | 'lg' | 'xl' | '2xl' | '3xl' | '4xl' | 'full';
  /** When false, a tap outside or Escape does nothing: only the X (or the dialog's own buttons) closes it. */
  dismissible?: boolean;
  /** Pinned under the content, outside the scroll: the dialog's main buttons stay in reach however long the content gets. */
  footer?: React.ReactNode;
}

export const Modal: React.FC<ModalProps> = ({
  isOpen,
  onClose,
  title,
  children,
  size = 'md',
  dismissible = true,
  footer,
}) => {
  const modalRef = useRef<HTMLDivElement>(null);
  const previousFocusRef = useRef<HTMLElement | null>(null);
  // Fades in on the frame after it mounts, like the drawers.
  const [shown, setShown] = useState(false);
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

  // Handle escape key press
  useEffect(() => {
    const handleEscape = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && isOpen && dismissible) {
        onClose();
      }
    };

    if (isOpen) {
      document.addEventListener('keydown', handleEscape);
      // Store the currently focused element
      previousFocusRef.current = document.activeElement as HTMLElement;
      
      // Focus the modal when it opens, unless something inside it already has focus
      // (grabbing it back would drop the on-screen keyboard and make the dialog jump).
      setTimeout(() => {
        const inside = modalRef.current?.contains(document.activeElement);
        if (!inside) modalRef.current?.focus();
      }, 100);
    }

    return () => {
      document.removeEventListener('keydown', handleEscape);
      // Restore focus when modal closes
      if (!isOpen && previousFocusRef.current) {
        previousFocusRef.current.focus();
      }
    };
  }, [isOpen, onClose, dismissible]);
  if (!isOpen) {
    return null;
  }

  const sizeClasses = {
    sm: 'max-w-sm',
    md: 'max-w-md',
    lg: 'max-w-lg',
    xl: 'max-w-xl',
    '2xl': 'max-w-2xl',
    '3xl': 'max-w-3xl',
    '4xl': 'max-w-4xl',
    'full': 'max-w-[90vw]'
  };

  // Rendered at the top level so the backdrop covers the whole screen, navigation included.
  return createPortal(
    <div className="fixed inset-0 z-[11000] flex items-start justify-center p-4 pt-[8vh]">
      {/* Backdrop with blur and darker opacity. The dialog sits near the top so an on-screen keyboard never re-centres it. */}
      <div
        className={`fixed inset-0 bg-black/70 backdrop-blur-sm transition-opacity duration-200 ${shown ? 'opacity-100' : 'opacity-0'}`}
        onClick={dismissible ? onClose : undefined}
        data-testid="modal-backdrop"
      />
      
      {/* Modal */}
      <div 
        ref={modalRef}
        className={`relative w-full ${sizeClasses[size]} bg-[#1E1E1E] rounded-[4px] shadow-2xl border border-[#333333] max-h-[84vh] overflow-hidden flex flex-col transition-opacity duration-200 ${shown ? 'opacity-100' : 'opacity-0'}`}
        role="dialog"
        aria-modal="true"
        aria-labelledby="modal-title"
        tabIndex={-1}
      >
        {/* Header */}
        <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 border-b border-[#333333]">
          <h2 id="modal-title" className="text-lg font-semibold text-white">{title}</h2>
          <button
            onClick={onClose}
            className="p-1 hover:bg-[#333333] rounded-[4px] transition-colors focus:outline-none focus:ring-2 focus:ring-[#0D47A1] focus:ring-offset-2 focus:ring-offset-[#1E1E1E]"
            aria-label="Close modal"
          >
            <X className="w-5 h-5 text-gray-400" />
          </button>
        </div>
        
        {/* Content: the only part that scrolls. */}
        <div className="flex-1 min-h-0 overflow-y-auto">
          {children}
        </div>
        {footer && <div className="flex-shrink-0 border-t border-[#333333] bg-[#1E1E1E] px-6 py-4">{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}; 