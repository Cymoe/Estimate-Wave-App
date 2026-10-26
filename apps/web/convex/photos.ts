import { v } from "convex/values";
import type { Doc, Id } from "./_generated/dataModel";
import { mutation, query, type MutationCtx, type QueryCtx } from "./_generated/server";
import { fail, getOwned, logActivity, nowIso, requireMember } from "./lib/access";

// Job photos on an estimate or a project. A project's photos include the
// photos taken on its estimates.

export const MAX_PHOTO_BYTES = 15 * 1024 * 1024;
const PHOTO_TYPES = ["image/jpeg", "image/png", "image/webp", "image/heic", "image/heif", "image/gif"];

/** The image type, from the upload or the file name (iPhones sometimes send no type). */
function photoType(contentType: string | undefined, fileName: string) {
  if (contentType && contentType !== "application/octet-stream") return contentType.toLowerCase();
  const ext = fileName.toLowerCase().split(".").pop() ?? "";
  return { jpg: "image/jpeg", jpeg: "image/jpeg", png: "image/png", webp: "image/webp", heic: "image/heic", heif: "image/heif", gif: "image/gif" }[ext] ?? "";
}

/** The estimate or project a photo belongs to, checked against the signed-in member. */
async function owner(ctx: QueryCtx | MutationCtx, target: { estimateId?: Id<"estimates">; projectId?: Id<"projects"> }) {
  if ((target.estimateId === undefined) === (target.projectId === undefined)) fail("INVALID", "A photo goes on one estimate or one project");
  return target.estimateId !== undefined
    ? (await getOwned(ctx, "estimates", target.estimateId)).doc.organizationId
    : (await getOwned(ctx, "projects", target.projectId!)).doc.organizationId;
}

async function withUrl(ctx: QueryCtx, photo: Doc<"jobPhotos">, from?: string) {
  return {
    id: photo._id,
    url: (await ctx.storage.getUrl(photo.storageId)) ?? undefined,
    fileName: photo.fileName,
    caption: photo.caption,
    createdAt: photo.createdAt,
    estimateId: photo.estimateId,
    projectId: photo.projectId,
    from,
  };
}

export const uploadUrl = mutation({
  args: { organizationId: v.id("organizations") },
  handler: async (ctx, { organizationId }) => {
    await requireMember(ctx, organizationId);
    return await ctx.storage.generateUploadUrl();
  },
});

/** Files an uploaded image on an estimate or a project. */
export const add = mutation({
  args: {
    storageId: v.id("_storage"),
    fileName: v.string(),
    estimateId: v.optional(v.id("estimates")),
    projectId: v.optional(v.id("projects")),
    caption: v.optional(v.string()),
  },
  handler: async (ctx, { storageId, fileName, estimateId, projectId, caption }) => {
    const organizationId = await owner(ctx, { estimateId, projectId });
    const { user } = await requireMember(ctx, organizationId);
    const file = await ctx.db.system.get(storageId);
    if (file === null) fail("NOT_FOUND", "The uploaded file wasn't found");
    const type = photoType(file.contentType, fileName);
    if (!PHOTO_TYPES.includes(type) || file.size > MAX_PHOTO_BYTES)
      fail("INVALID", "A photo must be a JPEG, PNG, HEIC or WebP image of 15MB or less");
    const id = await ctx.db.insert("jobPhotos", {
      organizationId,
      estimateId,
      projectId,
      storageId,
      fileName: fileName.slice(0, 200),
      contentType: type,
      size: file.size,
      caption: caption?.trim().slice(0, 300) || undefined,
      uploadedBy: user._id,
      createdAt: nowIso(),
    });
    await logActivity(ctx, { organizationId, userId: user._id, action: "photo_added", resourceType: estimateId ? "estimate" : "project", resourceId: estimateId ?? projectId, details: { fileName } });
    return id;
  },
});

/** An estimate's photos, or a project's with its estimates' photos, newest first. */
export const list = query({
  args: { estimateId: v.optional(v.id("estimates")), projectId: v.optional(v.id("projects")) },
  handler: async (ctx, { estimateId, projectId }) => {
    const organizationId = await owner(ctx, { estimateId, projectId });
    if (estimateId !== undefined) {
      const rows = await ctx.db.query("jobPhotos").withIndex("by_estimate", (q) => q.eq("estimateId", estimateId)).take(500);
      return await Promise.all(rows.sort((a, b) => b.createdAt.localeCompare(a.createdAt)).map((p) => withUrl(ctx, p)));
    }
    const own = await ctx.db.query("jobPhotos").withIndex("by_project", (q) => q.eq("projectId", projectId)).take(500);
    const estimates = (
      await ctx.db
        .query("estimates")
        .withIndex("by_organization_and_issue_date", (q) => q.eq("organizationId", organizationId))
        .take(2000)
    ).filter((e) => e.projectId === projectId);
    const fromEstimates: Array<[Doc<"jobPhotos">, string]> = [];
    for (const estimate of estimates)
      for (const p of await ctx.db.query("jobPhotos").withIndex("by_estimate", (q) => q.eq("estimateId", estimate._id)).take(500))
        fromEstimates.push([p, estimate.estimateNumber]);
    const all: Array<[Doc<"jobPhotos">, string | undefined]> = [...own.map((p) => [p, undefined] as [Doc<"jobPhotos">, undefined]), ...fromEstimates];
    return await Promise.all(all.sort((a, b) => b[0].createdAt.localeCompare(a[0].createdAt)).map(([p, from]) => withUrl(ctx, p, from)));
  },
});

async function ownPhoto(ctx: MutationCtx, id: Id<"jobPhotos">) {
  const photo = await ctx.db.get(id);
  if (photo === null) fail("NOT_FOUND", "Photo not found");
  const { user } = await requireMember(ctx, photo.organizationId);
  return { photo, user };
}

export const setCaption = mutation({
  args: { id: v.id("jobPhotos"), caption: v.string() },
  handler: async (ctx, { id, caption }) => {
    await ownPhoto(ctx, id);
    await ctx.db.patch(id, { caption: caption.trim().slice(0, 300) || undefined });
    return null;
  },
});

export const remove = mutation({
  args: { id: v.id("jobPhotos") },
  handler: async (ctx, { id }) => {
    const { photo, user } = await ownPhoto(ctx, id);
    await ctx.db.delete(id);
    if ((await ctx.db.system.get(photo.storageId)) !== null) await ctx.storage.delete(photo.storageId);
    await logActivity(ctx, { organizationId: photo.organizationId, userId: user._id, action: "photo_removed", resourceType: photo.estimateId ? "estimate" : "project", resourceId: photo.estimateId ?? photo.projectId, details: { fileName: photo.fileName } });
    return null;
  },
});

/** Deletes the photos on an estimate or a project, with their files (when it's deleted). */
export async function deletePhotos(ctx: MutationCtx, target: { estimateId?: Id<"estimates">; projectId?: Id<"projects"> }) {
  const rows =
    target.estimateId !== undefined
      ? await ctx.db.query("jobPhotos").withIndex("by_estimate", (q) => q.eq("estimateId", target.estimateId)).take(500)
      : await ctx.db.query("jobPhotos").withIndex("by_project", (q) => q.eq("projectId", target.projectId)).take(500);
  for (const p of rows) {
    await ctx.db.delete(p._id);
    if ((await ctx.db.system.get(p.storageId)) !== null) await ctx.storage.delete(p.storageId);
  }
}
