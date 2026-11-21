import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let po: Record<string, unknown> | null = null;
jest.mock("../../lib/api", () => ({
  purchaseOrdersAPI: { get: async () => po },
}));

import { PurchaseOrderPage } from "../PurchaseOrderPage";

async function open() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () =>
    createRoot(container).render(
      <MemoryRouter initialEntries={["/po/tok"]}>
        <Routes>
          <Route path="/po/:token" element={<PurchaseOrderPage />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  await act(async () => {});
}

afterEach(() => {
  document.body.innerHTML = "";
});

describe("the vendor's purchase order", () => {
  it("shows who is ordering what, where and when, with the total, and prints", async () => {
    po = {
      company: { name: "Peak Builders", phone: "432-555-0100" },
      number: "PO-2026-123456-3",
      title: "Cabinet supplier",
      vendor: { name: "Midland Cabinet Co" },
      job: "Miller kitchen",
      orderedAt: "2026-11-20T15:00:00Z",
      neededBy: "2026-12-01",
      deliverTo: "12 Oak St, Midland, TX 79701",
      notes: "Call before delivery",
      status: "ordered",
      lines: [
        {
          description: "Semi-custom cabinets",
          quantity: 22,
          unit: "lf",
          unitCost: 160,
        },
      ],
      total: 3520,
    };
    const print = jest.spyOn(window, "print").mockImplementation(() => {});
    await open();
    const page = document.body.querySelector('[data-testid="vendor-po"]')!;
    expect(page.textContent).toContain("PO-2026-123456-3");
    expect(page.textContent).toContain("Midland Cabinet Co");
    expect(page.textContent).toContain("Needed byDecember 1, 2026");
    expect(page.textContent).toContain(
      "Deliver to12 Oak St, Midland, TX 79701",
    );
    expect(
      page.querySelector('[data-testid="vendor-po-line"]')!.textContent,
    ).toBe("Semi-custom cabinets22 lf$160.00$3,520.00");
    expect(
      page.querySelector('[data-testid="vendor-po-total"]')!.textContent,
    ).toBe("$3,520.00");
    expect(page.textContent).toContain(
      "Please reference PO-2026-123456-3 on your invoice and call 432-555-0100",
    );
    await act(async () =>
      (
        Array.from(page.querySelectorAll("button")).find((b) =>
          b.textContent?.includes("Print"),
        ) as HTMLButtonElement
      ).click(),
    );
    expect(print).toHaveBeenCalled();
  });

  it("says when the link is no good", async () => {
    po = null;
    await open();
    expect(document.body.textContent).toContain(
      "This purchase order isn’t available.",
    );
  });
});
