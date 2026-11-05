import { toCsv } from '../../../convex/lib/signals';
import type { OutreachRow } from '../../lib/api';

/** A list as a CSV for letters: one row per owner, the mailing address split for a mail merge. */
export function outreachCsv(rows: OutreachRow[]): string {
  return toCsv(
    ['Name', 'Company', 'Mailing address', 'Mailing city', 'Mailing state', 'Mailing zip', 'Property address', 'Property value', 'Properties', 'Total value', 'Why', 'Status', 'Note'],
    rows.map((r) => [
      r.name,
      r.company ?? '',
      r.mailing.address ?? '',
      r.mailing.city ?? '',
      r.mailing.state ?? '',
      r.mailing.zip?.slice(0, 5) ?? '',
      r.property.address,
      r.property.valueCents ? Math.round(r.property.valueCents / 100) : '',
      r.properties,
      Math.round(r.totalValueCents / 100),
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
