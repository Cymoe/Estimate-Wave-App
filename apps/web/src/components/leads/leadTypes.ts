export type LeadStatus = 'new' | 'no_answer' | 'contacted' | 'scheduled' | 'quoted' | 'won' | 'lost';

export interface Lead {
  id: string;
  name: string;
  phone?: string;
  email?: string;
  address?: string;
  city?: string;
  jobType?: string;
  source?: string;
  estimatedValue?: number;
  followUpDate?: string;
  appointmentAt?: string;
  notes?: string;
  status: LeadStatus;
  lostReason?: string;
  clientId?: string;
  isSample?: boolean;
  createdAt?: string;
  estimate: { id: string; estimateNumber: string; status: string; totalAmount: number } | null;
}

export interface Trade {
  id: string;
  name: string;
}

/** The stages, in board order. `dot` colours the stage pill in the lead drawer. */
export const STATUSES: { value: LeadStatus; label: string; color: string; dot: string }[] = [
  { value: 'new', label: 'New', color: 'text-sky-300', dot: 'bg-sky-300' },
  { value: 'no_answer', label: 'No Answer', color: 'text-rose-300', dot: 'bg-rose-300' },
  { value: 'contacted', label: 'Contacted', color: 'text-amber-300', dot: 'bg-amber-300' },
  { value: 'scheduled', label: 'Estimate Scheduled', color: 'text-orange-300', dot: 'bg-orange-300' },
  { value: 'quoted', label: 'Estimate Sent', color: 'text-violet-300', dot: 'bg-violet-300' },
  { value: 'won', label: 'Won', color: 'text-emerald-300', dot: 'bg-emerald-300' },
  { value: 'lost', label: 'Lost', color: 'text-gray-500', dot: 'bg-gray-500' },
];

export const SOURCES = ['Referral', 'Google', 'Facebook', 'Website', 'Yard sign', 'Repeat customer', 'Other'];

export const KNOWN_CITIES = ['Midland', 'Odessa', 'Andrews', 'Big Spring', 'Stanton', 'Monahans', 'Kermit', 'Gardendale'];
