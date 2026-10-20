import * as XLSX from 'xlsx';
import { STATUSES, type Lead } from '../components/leads/leadTypes';
import { leadOrigin } from '../components/market/wallet';

/**
 * Leads as a spreadsheet: one row per lead, the same columns in CSV and
 * Excel. Takes the leads the board is showing, so filters apply.
 */

export type LeadRow = Record<string, string | number>;

const day = (iso?: string) => (iso ? iso.slice(0, 10) : '');
const when = (iso?: string) => (iso ? iso.replace('T', ' ').slice(0, 16) : '');

export function leadRows(leads: Lead[], tradeName: (slug?: string) => string): LeadRow[] {
  return leads.map((lead) => ({
    Name: lead.name,
    Phone: lead.phone ?? '',
    Email: lead.email ?? '',
    Address: lead.address ?? '',
    City: lead.city ?? '',
    County: lead.county ?? '',
    Service: tradeName(lead.jobType),
    Source: lead.source ?? '',
    Stage: STATUSES.find((s) => s.value === lead.status)?.label ?? lead.status,
    Value: lead.estimate?.totalAmount ?? lead.estimatedValue ?? '',
    Estimate: lead.estimate?.estimateNumber ?? '',
    'Follow-up': lead.followUpDate ?? '',
    Appointment: when(lead.appointmentAt),
    'Last contact': when(lead.lastContactAt),
    Calls: lead.contacts ?? 0,
    Texts: lead.texts ?? 0,
    'Came in': day(lead.createdAt),
    Origin: leadOrigin(lead) ?? '',
    'Lost because': lead.lostReason ?? '',
    Notes: lead.notes ?? '',
  }));
}

const cell = (value: string | number) => {
  const text = String(value);
  return /[",\n]/.test(text) ? `"${text.replace(/"/g, '""')}"` : text;
};

export function leadsCsv(rows: LeadRow[]): string {
  if (rows.length === 0) return '';
  const headers = Object.keys(rows[0]);
  return [headers.join(','), ...rows.map((row) => headers.map((h) => cell(row[h])).join(','))].join('\n');
}

const stamp = () => new Date().toISOString().slice(0, 16).replace('T', '_').replace(':', '-');

const download = (blob: Blob, name: string) => {
  const link = document.createElement('a');
  const url = URL.createObjectURL(blob);
  link.href = url;
  link.download = name;
  link.style.visibility = 'hidden';
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

export const LeadExportService = {
  csv(leads: Lead[], tradeName: (slug?: string) => string) {
    download(new Blob([leadsCsv(leadRows(leads, tradeName))], { type: 'text/csv;charset=utf-8;' }), `leads_${stamp()}.csv`);
  },
  excel(leads: Lead[], tradeName: (slug?: string) => string) {
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, XLSX.utils.json_to_sheet(leadRows(leads, tradeName)), 'Leads');
    XLSX.writeFile(wb, `leads_${stamp()}.xlsx`);
  },
};
