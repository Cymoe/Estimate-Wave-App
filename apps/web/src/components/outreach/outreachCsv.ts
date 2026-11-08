import { toCsv } from '../../../convex/lib/signals';
import type { OutreachContact } from '../../lib/api';
import { phoneText, STATUS_LABEL } from './format';

/** The contacts as a CSV: one row per owner, the mailing address split for a mail merge, phones and emails where unlocked. */
export function outreachCsv(rows: OutreachContact[]): string {
  return toCsv(
    ['Name', 'Company', 'Decision maker', 'Title', 'Phone', 'Phone type', 'Phone line', 'DNC', 'Other phones', 'Email', 'Status', 'Note', 'Mailing address', 'Mailing city', 'Mailing state', 'Mailing zip', 'Property address', 'Property value', 'Properties', 'Total value', 'Type', 'Why', 'Signals', 'Research', 'Research sources'],
    rows.map((r) => [
      r.name,
      r.company ?? '',
      r.person?.name ?? '',
      r.person?.title ?? '',
      r.phones[0] ? phoneText(r.phones[0].number) : '',
      r.phones[0]?.type ?? '',
      r.phones[0]?.line ?? '',
      r.phones[0]?.dnc ? 'yes' : '',
      r.phones.slice(1).map((p) => `${phoneText(p.number)}${p.line ? ` (${p.line})` : ''}${p.dnc ? ' (DNC)' : ''}`).join(' '),
      r.emails.map((e) => e.email).join(' '),
      STATUS_LABEL[r.status] ?? r.status,
      r.note ?? '',
      r.mailing.address ?? '',
      r.mailing.city ?? '',
      r.mailing.state ?? '',
      r.mailing.zip?.slice(0, 5) ?? '',
      r.property?.address ?? '',
      r.property?.valueCents ? Math.round(r.property.valueCents / 100) : '',
      r.properties,
      Math.round(r.totalValueCents / 100),
      r.kinds.join(', '),
      r.why,
      r.signals.map((s) => `${s.kind} ${s.date.slice(0, 10)}`).join(' '),
      r.research?.answer ?? '',
      r.research?.sources.map((s) => s.url).join(' ') ?? '',
    ]),
  );
}

/** Hands the browser a file to save. */
export function download(name: string, text: string, type = 'text/csv') {
  const url = URL.createObjectURL(new Blob([text], { type }));
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

/** "shopping-center-owners-midland.csv" */
export const csvName = (title: string) =>
  `${title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-|-$/g, '')}.csv`;
