import { toCsv } from '../../../convex/lib/signals';
import type { OutreachContact } from '../../lib/api';
import { phoneText } from './format';

/** The contacts as a CSV: one row per owner, the mailing address split for a mail merge, phones and emails where unlocked. */
export function outreachCsv(rows: OutreachContact[]): string {
  return toCsv(
    ['Name', 'Company', 'Decision maker', 'Title', 'Mailing address', 'Mailing city', 'Mailing state', 'Mailing zip', 'Property address', 'Property value', 'Properties', 'Total value', 'Type', 'Signals', 'Phone', 'Phone type', 'DNC', 'Other phones', 'Email', 'Why', 'Status', 'Note'],
    rows.map((r) => [
      r.name,
      r.company ?? '',
      r.person?.name ?? '',
      r.person?.title ?? '',
      r.mailing.address ?? '',
      r.mailing.city ?? '',
      r.mailing.state ?? '',
      r.mailing.zip?.slice(0, 5) ?? '',
      r.property.address,
      r.property.valueCents ? Math.round(r.property.valueCents / 100) : '',
      r.properties,
      Math.round(r.totalValueCents / 100),
      r.kinds.join(', '),
      r.signals.map((s) => `${s.kind} ${s.date.slice(0, 10)}`).join(' '),
      r.phones[0] ? phoneText(r.phones[0].number) : '',
      r.phones[0]?.type ?? '',
      r.phones[0]?.dnc ? 'yes' : '',
      r.phones.slice(1).map((p) => `${phoneText(p.number)}${p.dnc ? ' (DNC)' : ''}`).join(' '),
      r.emails.map((e) => e.email).join(' '),
      r.why,
      r.status,
      r.note ?? '',
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
