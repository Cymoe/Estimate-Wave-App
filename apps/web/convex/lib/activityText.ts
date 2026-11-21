// What an activity row says in the Activity panel and page, in words.
// Pure: no Convex reads, so it's easy to test; activityLogs.feed adds who
// did it and where the row links.

type Details = Record<string, unknown>;

export type ActivityIcon = "plus" | "edit" | "trash" | "send" | "sign" | "check" | "x" | "money" | "photo" | "task" | "alert" | "bot" | "activity";
export type ActivityTone = "blue" | "green" | "red" | "amber" | "gray" | "purple";

/** Done by the client on their link or portal, though stored under the company user who owns the estimate. */
export const CLIENT_ACTIONS = new Set([
  "accepted_by_client",
  "declined_by_client",
  "selection_picked",
  "warranty_requested",
  "change_order_signed",
  "affidavit_signed",
  "referral_received",
]);

const TYPE_NAMES: Record<string, string> = {
  estimate: "estimate",
  project: "project",
  lead: "lead",
  client: "client",
  purchase_order: "purchase order",
  expense: "expense",
  project_template: "template",
  organization: "company",
  assistant: "assistant",
};

const str = (d: Details, key: string): string | undefined => {
  const v = d[key];
  return typeof v === "string" && v.trim() ? v.trim() : typeof v === "number" ? String(v) : undefined;
};
const num = (d: Details, key: string): number | undefined => (typeof d[key] === "number" && Number.isFinite(d[key]) ? (d[key] as number) : undefined);
const dollars = (n: number) => `$${n.toLocaleString("en-US", { minimumFractionDigits: n % 1 ? 2 : 0, maximumFractionDigits: 2 })}`;
const cents = (n: number | undefined) => (n === undefined ? undefined : dollars(n / 100));
const paren = (s: string | undefined) => (s ? ` (${s})` : "");
const quote = (s: string | undefined, max = 80) => (s ? ` “${s.length > max ? `${s.slice(0, max - 1)}…` : s}”` : "");

const ESTIMATE_STATUS: Record<string, string> = {
  draft: "draft",
  sent: "sent",
  opened: "opened",
  accepted: "accepted",
  rejected: "declined",
  expired: "expired",
};

/** The sentence for a row: "Created estimate EST-0012 ($8,400)". */
export function describe(row: { action: string; resourceType: string; details?: unknown }): { text: string; icon: ActivityIcon; tone: ActivityTone } {
  const d: Details = row.details && typeof row.details === "object" ? (row.details as Details) : {};
  const type = TYPE_NAMES[row.resourceType] ?? row.resourceType.replace(/_/g, " ");
  const est = str(d, "estimateNumber");
  const estimate = est ? `estimate ${est}` : "an estimate";
  // The thing's own name: an estimate's number, a PO's number and title, a lead's or project's name.
  const label =
    row.resourceType === "estimate"
      ? (est ?? "")
      : row.resourceType === "purchase_order"
        ? [str(d, "number"), str(d, "title")].filter(Boolean).join(" · ")
        : row.resourceType === "expense"
          ? (str(d, "description") ?? "")
          : (str(d, "name") ?? "");
  const named = (verb: string) => `${verb} ${type}${label ? ` ${label}` : ""}`;

  switch (row.action) {
    case "created":
      if (row.resourceType === "purchase_order" && num(d, "count") !== undefined)
        return { text: `Built ${num(d, "count")} purchase order${num(d, "count") === 1 ? "" : "s"}${str(d, "from") ? ` from ${str(d, "from")}` : ""}`, icon: "plus", tone: "blue" };
      if (row.resourceType === "client" && d.fromLead) return { text: `Turned lead ${str(d, "name") ?? ""} into a client`.trim(), icon: "plus", tone: "blue" };
      return {
        text:
          named("Created") +
          paren(num(d, "totalAmount") !== undefined ? dollars(num(d, "totalAmount")!) : num(d, "amount") !== undefined ? dollars(num(d, "amount")!) : undefined),
        icon: "plus",
        tone: "blue",
      };
    case "deleted":
      return { text: named("Deleted"), icon: "trash", tone: "red" };
    case "status_changed": {
      const to = str(d, "to");
      return { text: `Marked ${type} ${ESTIMATE_STATUS[to ?? ""] ?? to ?? "changed"}`, icon: "edit", tone: "gray" };
    }
    case "approved":
      return { text: `Accepted ${estimate} for the client`, icon: "check", tone: "green" };
    case "signed":
      return { text: `Signed ${estimate}`, icon: "sign", tone: "green" };
    case "accepted_by_client":
      return { text: `Signed ${estimate}`, icon: "sign", tone: "green" };
    case "declined_by_client":
      return { text: `Declined ${estimate}`, icon: "x", tone: "red" };
    case "emailed_to_client":
      return { text: `Emailed ${estimate}${str(d, "to") ? ` to ${str(d, "to")}` : ""}`, icon: "send", tone: "blue" };
    case "email_failed":
      return { text: `Couldn’t email ${estimate}${str(d, "error") ? `: ${str(d, "error")}` : ""}`, icon: "alert", tone: "red" };
    case "reminder_sent":
      return { text: `Reminded the client about ${estimate}`, icon: "send", tone: "gray" };
    case "reminder_failed":
      return { text: `Couldn’t send the reminder about ${estimate}`, icon: "alert", tone: "amber" };
    case "sent_for_signature":
      return { text: `Sent the ${d.kind === "affidavit" ? "completion sign-off" : "change order"} on ${estimate} for signature`, icon: "send", tone: "blue" };
    case "change_order_signed":
      return { text: `Signed change order ${str(d, "number") ?? ""} on ${estimate}`.replace("  ", " "), icon: "sign", tone: "green" };
    case "affidavit_signed":
      return { text: `Signed off the finished job (${estimate})`, icon: "sign", tone: "green" };
    case "selection_picked":
      return { text: `Picked ${str(d, "product") ?? "a selection"} for ${str(d, "item") ?? "a line"}`, icon: "check", tone: "purple" };
    case "selection_approved":
      return { text: `Approved ${str(d, "product") ?? "the pick"} for ${str(d, "item") ?? "a line"}${paren(num(d, "unitPrice") !== undefined ? `${dollars(num(d, "unitPrice")!)} each` : undefined)}`, icon: "check", tone: "green" };
    case "warranty_requested":
      return { text: `Asked for warranty service${quote(str(d, "note"))}`, icon: "alert", tone: "amber" };
    case "photo_added":
      return { text: `Added a photo to the ${type}`, icon: "photo", tone: "gray" };
    case "photo_removed":
      return { text: `Removed a photo from the ${type}`, icon: "photo", tone: "gray" };
    case "task_added":
      return { text: `Added task${quote(str(d, "title"))}`, icon: "task", tone: "gray" };
    case "task_done":
      return { text: `Finished task${quote(str(d, "title"))}`, icon: "check", tone: "green" };
    case "ordered":
      return { text: `Ordered ${label || "a purchase order"}${paren(num(d, "total") !== undefined ? dollars(num(d, "total")!) : undefined)}`, icon: "send", tone: "blue" };
    case "received":
      return { text: `Received ${label || "a purchase order"}${paren(num(d, "amount") !== undefined ? dollars(num(d, "amount")!) : undefined)}`, icon: "check", tone: "green" };
    case "cancelled":
      return { text: named("Cancelled"), icon: "x", tone: "gray" };
    case "lead_delivered":
      return { text: `Got lead ${str(d, "name") ?? ""}${paren(cents(num(d, "priceCents")))}`.replace("  ", " "), icon: "plus", tone: "green" };
    case "referral_received":
      return { text: `Referred ${str(d, "name") ?? "a friend"}`, icon: "plus", tone: "purple" };
    case "referral_reward_given":
      return { text: `Gave the referral reward for ${str(d, "name") ?? "a lead"}`, icon: "money", tone: "green" };
    case "credit_requested":
      return { text: `Asked for credit on lead ${str(d, "name") ?? ""}`.trim(), icon: "money", tone: "amber" };
    case "credit_given":
      return { text: `Got ${cents(num(d, "amountCents")) ?? "credit"} back for lead ${str(d, "name") ?? ""}`.trim(), icon: "money", tone: "green" };
    case "funding_paid":
      return { text: `Added ${cents(num(d, "amountCents")) ?? "funds"} to the lead balance`, icon: "money", tone: "green" };
    case "plan_started":
      return { text: `Started the monthly plan${paren(num(d, "monthlyCents") !== undefined ? `${cents(num(d, "monthlyCents"))}/mo` : undefined)}`, icon: "money", tone: "blue" };
    case "plan_cancelled":
      return { text: "Cancelled the monthly plan", icon: "x", tone: "gray" };
    case "assistant_connected":
      return { text: `Connected ${d.app === "chatgpt" ? "ChatGPT" : d.app === "claude" ? "Claude" : "an assistant"}`, icon: "bot", tone: "purple" };
    case "assistant_updated":
      return { text: "Changed an assistant’s spending", icon: "bot", tone: "gray" };
    case "assistant_disconnected":
      return { text: `Disconnected ${d.app === "chatgpt" ? "ChatGPT" : d.app === "claude" ? "Claude" : "an assistant"}`, icon: "bot", tone: "gray" };
    case "bought_lead":
      return { text: `Bought a lead${paren(cents(num(d, "amountCents")))}`, icon: "money", tone: "green" };
    case "claimed_lead":
      return { text: `Claimed a lead from the Vault${paren(cents(num(d, "amountCents")))}`, icon: "money", tone: "green" };
    case "placed_buy_order":
      return { text: `Placed a buy order${paren(cents(num(d, "amountCents")))}`, icon: "money", tone: "blue" };
    case "set_standing_bid":
      return { text: `Set a standing bid${paren(cents(num(d, "amountCents")))}`, icon: "money", tone: "blue" };
    case "updated":
      return { text: named("Updated"), icon: "edit", tone: "gray" };
    default:
      return { text: `${row.action.charAt(0).toUpperCase()}${row.action.slice(1).replace(/_/g, " ")} ${type}${label ? ` ${label}` : ""}`, icon: "activity", tone: "gray" };
  }
}
