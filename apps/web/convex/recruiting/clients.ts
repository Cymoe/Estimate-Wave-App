// Clients: the companies National Sales Registry hires for. Managed from
//   Ops → Recruiting (staff), or npx convex run recruiting/clients:create
//   and recruiting/clients:list

import { v } from "convex/values";
import type { Doc, Id } from "../_generated/dataModel";
import { internalMutation, internalQuery, type MutationCtx, type QueryCtx } from "../_generated/server";

/** A client's short name: "Acme Roofing" → "acme". In source ad ids and the apply page's address. */
export const slugOf = (name: string) =>
  name
    .toLowerCase()
    .replace(/[^a-z0-9 ]/g, "")
    .split(/\s+/)
    .filter((w) => w && !["the", "and", "of", "llc", "inc", "co"].includes(w))[0]
    ?.slice(0, 10) || "client";

/** A slug no other client has: "acme", then "acme2", "acme3". */
export async function uniqueSlug(ctx: QueryCtx, name: string, self?: Id<"recruitClients">): Promise<string> {
  const base = slugOf(name);
  for (let n = 1; ; n++) {
    const slug = n === 1 ? base : `${base}${n}`;
    const taken = await ctx.db.query("recruitClients").withIndex("by_slug", (q) => q.eq("slug", slug)).first();
    if (!taken || taken._id === self) return slug;
  }
}

/** The client behind /jobs/<slug>. Clients saved before slugs were handed out match on their name's slug. */
export async function clientBySlug(ctx: QueryCtx, slug: string): Promise<Doc<"recruitClients"> | null> {
  const s = slug.trim().toLowerCase();
  if (!s) return null;
  const hit = await ctx.db.query("recruitClients").withIndex("by_slug", (q) => q.eq("slug", s)).first();
  if (hit) return hit;
  return (await ctx.db.query("recruitClients").collect()).find((c) => !c.slug && slugOf(c.name) === s) ?? null;
}

/** Hands a client its slug and its hires link token if it has none yet. */
export async function ensureLinks(ctx: MutationCtx, clientId: Id<"recruitClients">): Promise<Doc<"recruitClients">> {
  const c = (await ctx.db.get(clientId))!;
  const patch: Partial<Doc<"recruitClients">> = {};
  if (!c.slug) patch.slug = await uniqueSlug(ctx, c.name, c._id);
  if (!c.hiresToken) patch.hiresToken = crypto.randomUUID().replace(/-/g, "");
  if (Object.keys(patch).length) await ctx.db.patch(clientId, patch);
  return { ...c, ...patch };
}

const fields = {
  name: v.string(),
  role: v.string(),
  city: v.string(),
  compSheet: v.string(),
  calEventLink: v.string(),
  calEventTypeId: v.optional(v.number()),
  timezone: v.string(),
  reportEmail: v.optional(v.string()),
  // For the ad agent (ad-brief.md, "Inputs per client").
  territory: v.optional(v.string()),
  repStories: v.optional(v.array(v.string())),
  perks: v.optional(v.string()),
  wants: v.optional(v.string()),
  adsEnabled: v.optional(v.boolean()),
};

export function checkTimezone(timezone: string) {
  try {
    new Intl.DateTimeFormat("en-US", { timeZone: timezone });
  } catch {
    throw new Error(`"${timezone}" isn't a timezone; use one like "America/Chicago"`);
  }
}

export const create = internalMutation({
  args: fields,
  handler: async (ctx, args) => {
    checkTimezone(args.timezone);
    const id = await ctx.db.insert("recruitClients", { ...args, active: true, createdAt: new Date().toISOString() });
    await ensureLinks(ctx, id);
    return { clientId: id, note: "Use this clientId when posting applicants to /recruiting/apply." };
  },
});

export const update = internalMutation({
  args: {
    clientId: v.id("recruitClients"),
    name: v.optional(v.string()),
    role: v.optional(v.string()),
    city: v.optional(v.string()),
    compSheet: v.optional(v.string()),
    calEventLink: v.optional(v.string()),
    calEventTypeId: v.optional(v.number()),
    timezone: v.optional(v.string()),
    reportEmail: v.optional(v.string()),
    active: v.optional(v.boolean()),
    territory: v.optional(v.string()),
    repStories: v.optional(v.array(v.string())),
    perks: v.optional(v.string()),
    wants: v.optional(v.string()),
    adsEnabled: v.optional(v.boolean()),
  },
  handler: async (ctx, { clientId, ...patch }) => {
    if (patch.timezone) checkTimezone(patch.timezone);
    const set = Object.fromEntries(Object.entries(patch).filter(([, val]) => val !== undefined));
    await ctx.db.patch(clientId, set);
    await ensureLinks(ctx, clientId);
  },
});

export const list = internalQuery({
  args: {},
  handler: async (ctx) =>
    (await ctx.db.query("recruitClients").collect()).map((c) => ({ clientId: c._id, name: c.name, role: c.role, city: c.city, timezone: c.timezone, active: c.active, reportEmail: c.reportEmail, adsEnabled: c.adsEnabled === true, hiresToken: c.hiresToken })),
});

/** The client's hires link token, made if it has none: for the weekly report. */
export const links = internalMutation({
  args: { clientId: v.id("recruitClients") },
  handler: async (ctx, { clientId }): Promise<string> => (await ensureLinks(ctx, clientId)).hiresToken!,
});
