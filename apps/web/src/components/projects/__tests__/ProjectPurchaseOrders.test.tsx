import { createRoot } from "react-dom/client";
import { act } from "react";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let data: Record<string, unknown> = { orders: [], committed: 0, received: 0 };
const calls: Array<[string, ...unknown[]]> = [];
const call =
  (name: string, result: unknown = null) =>
  async (...args: unknown[]) => {
    calls.push([name, ...args]);
    return result;
  };
jest.mock("../../../lib/api", () => ({
  purchaseOrdersAPI: {
    forProject: async () => data,
    create: (...a: unknown[]) => call("create", "new1")(...a),
    update: (...a: unknown[]) => call("update")(...a),
    remove: (...a: unknown[]) => call("remove")(...a),
    buildFromEstimate: (...a: unknown[]) => call("buildFromEstimate", 13)(...a),
    markOrdered: (...a: unknown[]) => call("markOrdered", "tok123")(...a),
    markReceived: (...a: unknown[]) => call("markReceived", "exp1")(...a),
    reopen: (...a: unknown[]) => call("reopen")(...a),
    cancel: (...a: unknown[]) => call("cancel")(...a),
  },
  purchaseOrderUrl: (token: string) => `https://app.example/po/${token}`,
}));
const shared: Array<[string, string, string]> = [];
jest.mock("../../estimates/estimateActions", () => ({
  shareOrCopy: async (url: string, title: string, text: string) => (
    shared.push([url, title, text]),
    "copied"
  ),
}));

import { ProjectPurchaseOrders } from "../ProjectPurchaseOrders";

const flush = () =>
  act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
const button = (text: string, within: ParentNode = document.body) =>
  Array.from(within.querySelectorAll("button")).find((b) =>
    b.textContent?.trim().startsWith(text),
  ) as HTMLButtonElement;
const type = async (input: HTMLInputElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input, value);
    input.dispatchEvent(new Event("input", { bubbles: true }));
  });
const blur = (el: HTMLElement) =>
  act(async () =>
    el.dispatchEvent(new FocusEvent("focusout", { bubbles: true })),
  );

const cabinets = {
  id: "po1",
  number: "PO-2026-123456-3",
  title: "Cabinet supplier",
  lines: [
    {
      _id: "l1",
      description: "Semi-custom cabinets",
      quantity: 22,
      unit: "lf",
      unitCost: 173.25,
      kind: "material",
    },
  ],
  total: 3811.5,
  status: "draft",
  neededBy: "2026-12-01",
  deliverTo: "12 Oak St, Midland, TX",
};

async function render() {
  const onSummary = jest.fn();
  const onExpensesChanged = jest.fn();
  const container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () =>
    createRoot(container).render(
      <ProjectPurchaseOrders
        projectId="p1"
        companyName="Peak Builders"
        onSummary={onSummary}
        onExpensesChanged={onExpensesChanged}
      />,
    ),
  );
  await flush();
  return { onSummary, onExpensesChanged };
}

afterEach(() => {
  document.body.innerHTML = "";
  data = { orders: [], committed: 0, received: 0 };
  calls.length = 0;
  shared.length = 0;
});

describe("Purchase orders on the project", () => {
  it("with none yet, builds them from the estimate", async () => {
    await render();
    expect(
      document.body.querySelector('[data-testid="po-empty"]')!.textContent,
    ).toContain("one for each supplier and sub");
    await act(async () => button("Build POs from the estimate").click());
    await flush();
    expect(calls).toContainEqual(["buildFromEstimate", "p1"]);
    expect(document.body.textContent).toContain(
      "Added 13 purchase orders from the estimate.",
    );
  });

  it("lists each PO with its total and status, sums what is to order, committed and received, and reports the counts", async () => {
    data = {
      orders: [
        cabinets,
        {
          ...cabinets,
          id: "po2",
          title: "Electrician",
          total: 1794,
          status: "ordered",
          shareToken: "tok9",
        },
        {
          ...cabinets,
          id: "po3",
          title: "Tile setter",
          total: 410,
          status: "received",
          receivedAmount: 425,
        },
      ],
      committed: 1794,
      received: 425,
    };
    const { onSummary } = await render();
    expect(onSummary).toHaveBeenLastCalledWith({
      open: 2,
      committed: 1794,
      received: 425,
    });
    expect(
      document.body.querySelector('[data-testid="po-summary"]')!.textContent,
    ).toBe("To order$3,811.50Committed$1,794.00Received$425.00");
    const rows = Array.from(
      document.body.querySelectorAll('[data-testid="po"]'),
    );
    expect(
      rows.map(
        (r) => r.querySelector('[data-testid="po-status"]')!.textContent,
      ),
    ).toEqual(["Draft", "Ordered", "Received"]);
    expect(rows[2].textContent).toContain("$425.00");
  });

  it("opens a PO to edit the vendor and a line cost, then sends it to the vendor", async () => {
    data = { orders: [cabinets], committed: 0, received: 0 };
    await render();
    await act(async () => button("Cabinet supplier").click());
    const card = document.body.querySelector('[data-testid="po"]')!;
    const name = card.querySelector(
      'input[aria-label="Vendor name"]',
    ) as HTMLInputElement;
    await type(name, "Midland Cabinet Co");
    await blur(name);
    await flush();
    expect(calls).toContainEqual([
      "update",
      "po1",
      { vendor: { name: "Midland Cabinet Co", phone: undefined } },
    ]);

    const cost = card.querySelector(
      'input[aria-label="Cost for Semi-custom cabinets"]',
    ) as HTMLInputElement;
    await type(cost, "160");
    expect(card.querySelector('[data-testid="po-total"]')!.textContent).toBe(
      "$3,520.00",
    );
    await blur(cost);
    await flush();
    expect(calls).toContainEqual([
      "update",
      "po1",
      {
        lines: [
          {
            _id: "l1",
            description: "Semi-custom cabinets",
            quantity: 22,
            unit: "lf",
            unitCost: 160,
            kind: "material",
          },
        ],
      },
    ]);

    await act(async () => button("Send to vendor", card).click());
    await flush();
    expect(calls).toContainEqual(["markOrdered", "po1"]);
    expect(shared[0]).toEqual([
      "https://app.example/po/tok123",
      "PO-2026-123456-3",
      "PO-2026-123456-3 from Peak Builders: Cabinet supplier",
    ]);
    expect(card.textContent).toContain("Link copied");
  });

  it("marks an ordered PO received with the invoice amount, onto the expenses", async () => {
    data = {
      orders: [{ ...cabinets, status: "ordered", shareToken: "tok9" }],
      committed: 3811.5,
      received: 0,
    };
    const { onExpensesChanged } = await render();
    await act(async () => button("Cabinet supplier").click());
    await act(async () => button("Mark received").click());
    const form = document.body.querySelector('[data-testid="receive-form"]')!;
    const amount = form.querySelector("input") as HTMLInputElement;
    expect(amount.value).toBe("3811.5");
    await type(amount, "3,850");
    await act(async () => button("Add to expenses", form).click());
    await flush();
    expect(calls).toContainEqual(["markReceived", "po1", 3850]);
    expect(onExpensesChanged).toHaveBeenCalled();
  });

  it("adds a blank PO for a vendor the package didn’t have", async () => {
    data = { orders: [cabinets], committed: 0, received: 0 };
    jest.spyOn(window, "prompt").mockReturnValue("Appliance store");
    await render();
    await act(async () => button("New PO").click());
    await flush();
    expect(calls).toContainEqual(["create", "p1", "Appliance store"]);
  });
});
