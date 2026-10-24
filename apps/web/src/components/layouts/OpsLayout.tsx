import React, { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, ChevronDown, LogOut, Moon, Sun } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useTheme } from '../../contexts/ThemeContext';
import { isSuperAdmin } from '../../lib/roles';
import { usePaymentsMode } from '../../lib/live';
import { OpsErrorBoundary } from '../ops/OpsErrorBoundary';

/**
 * The frame for the platform side. Nothing of a company's in it: no
 * company switcher, no tiles, no wallet. A thin bar with the name, and a
 * menu to switch to your own company (if you have one) or sign out.
 */
export const OpsLayout: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, signOut } = useAuth();
  const { theme, toggleTheme } = useTheme();
  const navigate = useNavigate();
  const [open, setOpen] = useState(false);
  const menuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    const close = (e: MouseEvent) => {
      if (menuRef.current && !menuRef.current.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    return () => document.removeEventListener('mousedown', close);
  }, [open]);

  const hasCompany = Boolean(user?.organizationId);
  const payments = usePaymentsMode<{ playMoney: boolean }>();
  const name = user?.name || user?.email || 'You';

  return (
    <div className="min-h-screen bg-[#0A0A0A] text-white" data-testid="ops-layout">
      <header className="sticky top-0 z-40 border-b border-[#2A2A2A] bg-[#0A0A0A]/95 backdrop-blur">
        <div className="flex items-center justify-between px-4 md:px-6 h-12">
          <span className="flex items-center gap-2 text-sm">
            <span className="font-semibold tracking-tight">FieldQuote</span>
            <span className="text-xs px-1.5 py-0.5 rounded border border-[#336699]/60 bg-[#336699]/15 text-[#cfe2f5]">Ops</span>
            <span className="hidden sm:inline text-gray-500">· {isSuperAdmin(user) ? 'platform owner' : 'staff'}</span>
          </span>
          <div className="relative" ref={menuRef}>
            <button
              type="button"
              onClick={() => setOpen((o) => !o)}
              aria-haspopup="menu"
              aria-expanded={open}
              className="flex items-center gap-2 text-sm text-gray-300 hover:text-white px-2 py-1 rounded"
            >
              <span className="w-6 h-6 rounded-full bg-[#336699] text-white text-xs flex items-center justify-center uppercase">{name.slice(0, 1)}</span>
              <span className="hidden sm:inline max-w-[12rem] truncate">{name}</span>
              <ChevronDown className="w-4 h-4" />
            </button>
            {open && (
              <div role="menu" className="absolute right-0 mt-1 w-56 rounded border border-[#333] bg-[#161616] shadow-xl overflow-hidden">
                {hasCompany && (
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      setOpen(false);
                      navigate('/profit-tracker');
                    }}
                    className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-200 hover:bg-[#222] text-left"
                  >
                    <Building2 className="w-4 h-4 text-gray-500" />
                    Switch to my company
                  </button>
                )}
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => {
                    toggleTheme();
                    setOpen(false);
                  }}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-200 hover:bg-[#222] text-left"
                >
                  {theme === 'dark' ? <Sun className="w-4 h-4 text-gray-500" /> : <Moon className="w-4 h-4 text-gray-500" />}
                  {theme === 'dark' ? 'Light mode' : 'Dark mode'}
                </button>
                <button
                  type="button"
                  role="menuitem"
                  onClick={() => signOut()}
                  className="w-full flex items-center gap-2 px-3 py-2.5 text-sm text-gray-200 hover:bg-[#222] text-left border-t border-[#2A2A2A]"
                >
                  <LogOut className="w-4 h-4 text-gray-500" />
                  Sign out
                </button>
              </div>
            )}
          </div>
        </div>
      </header>
      {payments?.playMoney && (
        <p role="status" data-testid="test-mode" className="px-4 md:px-6 py-1.5 text-xs text-amber-200 bg-amber-500/10 border-b border-amber-500/30">
          Payments are in test mode: every balance is play money until Stripe is connected. No real money has moved.
        </p>
      )}
      <main>
        <OpsErrorBoundary>{children}</OpsErrorBoundary>
      </main>
    </div>
  );
};
