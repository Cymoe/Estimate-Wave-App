// The person behind the owners on the page. The rows are companies; the one
// to call is whoever runs them. This puts the owners a view holds into groups
// (convex/lib/operators.ts decides who belongs together, the same way the
// server does when it sends them to Leads) and adds what the page says about
// each: a name to go by, how many entities, and what they hold in all.

import type { OutreachContact, OutreachEmail, OutreachPhone } from '../../lib/api';
import { operatorGroups, operatorName, type OperatorOwner, type OperatorTie } from '../../../convex/lib/operators';
import { displayName, familyKey, mailKey, shortMoney } from '../../../convex/lib/outreach';
import { callOk } from './format';

export type Operator = {
  key: string;
  /** Who the group goes by: the decision maker, else the person among them, else the company family. */
  label: string;
  ties: OperatorTie[];
  /** Every owner of the group in the view, in the view's order. */
  members: OutreachContact[];
  properties: number;
  totalValueCents: number;
};
/** The group each owner is in, by owner id; an owner on its own has none. */
export type Operators = Map<string, Operator>;

/** A company on the roll, not a realtor (whose `company` is the brokerage they work with). */
const isCompany = (r: OutreachContact) => r.company !== undefined && !r.kinds.includes('realtor');

/** What the grouping reads off an owner. realOnly leaves out what the simulated chain made up, as the server does. */
function asOwner(r: OutreachContact, realOnly: boolean): OperatorOwner {
  // A sample run (its note says so) is made up from end to end, whatever its cells say.
  const real = (f: 'person' | 'phone' | 'email') => !realOnly || !(r.enrichment[f]?.simulated || r.note?.startsWith('Sample'));
  return {
    id: r.id,
    name: r.name,
    company: isCompany(r),
    person: real('person') ? operatorName(r.person) : undefined,
    phones: real('phone') ? r.phones.map((p) => p.number) : [],
    // An address the contact check says is someone else's ties nobody to it.
    emails: real('email') ? r.emails.filter((e) => e.nameMatch !== false).map((e) => e.email) : [],
    mailing: mailKey(r.mailing),
  };
}

/**
 * The view's owners by the person behind them. realOnly: the groups a send to
 * Leads will act on, which never rest on simulated results.
 */
export function operatorsOf(rows: OutreachContact[], { realOnly = false }: { realOnly?: boolean } = {}): Operators {
  const groups = operatorGroups(rows.map((r) => asOwner(r, realOnly)));
  const byId = new Map(rows.map((r) => [r.id, r] as const));
  const made = new Map<string, Operator>();
  const out: Operators = new Map();
  for (const [id, g] of groups) {
    let op = made.get(g.key);
    if (!op) {
      const members = g.ids.map((x) => byId.get(x)!);
      const individual = members.find((m) => !isCompany(m));
      const family = members.map((m) => (isCompany(m) ? familyKey(m.name) : undefined)).find(Boolean);
      op = {
        key: g.key,
        label: g.person ?? individual?.name ?? (g.ties.includes('family') && family ? displayName(family) : members[0].name),
        ties: g.ties,
        members,
        properties: members.reduce((sum, m) => sum + m.properties, 0),
        totalValueCents: members.reduce((sum, m) => sum + m.totalValueCents, 0),
      };
      made.set(g.key, op);
    }
    out.set(id, op);
  }
  return out;
}

/** The groups themselves, each once, biggest holdings first. */
export const operatorList = (ops: Operators): Operator[] => [...new Set(ops.values())].sort((a, b) => b.totalValueCents - a.totalValueCents || b.properties - a.properties || a.label.localeCompare(b.label));

const plural = (n: number, one: string, many = `${one}s`) => `${n.toLocaleString('en-US')} ${n === 1 ? one : many}`;

/** "3 entities · 128 properties · $41.2M": what the person controls, in a line. */
export const operatorHolding = (op: Operator) =>
  [plural(op.members.length, 'entity', 'entities'), plural(op.properties, 'property', 'properties'), op.totalValueCents > 0 ? shortMoney(op.totalValueCents) : ''].filter(Boolean).join(' · ');

/** Why these owners are shown as one, in a few words (few enough to fit its column: "on 2 of 3" was cut off there). */
export function operatorBasis(op: Operator): string {
  if (op.ties.includes('person')) return 'Same decision maker';
  if (op.ties.includes('phone')) return 'Same phone number';
  if (op.ties.includes('email')) return 'Same email';
  return 'Sister companies';
}

/** Every number the group's owners have, each once, the ones worth calling first. */
export function operatorPhones(op: Operator): OutreachPhone[] {
  const seen = new Set<string>();
  const all = op.members.flatMap((m) => m.phones).filter((p) => !seen.has(p.number) && seen.add(p.number));
  return [...all.filter(callOk), ...all.filter((p) => !callOk(p))];
}

/** Every email the group's owners have, each once, the person's own first. */
export function operatorEmails(op: Operator): OutreachEmail[] {
  const seen = new Set<string>();
  const all = op.members.flatMap((m) => m.emails).filter((e) => !seen.has(e.email) && seen.add(e.email));
  return [...all.filter((e) => e.nameMatch !== false), ...all.filter((e) => e.nameMatch === false)];
}

/** A group's owners still to be sent: not in Leads, not skipped, not already matching a lead the company has. */
export const operatorWaiting = (op: Operator) => op.members.filter((m) => !m.leadId && m.status !== 'skip' && m.known?.kind !== 'lead');

/** One thing drawn in the list: a person with their entities under them, or an owner (on its own, or one of a group's). */
export type OwnerItem = { kind: 'operator'; op: Operator; shown: OutreachContact[]; open: boolean } | { kind: 'owner'; row: OutreachContact; op?: Operator };

/**
 * The rows as they are drawn: a group's owners come together where the first
 * of them stands, under one line for the person, and only when it's open.
 * `rows` may be fewer than the group holds (a filter, a search); the person's
 * line still counts everyone.
 */
export function ownerItems(rows: OutreachContact[], ops: Operators | undefined, isOpen: (key: string) => boolean): OwnerItem[] {
  if (!ops || ops.size === 0) return rows.map((row) => ({ kind: 'owner', row }));
  const shown = new Map<string, OutreachContact[]>();
  for (const r of rows) {
    const op = ops.get(r.id);
    if (!op) continue;
    const list = shown.get(op.key);
    if (list) list.push(r);
    else shown.set(op.key, [r]);
  }
  const items: OwnerItem[] = [];
  const done = new Set<string>();
  for (const row of rows) {
    const op = ops.get(row.id);
    if (!op) {
      items.push({ kind: 'owner', row });
      continue;
    }
    if (done.has(op.key)) continue;
    done.add(op.key);
    const mine = shown.get(op.key)!;
    const open = isOpen(op.key);
    items.push({ kind: 'operator', op, shown: mine, open });
    if (open) for (const r of mine) items.push({ kind: 'owner', row: r, op });
  }
  return items;
}

/**
 * The page's order with the person as the unit: under "most parcels first" a
 * person ranks by everything they hold, and A to Z by the name they go by. In
 * the list's own order a group stands where its first owner does.
 */
export function sortByOperator(rows: OutreachContact[], ops: Operators, by: 'parcels' | 'name'): OutreachContact[] {
  const at = (r: OutreachContact) => ops.get(r.id);
  if (by === 'name') {
    const name = (r: OutreachContact) => at(r)?.label ?? r.name;
    return [...rows].sort((a, b) => name(a).localeCompare(name(b), 'en', { sensitivity: 'base', numeric: true }) || a.name.localeCompare(b.name, 'en', { sensitivity: 'base', numeric: true }));
  }
  const held = (r: OutreachContact) => at(r)?.properties ?? r.properties;
  const worth = (r: OutreachContact) => at(r)?.totalValueCents ?? r.totalValueCents;
  return [...rows].sort((a, b) => held(b) - held(a) || worth(b) - worth(a) || b.properties - a.properties || b.totalValueCents - a.totalValueCents || a.name.localeCompare(b.name));
}
