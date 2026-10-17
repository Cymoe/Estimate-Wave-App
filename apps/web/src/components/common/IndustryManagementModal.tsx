import React, { useEffect, useState } from 'react';
import { createPortal } from 'react-dom';
import { IndustryPicker } from './IndustryPicker';

interface IndustryManagementModalProps {
  isOpen: boolean;
  onClose: () => void;
}

export const IndustryManagementModal: React.FC<IndustryManagementModalProps> = ({ isOpen, onClose }) => {
  const [isClosing, setIsClosing] = useState(false);
  // Starts hidden and fades in on the next frame, matching the fade-out.
  const [isShown, setIsShown] = useState(false);

  useEffect(() => {
    if (!isOpen) {
      setIsShown(false);
      return;
    }
    const frame = requestAnimationFrame(() => setIsShown(true));
    return () => cancelAnimationFrame(frame);
  }, [isOpen]);

  // Prevent body scroll when modal is open
  useEffect(() => {
    if (isOpen) {
      document.body.style.overflow = 'hidden';
      return () => {
        document.body.style.overflow = 'unset';
      };
    }
  }, [isOpen]);

  const handleClose = () => {
    setIsClosing(true);
    setTimeout(() => {
      onClose();
      setIsClosing(false);
    }, 200);
  };

  if (!isOpen) return null;

  return createPortal(
    <>
      <div
        className={`fixed inset-0 bg-black/70 z-[100] transition-opacity duration-200 ${isShown && !isClosing ? 'opacity-100' : 'opacity-0'}`}
        onClick={handleClose}
      />
      <div className="fixed inset-0 z-[101] flex items-center justify-center p-4 pointer-events-none">
        <div
          className={`bg-[#1D1F25] border border-[#333333] shadow-2xl max-w-2xl w-full h-[85vh] flex flex-col pointer-events-auto transition-opacity duration-200 ${
            isShown && !isClosing ? 'opacity-100' : 'opacity-0'
          }`}
        >
          <IndustryPicker isOpen={isOpen} onClose={handleClose} />
        </div>
      </div>
    </>,
    document.body,
  );
};
