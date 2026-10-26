import React, { useState } from 'react';
import { 
  Building2, Users, Plus, Eye, ChevronRight, 
  Phone, Mail, Star, Shield, ArrowRight
} from 'lucide-react';

export const RelationshipManagement: React.FC = () => {
  const [activeDemo, setActiveDemo] = useState<'companies' | 'vendor-contacts' | null>(null);

  return (
    <div className="p-6 max-w-6xl mx-auto">
      <div className="mb-8">
        <h1 className="text-2xl font-bold text-white mb-2">🚀 New Relationship Management Features</h1>
        <p className="text-gray-400">
          Organize your business relationships more effectively with these powerful new tools
        </p>
      </div>

      <div className="grid md:grid-cols-2 gap-6">
        {/* Company Management Feature */}
        <div className="bg-[#1E1E1E] border border-[#333333] rounded-[4px] overflow-hidden">
          <div className="p-6 border-b border-[#333333]">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 bg-[#336699]/20 rounded-full flex items-center justify-center">
                <Building2 className="w-6 h-6 text-[#336699]" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Company Management</h3>
                <p className="text-sm text-gray-400">Group clients by organization</p>
              </div>
            </div>
            
            <div className="space-y-3 mb-4">
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <ChevronRight className="w-4 h-4 text-[#5b8fc7]" />
                Multiple contacts per company
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <ChevronRight className="w-4 h-4 text-[#5b8fc7]" />
                Track company-level relationships
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <ChevronRight className="w-4 h-4 text-[#5b8fc7]" />
                Organize by industry and department
              </div>
            </div>

            <div className="bg-[#333333] rounded-[4px] p-4 mb-4">
              <h4 className="text-white font-medium mb-2">Example Companies</h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-white">Austin Medical Center</div>
                    <div className="text-xs text-gray-400">Healthcare • 3 contacts</div>
                  </div>
                  <Users className="w-4 h-4 text-blue-400" />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-white">Riverside Shopping Plaza</div>
                    <div className="text-xs text-gray-400">Retail • 2 contacts</div>
                  </div>
                  <Users className="w-4 h-4 text-blue-400" />
                </div>
              </div>
            </div>

            <button 
              onClick={() => setActiveDemo('companies')}
              className="w-full bg-[#336699] hover:bg-[#336699]/80 text-white px-4 py-2 rounded-[4px] text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Eye className="w-4 h-4" />
              View Company Management
            </button>
          </div>
        </div>

        {/* Vendor Contacts Feature */}
        <div className="bg-[#1E1E1E] border border-[#333333] rounded-[4px] overflow-hidden">
          <div className="p-6 border-b border-[#333333]">
            <div className="flex items-center gap-3 mb-3">
              <div className="w-12 h-12 bg-[#336699]/20 rounded-full flex items-center justify-center">
                <Users className="w-6 h-6 text-[#5b8fc7]" />
              </div>
              <div>
                <h3 className="text-lg font-semibold text-white">Vendor Contacts</h3>
                <p className="text-sm text-gray-400">Multiple contacts per supplier</p>
              </div>
            </div>
            
            <div className="space-y-3 mb-4">
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <ChevronRight className="w-4 h-4 text-[#5b8fc7]" />
                Track multiple roles per vendor
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <ChevronRight className="w-4 h-4 text-[#5b8fc7]" />
                Primary contact designation
              </div>
              <div className="flex items-center gap-2 text-sm text-gray-300">
                <ChevronRight className="w-4 h-4 text-[#5b8fc7]" />
                14 specialized contact roles
              </div>
            </div>

            <div className="bg-[#333333] rounded-[4px] p-4 mb-4">
              <h4 className="text-white font-medium mb-2">Sample Contacts</h4>
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-white flex items-center gap-2">
                      Mike Johnson 
                      <Star className="w-3 h-3 text-yellow-400 fill-current" />
                    </div>
                    <div className="text-xs text-gray-400">Sales Manager • Primary</div>
                  </div>
                  <Phone className="w-4 h-4 text-gray-400" />
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <div className="text-sm font-medium text-white">Sarah Chen</div>
                    <div className="text-xs text-gray-400">Technical Support</div>
                  </div>
                  <Mail className="w-4 h-4 text-gray-400" />
                </div>
              </div>
            </div>

            <button 
              onClick={() => setActiveDemo('vendor-contacts')}
              className="w-full bg-[#336699] hover:bg-[#336699]/80 text-white px-4 py-2 rounded-[4px] text-sm font-medium transition-colors flex items-center justify-center gap-2"
            >
              <Eye className="w-4 h-4" />
              View Vendor Contacts
            </button>
          </div>
        </div>
      </div>

      {/* Demo Content */}
      {activeDemo && (
        <div className="mt-8 bg-[#1E1E1E] border border-[#333333] rounded-[4px] p-6">
          <div className="flex items-center justify-between mb-6">
            <h3 className="text-lg font-semibold text-white">
              {activeDemo === 'companies' ? '🏢 Company Management Demo' : '👥 Vendor Contacts Demo'}
            </h3>
            <button 
              onClick={() => setActiveDemo(null)}
              className="text-gray-400 hover:text-white transition-colors"
            >
              ✕
            </button>
          </div>

          {activeDemo === 'companies' ? (
            <div className="space-y-6">
              <div className="grid md:grid-cols-3 gap-4">
                <div className="bg-[#333333] rounded-[4px] p-4 border-l-4 border-[#336699]">
                  <h4 className="text-white font-medium mb-2">Multiple Contacts</h4>
                  <p className="text-gray-400 text-sm">
                    Track different people at the same company - project managers, billing contacts, decision makers
                  </p>
                </div>
                <div className="bg-[#333333] rounded-[4px] p-4 border-l-4 border-[#336699]">
                  <h4 className="text-white font-medium mb-2">Organized Communication</h4>
                  <p className="text-gray-400 text-sm">
                    Know exactly who to contact for different needs and departments
                  </p>
                </div>
                <div className="bg-[#333333] rounded-[4px] p-4 border-l-4 border-[#388E3C]">
                  <h4 className="text-white font-medium mb-2">Company-Level Tracking</h4>
                  <p className="text-gray-400 text-sm">
                    View total business value and project history per organization
                  </p>
                </div>
              </div>

              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <Building2 className="w-16 h-16 text-[#336699] mx-auto mb-4" />
                  <p className="text-white font-medium mb-2">Go to People → Clients to start</p>
                  <p className="text-gray-400 text-sm">Create companies and link multiple clients to each organization</p>
                </div>
              </div>
            </div>
          ) : (
            <div className="space-y-6">
              <div className="grid md:grid-cols-2 gap-6">
                <div>
                  <h4 className="text-white font-medium mb-3">Available Contact Roles</h4>
                  <div className="grid grid-cols-2 gap-2 text-sm">
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-[#5b8fc7]" />
                      <span className="text-gray-300">Owner</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-blue-400" />
                      <span className="text-gray-300">Sales Manager</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-green-400" />
                      <span className="text-gray-300">Technical Support</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-yellow-400" />
                      <span className="text-gray-300">Billing Contact</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-300">Emergency Services</span>
                    </div>
                    <div className="flex items-center gap-2">
                      <Shield className="w-4 h-4 text-gray-400" />
                      <span className="text-gray-300">+ 9 more roles</span>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-white font-medium mb-3">Quick Contact Actions</h4>
                  <div className="space-y-2">
                    <div className="bg-[#333333] rounded px-3 py-2 flex items-center gap-2">
                      <Phone className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-300">One-click calling</span>
                    </div>
                    <div className="bg-[#333333] rounded px-3 py-2 flex items-center gap-2">
                      <Star className="w-4 h-4 text-yellow-400" />
                      <span className="text-sm text-gray-300">Primary contact highlighting</span>
                    </div>
                    <div className="bg-[#333333] rounded px-3 py-2 flex items-center gap-2">
                      <ArrowRight className="w-4 h-4 text-gray-400" />
                      <span className="text-sm text-gray-300">Role-based contact suggestions</span>
                    </div>
                  </div>
                </div>
              </div>

              <div className="flex items-center justify-center py-8">
                <div className="text-center">
                  <Users className="w-16 h-16 text-[#5b8fc7] mx-auto mb-4" />
                  <p className="text-white font-medium mb-2">Go to People → Vendors</p>
                  <p className="text-gray-400 text-sm">Click any vendor to see the Contacts tab in the detail modal</p>
                </div>
              </div>
            </div>
          )}
        </div>
      )}

      {/* Implementation Status */}
      <div className="mt-8 bg-[#1E1E1E] border border-[#333333] rounded-[4px] p-6">
        <h3 className="text-lg font-semibold text-white mb-4">✅ Implementation Status</h3>
        
        <div className="grid md:grid-cols-2 gap-6">
          <div>
            <h4 className="text-white font-medium mb-3">🏢 Company Management</h4>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-gray-300">Database tables created</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-gray-300">CompanyService with CRUD operations</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-gray-300">Sample companies with 5 industries</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                <span className="text-gray-300">CompanyList UI component (ready)</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-yellow-400 rounded-full"></div>
                <span className="text-gray-300">Client linking UI (pending)</span>
              </div>
            </div>
          </div>

          <div>
            <h4 className="text-white font-medium mb-3">👥 Vendor Contacts</h4>
            <div className="space-y-2 text-sm">
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-gray-300">Database tables created</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-gray-300">VendorContactService with CRUD</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-gray-300">14 contact roles defined</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-gray-300">Sample contacts for 3 vendors</span>
              </div>
              <div className="flex items-center gap-2">
                <div className="w-2 h-2 bg-green-400 rounded-full"></div>
                <span className="text-gray-300">VendorContactsList UI integrated</span>
              </div>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}; 