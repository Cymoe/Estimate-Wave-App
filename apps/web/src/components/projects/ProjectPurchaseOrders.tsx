import React, { useCallback, useEffect, useState } from "react";
import {
  ChevronDown,
  ChevronRight,
  MoreVertical,
  Plus,
  Send,
  Share,
  Trash2,
} from "lucide-react";
import {
  purchaseOrdersAPI,
  purchaseOrderUrl,
  type PoLine,
  type ProjectOrders,
  type PurchaseOrder,
} from "../../lib/api";
import { formatCurrency } from "../../utils/format";
import { shareOrCopy } from "../estimates/estimateActions";

const errorText = (err: unknown) =>
  err instanceof Error && err.message ? err.message : "That didn't work.";
const field =
  "bg-[#0A0A0A] border border-[#333] px-2 py-1.5 text-sm text-white focus:outline-none focus:border-[#336699] disabled:opacity-60";
const primary =
  "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-[#336699] hover:bg-[#2a5580] text-white disabled:opacity-50";
const secondary =
  "inline-flex items-center gap-1.5 px-3 py-1.5 text-sm font-medium bg-[#262626] hover:bg-[#333] text-gray-200 disabled:opacity-50";
const round2 = (n: number) => Math.round(n * 100) / 100;
const number = (text: string) => {
  const n = Number(text.replace(/[$,]/g, ""));
  return Number.isFinite(n) ? n : NaN;
};

const PILL: Record<
  PurchaseOrder["status"],
  { label: string; className: string }
> = {
  draft: { label: "Draft", className: "bg-[#262626] text-gray-300" },
  ordered: { label: "Ordered", className: "bg-[#336699]/25 text-[#9cc2ea]" },
  received: { label: "Received", className: "bg-green-500/15 text-green-400" },
  cancelled: {
    label: "Cancelled",
    className: "bg-[#262626] text-gray-500 line-through",
  },
};

export type OrdersSummary = {
  open: number;
  committed: number;
  received: number;
};
const summaryOf = (data: ProjectOrders): OrdersSummary => ({
  open: data.orders.filter(
    (o) => o.status === "draft" || o.status === "ordered",
  ).length,
  committed: data.committed,
  received: data.received,
});

/** A PO's lines, edited in place: each change saves when the field is left. */
function Lines({
  po,
  editable,
  onSave,
}: {
  po: PurchaseOrder;
  editable: boolean;
  onSave: (lines: PoLine[]) => Promise<void>;
}) {
  const [lines, setLines] = useState(po.lines);
  useEffect(() => setLines(po.lines), [po.lines]);
  const set = (index: number, patch: Partial<PoLine>) =>
    setLines((list) =>
      list.map((line, i) => (i === index ? { ...line, ...patch } : line)),
    );
  const commit = (next = lines) => {
    if (JSON.stringify(next) !== JSON.stringify(po.lines)) onSave(next);
  };
  const total = round2(
    lines.reduce(
      (sum, line) => sum + (line.quantity || 0) * (line.unitCost || 0),
      0,
    ),
  );
  return (
    <div className="mt-3">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left text-[11px] uppercase tracking-wide text-gray-500">
            <th className="py-1 font-medium">Item</th>
            <th className="py-1 font-medium text-right w-20">Qty</th>
            <th className="py-1 font-medium text-right w-28">Cost each</th>
            <th className="py-1 font-medium text-right w-24">Total</th>
            {editable && <th className="w-6" />}
          </tr>
        </thead>
        <tbody>
          {lines.map((line, index) => (
            <tr
              key={line._id ?? index}
              className="border-t border-[#262626] align-top"
              data-testid="po-line"
            >
              <td className="py-1.5 pr-2">
                {editable ? (
                  <input
                    value={line.description}
                    onChange={(e) =>
                      set(index, { description: e.target.value })
                    }
                    onBlur={() => commit()}
                    aria-label="Item"
                    className={`${field} w-full`}
                  />
                ) : (
                  <span className="text-gray-200">{line.description}</span>
                )}
                <span
                  className={`mt-0.5 block text-[11px] ${line.kind === "labor" ? "text-amber-300/80" : "text-gray-500"}`}
                >
                  {line.kind === "labor" ? "Labor" : "Material"}
                </span>
              </td>
              <td className="py-1.5 text-right">
                {editable ? (
                  <input
                    inputMode="decimal"
                    value={String(line.quantity)}
                    onChange={(e) =>
                      set(index, { quantity: number(e.target.value) })
                    }
                    onBlur={() => commit()}
                    aria-label={`Quantity for ${line.description}`}
                    className={`${field} w-16 text-right`}
                  />
                ) : (
                  <span className="tabular-nums text-gray-200">
                    {line.quantity}
                  </span>
                )}
                {line.unit && (
                  <span className="block text-[11px] text-gray-500">
                    {line.unit}
                  </span>
                )}
              </td>
              <td className="py-1.5 text-right">
                {editable ? (
                  <input
                    inputMode="decimal"
                    value={String(line.unitCost)}
                    onChange={(e) =>
                      set(index, { unitCost: number(e.target.value) })
                    }
                    onBlur={() => commit()}
                    aria-label={`Cost for ${line.description}`}
                    className={`${field} w-24 text-right`}
                  />
                ) : (
                  <span className="tabular-nums text-gray-200">
                    {formatCurrency(line.unitCost)}
                  </span>
                )}
              </td>
              <td className="py-1.5 text-right tabular-nums text-gray-200">
                {formatCurrency(
                  round2((line.quantity || 0) * (line.unitCost || 0)),
                )}
              </td>
              {editable && (
                <td className="py-1.5 text-right">
                  <button
                    type="button"
                    onClick={() => {
                      const next = lines.filter((_, i) => i !== index);
                      setLines(next);
                      commit(next);
                    }}
                    aria-label={`Remove ${line.description}`}
                    className="p-1 text-gray-500 hover:text-red-400"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </button>
                </td>
              )}
            </tr>
          ))}
        </tbody>
        <tfoot>
          <tr className="border-t border-[#333]">
            <td className="py-2 text-gray-400" colSpan={3}>
              {editable && (
                <button
                  type="button"
                  onClick={() =>
                    setLines((list) => [
                      ...list,
                      {
                        description: "",
                        quantity: 1,
                        unitCost: 0,
                        kind: "material",
                      },
                    ])
                  }
                  className="inline-flex items-center gap-1 text-sm text-[#9cc2ea] hover:text-white"
                >
                  <Plus className="h-3.5 w-3.5" /> Add a line
                </button>
              )}
            </td>
            <td
              className="py-2 text-right font-medium tabular-nums text-white"
              data-testid="po-total"
            >
              {formatCurrency(total)}
            </td>
            {editable && <td />}
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

/** One PO: a row that opens to its vendor, lines, dates and what to do next. */
function OrderCard({
  po,
  open,
  onToggle,
  companyName,
  onChanged,
  onReceived,
}: {
  po: PurchaseOrder;
  open: boolean;
  onToggle: () => void;
  companyName?: string;
  onChanged: () => Promise<void>;
  onReceived?: () => void;
}) {
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);
  const [menu, setMenu] = useState(false);
  const [receiving, setReceiving] = useState<string | null>(null);
  const [vendor, setVendor] = useState({
    name: po.vendor?.name ?? "",
    phone: po.vendor?.phone ?? "",
  });
  useEffect(
    () =>
      setVendor({ name: po.vendor?.name ?? "", phone: po.vendor?.phone ?? "" }),
    [po.vendor?.name, po.vendor?.phone],
  );
  const editable = po.status === "draft" || po.status === "ordered";

  const run = async (work: () => Promise<string | null | void>) => {
    setBusy(true);
    setNote(null);
    setMenu(false);
    try {
      const said = await work();
      if (said) setNote(said);
      await onChanged();
    } catch (err) {
      setNote(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const share = (token: string) =>
    shareOrCopy(
      purchaseOrderUrl(token),
      po.number,
      `${po.number}${companyName ? ` from ${companyName}` : ""}: ${po.title}`,
    ).then((how) =>
      how === "copied"
        ? "Link copied. Paste it into a text or email to the vendor."
        : how === "shared"
          ? "Sent."
          : null,
    );
  const send = () =>
    run(async () => share(await purchaseOrdersAPI.markOrdered(po.id)));
  const saveVendor = () => {
    if (
      vendor.name.trim() === (po.vendor?.name ?? "") &&
      vendor.phone.trim() === (po.vendor?.phone ?? "")
    )
      return;
    run(() =>
      purchaseOrdersAPI
        .update(po.id, {
          vendor: { name: vendor.name, phone: vendor.phone || undefined },
        })
        .then(() => null),
    );
  };
  const receive = () => {
    const amount = number(receiving ?? "");
    if (!(amount >= 0)) return setNote("Enter the amount, $0 or more.");
    run(async () => {
      await purchaseOrdersAPI.markReceived(po.id, amount);
      setReceiving(null);
      onReceived?.();
      return "Received. It’s on the project’s expenses.";
    });
  };

  return (
    <li className="border border-[#333] bg-[#1a1a1a]" data-testid="po">
      <button
        type="button"
        onClick={onToggle}
        className="flex w-full items-center gap-3 px-4 py-3 text-left hover:bg-[#202020]"
        aria-expanded={open}
      >
        {open ? (
          <ChevronDown className="h-4 w-4 flex-shrink-0 text-gray-500" />
        ) : (
          <ChevronRight className="h-4 w-4 flex-shrink-0 text-gray-500" />
        )}
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-medium text-white">
            {po.title}
          </span>
          <span className="block truncate text-xs text-gray-500">
            {po.number}
            {po.vendor?.name ? ` · ${po.vendor.name}` : ""} · {po.lines.length}{" "}
            {po.lines.length === 1 ? "line" : "lines"}
          </span>
        </span>
        <span className="tabular-nums text-sm text-white">
          {formatCurrency(
            po.status === "received"
              ? (po.receivedAmount ?? po.total)
              : po.total,
          )}
        </span>
        <span
          className={`rounded-full px-2 py-0.5 text-xs ${PILL[po.status].className}`}
          data-testid="po-status"
        >
          {PILL[po.status].label}
        </span>
      </button>

      {open && (
        <div className="border-t border-[#262626] px-4 pb-4 pt-3">
          <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
            <label className="text-xs text-gray-500">
              Vendor
              <input
                value={vendor.name}
                disabled={!editable || busy}
                onChange={(e) =>
                  setVendor((v) => ({ ...v, name: e.target.value }))
                }
                onBlur={saveVendor}
                placeholder={`Which ${po.title.toLowerCase()}?`}
                aria-label="Vendor name"
                className={`${field} mt-1 w-full`}
              />
            </label>
            <label className="text-xs text-gray-500">
              Phone
              <input
                type="tel"
                value={vendor.phone}
                disabled={!editable || busy || !vendor.name.trim()}
                onChange={(e) =>
                  setVendor((v) => ({ ...v, phone: e.target.value }))
                }
                onBlur={saveVendor}
                aria-label="Vendor phone"
                className={`${field} mt-1 w-full`}
              />
            </label>
            <label className="text-xs text-gray-500">
              Needed by
              <input
                type="date"
                defaultValue={po.neededBy ?? ""}
                disabled={!editable || busy}
                onChange={(e) =>
                  run(() =>
                    purchaseOrdersAPI
                      .update(po.id, { neededBy: e.target.value })
                      .then(() => null),
                  )
                }
                style={{ colorScheme: "dark" }}
                aria-label="Needed by"
                className={`${field} mt-1 w-full`}
              />
            </label>
            <label className="text-xs text-gray-500">
              Deliver to
              <input
                defaultValue={po.deliverTo ?? ""}
                disabled={!editable || busy}
                onBlur={(e) =>
                  e.target.value !== (po.deliverTo ?? "") &&
                  run(() =>
                    purchaseOrdersAPI
                      .update(po.id, { deliverTo: e.target.value })
                      .then(() => null),
                  )
                }
                aria-label="Deliver to"
                className={`${field} mt-1 w-full`}
              />
            </label>
          </div>

          <Lines
            po={po}
            editable={editable && !busy}
            onSave={(lines) =>
              run(() =>
                purchaseOrdersAPI.update(po.id, { lines }).then(() => null),
              )
            }
          />

          <label className="mt-2 block text-xs text-gray-500">
            Notes for the vendor
            <textarea
              defaultValue={po.notes ?? ""}
              rows={2}
              disabled={!editable || busy}
              onBlur={(e) =>
                e.target.value !== (po.notes ?? "") &&
                run(() =>
                  purchaseOrdersAPI
                    .update(po.id, { notes: e.target.value })
                    .then(() => null),
                )
              }
              aria-label="Notes for the vendor"
              className={`${field} mt-1 w-full`}
            />
          </label>

          <div className="mt-3 flex flex-wrap items-center gap-2">
            {po.status === "draft" && (
              <button
                type="button"
                onClick={send}
                disabled={busy || po.lines.length === 0}
                className={primary}
              >
                <Send className="h-4 w-4" /> Send to vendor
              </button>
            )}
            {po.status === "ordered" &&
              (receiving === null ? (
                <>
                  <button
                    type="button"
                    onClick={() => setReceiving(String(po.total))}
                    disabled={busy}
                    className={primary}
                  >
                    Mark received
                  </button>
                  <button
                    type="button"
                    onClick={() => run(() => share(po.shareToken!))}
                    disabled={busy || !po.shareToken}
                    className={secondary}
                  >
                    <Share className="h-4 w-4" /> Share again
                  </button>
                </>
              ) : (
                <span
                  className="inline-flex flex-wrap items-center gap-2"
                  data-testid="receive-form"
                >
                  <span className="text-sm text-gray-400">
                    Final amount (their invoice)
                  </span>
                  <input
                    autoFocus
                    inputMode="decimal"
                    value={receiving}
                    onChange={(e) => setReceiving(e.target.value)}
                    aria-label="Final amount"
                    className={`${field} w-28 text-right`}
                  />
                  <button
                    type="button"
                    onClick={receive}
                    disabled={busy}
                    className={primary}
                  >
                    Add to expenses
                  </button>
                  <button
                    type="button"
                    onClick={() => setReceiving(null)}
                    className="text-sm text-gray-400 hover:text-white"
                  >
                    Cancel
                  </button>
                </span>
              ))}
            {po.status === "received" && (
              <span className="text-sm text-gray-400">
                Received
                {po.receivedAt
                  ? ` ${new Date(po.receivedAt).toLocaleDateString(undefined, { month: "short", day: "numeric" })}`
                  : ""}
                : on the project&rsquo;s expenses.
              </span>
            )}
            <div className="relative ml-auto">
              <button
                type="button"
                onClick={() => setMenu((m) => !m)}
                aria-label={`More for ${po.title}`}
                className="p-1.5 text-gray-400 hover:text-white"
              >
                <MoreVertical className="h-4 w-4" />
              </button>
              {menu && (
                <div className="absolute right-0 z-10 mt-1 w-44 border border-[#333] bg-[#262626] shadow-lg">
                  {(po.status === "received" || po.status === "cancelled") && (
                    <button
                      type="button"
                      onClick={() => run(() => purchaseOrdersAPI.reopen(po.id))}
                      className="w-full px-3 py-2.5 text-left text-sm text-gray-200 hover:bg-[#333]"
                    >
                      Reopen
                    </button>
                  )}
                  {editable && (
                    <button
                      type="button"
                      onClick={() => run(() => purchaseOrdersAPI.cancel(po.id))}
                      className="w-full px-3 py-2.5 text-left text-sm text-gray-200 hover:bg-[#333]"
                    >
                      Cancel PO
                    </button>
                  )}
                  {(po.status === "draft" || po.status === "cancelled") && (
                    <button
                      type="button"
                      onClick={() =>
                        window.confirm(`Delete ${po.number} (${po.title})?`) &&
                        run(() => purchaseOrdersAPI.remove(po.id))
                      }
                      className="w-full px-3 py-2.5 text-left text-sm text-red-300 hover:bg-[#333]"
                    >
                      Delete
                    </button>
                  )}
                </div>
              )}
            </div>
          </div>
          {note && (
            <p className="mt-2 text-sm text-gray-300" role="status">
              {note}
            </p>
          )}
        </div>
      )}
    </li>
  );
}

/**
 * The project's purchase orders: one per supplier and sub (pre-built from the
 * package or the estimate), each sent to its vendor as a link, then received
 * onto the project's expenses.
 */
export const ProjectPurchaseOrders: React.FC<{
  projectId: string;
  companyName?: string;
  /** Counts and money for the tab and the totals bar. */
  onSummary?: (summary: OrdersSummary) => void;
  /** A PO was received: the project's expenses changed. */
  onExpensesChanged?: () => void;
}> = ({ projectId, companyName, onSummary, onExpensesChanged }) => {
  const [data, setData] = useState<ProjectOrders | null>(null);
  const [failed, setFailed] = useState(false);
  const [openId, setOpenId] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [note, setNote] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      const next = await purchaseOrdersAPI.forProject(projectId);
      setData(next);
      setFailed(false);
      onSummary?.(summaryOf(next));
    } catch {
      setFailed(true);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [projectId]);
  useEffect(() => {
    load();
  }, [load]);

  const act = async (work: () => Promise<string | null>) => {
    setBusy(true);
    setNote(null);
    try {
      setNote(await work());
      await load();
    } catch (err) {
      setNote(errorText(err));
    } finally {
      setBusy(false);
    }
  };
  const build = () =>
    act(async () => {
      const added = await purchaseOrdersAPI.buildFromEstimate(projectId);
      return added
        ? `Added ${added} purchase order${added === 1 ? "" : "s"} from the estimate.`
        : "Every vendor on the estimate already has a PO.";
    });
  const add = () => {
    const title = window.prompt("Who is this PO for? (e.g. Appliance store)");
    if (!title?.trim()) return;
    act(async () => {
      const id = await purchaseOrdersAPI.create(projectId, title);
      setOpenId(id);
      return null;
    });
  };

  if (failed)
    return (
      <p className="text-sm text-gray-500">
        The purchase orders couldn&rsquo;t load. Try again in a moment.
      </p>
    );
  if (!data) return <p className="text-sm text-gray-500">Loading…</p>;

  const live = data.orders.filter((o) => o.status !== "cancelled");
  const planned = round2(
    live
      .filter((o) => o.status === "draft")
      .reduce((sum, o) => sum + o.total, 0),
  );
  return (
    <div data-testid="purchase-orders">
      <div className="mb-3 flex flex-wrap items-center gap-x-6 gap-y-2">
        <div className="flex gap-6 text-sm" data-testid="po-summary">
          <span>
            <span className="block text-[11px] uppercase tracking-wide text-gray-500">
              To order
            </span>
            <span className="tabular-nums text-white">
              {formatCurrency(planned)}
            </span>
          </span>
          <span>
            <span className="block text-[11px] uppercase tracking-wide text-gray-500">
              Committed
            </span>
            <span className="tabular-nums text-white">
              {formatCurrency(data.committed)}
            </span>
          </span>
          <span>
            <span className="block text-[11px] uppercase tracking-wide text-gray-500">
              Received
            </span>
            <span className="tabular-nums text-white">
              {formatCurrency(data.received)}
            </span>
          </span>
        </div>
        <div className="ml-auto flex gap-2">
          {data.orders.length > 0 && (
            <button
              type="button"
              onClick={build}
              disabled={busy}
              className={secondary}
            >
              Add from estimate
            </button>
          )}
          <button
            type="button"
            onClick={add}
            disabled={busy}
            className={primary}
          >
            <Plus className="h-4 w-4" /> New PO
          </button>
        </div>
      </div>
      {note && (
        <p className="mb-3 text-sm text-gray-300" role="status">
          {note}
        </p>
      )}

      {data.orders.length === 0 ? (
        <div
          className="border border-dashed border-[#333] px-4 py-8 text-center"
          data-testid="po-empty"
        >
          <p className="text-sm text-white">No purchase orders yet</p>
          <p className="mt-1 text-sm text-gray-500">
            Build them from the project&rsquo;s estimate: one for each supplier
            and sub, at an estimated cost you can change.
          </p>
          <button
            type="button"
            onClick={build}
            disabled={busy}
            className={`${primary} mt-4`}
          >
            Build POs from the estimate
          </button>
        </div>
      ) : (
        <ul className="space-y-2">
          {data.orders.map((po) => (
            <OrderCard
              key={po.id}
              po={po}
              open={openId === po.id}
              onToggle={() => setOpenId((id) => (id === po.id ? null : po.id))}
              companyName={companyName}
              onChanged={load}
              onReceived={onExpensesChanged}
            />
          ))}
        </ul>
      )}
    </div>
  );
};
