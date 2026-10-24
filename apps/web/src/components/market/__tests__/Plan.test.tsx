import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const active = { status: 'active', active: true, monthlyCents: 9900, claimsIncluded: 10, extraClaimCents: 1500, claimsLeft: 10, nextClaimCents: 0, periodStart: '2026-10-01T00:00:00Z', nextChargeAt: '2026-11-01T00:00:00Z' };
let plan: unknown = active;
let role = 'user';
const ensurePlan = jest.fn(async () => plan);
const startPlan = jest.fn(async () => {
  throw new Error('Balance too low: $99.00 needed, $12.00 available');
});
const createLink = jest.fn(async () => 'tok');

jest.mock('../../../lib/api', () => ({
  walletAPI: {
    get: async () => ({ balanceCents: 1200, typicalLeadCents: 5000, spentCents: 0, leadsBought: 0, wonCents: 0, wonCount: 0, transactions: [], plan }),
    ensurePlan: () => ensurePlan(),
    startPlan: () => startPlan(),
    cancelPlan: async () => undefined,
  },
  fundingAPI: { createLink: () => createLink(), url: (t: string) => `/fund/${t}` },
}));
jest.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', role } }) }));
jest.mock('../../layouts/DashboardLayout', () => ({
  OrganizationContext: require('react').createContext({ selectedOrg: { id: 'o2', name: 'Mio Homes', industry: 'Landscaping' } }),
}));

import { PlanGate, PlanPanel, planLabel } from '../plan';

const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
async function render(node: React.ReactNode) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => createRoot(container).render(<MemoryRouter>{node}</MemoryRouter>));
  await flush();
  return container;
}
afterEach(() => {
  document.body.innerHTML = '';
  jest.clearAllMocks();
  plan = active;
  role = 'user';
});

describe('the monthly plan', () => {
  it('labels every state', () => {
    const now = Date.parse('2026-10-20T00:00:00Z');
    expect(planLabel(null)).toBe('No plan');
    expect(planLabel({ ...active, status: 'trial', nextChargeAt: '2026-10-31T00:00:00Z' }, now)).toBe('Trial · 11 days left');
    expect(planLabel({ ...active, status: 'trial', active: false }, now)).toBe('Trial ended');
    expect(planLabel(active, now)).toBe('Pro plan');
    expect(planLabel({ ...active, monthlyCents: 0 }, now)).toBe('Pro plan · comped');
    expect(planLabel({ ...active, status: 'past_due', active: false }, now)).toBe('Plan paused');
    expect(planLabel({ ...active, status: 'cancelled', active: false }, now)).toBe('Plan ended');
  });

  it('shows the page while the plan is on, and starts the trial on first visit', async () => {
    const container = await render(<PlanGate><p>Estimates list</p></PlanGate>);
    expect(ensurePlan).toHaveBeenCalled();
    expect(container.textContent).toContain('Estimates list');
    expect(container.querySelector('[data-testid="plan-panel"]')).toBeNull();
  });

  it('replaces the page with the plan panel once the trial is over, and offers Add funds when the balance is short', async () => {
    plan = { ...active, status: 'trial', active: false, nextChargeAt: '2026-09-01T00:00:00Z' };
    const container = await render(<PlanGate><p>Estimates list</p></PlanGate>);
    expect(container.textContent).not.toContain('Estimates list');
    expect(container.textContent).toContain('Your trial has ended');
    const start = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Start the Pro plan · $99.00 now')!;
    await act(async () => start.click());
    await flush();
    expect(startPlan).toHaveBeenCalled();
    expect(container.querySelector('[role="alert"]')?.textContent).toContain('Balance too low');
    expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Add funds')).toBe(true);
  });

  it('offers to resume a paid month or continue after the trial without charging again', async () => {
    plan = { ...active, status: 'cancelled', nextChargeAt: '2026-11-01T00:00:00Z' };
    let container = await render(<PlanGate><p>Estimates list</p></PlanGate>);
    // Cancelled but paid up: the page stays open, and the plan panel on /plan would offer to resume.
    expect(container.textContent).toContain('Estimates list');
    document.body.innerHTML = '';
    container = await render(<PlanPanel organizationId="o2" plan={plan} />);
    const resume = Array.from(container.querySelectorAll('button')).find((b) => b.textContent?.startsWith('Resume the Pro plan · paid through'))!;
    expect(resume).toBeDefined();
    startPlan.mockImplementationOnce(async () => ({ ...active, chargedCents: 0 }));
    await act(async () => resume.click());
    await flush();
    // The toast renders at the bottom of the page, outside the panel.
    expect(document.body.textContent).toContain("You're on the Pro plan. The next $99.00 comes off your lead balance on");
    expect(document.body.textContent).not.toContain('came off your lead balance');
    document.body.innerHTML = '';
    const trial = { ...active, status: 'trial', nextChargeAt: '2026-10-31T00:00:00Z' };
    container = await render(<PlanPanel organizationId="o2" plan={trial} />);
    expect(Array.from(container.querySelectorAll('button')).some((b) => b.textContent?.startsWith('Continue after the trial · first $99.00 on'))).toBe(true);
  });

  it('asks before cancelling the plan, and keeps it when the answer is no', async () => {
    const container = await render(<PlanPanel organizationId="o2" plan={active} />);
    await act(async () => Array.from(container.querySelectorAll('button')).find((b) => b.textContent === 'Cancel plan')!.click());
    const dialog = document.body.querySelector('[role="dialog"], [role="alertdialog"]')!;
    expect(dialog.textContent).toContain('Cancel the Pro plan?');
    expect(dialog.textContent).toContain('stay open until');
    await act(async () => Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Keep it')!.click());
    await flush();
    expect(document.body.textContent).not.toContain('Plan cancelled');
  });

  it('gates a super admin too when the company they are looking at is off the plan', async () => {
    role = 'super_admin';
    plan = { ...active, status: 'cancelled', active: false };
    const container = await render(<PlanGate><p>Estimates list</p></PlanGate>);
    expect(container.textContent).not.toContain('Estimates list');
    expect(container.textContent).toContain('Your plan has ended');
  });
});
