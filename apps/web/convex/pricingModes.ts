import { v } from "convex/values";
import type { Doc } from "./_generated/dataModel";
import { mutation, query } from "./_generated/server";
import { fail, nowIso, pick, requireMember, requireUser } from "./lib/access";
import { pricingModeFields } from "./schema";

function present(mode: Doc<"pricingModes">) {
  return {
    ...mode,
    id: mode._id,
    win_rate:
      mode.total_estimates > 0 ? Math.round((mode.successful_estimates / mode.total_estimates) * 100) : undefined,
  };
}

/** Active presets plus the organization's own modes. */
export const list = query({
  args: { organizationId: v.optional(v.id("organizations")) },
  handler: async (ctx, { organizationId }) => {
    if (organizationId !== undefined) await requireMember(ctx, organizationId);
    else await requireUser(ctx);
    const presets = await ctx.db
      .query("pricingModes")
      .withIndex("by_preset", (q) => q.eq("is_preset", true))
      .take(200);
    const own =
      organizationId === undefined
        ? []
        : await ctx.db
            .query("pricingModes")
            .withIndex("by_organization", (q) => q.eq("organization_id", organizationId))
            .take(200);
    return [...presets, ...own]
      .filter((mode) => mode.is_active)
      .sort((a, b) => Number(b.is_preset) - Number(a.is_preset) || b.usage_count - a.usage_count)
      .map(present);
  },
});

export const presets = query({
  args: {},
  handler: async (ctx) => {
    await requireUser(ctx);
    const modes = await ctx.db
      .query("pricingModes")
      .withIndex("by_preset", (q) => q.eq("is_preset", true))
      .take(200);
    return modes
      .filter((mode) => mode.is_active)
      .sort((a, b) => a.name.localeCompare(b.name))
      .map((mode) => ({ ...mode, id: mode._id }));
  },
});

export const create = mutation({
  args: { organizationId: v.id("organizations"), data: v.any() },
  handler: async (ctx, { organizationId, data }) => {
    await requireMember(ctx, organizationId);
    const fields = pick(data, pricingModeFields);
    if (typeof fields.name !== "string" || fields.name.trim() === "") fail("INVALID", "Name is required");
    const now = nowIso();
    const id = await ctx.db.insert("pricingModes", {
      adjustments: {},
      is_active: true,
      ...(fields as { name: string }),
      is_preset: false,
      usage_count: 0,
      successful_estimates: 0,
      total_estimates: 0,
      organization_id: organizationId,
      created_at: now,
      updated_at: now,
    });
    return present((await ctx.db.get(id))!);
  },
});
