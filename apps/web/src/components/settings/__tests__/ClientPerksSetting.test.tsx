import { createRoot } from "react-dom/client";
import { act } from "react";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let org: Record<string, unknown> = {};
let role = "admin";
const setPerks = jest.fn(
  async (
    _id: string,
    perks: { reviewUrl?: string; referralReward?: string },
  ) =>
    perks.reviewUrl || perks.referralReward
      ? { ...perks, reviewUrl: perks.reviewUrl && `https://${perks.reviewUrl}` }
      : null,
);
jest.mock("../../../lib/api", () => ({
  organizationsAPI: {
    getById: async () => org,
    myRole: async () => role,
    setPerks: (
      id: string,
      perks: { reviewUrl?: string; referralReward?: string },
    ) => setPerks(id, perks),
  },
}));

import { ClientPerksSetting } from "../ClientPerksSetting";

async function render() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () =>
    createRoot(container).render(<ClientPerksSetting organizationId="o1" />),
  );
  await act(async () => {});
}
const input = (label: string) =>
  Array.from(document.body.querySelectorAll("label"))
    .find((l) => l.textContent?.startsWith(label))!
    .querySelector("input") as HTMLInputElement;
const type = async (label: string, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(
      HTMLInputElement.prototype,
      "value",
    )!.set!.call(input(label), value);
    input(label).dispatchEvent(new Event("input", { bubbles: true }));
  });
const save = () =>
  Array.from(document.body.querySelectorAll("button")).find(
    (b) => b.textContent === "Save",
  ) as HTMLButtonElement;

afterEach(() => {
  document.body.innerHTML = "";
  jest.clearAllMocks();
  role = "admin";
});

describe("After the job settings", () => {
  it("shows what is set, and saves the review link and the referral reward", async () => {
    org = { perks: { referralReward: "$100 off" } };
    await render();
    expect(input("Referral reward").value).toBe("$100 off");
    expect(save().disabled).toBe(true);
    await type("Review link", "g.page/r/peak/review");
    await act(async () => save().click());
    await act(async () => {});
    expect(setPerks).toHaveBeenCalledWith("o1", {
      reviewUrl: "g.page/r/peak/review",
      referralReward: "$100 off",
    });
    expect(input("Review link").value).toBe("https://g.page/r/peak/review");
    expect(document.body.textContent).toContain("Saved.");
  });

  it("is read-only for members, and says a refusal", async () => {
    org = {};
    role = "member";
    await render();
    expect(input("Review link").disabled).toBe(true);
    expect(document.body.textContent).toContain("Ask an owner or admin");
    document.body.innerHTML = "";
    role = "admin";
    setPerks.mockRejectedValueOnce(
      new Error("That review link doesn't look like a web address"),
    );
    await render();
    await type("Review link", "nope nope");
    await act(async () => save().click());
    await act(async () => {});
    expect(document.body.textContent).toContain(
      "doesn't look like a web address",
    );
  });
});
