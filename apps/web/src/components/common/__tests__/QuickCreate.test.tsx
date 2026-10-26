import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// The owner sees every staff tool, so this is where Client, Market lead and Company used to show.
jest.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: { id: 'u1', role: 'super_admin' } }) }));

import { QuickCreateButton } from '../QuickCreateButton';
import { QuickCreateMenu } from '../QuickCreateMenu';
import { MobileCreateMenu } from '../../layouts/MobileCreateMenu';

const animate = jest.fn();
beforeAll(() => {
  (HTMLElement.prototype as unknown as { animate: typeof animate }).animate = animate;
});
afterEach(() => {
  document.body.innerHTML = '';
  animate.mockClear();
});

function mount() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  const render = (isOpen: boolean) =>
    act(async () =>
      root.render(
        <MemoryRouter>
          <QuickCreateButton isOpen={isOpen} onClick={() => {}}>
            <QuickCreateMenu isOpen={isOpen} onClose={() => {}} />
          </QuickCreateButton>
          <MobileCreateMenu isOpen={isOpen} onClose={() => {}} />
        </MemoryRouter>,
      ),
    );
  return { container, render };
}

describe('the yellow + button', () => {
  it('creates leads, estimates, bids, projects and price book items, on desktop and phone', async () => {
    const { container, render } = mount();
    await render(true);
    expect(Array.from(container.querySelectorAll('[role="menu"] li')).map((li) => li.textContent)).toEqual(['Lead', 'Estimate', 'Bid', 'Project', 'Price book item']);
    expect(container.textContent).toContain('New leadSomeone asking about work');
    expect(container.textContent).toContain('New bidWhat a lead is worth to you');
    expect(container.textContent).toContain('New price book itemAdd to your price book');
    for (const gone of ['Client', 'Market lead', 'Company']) expect(container.textContent).not.toContain(gone);
  });

  it('pops, bursts a ring and spins the + into a × each time it opens', async () => {
    const { container, render } = mount();
    await render(false);
    expect(animate).not.toHaveBeenCalled();
    await render(true);
    expect(animate).toHaveBeenCalledTimes(2);
    const plus = container.querySelector('button[aria-label="Close"] svg') as SVGElement;
    expect(plus.style.transform).toBe('rotate(135deg)');
    await render(false);
    expect(animate).toHaveBeenCalledTimes(2);
    await render(true);
    expect(animate).toHaveBeenCalledTimes(4);
  });

  it('springs the choices out nearest-first, and drops them at once on close', async () => {
    const { container, render } = mount();
    await render(true);
    const items = Array.from(container.querySelectorAll('[role="menu"] li')) as HTMLElement[];
    expect(items.map((li) => li.style.transition.match(/ (\d+)ms,/)![1])).toEqual(['80', '60', '40', '20', '0']);
    await render(false);
    expect(items[0].style.transition).toBe('transform 100ms ease-in, opacity 100ms ease-in');
    expect(items[0].style.opacity).toBe('0');
  });
});
