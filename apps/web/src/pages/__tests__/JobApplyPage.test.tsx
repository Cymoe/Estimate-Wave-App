import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const job = {
  company: 'Acme Roofing',
  role: 'Door-to-door roofing sales rep',
  city: 'Midland, TX',
  perks: 'Paid training, weekly leaderboard',
  service: 'National Sales Registry',
  consent: 'By tapping Apply, you agree that National Sales Registry may text you at this number about the Acme Roofing job. Reply STOP to opt out, HELP for help.',
};
let found: unknown = job;
const apply = jest.fn<Promise<{ existing: boolean }>, unknown[]>(async () => ({ existing: false }));
let hires: unknown = null;
const setHire = jest.fn<Promise<null>, unknown[]>(async () => null);
const hireWatchers: Array<(v: unknown) => void> = [];

jest.mock('../../lib/api', () => ({
  recruitingPublicAPI: {
    job: async () => found,
    apply: (...a: unknown[]) => apply(...a),
    watchHires: (_t: string, cb: (v: unknown) => void) => {
      hireWatchers.push(cb);
      cb(hires);
      return () => {};
    },
    setHire: (...a: unknown[]) => setHire(...a),
  },
}));

import JobApplyPage from '../JobApplyPage';
import HiresPage from '../HiresPage';

async function render(path: string) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () =>
    createRoot(container).render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/jobs/:slug" element={<JobApplyPage />} />
          <Route path="/hires/:token" element={<HiresPage />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  await act(async () => {});
  return container;
}
const type = (el: Element, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
const click = (el: Element) => act(async () => void (el as HTMLElement).click());

afterEach(() => {
  document.body.innerHTML = '';
  jest.clearAllMocks();
  found = job;
  hires = null;
  hireWatchers.length = 0;
});

describe('the apply page', () => {
  it('shows the job and the consent wording; Apply waits for the box, then sends the ad along', async () => {
    const page = await render('/jobs/acme?ad=acme-m1');
    expect(page.textContent).toContain('Acme Roofing is hiring');
    expect(page.querySelector('h1')!.textContent).toBe('Door-to-door roofing sales rep');
    expect(page.textContent).toContain(job.consent);
    const submit = page.querySelector('button[type="submit"]') as HTMLButtonElement;
    await type(page.querySelector('input[autocomplete="name"]')!, 'Dana Cruz');
    await type(page.querySelector('input[type="tel"]')!, '(432) 555-0100');
    expect(submit.disabled).toBe(true);
    await click(page.querySelector('input[type="checkbox"]')!);
    expect(submit.disabled).toBe(false);
    await act(async () => void (page.querySelector('form') as HTMLFormElement).requestSubmit());
    expect(apply).toHaveBeenCalledWith({ slug: 'acme', ad: 'acme-m1', name: 'Dana Cruz', phone: '(432) 555-0100', agreed: true });
    expect(page.querySelector('[data-testid="apply-done"]')!.textContent).toContain('You’re in, Dana');
    expect(page.textContent).toContain('will text you at (432) 555-0100');
  });

  it("says what's wrong in the server's words", async () => {
    apply.mockRejectedValueOnce(new Error('Enter a US cell number, like (432) 555-0100'));
    const page = await render('/jobs/acme');
    await type(page.querySelector('input[autocomplete="name"]')!, 'Dana');
    await type(page.querySelector('input[type="tel"]')!, '555');
    await click(page.querySelector('input[type="checkbox"]')!);
    await act(async () => void (page.querySelector('form') as HTMLFormElement).requestSubmit());
    expect(page.querySelector('[role="alert"]')!.textContent).toBe('Enter a US cell number, like (432) 555-0100');
  });

  it('a closed job says so', async () => {
    found = null;
    const page = await render('/jobs/nope');
    expect(page.textContent).toContain('isn’t taking applications right now');
  });
});

describe("the client's hires link", () => {
  it('lists who interviewed; tapping Hired marks them, tapping it again clears it', async () => {
    hires = {
      company: 'Acme Roofing',
      role: 'Roofing sales rep',
      reps: [
        { id: 'a1', name: 'Dana Cruz', score: 'A', interviewAt: '2026-11-08T16:00:00.000Z', missed: false, outcome: null },
        { id: 'a2', name: 'Lee Park', score: 'B', interviewAt: '2026-11-07T16:00:00.000Z', missed: false, outcome: 'hired' },
      ],
    };
    const page = await render('/hires/tok123');
    const rows = page.querySelectorAll('[data-testid="hire-rep"]');
    expect(rows).toHaveLength(2);
    expect(page.textContent).toContain('1 hired');
    await click(Array.from(rows[0].querySelectorAll('button')).find((b) => b.textContent === 'Hired')!);
    expect(setHire).toHaveBeenCalledWith('tok123', 'a1', 'hired');
    await click(Array.from(rows[1].querySelectorAll('button')).find((b) => b.textContent === 'Hired')!);
    expect(setHire).toHaveBeenLastCalledWith('tok123', 'a2', null);
  });

  it('a wrong link says so', async () => {
    const page = await render('/hires/wrong');
    expect(page.textContent).toContain('This link isn’t valid.');
  });
});
