import React, { useContext, useState } from 'react';
import { Activity, Download } from 'lucide-react';
import { ActivityFeed } from '../components/activity/ActivityFeed';
import { useActivity } from '../components/activity/useActivity';
import { OrganizationContext } from '../components/layouts/DashboardLayout';

const KINDS: Array<{ id?: string; label: string }> = [
  { label: 'Everything' },
  { id: 'estimate', label: 'Estimates' },
  { id: 'project', label: 'Projects' },
  { id: 'purchase_order', label: 'Purchase orders' },
  { id: 'lead', label: 'Leads' },
  { id: 'client', label: 'Clients' },
  { id: 'expense', label: 'Expenses' },
  { id: 'organization', label: 'Company' },
];

const LIMIT = 300;
const csvCell = (s: string) => `"${s.replace(/"/g, '""')}"`;

/** Everything that happened in the company, filtered by kind, with a CSV download. */
export const ActivityPage: React.FC = () => {
  const { selectedOrg } = useContext(OrganizationContext);
  const [kind, setKind] = useState<string | undefined>(undefined);
  const rows = useActivity(selectedOrg?.id, kind, LIMIT);

  const download = () => {
    if (!rows?.length) return;
    const lines = [['When', 'Who', 'What', 'Link'].join(','), ...rows.map((r) => [r.at, r.who, r.text, r.link ? `${window.location.origin}${r.link}` : ''].map(csvCell).join(','))];
    const url = URL.createObjectURL(new Blob([lines.join('\n')], { type: 'text/csv' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = `activity-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="p-4 md:p-8 max-w-4xl">
      <div className="flex items-center justify-between gap-3 mb-2">
        <div className="flex items-center gap-3">
          <Activity className="w-7 h-7 text-[#3B82F6]" />
          <h1 className="text-2xl md:text-3xl font-bold text-white">Activity</h1>
        </div>
        <button
          type="button"
          onClick={download}
          disabled={!rows?.length}
          className="flex items-center gap-2 px-3 py-2 rounded-lg border border-[#333333] text-sm text-gray-200 hover:bg-[#252525] disabled:opacity-50"
        >
          <Download className="w-4 h-4" /> CSV
        </button>
      </div>
      <p className="text-gray-400 mb-5">Everything that happened in {selectedOrg?.name ?? 'your company'}: what your team did, what clients did on their links, and what your assistants did for you.</p>

      <div className="flex flex-wrap gap-2 mb-6" role="group" aria-label="Show">
        {KINDS.map((k) => {
          const on = kind === k.id;
          return (
            <button
              key={k.label}
              type="button"
              aria-pressed={on}
              onClick={() => setKind(k.id)}
              className={`px-3 py-1.5 rounded-full text-sm border transition-colors ${
                on ? 'bg-[#336699] border-[#336699] text-white' : 'border-[#333333] text-gray-300 hover:bg-[#252525]'
              }`}
            >
              {k.label}
            </button>
          );
        })}
      </div>

      <div className="bg-[#1A1A1A] rounded-lg p-4 md:p-6">
        <ActivityFeed organizationId={selectedOrg?.id} resourceType={kind} limit={LIMIT} />
      </div>
    </div>
  );
};
