import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const submit = jest.fn(async (): Promise<{ duplicate: boolean; id?: string }> => ({ duplicate: false, id: 'a1' }));
jest.mock('../../lib/api', () => ({
  applicationsAPI: {
    options: async () => ({ trades: [{ slug: 'painting', name: 'Painting' }, { slug: 'concrete', name: 'Concrete' }], counties: ['Midland', 'Ector', 'Travis'], westTexas: ['Midland', 'Ector'] }),
    submit: (form: unknown) => submit(form),
  },
}));
jest.mock('../../components/auth/AuthButtons', () => ({ AuthButtons: () => <div data-testid="auth-buttons">Sign in with Google</div> }));

import LeadsLanding from '../LeadsLanding';

const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
const buttons = () => Array.from(document.body.querySelectorAll('button'));
const byText = (text: string) => buttons().find((b) => b.textContent?.trim() === text);
function type(selector: string, value: string) {
  const el = document.body.querySelector(selector) as HTMLInputElement | HTMLSelectElement;
  const proto = el instanceof HTMLSelectElement ? HTMLSelectElement.prototype : el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event(el instanceof HTMLSelectElement ? 'change' : 'input', { bubbles: true }));
}
async function render(scrollTo?: 'apply', path = '/') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () =>
    createRoot(container).render(
      <MemoryRouter initialEntries={[path]}>
        <LeadsLanding scrollTo={scrollTo} />
      </MemoryRouter>,
    ),
  );
  await flush();
}

beforeAll(() => {
  Element.prototype.scrollIntoView = jest.fn();
});
afterEach(() => {
  document.body.innerHTML = '';
  jest.clearAllMocks();
});

describe('lead-buyer landing page', () => {
  it('says what it sells, names the four ways in, and scrolls to them', async () => {
    await render();
    const text = document.body.textContent!;
    expect(document.body.querySelector('h1')!.textContent).toBe('Stop wondering where your next job is coming from.');
    expect(text).toContain('painters, landscapers, concrete crews, builders, remodelers & lighting companies in West Texas');
    for (const way of ['Standing bids', 'Marketplace', 'The Vault', 'Pro plan']) expect(text).toContain(way);
    expect(text).toContain('$99 a month');
    expect(text).toContain('Load a balance of $5,000 or more');
    expect(text).toContain('Load $10,000 and we add $1,000 (10% bonus)');
    expect(text).toContain('Our team confirms it by phone');
    await act(async () => byText('See your options')!.click());
    expect(document.getElementById('bids')!.scrollIntoView).toHaveBeenCalled();
  });

  it('takes an application and thanks them', async () => {
    await render();
    expect(document.body.querySelector('[aria-pressed]')).not.toBeNull();
    await act(async () => type('input[placeholder="Basin Paint Co."]', 'Basin Paint Co.'));
    await act(async () => type('input[placeholder="Ana Ruiz"]', 'Ana Ruiz'));
    await act(async () => type('input[type="tel"]', '(432) 555-0199'));
    await act(async () => type('input[type="email"]', 'ana@basinpaint.example'));
    await act(async () => byText('Painting')!.click());
    expect(byText('Painting')!.getAttribute('aria-pressed')).toBe('true');
    await act(async () => type('select[aria-label="County"]', 'Midland'));
    expect(Array.from(document.body.querySelectorAll('optgroup')).map((g) => g.label)).toEqual(['West Texas', 'Rest of Texas']);
    await act(async () => (document.body.querySelector('form[aria-label="Apply"]') as HTMLFormElement).requestSubmit());
    await flush();
    expect(submit).toHaveBeenCalledWith({ companyName: 'Basin Paint Co.', contactName: 'Ana Ruiz', email: 'ana@basinpaint.example', phone: '(432) 555-0199', trades: ['painting'], county: 'Midland', jobsPerMonth: undefined, notes: undefined });
    expect(document.body.querySelector('[role="status"]')!.textContent).toContain("You're in the queue");
  });

  it('refuses to send with no trade picked, and tells a repeat applicant they are already listed', async () => {
    await render();
    await act(async () => type('input[placeholder="Basin Paint Co."]', 'Basin Paint Co.'));
    await act(async () => type('input[placeholder="Ana Ruiz"]', 'Ana'));
    await act(async () => type('input[type="tel"]', '4325550199'));
    await act(async () => type('input[type="email"]', 'a@b.co'));
    await act(async () => type('select[aria-label="County"]', 'Ector'));
    await act(async () => (document.body.querySelector('form[aria-label="Apply"]') as HTMLFormElement).requestSubmit());
    expect(document.body.querySelector('[role="alert"]')!.textContent).toBe('Pick at least one trade.');
    expect(submit).not.toHaveBeenCalled();
    submit.mockResolvedValueOnce({ duplicate: true, id: undefined });
    await act(async () => byText('Concrete')!.click());
    await act(async () => (document.body.querySelector('form[aria-label="Apply"]') as HTMLFormElement).requestSubmit());
    await flush();
    expect(document.body.querySelector('[role="status"]')!.textContent).toContain("You're already on the list");
  });

  it('opens sign-in straight away when an alert link sent a signed-out person here', async () => {
    await render(undefined, `/?next=${encodeURIComponent('/leads?lead=abc&ack=1')}`);
    const dialog = document.body.querySelector('[role="dialog"]')!;
    expect(dialog.textContent).toContain('Sign in to see your lead');
    expect(dialog.textContent).toContain('Sign in with Google');
    document.body.innerHTML = '';
    await render(undefined, `/?next=${encodeURIComponent('/bids')}`);
    expect(document.body.querySelector('[role="dialog"]')!.textContent).toContain('Sign in to get back where you were');
    document.body.innerHTML = '';
    await render();
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
  });

  it('says so when sign-in came back with an error', async () => {
    await render(undefined, '/?error=OAuthAccountNotLinked');
    expect(document.body.querySelector('[role="alert"]')?.textContent).toContain("Sign-in didn't work: OAuthAccountNotLinked. Try again, or continue with Google.");
  });

  it('opens on the form from /apply, and Sign in opens the sign-in dialog', async () => {
    await render('apply');
    expect(document.getElementById('apply')!.scrollIntoView).toHaveBeenCalled();
    await act(async () => byText('Sign in')!.click());
    expect(document.body.querySelector('[role="dialog"]')!.textContent).toContain('Sign in with Google');
  });
});
