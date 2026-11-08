// Clients: the companies National Sales Registry hires for. Managed from
//   Ops → Recruiting (staff), or npx convex run recruiting/clients:create
//   and recruiting/clients:list

import { v } from "convex/values";
import { internalMutation, internalQuery } from "../_generated/server";

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
    return { clientId: id, note: "Use this clientId when posting applicants to /apply." };
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
  },
});

export const list = internalQuery({
  args: {},
  handler: async (ctx) =>
    (await ctx.db.query("recruitClients").collect()).map((c) => ({ clientId: c._id, name: c.name, role: c.role, city: c.city, timezone: c.timezone, active: c.active, reportEmail: c.reportEmail, adsEnabled: c.adsEnabled === true })),
});
