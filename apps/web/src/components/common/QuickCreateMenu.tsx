import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { FileText, FolderOpen, User, UserPlus } from 'lucide-react';

interface QuickCreateOption {
  id: string;
  name: string;
  icon: React.ComponentType<{ className?: string }>;
  action: () => void;
}

interface Props {
  isOpen: boolean;
  onClose: () => void;
}

/**
 * What the yellow + button creates. The choices float up out of the button
 * (rendered inside QuickCreateButton so they line up with it), each a round
 * icon with its label beside it, over a dimmed page.
 */
export const QuickCreateMenu: React.FC<Props> = ({ isOpen, onClose }) => {
  const navigate = useNavigate();
  const [selectedIndex, setSelectedIndex] = useState(-1);

  const options: QuickCreateOption[] = [
    { id: 'lead', name: 'Lead', icon: UserPlus, action: () => navigate('/leads?new=1') },
    { id: 'estimate', name: 'Estimate', icon: FileText, action: () => navigate('/work?new=1') },
    { id: 'project', name: 'Project', icon: FolderOpen, action: () => navigate('/projects?new=1') },
    { id: 'client', name: 'Client', icon: User, action: () => navigate('/clients/new') },
  ];

  const choose = (option: QuickCreateOption) => {
    option.action();
    onClose();
  };

  useEffect(() => {
    if (!isOpen) {
      setSelectedIndex(-1);
      return;
    }
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'ArrowUp') {
        e.preventDefault();
        setSelectedIndex((i) => (i <= 0 ? options.length - 1 : i - 1));
      } else if (e.key === 'ArrowDown') {
        e.preventDefault();
        setSelectedIndex((i) => (i + 1) % options.length);
      } else if (e.key === 'Enter' && selectedIndex >= 0) {
        e.preventDefault();
        choose(options[selectedIndex]);
      } else if (e.key === 'Escape') {
        e.preventDefault();
        onClose();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isOpen, selectedIndex]);

  return (
    <>
      {/* Dims the page; tapping it closes the menu. */}
      <div
        className={`fixed inset-0 bg-black/50 -z-10 transition-opacity duration-200 ${
          isOpen ? 'opacity-100' : 'opacity-0 pointer-events-none'
        }`}
        onClick={onClose}
        aria-hidden
      />
      <ul
        className={`absolute bottom-full right-0 mb-4 flex flex-col items-end gap-3 ${isOpen ? '' : 'pointer-events-none'}`}
        role="menu"
        aria-hidden={!isOpen}
      >
        {options.map((option, index) => {
          const Icon = option.icon;
          // The item nearest the button appears first.
          const delay = isOpen ? (options.length - 1 - index) * 35 : 0;
          return (
            <li
              key={option.id}
              className={`transition-all duration-200 ease-out ${
                isOpen ? 'opacity-100 translate-y-0' : 'opacity-0 translate-y-3'
              }`}
              style={{ transitionDelay: `${delay}ms` }}
            >
              <button
                role="menuitem"
                tabIndex={isOpen ? 0 : -1}
                onClick={() => choose(option)}
                onMouseEnter={() => setSelectedIndex(index)}
                className="group flex items-center gap-3 pr-1"
              >
                {/* Plain label, no box. Colors are set inline so light mode keeps them on the dimmed page. */}
                <span
                  className="text-sm font-medium whitespace-nowrap"
                  style={{ color: '#FFFFFF', textShadow: '0 1px 3px rgba(0,0,0,0.6)' }}
                >
                  {option.name}
                </span>
                <span
                  className={`w-12 h-12 rounded-full flex items-center justify-center shadow-lg transition-transform ${
                    selectedIndex === index ? 'scale-110' : 'group-hover:scale-110'
                  }`}
                  style={{ backgroundColor: '#FFFFFF', color: '#111827' }}
                >
                  <Icon className="w-5 h-5" />
                </span>
              </button>
            </li>
          );
        })}
      </ul>
    </>
  );
};
