import React, { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';
import { useSlideIn } from '../common/StructuredNote';
import { EstimateDetail } from './EstimateDetail';

/**
 * One estimate, in a drawer over the estimates list: the same screen as the
 * estimate page, the size of the create-estimate drawer.
 */
export const EstimateDrawer: React.FC<{ estimateId: string; onClose: () => void }> = ({ estimateId, onClose }) => {
  const { shown, slideOut } = useSlideIn();
  const close = () => slideOut(onClose);
  const panel = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      // Esc closes the drawer unless something inside it (a modal, an open cell) handles it first.
      const target = e.target as HTMLElement | null;
      const typing = target && (target.tagName === 'INPUT' || target.tagName === 'TEXTAREA' || target.isContentEditable);
      // Something open on top (the item pricing drawer, a share or delete box) goes first.
      const otherDialogOpen = Array.from(document.querySelectorAll('[role="dialog"]')).some(
        (el) => el !== panel.current && el.getAttribute('aria-hidden') !== 'true',
      );
      if (e.key === 'Escape' && !e.defaultPrevented && !typing && !otherDialogOpen) close();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  });

  return createPortal(
    <>
      <div
        className={`fixed inset-0 bg-black/60 backdrop-blur-sm transition-opacity z-[10000] ${shown ? 'opacity-100' : 'opacity-0'}`}
        onClick={close}
      />
      <div
        ref={panel}
        role="dialog"
        aria-label="Estimate"
        className={`fixed right-0 top-0 h-[100dvh] w-full md:w-[80%] max-w-[1200px] bg-[#000000] shadow-xl transform transition-transform z-[10001] flex flex-col overflow-hidden ${
          shown ? 'translate-x-0' : 'translate-x-full'
        }`}
      >
        <EstimateDetail key={estimateId} estimateId={estimateId} onClose={close} inDrawer />
      </div>
    </>,
    document.body,
  );
};
