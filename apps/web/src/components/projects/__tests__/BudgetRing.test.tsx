import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { BudgetRing } from '../BudgetRing';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function ring(percent: number) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => createRoot(container).render(<BudgetRing percent={percent} />));
  return container.querySelector('[data-testid="budget-ring"]') as HTMLElement;
}
const filled = (el: HTMLElement) => {
  const fill = el.querySelector('[data-testid="budget-ring-fill"]');
  if (!fill) return 0;
  const [done, total] = fill.getAttribute('stroke-dasharray')!.split(' ').map(Number);
  return Math.round((done / total) * 100);
};

afterEach(() => {
  document.body.innerHTML = '';
});

test('an empty ring at 0%, with the number beside it', async () => {
  const el = await ring(0);
  expect(el.textContent).toBe('0%');
  expect(filled(el)).toBe(0);
  expect(el.getAttribute('aria-label')).toBe('0% of the budget spent');
});

test('fills with what is spent: blue, amber from 90%, red and closed past the budget', async () => {
  let el = await ring(42);
  expect([el.textContent, filled(el), el.dataset.tone]).toEqual(['42%', 42, 'ok']);
  document.body.innerHTML = '';
  el = await ring(93);
  expect(el.dataset.tone).toBe('near');
  expect(el.querySelector('[data-testid="budget-ring-fill"]')!.getAttribute('stroke')).toBe('#F59E0B');
  document.body.innerHTML = '';
  el = await ring(128);
  expect([el.textContent, filled(el), el.dataset.tone]).toEqual(['128%', 100, 'over']);
  expect(el.querySelector('[data-testid="budget-ring-fill"]')!.getAttribute('stroke')).toBe('#EF4444');
});
