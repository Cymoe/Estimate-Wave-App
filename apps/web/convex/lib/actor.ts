import type { ObjectType, PropertyValidators } from "convex/values";
import type { Id } from "../_generated/dataModel";
import type { MutationCtx, QueryCtx } from "../_generated/server";

// Some company functions are also used by assistants (Claude, ChatGPT)
// through the connector in mcp.ts. Their definitions are written once with
// queryDef / mutationDef: the public function registers it for the web app,
// and the connector runs the same handler for the user behind the
// connection, so both get the same checks, prices and hidden details.

export function queryDef<Args extends PropertyValidators, R>(def: {
  args: Args;
  handler: (ctx: QueryCtx, args: ObjectType<Args>) => Promise<R>;
}) {
  return def;
}

export function mutationDef<Args extends PropertyValidators, R>(def: {
  args: Args;
  handler: (ctx: MutationCtx, args: ObjectType<Args>) => Promise<R>;
}) {
  return def;
}

/**
 * The same ctx, signed in as `userId`. Only for code that has already
 * checked the connection's token: requireUser, requireMember and every
 * other check then see that user, exactly as on the web.
 */
export function actAs<C extends QueryCtx | MutationCtx>(ctx: C, userId: Id<"users">, connectionId: string): C {
  const identity = {
    subject: `${userId}|assistant:${connectionId}`,
    issuer: "fieldquote-assistant",
    tokenIdentifier: `fieldquote-assistant|${connectionId}`,
  };
  return { ...ctx, auth: { ...ctx.auth, getUserIdentity: async () => identity } };
}
