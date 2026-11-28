import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let data: Record<string, unknown> = { reward: null, referrals: [] };
const markPaid = jest.fn<Promise<null>, [string, boolean]>(async () => null);
jest.mock("../../../lib/api", () => ({
  referralsAPI: {
    forClient: async () => data,
    markPaid: (leadId: string, paid: boolean) => markPaid(leadId, paid),
  },
}));

import { ClientReferrals } from "../ClientReferrals";

async function render() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () =>
    createRoot(container).render(
      <MemoryRouter>
        <ClientReferrals clientId="c1" />
      </MemoryRouter>,
    ),
  );
  await act(async () => {});
}
const button = (text: string) =>
  Array.from(document.body.querySelectorAll("button")).find(
    (b) => b.textContent === text,
  ) as HTMLButtonElement;

afterEach(() => {
  document.body.innerHTML = "";
  jest.clearAllMocks();
});

describe("a client's referrals", () => {
  it("is hidden until they have sent someone", async () => {
    await render();
    expect(
      document.body.querySelector('[data-testid="client-referrals"]'),
    ).toBeNull();
  });

  it("lists who they sent, says the reward owed, and marks it given", async () => {
    data = {
      reward: "$250 gift card",
      referrals: [
        {
          leadId: "l1",
          name: "Bo Jones",
          status: "won",
          createdAt: "2026-11-01",
          earned: true,
        },
        {
          leadId: "l2",
          name: "Cy Lee",
          status: "contacted",
          createdAt: "2026-11-02",
          earned: false,
        },
        {
          leadId: "l3",
          name: "Di Park",
          status: "won",
          createdAt: "2026-10-02",
          earned: true,
          paidAt: "2026-10-20",
        },
      ],
    };
    await render();
    expect(
      document.body.querySelector('[data-testid="reward-owed"]')!.textContent,
    ).toBe("A reward is owed: $250 gift card");
    const rows = Array.from(
      document.body.querySelectorAll('[data-testid="referral"]'),
    );
    expect(rows.map((r) => r.textContent)).toEqual([
      "Bo JonesWonMark reward given",
      "Cy LeeContactedNot signed yet",
      "Di ParkWonReward given",
    ]);
    await act(async () => button("Mark reward given").click());
    await act(async () => {});
    expect(markPaid).toHaveBeenCalledWith("l1", true);
  });
});
