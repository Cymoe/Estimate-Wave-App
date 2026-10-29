import { v } from "convex/values";
import type { Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx } from "./_generated/server";
import { fail, nowIso, requireMember } from "./lib/access";
import { languageField } from "./schema";

// A company's crew: the people it puts on jobs, its own and its subs. They
// don't have Tolliver accounts; tasks are assigned to them and the company
// can text them their work.

const clean = (s: string | undefined, max: number) => s?.trim().slice(0, max) || undefined;

const crewFields = { name: v.string(), phone: v.optional(v.string()), email: v.optional(v.string()), trade: v.optional(v.string()), language: languageField };

/** A crew member of the signed-in member's company. */
export async function ownedCrew(ctx: MutationCtx, id: Id<"crew">) {
  const person = await ctx.db.get(id);
  if (person === null) fail("NOT_FOUND", "Not found");
  await requireMember(ctx, person.organizationId).catch(() => fail("NOT_FOUND", "Not found"));
  return person;
}

export const list = query({
  args: { organizationId: v.id("organizations"), includeArchived: v.optional(v.boolean()) },
  handler: async (ctx, { organizationId, includeArchived }) => {
    await requireMember(ctx, organizationId);
    const people = await ctx.db.query("crew").withIndex("by_organization", (q) => q.eq("organizationId", organizationId)).take(500);
    return people
      .filter((p) => includeArchived || !p.archivedAt)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((p) => ({ id: p._id, name: p.name, phone: p.phone, email: p.email, trade: p.trade, language: p.language, archived: Boolean(p.archivedAt) }));
  },
});

export const add = mutation({
  args: { organizationId: v.id("organizations"), ...crewFields },
  handler: async (ctx, { organizationId, ...data }) => {
    await requireMember(ctx, organizationId);
    const name = clean(data.name, 120);
    if (!name) fail("INVALID", "Add their name");
    const now = nowIso();
    return await ctx.db.insert("crew", {
      organizationId,
      name,
      phone: clean(data.phone, 40),
      email: clean(data.email, 200),
      trade: clean(data.trade, 80),
      language: data.language,
      createdAt: now,
      updatedAt: now,
    });
  },
});

export const update = mutation({
  args: { id: v.id("crew"), ...crewFields },
  handler: async (ctx, { id, ...data }) => {
    await ownedCrew(ctx, id);
    const name = clean(data.name, 120);
    if (!name) fail("INVALID", "Add their name");
    await ctx.db.patch(id, { name, phone: clean(data.phone, 40), email: clean(data.email, 200), trade: clean(data.trade, 80), language: data.language, updatedAt: nowIso() });
    return null;
  },
});

/** Takes someone off the crew list. Tasks they were on keep showing their name. */
export const archive = mutation({
  args: { id: v.id("crew"), archived: v.boolean() },
  handler: async (ctx, { id, archived }) => {
    await ownedCrew(ctx, id);
    const now = nowIso();
    await ctx.db.patch(id, { archivedAt: archived ? now : undefined, updatedAt: now });
    return null;
  },
});
