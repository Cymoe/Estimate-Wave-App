import { useNavigate, useLocation } from 'react-router-dom';
import { Building2, Menu, X } from 'lucide-react';
import { AuthButtons } from '../auth/AuthButtons';
import { useState, useEffect } from 'react';
import { APP_NAME } from '@/config/brand';

interface MarketingHeaderProps {
  showSignIn?: boolean;
  useAuthButtons?: boolean;
}

export const MarketingHeader = ({ showSignIn = true, useAuthButtons = false }: MarketingHeaderProps) => {
  const navigate = useNavigate();
  const location = useLocation();
  const [mobileMenuOpen, setMobileMenuOpen] = useState(false);
  
  // Close mobile menu when window is resized to desktop size
  useEffect(() => {
    const handleResize = () => {
      if (window.innerWidth >= 768) {
        setMobileMenuOpen(false);
      }
    };
    
    window.addEventListener('resize', handleResize);
    return () => window.removeEventListener('resize', handleResize);
  }, []);
  
  // Close mobile menu when clicking outside
  useEffect(() => {
    const handleClickOutside = (event: MouseEvent) => {
      const target = event.target as HTMLElement;
      if (mobileMenuOpen && !target.closest('.mobile-menu') && !target.closest('.menu-button')) {
        setMobileMenuOpen(false);
      }
    };
    
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, [mobileMenuOpen]);
  
  // Prevent scrolling when mobile menu is open
  useEffect(() => {
    if (mobileMenuOpen) {
      document.body.style.overflow = 'hidden';
    } else {
      document.body.style.overflow = '';
    }
    
    return () => {
      document.body.style.overflow = '';
    };
  }, [mobileMenuOpen]);
  
  // Determine which nav item is active
  const isActive = (path: string) => {
    if (path === '/marketing/projects' && location.pathname === '/marketing/projects') {
      return true;
    }
    if (path === '/who-we-serve' && location.pathname === '/who-we-serve') {
      return true;
    }
    if (path === '/experience' && location.pathname === '/experience') {
      return true;
    }
    if (path === '/docs/construction-saas-user-feedback' && location.pathname.includes('/docs') && location.pathname.includes('feedback')) {
      return true;
    }
    if (path === '/docs/product-roadmap' && location.pathname.includes('/docs') && location.pathname.includes('roadmap')) {
      return true;
    }
    return false;
  };
  
  // Handle navigation and close mobile menu
  const handleNavigation = (path: string) => {
    navigate(path);
    setMobileMenuOpen(false);
  };

  return (
    <nav className="relative flex justify-between items-center p-4 md:p-6 border-b border-gray-200">
      <div 
        className="flex items-center space-x-2 cursor-pointer z-20" 
        onClick={() => navigate('/')}
      >
        <Building2 className="h-6 w-6" style={{ color: '#336699' }} />
        <span className="text-xl font-bold text-gray-900">{APP_NAME}</span>
      </div>
      
      {/* Mobile menu button */}
      <button 
        className="md:hidden z-20 menu-button" 
        onClick={() => setMobileMenuOpen(!mobileMenuOpen)}
        aria-label="Toggle menu"
      >
        {mobileMenuOpen ? (
          <X className="h-6 w-6 text-gray-900" />
        ) : (
          <Menu className="h-6 w-6 text-gray-900" />
        )}
      </button>
      
      {/* Desktop navigation */}
      <div className="hidden md:flex items-center space-x-6">
        <button 
          onClick={() => handleNavigation('/who-we-serve')}
          className={`text-gray-700 font-medium transition-colors ${
            isActive('/who-we-serve') ? '' : 'hover:text-blue-600'
          }`}
          style={{ color: isActive('/who-we-serve') ? '#336699' : undefined }}
        >
          For Professionals
        </button>
        <button 
          onClick={() => handleNavigation('/marketing/projects')}
          className={`text-gray-700 font-medium transition-colors ${
            isActive('/marketing/projects') ? '' : 'hover:text-blue-600'
          }`}
          style={{ color: isActive('/marketing/projects') ? '#336699' : undefined }}
        >
          Projects
        </button>
        <button 
          onClick={() => handleNavigation('/docs/construction-saas-user-feedback')}
          className={`text-gray-700 font-medium transition-colors ${
            isActive('/docs/construction-saas-user-feedback') ? '' : 'hover:text-blue-600'
          }`}
          style={{ color: isActive('/docs/construction-saas-user-feedback') ? '#336699' : undefined }}
        >
          Insights
        </button>
        <button 
          onClick={() => handleNavigation('/docs/product-roadmap')}
          className={`text-gray-700 font-medium transition-colors ${
            isActive('/docs/product-roadmap') ? '' : 'hover:text-blue-600'
          }`}
          style={{ color: isActive('/docs/product-roadmap') ? '#336699' : undefined }}
        >
          Roadmap
        </button>
        <a 
          href="/blog"
          className="text-gray-700 font-medium transition-colors hover:text-blue-600"
        >
          Resources
        </a>
        <button 
          onClick={() => handleNavigation('/experience')}
          className={`text-gray-700 font-medium transition-colors ${
            isActive('/experience') ? '' : 'hover:text-blue-600'
          }`}
          style={{ color: isActive('/experience') ? '#336699' : undefined }}
        >
          Experience
        </button>
        
        {showSignIn && !useAuthButtons && (
          <button 
            onClick={() => navigate('/')}
            className="px-4 py-2 text-white transition-colors"
            style={{ backgroundColor: '#336699', borderRadius: '4px' }}
          >
            Sign In
          </button>
        )}
        
        {useAuthButtons && (
          <div className="hidden md:block">
            <AuthButtons />
          </div>
        )}
      </div>
      
      {/* Mobile menu overlay */}
      {mobileMenuOpen && (
        <div className="fixed inset-0 bg-black bg-opacity-50 z-10" aria-hidden="true" />
      )}
      
      {/* Mobile navigation menu */}
      <div 
        className={`fixed top-0 right-0 bottom-0 w-64 bg-white z-10 transform transition-transform duration-300 ease-in-out mobile-menu ${mobileMenuOpen ? 'translate-x-0' : 'translate-x-full'}`}
        style={{ boxShadow: '-4px 0 15px rgba(0, 0, 0, 0.1)' }}
      >
        <div className="flex flex-col p-6 h-full">
          <div className="mb-8 mt-12">
            <div className="flex flex-col space-y-4">
              <button 
                onClick={() => handleNavigation('/who-we-serve')}
                className={`text-gray-700 font-medium transition-colors text-left ${
                  isActive('/who-we-serve') ? '' : 'hover:text-blue-600'
                }`}
                style={{ color: isActive('/who-we-serve') ? '#336699' : undefined }}
              >
                For Professionals
              </button>
              <button 
                onClick={() => handleNavigation('/marketing/projects')}
                className={`text-gray-700 font-medium transition-colors text-left ${
                  isActive('/marketing/projects') ? '' : 'hover:text-blue-600'
                }`}
                style={{ color: isActive('/marketing/projects') ? '#336699' : undefined }}
              >
                Projects
              </button>
              <button 
                onClick={() => handleNavigation('/docs/construction-saas-user-feedback')}
                className={`text-gray-700 font-medium transition-colors text-left ${
                  isActive('/docs/construction-saas-user-feedback') ? '' : 'hover:text-blue-600'
                }`}
                style={{ color: isActive('/docs/construction-saas-user-feedback') ? '#336699' : undefined }}
              >
                Insights
              </button>
              <button 
                onClick={() => handleNavigation('/docs/product-roadmap')}
                className={`text-gray-700 font-medium transition-colors text-left ${
                  isActive('/docs/product-roadmap') ? '' : 'hover:text-blue-600'
                }`}
                style={{ color: isActive('/docs/product-roadmap') ? '#336699' : undefined }}
              >
                Roadmap
              </button>
              <a 
                href="/blog"
                className="text-gray-700 font-medium transition-colors text-left hover:text-blue-600"
                onClick={() => setMobileMenuOpen(false)}
              >
                Resources
              </a>
              <button 
                onClick={() => handleNavigation('/experience')}
                className={`text-gray-700 font-medium transition-colors text-left ${
                  isActive('/experience') ? '' : 'hover:text-blue-600'
                }`}
                style={{ color: isActive('/experience') ? '#336699' : undefined }}
              >
                Experience
              </button>
            </div>
          </div>
          
          {/* Mobile auth buttons */}
          <div className="mt-auto">
            {showSignIn && !useAuthButtons && (
              <button 
                onClick={() => {
                  navigate('/');
                  setMobileMenuOpen(false);
                }}
                className="w-full px-4 py-2 text-white transition-colors text-center"
                style={{ backgroundColor: '#336699', borderRadius: '4px' }}
              >
                Sign In
              </button>
            )}
            
            {useAuthButtons && (
              <div className="w-full">
                <AuthButtons />
              </div>
            )}
          </div>
        </div>
      </div>
    </nav>
  );
};

export default MarketingHeader;
