// The Outreach page reads a view once and then hears only of the owners that
// changed (outreachAPI.watchChanges). This puts those owners into the view
// it already has, and keeps the column counts in step, so an answer landing
// costs one owner on the wire, not the whole list again.

import type { OutreachContact, OutreachContacts, OutreachField } from '../../lib/api';

/** The column headers' counts ("19 / 56 · 2 sources"), from the rows on the page: the same counting the server does. */
export function coverageOfRows(rows: OutreachContact[]): OutreachContacts['coverage'] {
  const count = (has: (r: OutreachContact) => boolean, source: (r: OutreachContact) => string | undefined, of: (r: OutreachContact) => boolean = () => true) => {
    const sources = new Set<string>();
    let found = 0;
    let total = 0;
    for (const r of rows) {
      if (!of(r)) continue;
      total++;
      if (!has(r)) continue;
      found++;
      const s = source(r);
      if (s) sources.add(s);
    }
    return { found, total, sources: sources.size };
  };
  const cell = (r: OutreachContact, f: OutreachField) => r.enrichment[f]?.source;
  return {
    phone: count((r) => r.phones.length > 0, (r) => cell(r, 'phone')),
    email: count((r) => r.emails.length > 0, (r) => cell(r, 'email')),
    person: count((r) => Boolean(r.person), (r) => r.person?.source, (r) => Boolean(r.company)),
    research: count((r) => Boolean(r.research), (r) => cell(r, 'research')),
  };
}

/** Which owners a view holds: one list's, those on no list, or all of them. */
export type ViewOf = { listId?: string; unlisted?: boolean; order?: { key: (r: OutreachContact) => number } };

const belongs = (r: OutreachContact, { listId, unlisted }: ViewOf) => (unlisted ? r.listIds.length === 0 : !listId || r.listIds.includes(listId));

/**
 * The view with the changed owners put in: one already there is replaced
 * where it stands (keeping its related owners and its match to a client or
 * lead, which the feed doesn't carry), one that left the view (its list tag
 * taken off) is dropped, and a new one is added in the view's order (the
 * list's own, or newest first).
 */
export function mergeChanged(view: OutreachContacts, changed: OutreachContact[], of: ViewOf): OutreachContacts {
  if (changed.length === 0) return view;
  const byId = new Map(changed.map((r) => [r.id, r] as const));
  const rows: OutreachContact[] = [];
  let touched = false;
  for (const old of view.rows) {
    const next = byId.get(old.id);
    if (!next) {
      rows.push(old);
      continue;
    }
    byId.delete(old.id);
    touched = true;
    if (!belongs(next, of)) continue;
    rows.push({ ...next, related: old.related, ...(old.known && !next.leadId ? { known: old.known } : {}) });
  }
  const added = [...byId.values()].filter((r) => belongs(r, of));
  if (!touched && added.length === 0) return view;
  if (added.length) {
    rows.push(...added);
    const order = of.order;
    rows.sort((a, b) => (order ? order.key(b) - order.key(a) || a.name.localeCompare(b.name) : (b.createdAt ?? '').localeCompare(a.createdAt ?? '') || a.name.localeCompare(b.name)));
  }
  // All owners holds everyone, so it can count those on no list itself (the picker's "Not on a list").
  const all = !of.listId && !of.unlisted;
  return { ...view, rows, coverage: coverageOfRows(rows), ...(all ? { unlisted: rows.filter((r) => r.listIds.length === 0).length } : {}) };
}
