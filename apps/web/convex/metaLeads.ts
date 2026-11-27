import { v } from "convex/values";
import { internal } from "./_generated/api";
import { internalAction, internalMutation, internalQuery } from "./_generated/server";
import { nowIso } from "./lib/access";
import { graphGet, metaToken } from "./ads";

/**
 * Leads from the Meta instant forms, into intake (intake.receive) the same way a webhook's lead comes in: checked for
 * a repeat by Meta's lead id, flagged when the phone was seen lately, logged, and staff told. Every few minutes
 * (crons.ts) the Page's forms are asked for leads newer than the last one taken, with the Page's own token; nothing
 * is set up in Meta for it. The lead keeps the ad it came from, so it arrives as that ad's trade.
 */

/** How far back the first look goes, so leads from before this was switched on come in too. */
const FIRST_LOOK_DAYS = 30;

export const since = internalQuery({
  args: {},
  handler: async (ctx) => {
    const row = (await ctx.db.query("adSettings").take(1))[0];
    return { pageId: row?.pageId, since: row?.metaLeadsSince };
  },
});

export const setSince = internalMutation({
  args: { since: v.string() },
  handler: async (ctx, { since }) => {
    const row = (await ctx.db.query("adSettings").take(1))[0];
    if (row && (!row.metaLeadsSince || since > row.metaLeadsSince)) await ctx.db.patch(row._id, { metaLeadsSince: since, updatedAt: nowIso() });
  },
});

type MetaLead = {
  id: string;
  created_time?: string;
  form_id?: string;
  ad_name?: string;
  adset_name?: string;
  campaign_name?: string;
  field_data?: Array<{ name: string; values?: string[] }>;
};

export const pull = internalAction({
  args: {},
  handler: async (ctx): Promise<{ taken: number; repeats: number; error?: string }> => {
    const token = await metaToken(ctx);
    const { pageId, since: last } = await ctx.runQuery(internal.metaLeads.since, {});
    if (!token || !pageId) return { taken: 0, repeats: 0 };
    let taken = 0;
    let repeats = 0;
    let newest = last;
    try {
      const pages = await graphGet("me/accounts?fields=id,access_token&limit=50", token);
      const pageToken: string | undefined = (pages?.data ?? []).find((p: { id: string }) => String(p.id) === pageId)?.access_token;
      if (!pageToken) return { taken, repeats, error: "The token can't reach the Page" };
      // A minute's overlap with the last look: a lead seen twice is a repeat (intake.receive), never a second lead.
      const from = Math.floor((last ? Date.parse(last) - 60_000 : Date.now() - FIRST_LOOK_DAYS * 86_400_000) / 1000);
      const forms = await graphGet(`${pageId}/leadgen_forms?fields=id,name&limit=100`, pageToken);
      for (const form of forms?.data ?? []) {
        const filtering = JSON.stringify([{ field: "time_created", operator: "GREATER_THAN", value: from }]);
        let next: string | undefined = `${form.id}/leads?fields=id,created_time,form_id,ad_name,adset_name,campaign_name,field_data&limit=100&filtering=${encodeURIComponent(filtering)}`;
        for (let page = 0; next && page < 10; page++) {
          const got = await graphGet(next, pageToken);
          for (const lead of (got?.data ?? []) as MetaLead[]) {
            const payload = { ...lead, leadgen_id: lead.id, form_id: lead.form_id ?? form.id, form_name: form.name };
            const r = await ctx.runMutation(internal.intake.receive, { payload, source: "meta" });
            // A repeat here is this look's own minute of overlap seeing the last lead again: counted, not logged, so the
            // webhook hits don't fill with the same lead every few minutes.
            if (r.repeat) repeats++;
            else {
              taken++;
              await ctx.runMutation(internal.intake.log, {
                outcome: "accepted",
                reason: r.duplicate ? "Same phone as another lead: flagged" : undefined,
                source: "meta",
                externalId: r.externalId,
                intakeLeadId: r.id,
                summary: r.summary,
              });
            }
            if (lead.created_time) {
              const at = new Date(lead.created_time).toISOString();
              if (!newest || at > newest) newest = at;
            }
          }
          // The next page, as a path from the version on.
          const url: string | undefined = got?.paging?.next;
          next = url ? url.replace(/^https:\/\/graph\.facebook\.com\/v[\d.]+\//, "").replace(/([?&])access_token=[^&]*&?/, "$1") : undefined;
        }
      }
    } catch (e) {
      console.error("meta leads", e instanceof Error ? e.message : String(e));
      return { taken, repeats, error: e instanceof Error ? e.message : String(e) };
    } finally {
      if (newest && newest !== last) await ctx.runMutation(internal.metaLeads.setSince, { since: newest });
    }
    return { taken, repeats };
  },
});

/** What Meta shows for each of the Page's forms, from the deployment: to see why a lead didn't come in. */
export const peek = internalAction({
  args: {},
  handler: async (ctx) => {
    const token = await metaToken(ctx);
    const { pageId, since: last } = await ctx.runQuery(internal.metaLeads.since, {});
    if (!token || !pageId) return { error: "No token or Page" };
    try {
      const pages = await graphGet("me/accounts?fields=id,name,access_token&limit=50", token);
      const page = (pages?.data ?? []).find((p: { id: string }) => String(p.id) === pageId);
      if (!page?.access_token) return { error: "The token can't reach the Page", pages: (pages?.data ?? []).map((p: { id: string; name: string }) => `${p.id} ${p.name}`) };
      const forms = await graphGet(`${pageId}/leadgen_forms?fields=id,name,status,leads_count,created_time&limit=100`, page.access_token);
      const out = [];
      for (const f of forms?.data ?? []) {
        let leads: unknown;
        try {
          const got = await graphGet(`${f.id}/leads?fields=id,created_time&limit=5`, page.access_token);
          leads = (got?.data ?? []).map((l: { id: string; created_time: string }) => `${l.id} ${l.created_time}`);
        } catch (e) {
          leads = e instanceof Error ? e.message : String(e);
        }
        out.push({ id: f.id, name: f.name, status: f.status, count: f.leads_count, leads });
      }
      return { page: page.name ?? pageId, since: last, forms: out };
    } catch (e) {
      return { error: e instanceof Error ? e.message : String(e) };
    }
  },
});
