import { createRoot } from 'react-dom/client';
import { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

type Check = { ok: true; phone: string } | { ok: false; reason: string };
let checkResult: Check = { ok: true, phone: '4325550123' };
const list = jest.fn<Promise<unknown>, [{ kind: string; trade?: string; street?: string }]>(async () => ({
  kind: 'trade_permits',
  tradeName: 'Roofing',
  streets: [{ street: 'Howdy Dr', permits: 2 }],
  homes: [
    { parcelId: 'p1', owner: 'Cole Jane', address: '2709 Howdy Dr', street: 'Howdy Dr', zip: '79705', marketValueCents: 31_000_000, deedDate: '2019-04-02', why: '2 roofing permits on Howdy Dr in the last 30 days' },
    { parcelId: 'p2', owner: 'Reyes Samuel', address: '2711 Howdy Dr', street: 'Howdy Dr', why: '2 roofing permits on Howdy Dr in the last 30 days' },
  ],
}));
const check = jest.fn<Promise<Check>, [string]>(async () => checkResult);
const log = jest.fn<Promise<string>, [Record<string, unknown>]>(async () => 'c1');
const takeLead = jest.fn<Promise<{ id: string; duplicate: boolean }>, [Record<string, unknown>]>(async () => ({ id: 'i1', duplicate: false }));
const myDay = jest.fn(async () => ({
  calls: 4,
  answered: 1,
  leads: 0,
  hours: { open: true },
  brand: 'Permian Home Quotes',
  callbacks: [{ id: 'c9', parcelId: 'p7', phone: '4325550177', address: '12 Elm St', owner: 'Hall James', trade: 'roofing', callbackAt: '2026-10-28T15:00:00.000Z', note: 'After work' }],
}));

jest.mock('../../lib/api', () => ({
  industriesAPI: { list: async () => [{ id: 'roofing', name: 'Roofing' }, { id: 'hvac', name: 'HVAC' }] },
  callsAPI: {
    myDay: () => myDay(),
    list: (args: { kind: string; trade?: string; street?: string }) => list(args),
    check: (phone: string) => check(phone),
    log: (args: Record<string, unknown>) => log(args),
    takeLead: (args: Record<string, unknown>) => takeLead(args),
  },
}));
jest.mock('../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'caller', name: 'Dana Ruiz' } }) }));

import CallsPage from '../CallsPage';

const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
const click = async (el: Element) => {
  await act(async () => (el as HTMLElement).click());
  await flush();
};
const button = (root: ParentNode, text: string) => Array.from(root.querySelectorAll('button')).find((b) => b.textContent?.trim() === text)!;
function type(el: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!;
  setter.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

async function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => createRoot(container).render(<CallsPage />));
  await flush();
  return container;
}

afterEach(() => {
  document.body.innerHTML = '';
  jest.clearAllMocks();
  checkResult = { ok: true, phone: '4325550123' };
});

describe('the Calls page', () => {
  it('shows the day, lists homes, checks the number before it is dialable, and logs how it went', async () => {
    const page = await render();
    expect(page.querySelector('[data-testid="my-day"]')!.textContent).toBe('Today: 4 calls · 1 answered · 0 leads');
    expect(page.textContent).toContain('After work');
    await click(button(page, 'Show homes'));
    expect(list).toHaveBeenCalledWith({ kind: 'trade_permits', trade: 'roofing', street: undefined });
    expect(page.textContent).toContain('Streets: Howdy Dr (2)');
    const homes = page.querySelector('[data-testid="homes"]')!;
    expect(homes.textContent).toContain('2 roofing permits on Howdy Dr in the last 30 days · worth $310,000 · owned since Apr 2019');

    await click(homes.querySelector('button')!);
    const dialog = document.body.querySelector('[role="dialog"]')!;
    const script = dialog.querySelector('[data-testid="call-script"]')!.textContent!;
    expect(script).toContain('Hi, this is Dana with Permian Home Quotes');
    expect(script).toContain('A few homes on Howdy Dr have had roofing work done lately');
    expect(dialog.querySelector('[data-testid="consent-line"]')!.textContent).toBe(
      '"Is it okay if one local roofing company from the Permian Home Quotes network calls or texts you at this number about this job?"',
    );

    // Blocked: the reason, and no number to tap.
    checkResult = { ok: false, reason: 'This number is on the National Do Not Call list.' };
    await act(async () => type(dialog.querySelector('input[aria-label="Phone number"]') as HTMLInputElement, '432 555 0100'));
    await click(button(dialog, 'Check'));
    expect(check).toHaveBeenCalledWith('432 555 0100');
    expect(dialog.querySelector('[data-testid="call-blocked"]')!.textContent).toContain('National Do Not Call list');
    expect(dialog.querySelector('[data-testid="dial"]')).toBeNull();

    // Clear: a tel: link, then the outcome.
    checkResult = { ok: true, phone: '4325550123' };
    await act(async () => type(dialog.querySelector('input[aria-label="Phone number"]') as HTMLInputElement, '432-555-0123'));
    await click(button(dialog, 'Check'));
    const dial = dialog.querySelector('[data-testid="dial"]') as HTMLAnchorElement;
    expect(dial.getAttribute('href')).toBe('tel:+14325550123');
    expect(dial.textContent).toContain('(432) 555-0123');
    await click(button(dialog, 'Left voicemail'));
    expect(log).toHaveBeenCalledWith(expect.objectContaining({ phone: '4325550123', outcome: 'voicemail', parcelId: 'p1', address: '2709 Howdy Dr', trade: 'roofing' }));
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(page.textContent).toContain('Logged: 2709 Howdy Dr.');
    // The home called leaves the list.
    expect(page.querySelector('[data-testid="homes"]')!.textContent).not.toContain('Cole Jane');
    expect(myDay).toHaveBeenCalledTimes(2);
  });

  it('takes a lead only once they own the home and said yes to the consent line', async () => {
    const page = await render();
    await click(button(page, 'Show homes'));
    await click(page.querySelector('[data-testid="homes"] button')!);
    const dialog = document.body.querySelector('[role="dialog"]')!;
    await act(async () => type(dialog.querySelector('input[aria-label="Phone number"]') as HTMLInputElement, '4325550123'));
    await click(button(dialog, 'Check'));
    await click(button(dialog, 'Interested'));
    const form = dialog.querySelector('form[aria-label="Take the lead"]')!;
    const send = () => button(form, 'Send to Ops');
    expect(send().disabled).toBe(true);
    const boxes = form.querySelectorAll('input[type="checkbox"]');
    await click(boxes[0]);
    expect(send().disabled).toBe(true);
    await click(boxes[1]);
    expect(send().disabled).toBe(false);
    await act(async () => type(form.querySelector('textarea') as HTMLTextAreaElement, 'Hail damage, wants it before winter'));
    await click(send());
    expect(takeLead).toHaveBeenCalledWith(
      expect.objectContaining({ parcelId: 'p1', phone: '4325550123', name: 'Cole Jane', address: '2709 Howdy Dr', zip: '79705', jobType: 'roofing', notes: 'Hail damage, wants it before winter', isOwner: true, consented: true }),
    );
    expect(page.textContent).toContain("Lead taken: Cole Jane. It's in Ops for someone to confirm.");
  });

  it('opens a callback with its number and note', async () => {
    const page = await render();
    await click(Array.from(page.querySelectorAll('section[aria-label="Callbacks"] button'))[0]);
    const dialog = document.body.querySelector('[role="dialog"]')!;
    expect((dialog.querySelector('input[aria-label="Phone number"]') as HTMLInputElement).value).toBe('4325550177');
    expect(dialog.textContent).toContain('Callback note: After work');
  });

  it('auction buyers are called under the buyer, with their number filled in', async () => {
    list.mockResolvedValueOnce({
      kind: 'auction_buyers',
      tradeName: 'Roofing',
      homes: [{ parcelId: 'p3', owner: 'Basin Flips LLC', phone: '4325550142', address: '2709 Howdy Dr', why: 'Bought at the Oct 6 courthouse auction for $145,000' }],
    });
    const page = await render();
    await click(Array.from(page.querySelectorAll('[role="tab"]')).find((t) => t.textContent === 'Auction buyers')!);
    expect(page.textContent).toContain("Homes bought at Midland's courthouse foreclosure auction in the last 4 months");
    await click(button(page, 'Show homes'));
    expect(list).toHaveBeenLastCalledWith({ kind: 'auction_buyers', trade: 'roofing', street: undefined });
    await click(page.querySelector('[data-testid="homes"] button')!);
    const dialog = document.body.querySelector('[role="dialog"]')!;
    const script = dialog.querySelector('[data-testid="call-script"]')!.textContent!;
    expect(script).toContain('Am I speaking with Basin Flips LLC?');
    expect(script).toContain('I saw you picked up 2709 Howdy Dr at the courthouse auction. Are you planning any work on it?');
    expect((dialog.querySelector('input[aria-label="Phone number"]') as HTMLInputElement).value).toBe('4325550142');
  });

  it('a street list asks for the street', async () => {
    const page = await render();
    await click(Array.from(page.querySelectorAll('[role="tab"]')).find((t) => t.textContent === 'A street')!);
    expect(button(page, 'Show homes').disabled).toBe(true);
    await act(async () => type(page.querySelector('input[aria-label="Street"]') as HTMLInputElement, 'Oak Av'));
    await click(button(page, 'Show homes'));
    expect(list).toHaveBeenCalledWith({ kind: 'street', trade: 'roofing', street: 'Oak Av' });
  });
});
