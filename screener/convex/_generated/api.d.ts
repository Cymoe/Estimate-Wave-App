/* eslint-disable */
/**
 * Generated `api` utility.
 *
 * THIS CODE IS AUTOMATICALLY GENERATED.
 *
 * To regenerate, run `npx convex dev`.
 * @module
 */

import type * as agent from "../agent.js";
import type * as applicants from "../applicants.js";
import type * as clients from "../clients.js";
import type * as crons from "../crons.js";
import type * as followups from "../followups.js";
import type * as http from "../http.js";
import type * as lib_brief from "../lib/brief.js";
import type * as lib_calcom from "../lib/calcom.js";
import type * as lib_claude from "../lib/claude.js";
import type * as lib_email from "../lib/email.js";
import type * as lib_sms from "../lib/sms.js";
import type * as lib_time from "../lib/time.js";
import type * as reports from "../reports.js";
import type * as tools from "../tools.js";

import type {
  ApiFromModules,
  FilterApi,
  FunctionReference,
} from "convex/server";

declare const fullApi: ApiFromModules<{
  agent: typeof agent;
  applicants: typeof applicants;
  clients: typeof clients;
  crons: typeof crons;
  followups: typeof followups;
  http: typeof http;
  "lib/brief": typeof lib_brief;
  "lib/calcom": typeof lib_calcom;
  "lib/claude": typeof lib_claude;
  "lib/email": typeof lib_email;
  "lib/sms": typeof lib_sms;
  "lib/time": typeof lib_time;
  reports: typeof reports;
  tools: typeof tools;
}>;

/**
 * A utility for referencing Convex functions in your app's public API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = api.myModule.myFunction;
 * ```
 */
export declare const api: FilterApi<
  typeof fullApi,
  FunctionReference<any, "public">
>;

/**
 * A utility for referencing Convex functions in your app's internal API.
 *
 * Usage:
 * ```js
 * const myFunctionReference = internal.myModule.myFunction;
 * ```
 */
export declare const internal: FilterApi<
  typeof fullApi,
  FunctionReference<any, "internal">
>;

export declare const components: {};
