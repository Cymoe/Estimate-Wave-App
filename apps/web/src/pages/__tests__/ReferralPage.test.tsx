import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter, Route, Routes } from "react-router-dom";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let info: Record<string, unknown> | null = null;
const submit = jest.fn<Promise<null>, [string, Record<string, unknown>]>(
  async () => null,
);
jest.mock("../../lib/api", () => ({
  referralsAPI: {
    get: async () => info,
    submit: (code: string, details: Record<string, unknown>) =>
      submit(code, details),
  },
}));

import { ReferralPage } from "../ReferralPage";

async function open(path = "/r/abcd2345") {
  const container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () =>
    createRoot(container).render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/r/:code" element={<ReferralPage />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  await act(async () => {});
}
const button = (text: string) =>
  Array.from(document.body.querySelectorAll("button")).find((b) =>
    b.textContent?.includes(text),
  ) as HTMLButtonElement;
const type = async (label: string, value: string) => {
  const el = Array.from(document.body.querySelectorAll("label"))
    .find((l) => l.textContent?.startsWith(label))!
    .querySelector("input, textarea") as HTMLInputElement | HTMLTextAreaElement;
  const proto =
    el instanceof HTMLTextAreaElement
      ? HTMLTextAreaElement.prototype
      : HTMLInputElement.prototype;
  await act(async () => {
    Object.getOwnPropertyDescriptor(proto, "value")!.set!.call(el, value);
    el.dispatchEvent(new Event("input", { bubbles: true }));
  });
};

afterEach(() => {
  document.body.innerHTML = "";
  window.localStorage.clear();
  jest.clearAllMocks();
});

describe("the referral page", () => {
  it("says who sent them, takes their details (a phone or email needed), and thanks them", async () => {
    info = {
      referrer: "Ann",
      company: { name: "Peak Builders", phone: "555-0100" },
    };
    await open();
    expect(document.body.textContent).toContain(
      "Ann sent you to Peak Builders",
    );
    expect(
      document.body.querySelector('a[href="tel:555-0100"]'),
    ).not.toBeNull();
    await type("Your name", "Bo Jones");
    expect(button("Send").disabled).toBe(true);
    await type("Phone", "555-0199");
    await type("What do you need done?", "Kitchen next spring");
    expect(button("Send").disabled).toBe(false);
    await act(async () => button("Send").click());
    await act(async () => {});
    expect(submit).toHaveBeenCalledWith("abcd2345", {
      name: "Bo Jones",
      phone: "555-0199",
      email: undefined,
      address: undefined,
      note: "Kitchen next spring",
      language: "en",
    });
    expect(
      document.body.querySelector('[data-testid="referral-done"]')!.textContent,
    ).toContain("Peak Builders will be in touch soon.");
  });

  it("says a refusal in their language", async () => {
    info = { referrer: "Ann", company: { name: "Peak Builders" } };
    submit.mockRejectedValueOnce(
      Object.assign(new Error("x"), { reason: "referral_limit" }),
    );
    await open("/r/abcd2345?lang=es");
    expect(document.body.textContent).toContain(
      "Ann te recomienda Peak Builders",
    );
    await type("Tu nombre", "Bo");
    await type("Correo", "bo@example.com");
    await act(async () => button("Enviar").click());
    await act(async () => {});
    expect(
      document.body.querySelector('[role="alert"]')!.textContent,
    ).toContain("Mejor llama a la empresa");
  });

  it("says a link that isn't valid", async () => {
    info = null;
    await open();
    expect(document.body.textContent).toContain(
      "This link isn't valid any more.",
    );
  });
});
