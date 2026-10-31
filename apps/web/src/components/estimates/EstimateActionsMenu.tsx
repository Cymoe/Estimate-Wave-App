import React, { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { CheckCircle, Copy, Link, Send, Trash2, XCircle } from 'lucide-react';
import type { Estimate } from '../../services/EstimateService';

export type EstimateAction = 'send' | 'copy-link' | 'duplicate' | 'accept' | 'decline' | 'delete';

interface EstimateActionsMenuProps {
  estimate: Estimate;
  /** Where the press was, so the menu opens beside the finger. */
  x: number;
  y: number;
  onAction: (action: EstimateAction) => void;
  onClose: () => void;
}

/** The menu that opens when an estimate row is held down (or right-clicked). */
export const EstimateActionsMenu: React.FC<EstimateActionsMenuProps> = ({ estimate, x, y, onAction, onClose }) => {
  const menu = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  // Keep the menu on screen.
  useLayoutEffect(() => {
    const el = menu.current;
    if (!el) return;
    const margin = 8;
    const { width, height } = el.getBoundingClientRect();
    setPosition({
      left: Math.max(margin, Math.min(x, window.innerWidth - width - margin)),
      top: Math.max(margin, Math.min(y, window.innerHeight - height - margin)),
    });
  }, [x, y]);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onClose();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const answerable = estimate.status === 'sent' || estimate.status === 'opened';
  const approvable = answerable || estimate.status === 'draft';
  const item = (action: EstimateAction, label: string, Icon: React.ElementType, danger = false) => (
    <button
      key={action}
      type="button"
      role="menuitem"
      onClick={() => {
        onClose();
        onAction(action);
      }}
      className={`w-full flex items-center gap-3 px-4 py-3 text-sm text-left [@media(hover:hover)]:hover:bg-[#2a2a2a] active:bg-[#2a2a2a] ${
        danger ? 'text-red-400' : 'text-white'
      }`}
    >
      <Icon className="w-4 h-4 flex-shrink-0" />
      {label}
    </button>
  );

  return createPortal(
    <div
      className="fixed inset-0 z-[10020]"
      onClick={onClose}
      onContextMenu={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div
        ref={menu}
        role="menu"
        aria-label={`Actions for ${estimate.estimate_number}`}
        onClick={(e) => e.stopPropagation()}
        style={{ left: position.left, top: position.top }}
        className="fixed min-w-[220px] bg-[#1E1E1E] border border-[#333333] rounded-lg shadow-2xl overflow-hidden"
      >
        <div className="px-4 py-2 text-xs text-gray-400 border-b border-[#333333] truncate">
          {estimate.estimate_number}
          {estimate.client?.name ? ` · ${estimate.client.name}` : ''}
        </div>
        {item('send', 'Send to client', Send)}
        {item('copy-link', 'Copy client link', Link)}
        {item('duplicate', 'Duplicate', Copy)}
        {approvable && item('accept', 'Approve without signature', CheckCircle)}
        {answerable && item('decline', 'Mark as declined', XCircle)}
        <div className="border-t border-[#333333]">{item('delete', 'Delete', Trash2, true)}</div>
      </div>
    </div>,
    document.body,
  );
};
