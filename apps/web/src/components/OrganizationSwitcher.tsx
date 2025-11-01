import React, { useState, useEffect } from 'react';
import { Building2, ChevronDown, Check } from 'lucide-react';

interface Organization {
  _id: string;
  name: string;
  slug: string;
  email?: string;
  city?: string;
  state?: string;
}

interface OrganizationSwitcherProps {
  currentOrgId: string | null;
  onOrganizationChange: (orgId: string) => void;
}

export const OrganizationSwitcher: React.FC<OrganizationSwitcherProps> = ({
  currentOrgId,
  onOrganizationChange,
}) => {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [isOpen, setIsOpen] = useState(false);
  const [isLoading, setIsLoading] = useState(true);

  const currentOrg = organizations.find(org => org._id === currentOrgId);

  useEffect(() => {
    const fetchOrganizations = async () => {
      try {
        const apiUrl = import.meta.env.VITE_API_URL;
        if (!apiUrl) return;

        const baseUrl = apiUrl.endsWith('/') ? apiUrl.slice(0, -1) : apiUrl;
        const response = await fetch(`${baseUrl}/api/organizations`);
        
        if (response.ok) {
          const data = await response.json();
          setOrganizations(data);
        }
      } catch (error) {
        console.error('Failed to fetch organizations:', error);
      } finally {
        setIsLoading(false);
      }
    };

    fetchOrganizations();
  }, []);

  if (isLoading) {
    return (
      <div className="px-4 py-2 bg-slate-gray rounded-lg">
        <p className="text-white text-sm">Loading...</p>
      </div>
    );
  }

  return (
    <div className="relative">
      {/* Current Organization Display */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center gap-3 px-4 py-2 bg-slate-gray hover:bg-opacity-80 rounded-lg transition-all w-full min-w-[250px]"
      >
        <Building2 className="h-5 w-5 text-professional-blue" />
        <div className="flex-1 text-left">
          <p className="text-white font-medium text-sm">
            {currentOrg?.name || 'Select Organization'}
          </p>
          {currentOrg?.city && currentOrg?.state && (
            <p className="text-white text-xs opacity-60">
              {currentOrg.city}, {currentOrg.state}
            </p>
          )}
        </div>
        <ChevronDown className={`h-4 w-4 text-white transition-transform ${isOpen ? 'rotate-180' : ''}`} />
      </button>

      {/* Dropdown Menu */}
      {isOpen && (
        <>
          {/* Backdrop */}
          <div 
            className="fixed inset-0 z-40" 
            onClick={() => setIsOpen(false)}
          />
          
          {/* Dropdown */}
          <div className="absolute top-full left-0 right-0 mt-2 bg-slate-gray border border-gray-700 rounded-lg shadow-xl z-50 max-h-96 overflow-auto">
            <div className="p-2">
              <p className="px-3 py-2 text-xs text-white opacity-60 font-medium">
                SWITCH ORGANIZATION
              </p>
              
              {organizations.map((org) => (
                <button
                  key={org._id}
                  onClick={() => {
                    onOrganizationChange(org._id);
                    setIsOpen(false);
                  }}
                  className={`w-full flex items-center gap-3 px-3 py-2 rounded-md transition-colors ${
                    org._id === currentOrgId
                      ? 'bg-professional-blue bg-opacity-20 text-white'
                      : 'hover:bg-gray-700 text-white'
                  }`}
                >
                  <Building2 className="h-4 w-4 text-professional-blue flex-shrink-0" />
                  
                  <div className="flex-1 text-left min-w-0">
                    <p className="font-medium text-sm truncate">{org.name}</p>
                    {org.city && org.state && (
                      <p className="text-xs opacity-60">
                        {org.city}, {org.state}
                      </p>
                    )}
                  </div>
                  
                  {org._id === currentOrgId && (
                    <Check className="h-4 w-4 text-professional-blue flex-shrink-0" />
                  )}
                </button>
              ))}
            </div>
          </div>
        </>
      )}
    </div>
  );
};

