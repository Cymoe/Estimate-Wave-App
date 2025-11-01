import React from 'react';
import { X, ChevronRight, User, Building, CreditCard, HelpCircle, LogOut } from 'lucide-react';
import { NavLink, useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';

interface MobileMenuProps {
  isOpen: boolean;
  onClose: () => void;
  selectedOrg: { id: string; name: string; industry: string };
  organizations: { id: string; name: string; industry: string }[];
  onOrgChange: (org: { id: string; name: string; industry: string }) => void;
  onShowHelp: () => void;
}

export const MobileMenu: React.FC<MobileMenuProps> = ({
  isOpen,
  onClose,
  selectedOrg,
  organizations,
  onOrgChange,
  onShowHelp
}) => {
  const navigate = useNavigate();
  const { user, signOut } = useAuth();
  const [orgDropdownOpen, setOrgDropdownOpen] = React.useState(false);

  if (!isOpen) return null;

  return (
    <div className="md:hidden fixed inset-0 z-[10001]">
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black bg-opacity-50" onClick={onClose} />
      
      {/* Menu Drawer */}
      <div className="absolute left-0 top-0 bottom-0 w-80 bg-[#1A1A1A] shadow-xl overflow-y-auto">
        {/* Header */}
        <div className="flex items-center justify-between p-4 border-b border-[#333333]">
          <h2 className="text-white font-medium text-lg">Menu</h2>
          <button
            onClick={onClose}
            className="p-2 hover:bg-[#333333] rounded-[4px] transition-colors"
          >
            <X className="h-5 w-5 text-white" />
          </button>
        </div>

        {/* Organization Selector */}
        <div className="p-4 border-b border-[#333333]">
          <button
            onClick={() => setOrgDropdownOpen(!orgDropdownOpen)}
            className="w-full flex items-center justify-between p-3 bg-[#333333] hover:bg-[#404040] rounded-[4px] transition-colors"
          >
            <div className="text-left">
              <div className="text-white font-medium">{selectedOrg.name}</div>
              <div className="text-gray-400 text-sm">{selectedOrg.industry}</div>
            </div>
            <ChevronRight className={`h-4 w-4 text-gray-400 transition-transform ${orgDropdownOpen ? 'rotate-90' : ''}`} />
          </button>
          
          {orgDropdownOpen && (
            <div className="mt-2 space-y-1">
              {organizations.map(org => (
                <button
                  key={org.id}
                  onClick={() => {
                    onOrgChange(org);
                    setOrgDropdownOpen(false);
                  }}
                  className={`w-full text-left p-3 rounded-[4px] transition-colors ${
                    selectedOrg.id === org.id
                      ? 'bg-[#336699] text-white'
                      : 'hover:bg-[#333333] text-gray-300'
                  }`}
                >
                  <div className="font-medium">{org.name}</div>
                  <div className="text-sm opacity-70">{org.industry}</div>
                </button>
              ))}
            </div>
          )}
        </div>

        {/* Navigation Links */}
        <nav className="p-4 space-y-2">
          <NavLink
            to="/profit-tracker"
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 p-3 rounded-[4px] transition-colors ${
                isActive
                  ? 'bg-gradient-to-br from-[#336699]/20 to-[#336699]/5 border border-[#336699]/50 text-white'
                  : 'hover:bg-[#333333] text-gray-300'
              }`
            }
          >
            <span className="text-lg">💰</span>
            <span>Profit Tracker</span>
          </NavLink>


          <NavLink
            to="/work"
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 p-3 rounded-[4px] transition-colors ${
                isActive
                  ? 'bg-gradient-to-br from-[#336699]/20 to-[#336699]/5 border border-[#336699]/50 text-white'
                  : 'hover:bg-[#333333] text-gray-300'
              }`
            }
          >
            <span className="text-lg">💼</span>
            <span>Work</span>
          </NavLink>

          <NavLink
            to="/services"
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 p-3 rounded-[4px] transition-colors ${
                isActive
                  ? 'bg-gradient-to-br from-[#336699]/20 to-[#336699]/5 border border-[#336699]/50 text-white'
                  : 'hover:bg-[#333333] text-gray-300'
              }`
            }
          >
            <span className="text-lg">◉</span>
            <span>Services</span>
          </NavLink>

          <NavLink
            to="/price-book"
            onClick={onClose}
            className={({ isActive }) =>
              `flex items-center gap-3 p-3 rounded-[4px] transition-colors ${
                isActive
                  ? 'bg-gradient-to-br from-[#336699]/20 to-[#336699]/5 border border-[#336699]/50 text-white'
                  : 'hover:bg-[#333333] text-gray-300'
              }`
            }
          >
            <span className="text-lg">📚</span>
            <span>Price Book</span>
          </NavLink>
        </nav>

        {/* User Section */}
        <div className="mt-auto border-t border-[#333333] p-4">
          <div className="mb-4">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-10 h-10 bg-[#336699] rounded-full flex items-center justify-center text-white font-medium">
                {(user?.user_metadata?.full_name || 'User').charAt(0).toUpperCase()}
              </div>
              <div>
                <div className="text-white font-medium">
                  {user?.user_metadata?.full_name || 'User'}
                </div>
                <div className="text-gray-400 text-sm">Admin • Pro Plan</div>
              </div>
            </div>
          </div>

          {/* User Actions */}
          <div className="space-y-1">
            <button
              onClick={() => {
                navigate('/profile');
                onClose();
              }}
              className="w-full text-left p-3 hover:bg-[#333333] rounded-[4px] transition-colors text-gray-300"
            >
              <span>Profile Settings</span>
            </button>

            <button
              onClick={() => {
                navigate('/company-settings');
                onClose();
              }}
              className="w-full text-left p-3 hover:bg-[#333333] rounded-[4px] transition-colors text-gray-300"
            >
              <span>Company Settings</span>
            </button>

            <button
              onClick={() => {
                navigate('/billing');
                onClose();
              }}
              className="w-full text-left p-3 hover:bg-[#333333] rounded-[4px] transition-colors text-gray-300"
            >
              <span>Billing & Plan</span>
            </button>

            <button
              onClick={() => {
                onShowHelp();
                onClose();
              }}
              className="w-full flex items-center gap-3 p-3 hover:bg-[#333333] rounded-[4px] transition-colors text-[#336699]"
            >
              <HelpCircle className="h-4 w-4" />
              <span>Help & Tutorials</span>
            </button>

            <div className="border-t border-[#333333] mt-2 pt-2">
              <button
                onClick={async () => {
                  try {
                    await signOut();
                    onClose();
                  } catch (error) {
                    console.error('Error signing out:', error);
                  }
                }}
                className="w-full flex items-center gap-3 p-3 hover:bg-[#333333] rounded-[4px] transition-colors text-gray-300"
              >
                <LogOut className="h-4 w-4" />
                <span>Sign Out</span>
              </button>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}; 