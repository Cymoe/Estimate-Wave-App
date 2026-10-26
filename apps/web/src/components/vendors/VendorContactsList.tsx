import React, { useState, useEffect } from 'react';
import { 
  User, Phone, Mail, Star, Plus, Edit2, Trash2, 
  Users, Shield, MessageCircle
} from 'lucide-react';
import { VendorContactService, VendorContact, CONTACT_ROLES } from '../../services/VendorContactService';

interface VendorContactsListProps {
  vendorId: string;
  vendorName: string;
}

export const VendorContactsList: React.FC<VendorContactsListProps> = ({ 
  vendorId, 
  vendorName 
}) => {
  const [contacts, setContacts] = useState<VendorContact[]>([]);
  const [loading, setLoading] = useState(true);
  const [showAddModal, setShowAddModal] = useState(false);

  useEffect(() => {
    loadContacts();
  }, [vendorId]);

  const loadContacts = async () => {
    try {
      setLoading(true);
      const data = await VendorContactService.getVendorContacts(vendorId);
      setContacts(data);
    } catch (error) {
      console.error('Error loading vendor contacts:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleSetPrimary = async (contactId: string) => {
    try {
      await VendorContactService.setPrimaryContact(contactId);
      await loadContacts(); // Refresh list
    } catch (error) {
      console.error('Error setting primary contact:', error);
    }
  };

  const handleDeleteContact = async (contactId: string) => {
    if (!confirm('Are you sure you want to delete this contact?')) return;
    
    try {
      await VendorContactService.deleteVendorContact(contactId);
      await loadContacts(); // Refresh list
    } catch (error) {
      console.error('Error deleting contact:', error);
    }
  };

  const getRoleColor = (role?: string) => {
    switch (role?.toLowerCase()) {
      case 'owner':
      case 'sales manager':
        return 'text-[#5b8fc7]';
      case 'account manager':
      case 'project manager':
        return 'text-blue-400';
      case 'technical support':
      case 'emergency services':
        return 'text-green-400';
      case 'billing/accounts receivable':
        return 'text-yellow-400';
      default:
        return 'text-gray-400';
    }
  };

  if (loading) {
    return (
      <div className="space-y-4">
        <div className="h-20 bg-[#1E1E1E] animate-pulse rounded"></div>
        <div className="h-20 bg-[#1E1E1E] animate-pulse rounded"></div>
        <div className="h-20 bg-[#1E1E1E] animate-pulse rounded"></div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Users className="w-5 h-5 text-[#336699]" />
          <h3 className="text-lg font-semibold text-white">Contacts</h3>
          <span className="text-sm text-gray-400">({contacts.length})</span>
        </div>
        <button
          onClick={() => setShowAddModal(true)}
          className="bg-[#336699] hover:bg-[#336699]/80 text-white px-3 py-2 rounded-[4px] text-sm font-medium transition-colors flex items-center gap-2"
        >
          <Plus className="w-4 h-4" />
          <span>Add Contact</span>
        </button>
      </div>

      {/* Contacts List */}
      {contacts.length === 0 ? (
        <div className="text-center py-8 bg-[#1E1E1E] border border-[#333333] rounded-[4px]">
          <User className="w-12 h-12 text-gray-400 mx-auto mb-4" />
          <h4 className="text-white font-medium mb-2">No contacts yet</h4>
          <p className="text-gray-400 text-sm mb-4">Add contacts to track multiple people at {vendorName}</p>
          <button
            onClick={() => setShowAddModal(true)}
            className="bg-[#336699] hover:bg-[#336699]/80 text-white px-4 py-2 rounded-[4px] text-sm font-medium transition-colors"
          >
            Add First Contact
          </button>
        </div>
      ) : (
        <div className="space-y-3">
          {contacts.map((contact) => (
            <div
              key={contact.id}
              className={`bg-[#1E1E1E] border border-[#333333] rounded-[4px] p-4 hover:bg-[#252525] transition-colors ${
                contact.is_primary ? 'ring-2 ring-[#336699] border-[#336699]' : ''
              }`}
            >
              <div className="flex items-start justify-between">
                <div className="flex-1">
                  <div className="flex items-center gap-2 mb-2">
                    <h4 className="text-white font-medium flex items-center gap-2">
                      {contact.name}
                      {contact.is_primary && (
                        <div className="flex items-center gap-1 bg-[#336699] text-white px-2 py-1 rounded text-xs font-medium">
                          <Star className="w-3 h-3" />
                          PRIMARY
                        </div>
                      )}
                    </h4>
                  </div>
                  
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
                    <div>
                      {contact.role && (
                        <div className="flex items-center gap-2 mb-1">
                          <Shield className="w-4 h-4 text-gray-400" />
                          <span className={`text-sm font-medium ${getRoleColor(contact.role)}`}>
                            {contact.role}
                          </span>
                        </div>
                      )}
                      {contact.title && (
                        <div className="text-sm text-gray-400 mb-1">{contact.title}</div>
                      )}
                      {contact.department && (
                        <div className="text-sm text-gray-500">{contact.department}</div>
                      )}
                    </div>
                    
                    <div className="space-y-1">
                      {contact.phone && (
                        <div className="flex items-center gap-2 text-sm">
                          <Phone className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-300">{contact.phone}</span>
                          {contact.extension && (
                            <span className="text-gray-500">ext. {contact.extension}</span>
                          )}
                        </div>
                      )}
                      {contact.mobile && (
                        <div className="flex items-center gap-2 text-sm">
                          <MessageCircle className="w-4 h-4 text-gray-400" />
                          <span className="text-gray-300">{contact.mobile}</span>
                        </div>
                      )}
                      {contact.email && (
                        <div className="flex items-center gap-2 text-sm">
                          <Mail className="w-4 h-4 text-gray-400" />
                          <span className="text-blue-400">{contact.email}</span>
                        </div>
                      )}
                    </div>
                  </div>
                  
                  {contact.notes && (
                    <div className="mt-3 pt-3 border-t border-[#333333]">
                      <p className="text-sm text-gray-400">{contact.notes}</p>
                    </div>
                  )}
                </div>
                
                <div className="flex items-center gap-2">
                  {!contact.is_primary && (
                    <button
                      onClick={() => handleSetPrimary(contact.id)}
                      className="text-gray-400 hover:text-[#5b8fc7] transition-colors"
                      title="Set as primary contact"
                    >
                      <Star className="w-4 h-4" />
                    </button>
                  )}
                  <button
                    className="text-gray-400 hover:text-white transition-colors"
                    title="Edit contact"
                  >
                    <Edit2 className="w-4 h-4" />
                  </button>
                  <button
                    onClick={() => handleDeleteContact(contact.id)}
                    className="text-gray-400 hover:text-red-400 transition-colors"
                    title="Delete contact"
                  >
                    <Trash2 className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
      
      {/* Quick Actions */}
      {contacts.length > 0 && (
        <div className="bg-[#1E1E1E] border border-[#333333] rounded-[4px] p-4">
          <h4 className="text-white font-medium mb-3">Quick Contact</h4>
          <div className="flex flex-wrap gap-2">
            {contacts.filter(c => c.phone).map((contact) => (
              <a
                key={contact.id}
                href={`tel:${contact.phone}`}
                className="bg-[#333333] hover:bg-[#404040] text-white px-3 py-2 rounded text-sm transition-colors flex items-center gap-2"
              >
                <Phone className="w-4 h-4" />
                {contact.name} {contact.is_primary && '⭐'}
              </a>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}; 