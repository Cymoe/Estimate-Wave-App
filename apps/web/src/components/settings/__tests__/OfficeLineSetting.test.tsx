import { createRoot } from "react-dom/client";
import { act } from "react";
import { MemoryRouter } from "react-router-dom";
import type { OfficeLineRow, OfficeLineSettings } from "../../../lib/api";

(
  globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }
).IS_REACT_ACT_ENVIRONMENT = true;

let settings: OfficeLineSettings;
let rows: OfficeLineRow[] = [];
const set = jest.fn<Promise<unknown>, [string, Record<string, unknown>]>(
  async (_id, changes) => {
    const next = { ...settings, ...changes, briefAt: changes.briefAt === null ? undefined : (changes.briefAt ?? settings.briefAt) };
    settings = next as OfficeLineSettings;
    return next;
  },
);
const sendTest = jest.fn<Promise<void>, [string]>(async () => undefined);
const answer = jest.fn<Promise<void>, [string, string, boolean]>(async (_o, _id, yes) => {
  rows = rows.map((r) => (r.ask ? { ...r, ask: { ...r.ask, status: yes ? "done" : "declined" } } : r));
});
jest.mock("../../../lib/api", () => ({
  officeLineAPI: {
    get: async () => settings,
    set: (id: string, changes: Record<string, unknown>) => set(id, changes),
    log: async () => rows,
    answer: (o: string, id: string, yes: boolean) => answer(o, id, yes),
    test: (id: string) => sendTest(id),
  },
}));

import { OfficeLineSetting } from "../OfficeLineSetting";

const base: OfficeLineSettings = {
  on: false,
  briefAt: "06:30",
  allowSpend: false,
  notes: "",
  canEdit: true,
  myMobile: "(432) 555-0100",
  lineNumber: "(432) 555-9999",
  ready: { texting: true, assistant: true },
};

async function render() {
  const container = document.createElement("div");
  document.body.appendChild(container);
  await act(async () =>
    createRoot(container).render(
      <MemoryRouter>
        <OfficeLineSetting organizationId="o1" />
      </MemoryRouter>,
    ),
  );
  await act(async () => {});
}
const $ = (sel: string) => document.body.querySelector(sel) as HTMLElement | null;
const button = (text: string) =>
  Array.from(document.body.querySelectorAll("button")).find((b) => b.textContent === text) as HTMLButtonElement;
const click = (el: HTMLElement) => act(async () => el.click());

beforeEach(() => {
  settings = { ...base };
  rows = [];
});
afterEach(() => {
  document.body.innerHTML = "";
  jest.clearAllMocks();
  jest.useRealTimers();
});

test("off: shows the number to text from your mobile; turning it on shows the brief, spending, notes and log", async () => {
  await render();
  expect($('[data-testid="office-line-numbers"]')!.textContent).toBe("Text (432) 555-9999 from (432) 555-0100.");
  expect($("select")).toBeNull();
  await click($('[role="switch"]')!);
  expect(set).toHaveBeenCalledWith("o1", { on: true });
  expect(($('[role="switch"]') as HTMLElement).getAttribute("aria-checked")).toBe("true");
  expect(($("select") as HTMLSelectElement).value).toBe("06:30");
  expect(($("select") as HTMLSelectElement).selectedOptions[0].textContent).toBe("6:30 AM");
  expect($('[data-testid="office-line-log"]')!.textContent).toContain("Nothing yet");
});

test("the brief time, Off, and the spending switch save at once", async () => {
  settings = { ...base, on: true };
  await render();
  const select = $("select") as HTMLSelectElement;
  await act(async () => {
    select.value = "07:00";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(set).toHaveBeenLastCalledWith("o1", { briefAt: "07:00" });
  await act(async () => {
    select.value = "";
    select.dispatchEvent(new Event("change", { bubbles: true }));
  });
  expect(set).toHaveBeenLastCalledWith("o1", { briefAt: null });
  await click($('input[type="checkbox"]')!);
  expect(set).toHaveBeenLastCalledWith("o1", { allowSpend: true });
});

test("no mobile: it points to Notifications and can't be turned on", async () => {
  settings = { ...base, myMobile: undefined };
  await render();
  expect($('[data-testid="office-line"]')!.textContent).toContain("Add your mobile in Notifications first");
  expect(($('a[href="/settings/organization?tab=notifications"]') as HTMLAnchorElement)).not.toBeNull();
  expect(($('[role="switch"]') as HTMLButtonElement).disabled).toBe(true);
});

test("members see it read-only and no log", async () => {
  settings = { ...base, on: true, canEdit: false };
  await render();
  expect(($('[role="switch"]') as HTMLButtonElement).disabled).toBe(true);
  expect(($("select") as HTMLSelectElement).disabled).toBe(true);
  expect($('[data-testid="office-line"]')!.textContent).toContain("Ask an owner or admin");
  expect($('[data-testid="office-line-log"]')).toBeNull();
});

test("send me a test text", async () => {
  settings = { ...base, on: true };
  await render();
  await click(button("Send me a test text"));
  expect(sendTest).toHaveBeenCalledWith("o1");
  expect($('[role="status"]')!.textContent).toBe("Sent to (432) 555-0100.");
});

test("not set up yet on Webb Leads' side: says so", async () => {
  settings = { ...base, on: true, ready: { texting: true, assistant: false } };
  await render();
  expect($('[data-testid="office-line"]')!.textContent).toContain("finishing the line’s setup");
});

test("the log: texts each way, and a waiting ask answered with Do it", async () => {
  settings = { ...base, on: true };
  rows = [
    { id: "r3", at: "2026-11-03T13:00:00.000Z", direction: "internal", kind: "ask", text: "#1 Text the cabinet PO to Midland Cabinet", ask: { id: "a1", number: 1, status: "pending" } },
    { id: "r2", at: "2026-11-03T12:59:00.000Z", direction: "out", kind: "message", text: "Saved #1. Reply YES 1." },
    { id: "r1", at: "2026-11-03T12:58:00.000Z", direction: "in", kind: "message", text: "send the cabinet PO" },
  ];
  await render();
  const items = Array.from(document.body.querySelectorAll('[data-testid="office-line-row"]')).map((r) => r.textContent);
  expect(items[0]).toContain("Asked");
  expect(items[0]).toContain("Waiting on you");
  expect(items[1]).toContain("Office line");
  expect(items[2]).toContain("You");
  jest.useFakeTimers();
  await act(async () => {
    button("Do it").click();
  });
  await act(async () => {
    jest.advanceTimersByTime(1600);
  });
  await act(async () => {});
  expect(answer).toHaveBeenCalledWith("o1", "a1", true);
  expect(document.body.querySelector('[data-testid="office-line-row"]')!.textContent).toContain("Done");
  expect(button("Do it")).toBeUndefined();
});
