import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

jest.mock('../../lib/api', () => ({
  recruitingPublicAPI: {
    salesInfo: async () => ({ service: 'National Sales Registry', monthly: 3000, perHire: 300, bookingUrl: 'https://cal.com/myles/15', phone: null }),
  },
}));

import RecruitLandingPage from '../RecruitLandingPage';

async function render(path: string) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => createRoot(container).render(<MemoryRouter initialEntries={[path]}><RecruitLandingPage /></MemoryRouter>));
  await act(async () => {});
  return container;
}

afterEach(() => {
  document.body.innerHTML = '';
  jest.useRealTimers();
});

describe('the National Sales Registry sales page', () => {
  it('shows the offer, the prices from the deployment, and Book a call to the booking link', async () => {
    const page = await render('/recruit');
    expect(page.querySelector('h1')!.textContent).toBe('We fill your door-knocking team.');
    expect(page.querySelector('[data-testid="recruit-price"]')!.textContent).toContain('$3,000/month + $300 per hire');
    const book = Array.from(page.querySelectorAll('a')).find((a) => a.textContent === 'Book a 15-minute call')!;
    expect(book.getAttribute('href')).toBe('https://cal.com/myles/15');
  });

  it('plays the screening one text at a time', async () => {
    jest.useFakeTimers();
    const page = await render('/recruit');
    const demo = page.querySelector('[data-testid="recruit-demo"]')!;
    expect(demo.querySelectorAll('li')).toHaveLength(1);
    // Each text schedules the next once it shows.
    for (let i = 0; i < 12; i++) await act(async () => void jest.advanceTimersByTime(2_000));
    expect(demo.querySelectorAll('li').length).toBeGreaterThan(10);
    expect(demo.textContent).toContain('Scored A and booked');
  });

  it('thanks a client who just paid', async () => {
    const page = await render('/recruit?paid=1');
    expect(page.querySelector('[role="status"]')!.textContent).toContain("You're all set");
  });
});
