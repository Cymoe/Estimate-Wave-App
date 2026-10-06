/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";
import type * as activityLogs from "../activityLogs.js";
import type * as auth from "../auth.js";
import type * as catalog_starterCatalog from "../catalog/starterCatalog.js";
import type * as clients from "../clients.js";
import type * as costCodes from "../costCodes.js";
import type * as estimates from "../estimates.js";
import type * as http from "../http.js";
import type * as industries from "../industries.js";
import type * as invoices from "../invoices.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_documents from "../lib/documents.js";
import type * as lib_organizations from "../lib/organizations.js";
import type * as lib_priceBook from "../lib/priceBook.js";
import type * as lineItems from "../lineItems.js";
import type * as organizations from "../organizations.js";
import type * as pricingModes from "../pricingModes.js";
import type * as projects from "../projects.js";
import type * as seed from "../seed.js";
import type * as users from "../users.js";

/**
 * A utility for referencing Convex functions in your app's API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
declare const fullApi: ApiFromModules<{
  activityLogs: typeof activityLogs;
  auth: typeof auth;
  "catalog/starterCatalog": typeof catalog_starterCatalog;
  clients: typeof clients;
  costCodes: typeof costCodes;
  estimates: typeof estimates;
  http: typeof http;
  industries: typeof industries;
  invoices: typeof invoices;
  "lib/access": typeof lib_access;
  "lib/documents": typeof lib_documents;
  "lib/organizations": typeof lib_organizations;
  "lib/priceBook": typeof lib_priceBook;
  lineItems: typeof lineItems;
  organizations: typeof organizations;
  pricingModes: typeof pricingModes;
  projects: typeof projects;
  seed: typeof seed;
  users: typeof users;
}>;
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;
