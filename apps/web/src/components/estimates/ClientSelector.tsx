import React, { useState } from 'react';
import { createPortal } from 'react-dom';
import { useFloating, offset, flip, shift, autoUpdate } from '@floating-ui/react-dom';
import { Check, ChevronDown, Search, Plus, User, Building2, X, Save } from 'lucide-react';
import { ClientService } from '../../services/ClientService';
import { useAuth } from '../../contexts/AuthContext';
import { useContext } from 'react';
import { OrganizationContext } from '../layouts/DashboardLayout';

interface Client {
  id?: string;
  name: string;
  company_name?: string;
  email?: string;
  phone?: string;
  address?: string;
  discount_percentage?: number;
}

interface ClientSelectorProps {
  clients: Client[];
  value: string;
  onChange: (clientId: string) => void;
  onAddNewClient: () => void;
  onClientCreated?: (client: Client) => void;
  placeholder?: string;
  className?: string;
}

export const ClientSelector: React.FC<ClientSelectorProps> = ({
  clients,
  value,
  onChange,
  onAddNewClient,
  onClientCreated,
  placeholder = 'Select a client...',
  className = ''
}) => {
  const [isOpen, setIsOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [showQuickAdd, setShowQuickAdd] = useState(false);
  const [quickAddData, setQuickAddData] = useState({
    name: '',
    company_name: '',
    email: '',
    phone: ''
  });
  const [isCreating, setIsCreating] = useState(false);
  
  const { user } = useAuth();
  const { selectedOrg } = useContext(OrganizationContext) as { selectedOrg: any };

  const { x, y, refs, strategy, update } = useFloating({
    placement: 'bottom-start',
    middleware: [offset(4), flip(), shift()],
    whileElementsMounted: autoUpdate,
  });


  const selectedClient = clients.find(c => c.id === value);

  const filteredClients = query === ''
    ? clients
    : clients.filter((client) => {
        const searchText = query.toLowerCase().replace(/\s+/g, '');
        return (
          client.name.toLowerCase().replace(/\s+/g, '').includes(searchText) ||
          (client.company_name && client.company_name.toLowerCase().replace(/\s+/g, '').includes(searchText)) ||
          (client.email && client.email.toLowerCase().replace(/\s+/g, '').includes(searchText))
        );
      });

  const openDropdown = () => {
    setIsOpen(true);
    setTimeout(() => {
      update();
    }, 0);
  };

  const closeDropdown = () => {
    setIsOpen(false);
    setQuery('');
  };

  const handleClientSelect = (clientId: string) => {
    onChange(clientId);
    closeDropdown();
  };

  const handleAddNewClient = () => {
    closeDropdown();
    onAddNewClient();
  };

  const handleQuickAddToggle = () => {
    setShowQuickAdd(!showQuickAdd);
    if (!showQuickAdd) {
      setQuery('');
    }
  };

  const handleQuickAddSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!user || !selectedOrg?.id || !quickAddData.name.trim() || !quickAddData.company_name.trim()) {
      return;
    }

    setIsCreating(true);
    try {
      const newClient = await ClientService.create({
        name: quickAddData.name.trim(),
        company_name: quickAddData.company_name.trim(),
        email: quickAddData.email.trim() || undefined,
        phone: quickAddData.phone.trim() || undefined,
        user_id: user.id,
        organization_id: selectedOrg.id
      });

      // Call the callback to update the parent component
      if (onClientCreated && newClient.id) {
        onClientCreated(newClient);
      }

      // Select the new client
      if (newClient.id) {
        onChange(newClient.id);
      }
      
      // Reset form and close
      setQuickAddData({ name: '', company_name: '', email: '', phone: '' });
      setShowQuickAdd(false);
      closeDropdown();
    } catch (error) {
      console.error('Error creating client:', error);
      alert('Failed to create client. Please try again.');
    } finally {
      setIsCreating(false);
    }
  };

  const handleQuickAddCancel = () => {
    setShowQuickAdd(false);
    setQuickAddData({ name: '', company_name: '', email: '', phone: '' });
  };

  return (
    <div className={`relative ${className}`}>
      {/* Main trigger button */}
      <div
        className="relative cursor-pointer"
        ref={refs.setReference}
        onClick={() => {
          if (!isOpen) {
            openDropdown();
          }
        }}
      >
        <div className="w-full px-4 py-3 bg-[#333333] border border-[#555555] rounded-lg text-white focus:outline-none focus:border-[#336699] focus:ring-2 focus:ring-[#336699]/20 hover:bg-[#404040] transition-colors">
          {selectedClient ? (
            <div className="flex items-center gap-3">
              <div className="w-8 h-8 bg-[#336699] rounded-full flex items-center justify-center flex-shrink-0">
                <Building2 className="w-4 h-4 text-white" />
              </div>
              <div className="flex-1 min-w-0">
                <div className="text-sm font-medium text-white truncate">
                  {selectedClient.company_name || selectedClient.name}
                </div>
                <div className="text-xs text-gray-400 truncate">
                  {selectedClient.name} {selectedClient.email && `• ${selectedClient.email}`}
                </div>
              </div>
              {selectedClient.discount_percentage && selectedClient.discount_percentage > 0 && (
                <div className="bg-green-500/20 text-green-400 px-2 py-1 rounded text-xs font-medium flex-shrink-0">
                  {selectedClient.discount_percentage}% off
                </div>
              )}
            </div>
          ) : (
            <div className="text-gray-400 text-sm">
              {placeholder}
            </div>
          )}
        </div>
        <ChevronDown 
          className={`absolute right-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400 transition-all ${isOpen ? 'rotate-180' : ''}`}
        />
      </div>

      {/* Dropdown portal */}
      {isOpen && typeof window !== 'undefined' && x !== undefined && y !== undefined && createPortal(
        <div
          ref={refs.setFloating}
          className="z-[99999] rounded-lg shadow-xl max-h-[600px] overflow-y-auto border border-[#333333] bg-[#1E1E1E]"
          style={{
            position: 'fixed',
            left: x ?? 0,
            top: y ?? 0,
            minWidth: (refs.reference.current as HTMLElement | null)?.offsetWidth || 300,
          }}
        >
          {/* Search header */}
          <div className="sticky top-0 p-3 border-b border-[#333333] bg-[#1E1E1E]">
            <div className="relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-gray-400" />
              <input
                className="w-full h-9 bg-[#333333] rounded-lg pl-9 pr-3 text-sm text-white placeholder-gray-400 border border-[#555555] focus:outline-none focus:border-[#336699] focus:ring-2 focus:ring-[#336699]/20"
                spellCheck={false}
                autoFocus
                placeholder="Search clients..."
                value={query}
                onChange={(e) => setQuery(e.target.value)}
              />
            </div>
          </div>

          {/* Options */}
          <div className="overflow-y-auto max-h-[300px]">
            {/* Quick Add Form */}
            {showQuickAdd && (
              <div className="p-4 border-b border-[#2a2a2a] bg-[#1a1a1a]">
                <div className="flex items-center justify-between mb-3">
                  <h3 className="text-sm font-medium text-white">Quick Add Client</h3>
                  <button
                    onClick={handleQuickAddCancel}
                    className="text-gray-400 hover:text-white transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>
                <form onSubmit={handleQuickAddSubmit} className="space-y-3">
                  <div>
                    <input
                      type="text"
                      placeholder="Client Name *"
                      value={quickAddData.name}
                      onChange={(e) => setQuickAddData(prev => ({ ...prev, name: e.target.value }))}
                      className="w-full px-3 py-2 bg-[#333333] border border-[#555555] rounded text-sm text-white placeholder-gray-400 focus:outline-none focus:border-[#336699]"
                      required
                    />
                  </div>
                  <div>
                    <input
                      type="text"
                      placeholder="Company Name *"
                      value={quickAddData.company_name}
                      onChange={(e) => setQuickAddData(prev => ({ ...prev, company_name: e.target.value }))}
                      className="w-full px-3 py-2 bg-[#333333] border border-[#555555] rounded text-sm text-white placeholder-gray-400 focus:outline-none focus:border-[#336699]"
                      required
                    />
                  </div>
                  <div>
                    <input
                      type="email"
                      placeholder="Email (optional)"
                      value={quickAddData.email}
                      onChange={(e) => setQuickAddData(prev => ({ ...prev, email: e.target.value }))}
                      className="w-full px-3 py-2 bg-[#333333] border border-[#555555] rounded text-sm text-white placeholder-gray-400 focus:outline-none focus:border-[#336699]"
                    />
                  </div>
                  <div>
                    <input
                      type="tel"
                      placeholder="Phone (optional)"
                      value={quickAddData.phone}
                      onChange={(e) => setQuickAddData(prev => ({ ...prev, phone: e.target.value }))}
                      className="w-full px-3 py-2 bg-[#333333] border border-[#555555] rounded text-sm text-white placeholder-gray-400 focus:outline-none focus:border-[#336699]"
                    />
                  </div>
                  <div className="flex gap-2">
                    <button
                      type="submit"
                      disabled={isCreating || !quickAddData.name.trim() || !quickAddData.company_name.trim()}
                      className="flex-1 flex items-center justify-center gap-2 px-3 py-2 bg-[#336699] text-white rounded text-sm font-medium hover:bg-[#2a5a8a] disabled:opacity-50 disabled:cursor-not-allowed transition-colors"
                    >
                      <Save className="w-4 h-4" />
                      {isCreating ? 'Creating...' : 'Create & Select'}
                    </button>
                    <button
                      type="button"
                      onClick={handleQuickAddCancel}
                      className="px-3 py-2 bg-[#444444] text-gray-300 rounded text-sm font-medium hover:bg-[#555555] transition-colors"
                    >
                      Cancel
                    </button>
                  </div>
                </form>
              </div>
            )}

            {/* Quick Add Client option */}
            {!showQuickAdd && (
              <div
                className="flex items-center px-4 py-3 text-sm cursor-pointer hover:bg-[#333333] transition-colors border-b border-[#2a2a2a]"
                onClick={handleQuickAddToggle}
              >
                <div className="w-8 h-8 bg-[#336699] rounded-full flex items-center justify-center mr-3">
                  <Plus className="w-4 h-4 text-white" />
                </div>
                <div>
                  <div className="text-white font-medium">Quick Add Client</div>
                  <div className="text-xs text-gray-400">Add a new client right here</div>
                </div>
              </div>
            )}

            {/* Full Client Form option - ALWAYS VISIBLE */}
            <div
              className="flex items-center px-4 py-3 text-sm cursor-pointer hover:bg-[#333333] transition-colors border-b border-[#2a2a2a]"
              onClick={handleAddNewClient}
            >
              <div className="w-8 h-8 bg-[#444444] rounded-full flex items-center justify-center mr-3">
                <User className="w-4 h-4 text-gray-300" />
              </div>
              <div>
                <div className="text-white font-medium">Full Client Form</div>
                <div className="text-xs text-gray-400">Open detailed client creation form</div>
              </div>
            </div>

            {/* Client options */}
            {filteredClients.length === 0 ? (
              <div className="px-4 py-6 text-center text-gray-400 text-sm">
                {query ? 'No clients found' : 'No clients available'}
              </div>
            ) : (
              filteredClients.map((client) => (
                <div
                  key={client.id}
                  className={`flex items-center px-4 py-3 text-sm cursor-pointer transition-colors ${
                    client.id === value
                      ? 'bg-[#336699]/20 border-l-2 border-[#336699]'
                      : 'hover:bg-[#333333]'
                  }`}
                  onClick={() => client.id && handleClientSelect(client.id)}
                >
                  <div className="w-8 h-8 bg-[#444444] rounded-full flex items-center justify-center mr-3 flex-shrink-0">
                    <User className="w-4 h-4 text-gray-300" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="text-white font-medium truncate">{client.company_name || client.name}</span>
                      {client.discount_percentage && client.discount_percentage > 0 && (
                        <span className="bg-green-500/20 text-green-400 px-1.5 py-0.5 rounded text-xs font-medium flex-shrink-0">
                          {client.discount_percentage}%
                        </span>
                      )}
                    </div>
                    <div className="text-xs text-gray-400 truncate">
                      {client.name}
                      {client.email && ` • ${client.email}`}
                    </div>
                  </div>
                  {client.id === value && (
                    <Check className="w-4 h-4 text-[#336699] flex-shrink-0" />
                  )}
                </div>
              ))
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Backdrop to close dropdown */}
      {isOpen && (
        <div
          className="fixed inset-0 z-[9998]"
          onClick={closeDropdown}
        />
      )}
    </div>
  );
};