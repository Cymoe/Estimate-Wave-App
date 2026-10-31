import React, { useEffect, useRef, useState } from 'react';
import { Plus } from 'lucide-react';
import { SPRING } from './quickCreateOptions';

const reducedMotion = () => window.matchMedia?.('(prefers-reduced-motion: reduce)').matches ?? false;

interface Props {
  isOpen: boolean;
  onClick: () => void;
  isSidebarCollapsed?: boolean;
  isProjectsSidebarLocked?: boolean;
  isProjectsSidebarOpen?: boolean;
  isIndustryDrawerOpen?: boolean;
  /** Hides the button. */
  hidden?: boolean;
  /** The menu, drawn above the button. */
  children?: React.ReactNode;
}

export const QuickCreateButton: React.FC<Props> = ({ 
  isOpen, 
  onClick,
  isSidebarCollapsed = false,
  isProjectsSidebarLocked = false,
  isProjectsSidebarOpen = false,
  isIndustryDrawerOpen = false,
  hidden = false,
  children
}) => {
  const [isEstimateCartOpen, setIsEstimateCartOpen] = useState(false);
  const buttonRef = useRef<HTMLButtonElement>(null);
  const ringRef = useRef<HTMLSpanElement>(null);
  const wasOpen = useRef(isOpen);

  // Each time it opens: the button squashes and springs back, a ring bursts
  // out of it, and phones that can buzz give a tap.
  useEffect(() => {
    const opened = isOpen && !wasOpen.current;
    wasOpen.current = isOpen;
    if (!opened || reducedMotion()) return;
    buttonRef.current?.animate?.(
      [{ transform: 'scale(1)' }, { transform: 'scale(0.86)', offset: 0.25 }, { transform: 'scale(1.12)', offset: 0.65 }, { transform: 'scale(1)' }],
      { duration: 260, easing: 'ease-out' },
    );
    ringRef.current?.animate?.(
      [{ transform: 'scale(1)', opacity: 0.7 }, { transform: 'scale(1.9)', opacity: 0 }],
      { duration: 420, easing: 'cubic-bezier(0.2, 0.8, 0.2, 1)' },
    );
    navigator.vibrate?.(8);
  }, [isOpen]);
  
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      // Open with Cmd+K
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        onClick();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [onClick]);

  // Listen for estimate cart toggle events
  useEffect(() => {
    const handleCartToggle = (event: CustomEvent) => {
      setIsEstimateCartOpen(event.detail.isOpen);
    };

    window.addEventListener('estimateCartToggle', handleCartToggle as EventListener);
    return () => {
      window.removeEventListener('estimateCartToggle', handleCartToggle as EventListener);
    };
  }, []);

  // Hide button when the estimate cart is open
  if (hidden || isEstimateCartOpen) {
    return null;
  }

  // Dynamic positioning based on sidebar states
  const baseRight = isSidebarCollapsed ? 96 : 240; // 24 * 4 or 60 * 4 (in pixels)
  const projectsOffset = (isProjectsSidebarLocked || isProjectsSidebarOpen) ? 320 : 0;
  const industryOffset = isIndustryDrawerOpen ? 400 : 0;
  
  const totalRightPx = baseRight + projectsOffset + industryOffset;

  return (
    <div className="fixed bottom-6 hidden md:block z-[9998]" style={{ right: `${totalRightPx}px` }}>
      {children}
      <span ref={ringRef} className="absolute inset-0 rounded-full border-2 border-[#5b8fc4] opacity-0 pointer-events-none" aria-hidden />
      <button
        ref={buttonRef}
        onClick={onClick}
        aria-label={isOpen ? 'Close' : 'Create new'}
        aria-expanded={isOpen}
        className={`relative flex w-14 h-14 bg-[#336699] hover:bg-[#2a5580] 
          text-white rounded-full shadow-[0_4px_20px_rgba(51,102,153,0.45)] hover:shadow-[0_6px_25px_rgba(51,102,153,0.65)]
          items-center justify-center transition-[box-shadow,background-color] duration-150 group
          ${isOpen ? 'shadow-[0_6px_28px_rgba(51,102,153,0.75)]' : ''}`}
      >
        {/* The + spins round into a ×. */}
        <Plus
          className="w-6 h-6 motion-reduce:transition-none"
          style={{ transform: isOpen ? 'rotate(135deg)' : 'rotate(0deg)', transition: `transform ${isOpen ? `240ms ${SPRING}` : '140ms ease-in'}` }}
        />
      </button>
    </div>
  );
}; 