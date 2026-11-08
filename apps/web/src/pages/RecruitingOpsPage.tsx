import { useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Check, X } from 'lucide-react';
import { useAuth } from '../contexts/AuthContext';
import { isStaff } from '../lib/roles';
import { recruitingAPI, type RecruitByAd, type RecruitClient, type RecruitSetup } from '../lib/api';
import { AdsTab } from '../components/recruiting/AdsTab';
import { ApplicantsTab } from '../components/recruiting/ApplicantsTab';
import { ClientsTab } from '../components/recruiting/ClientsTab';
import { TryItTab } from '../components/recruiting/TryItTab';
import { errorText } from '../components/recruiting/labels';

type Tab = 'applicants' | 'try' | 'ads' | 'clients' | 'byad' | 'setup';
const TABS: Array<[Tab, string]> = [
  ['applicants', 'Applicants'],
  ['try', 'Try it'],
  ['ads', 'Ads'],
  ['clients', 'Clients'],
  ['byad', 'By ad'],
  ['setup', 'Setup'],
];
const SUMMARY: Record<Tab, string> = {
  applicants: "Everyone Jordan is screening or has screened, newest first",
  try: 'Text Jordan as a rep to test the brief: nothing is sent or counted',
  ads: "The ad agent's drafts to approve, and how every ad is doing",
  clients: 'The companies National Sales Registry recruits for',
  byad: "Which ads bring in A-grade reps, last 30 days",
  setup: "What's connected, and the addresses to give Twilio, Cal.com and the ad forms",
};

function ByAdTab() {
  const [rows, setRows] = useState<RecruitByAd | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    recruitingAPI.byAd(30).then(setRows, (e) => setError(errorText(e)));
  }, []);
  if (error) return <p className="text-sm text-red-400">{error}</p>;
  if (!rows) return <p className="text-sm text-gray-400">Loading…</p>;
  if (rows.length === 0) return <p className="text-sm text-gray-400">No applicants in the last 30 days.</p>;
  return (
    <div className="overflow-x-auto border border-[#2A2A2A] rounded">
      <table className="w-full text-sm" data-testid="by-ad">
        <thead className="text-xs text-gray-500 text-left">
          <tr>
            {['Source ad id', 'Applicants', 'A', 'B', 'C', 'Booked', 'Showed'].map((h) => (
              <th key={h} className="px-3 py-2 font-normal">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-[#2A2A2A] text-gray-200">
          {rows.map((r) => (
            <tr key={r.sourceAdId}>
              <td className="px-3 py-2">{r.sourceAdId}</td>
              <td className="px-3 py-2">{r.applicants}</td>
              <td className="px-3 py-2">{r.A}</td>
              <td className="px-3 py-2">{r.B}</td>
              <td className="px-3 py-2">{r.C}</td>
              <td className="px-3 py-2">{r.booked}</td>
              <td className="px-3 py-2">{r.showed}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

function SetupTab({ setup }: { setup: RecruitSetup | null }) {
  if (!setup) return <p className="text-sm text-gray-400">Loading…</p>;
  const checks: Array<[boolean, string, string]> = [
    [setup.ready.claude, 'Claude', 'ANTHROPIC_API_KEY: Jordan and the ad agent. Try it works with only this.'],
    [setup.ready.number, "Jordan's own Twilio number", "RECRUIT_TWILIO_FROM: a new number, registered for A2P 10DLC (recruiting). Not the office line's."],
    [setup.ready.applySecret, 'Apply secret', 'RECRUIT_APPLY_SECRET: the ad forms send it with each applicant.'],
    [setup.ready.flags, 'Who gets flags', 'RECRUIT_FLAG_PHONES: Myles and a VA, comma-separated.'],
    [setup.ready.cal, 'Cal.com', 'CAL_API_KEY: so Jordan can book times itself. Without it Jordan sends the booking link.'],
  ];
  return (
    <div className="space-y-5 max-w-2xl">
      <ul className="space-y-2">
        {checks.map(([ok, label, how]) => (
          <li key={label} className="flex gap-3 border border-[#2A2A2A] rounded p-3" data-testid="setup-check">
            {ok ? <Check className="w-5 h-5 text-emerald-400 shrink-0" /> : <X className="w-5 h-5 text-gray-500 shrink-0" />}
            <span>
              <span className="block text-sm text-white">{label}</span>
              <span className="block text-xs text-gray-500">{how}</span>
            </span>
          </li>
        ))}
      </ul>
      <p className="text-xs text-gray-500">These are set in the Convex dashboard: Estimate Wave&apos;s deployment → Settings → Environment Variables.</p>
      <dl className="text-sm space-y-2">
        {[
          ['Twilio: "A message comes in" for Jordan\'s number', setup.smsWebhook],
          ['Ad forms post applicants to', setup.applyUrl],
          ['Cal.com webhook (optional)', setup.calWebhook],
          ["Media buyer's spend (optional)", setup.spendUrl],
        ].map(([label, url]) => (
          <div key={label}>
            <dt className="text-xs text-gray-500">{label}</dt>
            <dd className="text-gray-200 break-all">{url}</dd>
          </div>
        ))}
      </dl>
    </div>
  );
}

/**
 * Ops → Recruiting: National Sales Registry's side. Jordan screens sales
 * applicants by text; the ad agent writes the recruiting ads. Staff only.
 */
export default function RecruitingOpsPage() {
  const { user } = useAuth();
  const [params, setParams] = useSearchParams();
  const asked = params.get('tab');
  const openApplicant = params.get('applicant');
  const tab: Tab = TABS.some(([t]) => t === asked) ? (asked as Tab) : 'applicants';
  const title = TABS.find(([t]) => t === tab)![1];
  const [clients, setClients] = useState<RecruitClient[] | null>(null);
  const [setup, setSetup] = useState<RecruitSetup | null>(null);
  const [error, setError] = useState<string | null>(null);
  const staff = isStaff(user);

  useEffect(() => {
    if (!staff) return;
    const stop = recruitingAPI.watchClients(setClients, (e) => setError(e.message));
    recruitingAPI.setup().then(setSetup, () => {});
    return stop;
  }, [staff]);
  useEffect(() => {
    const before = document.title;
    document.title = `${title} · Recruiting · Ops · Webb Leads`;
    return () => {
      document.title = before;
    };
  }, [title]);

  if (!staff) return <div className="p-8 text-gray-400">The Ops page is only for Webb Leads staff.</div>;

  const go = (next: Tab) => setParams({ tab: next });
  const openId = (id: string | null) => setParams(id ? { tab: 'applicants', applicant: id } : { tab: 'applicants' });
  return (
    <div className="px-4 md:px-6 py-5 text-white">
      <div className="flex flex-wrap items-end justify-between gap-3 mb-4">
        <div>
          <p className="text-xs uppercase tracking-wide text-gray-500">Recruiting · National Sales Registry</p>
          <h1 className="text-xl font-semibold">{title}</h1>
          <p className="text-sm text-gray-400">{SUMMARY[tab]}</p>
        </div>
        <div className="flex max-w-full rounded border border-[#333] overflow-x-auto" role="tablist" aria-label="Recruiting tabs">
          {TABS.map(([value, label]) => (
            <button
              key={value}
              role="tab"
              aria-selected={tab === value}
              onClick={() => go(value)}
              className={`shrink-0 whitespace-nowrap px-4 py-2 text-sm ${tab === value ? 'bg-[#336699] text-white' : 'text-gray-300 [@media(hover:hover)]:hover:bg-[#222]'}`}
            >
              {label}
            </button>
          ))}
        </div>
      </div>
      {error && <p className="text-sm text-red-400 mb-3">{error}</p>}
      {tab === 'applicants' && <ApplicantsTab clients={clients} openId={openApplicant} onOpen={openId} />}
      {tab === 'try' && <TryItTab clients={clients} />}
      {tab === 'ads' && <AdsTab />}
      {tab === 'clients' && <ClientsTab clients={clients} applyUrl={setup?.applyUrl} />}
      {tab === 'byad' && <ByAdTab />}
      {tab === 'setup' && <SetupTab setup={setup} />}
    </div>
  );
}
