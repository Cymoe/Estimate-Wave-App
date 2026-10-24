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
import type * as bids from "../bids.js";
import type * as catalog_starterCatalog from "../catalog/starterCatalog.js";
import type * as clients from "../clients.js";
import type * as costCodes from "../costCodes.js";
import type * as crons from "../crons.js";
import type * as estimates from "../estimates.js";
import type * as expenses from "../expenses.js";
import type * as funding from "../funding.js";
import type * as http from "../http.js";
import type * as industries from "../industries.js";
import type * as leadCity from "../leadCity.js";
import type * as leads from "../leads.js";
import type * as lib_access from "../lib/access.js";
import type * as lib_auction from "../lib/auction.js";
import type * as lib_awards from "../lib/awards.js";
import type * as lib_categories from "../lib/categories.js";
import type * as lib_cleanup from "../lib/cleanup.js";
import type * as lib_contract from "../lib/contract.js";
import type * as lib_contractDefaults from "../lib/contractDefaults.js";
import type * as lib_counties from "../lib/counties.js";
import type * as lib_documents from "../lib/documents.js";
import type * as lib_funding from "../lib/funding.js";
import type * as lib_leadCity from "../lib/leadCity.js";
import type * as lib_organizations from "../lib/organizations.js";
import type * as lib_plan from "../lib/plan.js";
import type * as lib_priceBook from "../lib/priceBook.js";
import type * as lib_sales from "../lib/sales.js";
import type * as lib_wallet from "../lib/wallet.js";
import type * as lineItems from "../lineItems.js";
import type * as marketplace from "../marketplace.js";
import type * as organizations from "../organizations.js";
import type * as pricingModes from "../pricingModes.js";
import type * as projects from "../projects.js";
import type * as publicEstimates from "../publicEstimates.js";
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
  bids: typeof bids;
  "catalog/starterCatalog": typeof catalog_starterCatalog;
  clients: typeof clients;
  costCodes: typeof costCodes;
  crons: typeof crons;
  estimates: typeof estimates;
  expenses: typeof expenses;
  funding: typeof funding;
  http: typeof http;
  industries: typeof industries;
  leadCity: typeof leadCity;
  leads: typeof leads;
  "lib/access": typeof lib_access;
  "lib/auction": typeof lib_auction;
  "lib/awards": typeof lib_awards;
  "lib/categories": typeof lib_categories;
  "lib/cleanup": typeof lib_cleanup;
  "lib/contract": typeof lib_contract;
  "lib/contractDefaults": typeof lib_contractDefaults;
  "lib/counties": typeof lib_counties;
  "lib/documents": typeof lib_documents;
  "lib/funding": typeof lib_funding;
  "lib/leadCity": typeof lib_leadCity;
  "lib/organizations": typeof lib_organizations;
  "lib/plan": typeof lib_plan;
  "lib/priceBook": typeof lib_priceBook;
  "lib/sales": typeof lib_sales;
  "lib/wallet": typeof lib_wallet;
  lineItems: typeof lineItems;
  marketplace: typeof marketplace;
  organizations: typeof organizations;
  pricingModes: typeof pricingModes;
  projects: typeof projects;
  publicEstimates: typeof publicEstimates;
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
