import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import { Printer } from "lucide-react";
import { purchaseOrdersAPI, type VendorPurchaseOrder } from "../lib/api";
import { formatCurrency } from "../utils/format";
import { LightPage } from "../components/common/LightPage";

const longDay = (iso?: string) => {
  if (!iso) return undefined;
  const [y, m, d] = iso.slice(0, 10).split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  });
};

/**
 * The page a vendor opens from a purchase order's link: who's ordering, what,
 * how many, at what cost, and where and when it's needed. Prints as the PO.
 */
export function PurchaseOrderPage() {
  const { token = "" } = useParams();
  const [po, setPo] = useState<VendorPurchaseOrder | null | undefined>(
    undefined,
  );

  useEffect(() => {
    purchaseOrdersAPI
      .get(token)
      .then(setPo)
      .catch(() => setPo(null));
  }, [token]);

  if (po === undefined)
    return (
      <LightPage className="bg-white flex items-center justify-center text-gray-500">
        Loading…
      </LightPage>
    );
  if (po === null)
    return (
      <LightPage className="bg-white flex items-center justify-center px-6 text-center text-gray-700">
        This purchase order isn&rsquo;t available. Ask the company that sent it
        for a new link.
      </LightPage>
    );

  const company = po.company;
  const details: Array<[string, string | undefined]> = [
    ["Job", po.job],
    ["Ordered", longDay(po.orderedAt)],
    ["Needed by", longDay(po.neededBy)],
    ["Deliver to", po.deliverTo],
  ];
  return (
    <LightPage className="bg-white text-gray-900">
      <div
        className="mx-auto max-w-3xl px-5 py-8 sm:py-12 print:py-0"
        data-testid="vendor-po"
      >
        <header className="flex flex-wrap items-start justify-between gap-4 border-b border-gray-200 pb-5">
          <div>
            {company?.logoUrl ? (
              <img
                src={company.logoUrl}
                alt={company.name}
                className="h-10 max-w-[180px] object-contain"
              />
            ) : (
              <p className="text-lg font-semibold">{company?.name}</p>
            )}
            <p className="mt-1 text-sm text-gray-500">
              {[company?.phone, company?.email].filter(Boolean).join(" · ")}
            </p>
          </div>
          <div className="text-right">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Purchase order
            </p>
            <p className="text-xl font-bold">{po.number}</p>
            {po.status === "received" && (
              <p className="mt-1 text-sm font-medium text-green-700">
                Received
              </p>
            )}
          </div>
        </header>

        <section className="mt-5 grid grid-cols-1 gap-x-8 gap-y-3 text-sm sm:grid-cols-2">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              To
            </p>
            <p className="mt-0.5 text-gray-900">
              {po.vendor?.name ?? po.title}
            </p>
            {po.vendor?.phone && (
              <p className="text-gray-600">{po.vendor.phone}</p>
            )}
          </div>
          {details
            .filter(([, value]) => value)
            .map(([label, value]) => (
              <div key={label}>
                <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                  {label}
                </p>
                <p className="mt-0.5 text-gray-900">{value}</p>
              </div>
            ))}
        </section>

        <table className="mt-6 w-full text-sm">
          <thead>
            <tr className="border-b border-gray-300 text-left text-xs uppercase tracking-wide text-gray-500">
              <th className="py-2 font-semibold">Item</th>
              <th className="py-2 text-right font-semibold">Qty</th>
              <th className="py-2 text-right font-semibold">Each</th>
              <th className="py-2 text-right font-semibold">Total</th>
            </tr>
          </thead>
          <tbody>
            {po.lines.map((line, i) => (
              <tr
                key={i}
                className="border-b border-gray-100"
                data-testid="vendor-po-line"
              >
                <td className="py-2.5 pr-3">{line.description}</td>
                <td className="py-2.5 text-right tabular-nums whitespace-nowrap">
                  {line.quantity}
                  {line.unit ? ` ${line.unit}` : ""}
                </td>
                <td className="py-2.5 text-right tabular-nums">
                  {formatCurrency(line.unitCost)}
                </td>
                <td className="py-2.5 text-right tabular-nums">
                  {formatCurrency(
                    Math.round(line.quantity * line.unitCost * 100) / 100,
                  )}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr>
              <td colSpan={3} className="pt-3 text-right font-semibold">
                Total
              </td>
              <td
                className="pt-3 text-right text-base font-bold tabular-nums"
                data-testid="vendor-po-total"
              >
                {formatCurrency(po.total)}
              </td>
            </tr>
          </tfoot>
        </table>

        {po.notes && (
          <section className="mt-6 rounded-lg bg-gray-50 p-4 text-sm">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
              Notes
            </p>
            <p className="mt-1 whitespace-pre-line text-gray-800">{po.notes}</p>
          </section>
        )}

        <p className="mt-6 text-sm text-gray-500">
          Please reference {po.number} on your invoice
          {company?.phone
            ? ` and call ${company.phone} with any questions`
            : ""}
          .
        </p>

        <button
          type="button"
          onClick={() => window.print()}
          className="mt-6 inline-flex items-center gap-2 rounded-lg bg-gray-900 px-4 py-2.5 text-sm font-semibold text-white hover:bg-gray-800 print:hidden"
        >
          <Printer className="h-4 w-4" /> Print or save as PDF
        </button>
      </div>
    </LightPage>
  );
}
