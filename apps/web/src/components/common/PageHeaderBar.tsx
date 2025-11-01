import React, { useState, useRef, useEffect, useContext } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { Search, Plus } from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { useProductDrawer } from '../../contexts/ProductDrawerContext';
import { LayoutContext } from '../layouts/DashboardLayout';

interface PageHeaderBarProps {
  title: string;
  searchPlaceholder?: string;
  onSearch?: (query: string) => void;
  searchValue?: string;
  showSearch?: boolean;
  showAddButton?: boolean;
  addButtonLabel?: string;
  onAddClick?: () => void;
}

export const PageHeaderBar: React.FC<PageHeaderBarProps> = ({
  title,
  searchPlaceholder,
  onSearch,
  searchValue,
  addButtonLabel,
  onAddClick,
  showSearch = true,
  showAddButton = true,
}) => {
  const [isSearchExpanded, setIsSearchExpanded] = useState(false);
  const searchRef = useRef<HTMLDivElement>(null);
  const { isConstrained } = useContext(LayoutContext);

  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      if (searchRef.current && !searchRef.current.contains(event.target as Node)) {
        setIsSearchExpanded(false);
      }
    };

    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const { user } = useAuth();
  const isSuperAdmin = user?.role === 'super_admin';

  return (
    <div className="px-4 md:px-6 pt-3 md:pt-4">
      <div>
        <div className={`flex items-center justify-between gap-2 md:gap-4 py-3 md:py-4 ${isConstrained ? 'flex-wrap' : ''}`}>
          <div className="flex items-center gap-4">
            <h1 className={`${isConstrained ? 'text-xl' : 'text-xl md:text-2xl'} font-bold text-white`}>{title}</h1>
            {isSuperAdmin && (
              <span className="px-2 py-1 bg-action-yellow text-black text-xs font-bold rounded">
                SUPER ADMIN
              </span>
            )}
          </div>
          <div className="flex items-center gap-2 md:gap-3">
            {showSearch && (
              <div ref={searchRef} className={`relative ${isSearchExpanded ? (isConstrained ? 'w-40' : 'w-48 md:w-64') : 'w-auto'}`}>
                {isSearchExpanded ? (
                  <input
                    type="text"
                    placeholder={searchPlaceholder}
                    value={searchValue}
                    onChange={(e) => onSearch?.(e.target.value)}
                    className="w-full bg-[#1E1E1E] border border-[#333333] rounded-[4px] px-2 md:px-3 py-1.5 md:py-2 text-xs md:text-sm text-white placeholder-gray-500 focus:outline-none focus:border-[#336699]"
                    autoFocus
                  />
                ) : (
                  <button
                    onClick={() => setIsSearchExpanded(true)}
                    className="p-1.5 md:p-2 text-gray-400 hover:text-white transition-colors"
                  >
                    <Search className="w-4 h-4 md:w-5 md:h-5" />
                  </button>
                )}
              </div>
            )}
            {showAddButton && (
              <button
                onClick={onAddClick}
                className={`bg-white hover:bg-gray-100 text-[#121212] ${isConstrained ? 'px-3 py-1.5' : 'px-3 md:px-4 py-1.5 md:py-2'} rounded-[8px] text-xs md:text-sm font-medium transition-colors flex items-center gap-1 md:gap-2`}
              >
                <Plus className="w-3 h-3 md:w-4 md:h-4" />
                <span className={isConstrained ? 'hidden sm:inline' : ''}>{addButtonLabel}</span>
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}; 