// Who is behind an owner. A list of LLCs is not a list of people to call:
// one person often runs several of them. Owners are put in one group when
// they name the same decision maker and something besides the name agrees
// (one mailing address, a phone number or an email), when they share a phone
// number or an email, or when they are one company family
// ("Nuka Hiva Alpha 1-54 LLC" and "Nuka Hiva Alpha LLC"). A name alone ties
// nobody: two men called David Martinez are not one person. The Outreach
// page shows a group as one row with its companies under it, and a send to
// Leads makes one lead of it. Nothing here reads the database or the browser:
// the page and the server both group with it, so they agree.

import { familyKey } from "./outreach";

/** What ties two owners together. */
export type OperatorTie = "person" | "phone" | "email" | "family";

export type OperatorOwner = {
  id: string;
  name: string;
  /** Itself a company (an LLC on the roll), not a person owning in their own name. */
  company: boolean;
  /** The decision maker found behind the company. */
  person?: string;
  phones: string[];
  emails: string[];
  /** One spelling of where its tax bill is mailed (mailKey). */
  mailing?: string;
};

export type OperatorGroup = {
  /** The same for the same members, in whatever order they come. */
  key: string;
  /** In the order the owners were given. */
  ids: string[];
  ties: OperatorTie[];
  /** The decision maker most of its companies name, when any does. */
  person?: string;
};

const SUFFIX = /\b(JR|SR|II|III|IV)\b\.?/g;
/**
 * A person's name to compare: "Dana Reyes", "Dana M. Reyes" and "REYES, DANA M"
 * all give "DANA REYES" (the first and last words, initials and suffixes set
 * aside, in one order). One word is not a name to match on.
 */
export function personKey(name: string | undefined): string | undefined {
  const words = (name ?? "")
    .toUpperCase()
    .replace(SUFFIX, " ")
    .replace(/[^A-Z' -]/g, " ")
    .split(/\s+/)
    .filter((w) => w.replace(/[^A-Z]/g, "").length > 1);
  if (words.length < 2) return undefined;
  return [words[0], words[words.length - 1]].sort().join(" ");
}

/**
 * The decision maker's name to group companies by. A registered agent standing
 * in for one (often a lawyer who files for many unrelated companies) is not
 * who runs them, so their name ties nothing.
 */
export const operatorName = (person: { name: string; title?: string } | undefined): string | undefined =>
  person && !/registered agent/i.test(person.title ?? "") ? person.name : undefined;

const phoneKey = (p: string) => {
  const d = p.replace(/\D/g, "").slice(-10);
  return d.length === 10 ? d : undefined;
};
const emailKey = (e: string) => e.trim().toLowerCase() || undefined;

/**
 * The owners run by the same people, by owner id; an owner on its own has no
 * entry. Two companies are tied by being one company family, or by naming the
 * same decision maker with something else in common: one mailing address, a
 * phone or an email. The name by itself is not enough, however rare it looks:
 * shown as one line and sent to Leads as one lead, two strangers of one name
 * would be a wrong call to make. A shared phone or email ties any two owners, unless the
 * line is shared by people known to be different (a brokerage's front desk, a
 * registered agent's office): then only those of the same name are tied, and
 * an owner with no name stays out, since there is no telling whose it is.
 */
export function operatorGroups(owners: OperatorOwner[]): Map<string, OperatorGroup> {
  const parent = new Map<string, string>(owners.map((o) => [o.id, o.id]));
  const root = (id: string): string => {
    let r = id;
    while (parent.get(r) !== r) r = parent.get(r)!;
    parent.set(id, r);
    return r;
  };
  const edges: Array<[string, OperatorTie]> = [];
  const tie = (ids: string[], by: OperatorTie) => {
    if (ids.length < 2) return;
    for (const id of ids.slice(1)) parent.set(root(id), root(ids[0]));
    edges.push([ids[0], by]);
  };
  const buckets = <T,>(items: T[], keyOf: (item: T) => Array<string | undefined>, idOf: (item: T) => string) => {
    const out = new Map<string, string[]>();
    for (const item of items) {
      for (const key of new Set(keyOf(item))) {
        if (key === undefined) continue;
        const ids = out.get(key);
        if (ids) ids.push(idOf(item));
        else out.set(key, [idOf(item)]);
      }
    }
    return out;
  };
  const id = (o: OperatorOwner) => o.id;
  const companies = owners.filter((o) => o.company);
  for (const ids of buckets(companies, (o) => [personKey(o.person)], id).values()) {
    if (ids.length < 2) continue;
    const named = ids.map((x) => companies.find((o) => o.id === x)!);
    const lines = (o: OperatorOwner) => [o.mailing ? `m:${o.mailing}` : undefined, ...o.phones.map((p) => `p:${phoneKey(p)}`), ...o.emails.map((e) => `e:${emailKey(e)}`)].filter((k) => k && !k.endsWith(":undefined"));
    // One person: the same name and the same address, number or email. The name on its own ties nothing.
    for (const same of buckets(named, lines, id).values()) tie(same, "person");
  }
  for (const ids of buckets(companies, (o) => [familyKey(o.name)], id).values()) tie(ids, "family");

  // Who each owner is, to tell a line two people share from one person's line on two owners.
  const who = new Map(owners.map((o) => [o.id, o.company ? personKey(o.person) : (personKey(o.name) ?? o.name.trim().toUpperCase())] as const));
  const shared = (lines: Map<string, string[]>, by: OperatorTie) => {
    for (const ids of lines.values()) {
      if (ids.length < 2) continue;
      const names = new Set(ids.map((x) => who.get(x)).filter((n) => n !== undefined));
      if (names.size <= 1) tie(ids, by);
      else for (const name of names) tie(ids.filter((x) => who.get(x) === name), by);
    }
  };
  shared(buckets(owners, (o) => o.phones.map(phoneKey), id), "phone");
  shared(buckets(owners, (o) => o.emails.map(emailKey), id), "email");

  const members = new Map<string, OperatorOwner[]>();
  for (const o of owners) {
    const r = root(o.id);
    const list = members.get(r);
    if (list) list.push(o);
    else members.set(r, [o]);
  }
  const ties = new Map<string, Set<OperatorTie>>();
  for (const [at, by] of edges) {
    const r = root(at);
    ties.set(r, (ties.get(r) ?? new Set()).add(by));
  }
  const ORDER: OperatorTie[] = ["person", "phone", "email", "family"];
  const out = new Map<string, OperatorGroup>();
  for (const [r, list] of members) {
    if (list.length < 2) continue;
    // The name most of its companies give; the first seen breaks a tie.
    const counts = new Map<string, { name: string; n: number }>();
    for (const o of list) {
      const key = o.company ? personKey(o.person) : undefined;
      if (!key) continue;
      const seen = counts.get(key);
      if (seen) seen.n++;
      else counts.set(key, { name: o.person!.trim(), n: 1 });
    }
    const person = [...counts.values()].sort((a, b) => b.n - a.n)[0]?.name;
    const ids = list.map((o) => o.id);
    const group: OperatorGroup = { key: [...ids].sort()[0], ids, ties: ORDER.filter((t) => ties.get(r)?.has(t)), ...(person ? { person } : {}) };
    for (const x of ids) out.set(x, group);
  }
  return out;
}
