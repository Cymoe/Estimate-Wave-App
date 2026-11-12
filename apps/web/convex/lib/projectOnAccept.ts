import type { Doc, Id } from "../_generated/dataModel";
import type { MutationCtx } from "../_generated/server";
import { logActivity } from "./access";
import { jobName } from "./jobName";

/**
 * When an estimate is accepted it becomes a job: a new project, named the
 * way "Start a new project" names it, for the same client, with the
 * estimate's total as its budget. An estimate already on a project keeps it.
 * Returns the patch for the estimate (empty when nothing was made).
 */
export async function projectOnAccept(
  ctx: MutationCtx,
  estimate: Doc<"estimates">,
  userId: Id<"users">,
  now: string,
): Promise<{ projectId?: Id<"projects"> }> {
  if (estimate.projectId && (await ctx.db.get(estimate.projectId))) return {};
  const client = estimate.clientId ? await ctx.db.get(estimate.clientId) : null;
  const name = jobName({
    title: estimate.title,
    clientName: client?.companyName || client?.name,
    address: client?.address,
    estimateNumber: estimate.estimateNumber,
  });
  const projectId = await ctx.db.insert("projects", {
    name,
    status: "planning",
    ...(estimate.clientId ? { clientId: estimate.clientId } : {}),
    ...(estimate.totalAmount ? { budget: estimate.totalAmount } : {}),
    organizationId: estimate.organizationId,
    userId,
    createdAt: now,
    updatedAt: now,
  });
  await logActivity(ctx, {
    organizationId: estimate.organizationId,
    userId,
    action: "created",
    resourceType: "project",
    resourceId: projectId,
    details: { name, fromEstimate: estimate.estimateNumber },
  });
  return { projectId };
}
