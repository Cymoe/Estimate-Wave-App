import React, { useContext, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowLeft, Building2, Package, Users, Bell, Shield } from 'lucide-react';
import { OrganizationContext } from '../components/layouts/DashboardLayout';
import { BusinessDetailsForm } from '../components/settings/BusinessDetailsForm';
import { TradesEditor } from '../components/settings/TradesEditor';

export default function OrganizationSettings() {
  const navigate = useNavigate();
  const { selectedOrg, setSelectedOrg } = useContext(OrganizationContext);
  const [params] = useSearchParams();
  // ?tab=trades opens straight on Trades (the "Pick your trades first" links and old links use it).
  const [activeTab, setActiveTab] = useState(params.get('tab') ?? 'general');

  const tabs = [
    { id: 'general', label: 'General', icon: Building2 },
    { id: 'trades', label: 'Trades', icon: Package },
    { id: 'team', label: 'Team & Permissions', icon: Users },
    { id: 'notifications', label: 'Notifications', icon: Bell },
    { id: 'security', label: 'Security', icon: Shield },
  ];

  if (!selectedOrg) {
    return (
      <div className="min-h-screen bg-[#0A0A0A] flex items-center justify-center">
        <p className="text-gray-400">No organization selected</p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#0A0A0A]">
      {/* Header */}
      <div className="bg-[#0A0A0A] border-b border-[#333333]">
        <div className="px-6 py-4">
          <div className="flex items-center gap-4">
            <button
              onClick={() => navigate(-1)}
              className="p-2 hover:bg-[#252525] rounded-lg transition-colors"
            >
              <ArrowLeft className="w-5 h-5 text-gray-400" />
            </button>
            <div>
              <h1 className="text-xl font-semibold text-white">Organization Settings</h1>
              <p className="text-sm text-gray-500">{selectedOrg.name}</p>
            </div>
          </div>
        </div>
      </div>

      <div className="flex">
        {/* Sidebar */}
        <div className="w-64 border-r border-[#333333] min-h-screen bg-[#0A0A0A]">
          <nav className="p-4 space-y-1">
            {tabs.map((tab) => {
              const Icon = tab.icon;
              return (
                <button
                  key={tab.id}
                  onClick={() => setActiveTab(tab.id)}
                  className={`w-full flex items-center gap-3 px-4 py-3 rounded-lg transition-all ${
                    activeTab === tab.id
                      ? 'bg-[#252525] text-white'
                      : 'text-gray-400 hover:bg-[#1A1A1A] hover:text-white'
                  }`}
                >
                  <Icon className="w-5 h-5" />
                  <span className="text-sm font-medium">{tab.label}</span>
                </button>
              );
            })}
          </nav>
        </div>

        {/* Content */}
        <div className="flex-1 p-6">
          <div className="max-w-4xl">
            {activeTab === 'general' && (
              <div className="bg-[#1A1A1A] rounded-lg p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Business Details</h2>
                <BusinessDetailsForm
                  organizationId={selectedOrg.id}
                  onSaved={(org) => org.name && setSelectedOrg({ ...selectedOrg, name: org.name })}
                />
              </div>
            )}


            {activeTab === 'trades' && (
              <div className="bg-[#1A1A1A] rounded-lg p-6">
                <h2 className="text-lg font-semibold text-white mb-1">What work do you do?</h2>
                <TradesEditor organizationId={selectedOrg.id} />
              </div>
            )}

            {activeTab === 'team' && (
              <div className="bg-[#1A1A1A] rounded-lg p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Team & Permissions</h2>
                <p className="text-gray-400">Team member management coming soon...</p>
              </div>
            )}

            {activeTab === 'notifications' && (
              <div className="bg-[#1A1A1A] rounded-lg p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Notification Settings</h2>
                <p className="text-gray-400">Notification preferences coming soon...</p>
              </div>
            )}

            {activeTab === 'security' && (
              <div className="bg-[#1A1A1A] rounded-lg p-6">
                <h2 className="text-lg font-semibold text-white mb-4">Security Settings</h2>
                <p className="text-gray-400">Security configuration coming soon...</p>
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}