import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { ProgressRing } from '../ProgressRing';
import { completionOf } from '../useProjectShortcuts';

jest.mock('../../../lib/api', () => ({ tasksAPI: {} }));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

async function ring(percent: number) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => createRoot(container).render(<ProgressRing percent={percent} />));
  return container.querySelector('[data-testid="progress-ring"]') as HTMLElement;
}
const filled = (el: HTMLElement) => {
  const fill = el.querySelector('[data-testid="progress-ring-fill"]');
  if (!fill) return 0;
  const [done, total] = fill.getAttribute('stroke-dasharray')!.split(' ').map(Number);
  return Math.round((done / total) * 100);
};

afterEach(() => {
  document.body.innerHTML = '';
});

test('fills blue as tasks get done, and closes green when the job is complete', async () => {
  let el = await ring(0);
  expect([el.textContent, filled(el), el.getAttribute('aria-label')]).toEqual(['0%', 0, '0% complete']);
  document.body.innerHTML = '';
  el = await ring(38);
  expect([el.textContent, filled(el), el.dataset.done]).toEqual(['38%', 38, 'false']);
  expect(el.querySelector('[data-testid="progress-ring-fill"]')!.getAttribute('stroke')).toBe('#3B82F6');
  document.body.innerHTML = '';
  el = await ring(100);
  expect([el.textContent, filled(el), el.dataset.done, el.getAttribute('aria-label')]).toEqual(['100%', 100, 'true', 'Complete']);
  expect(el.querySelector('[data-testid="progress-ring-fill"]')!.getAttribute('stroke')).toBe('#22C55E');
});

test('completion: tasks done out of all of them; 100 once completed or signed off; nothing without tasks', () => {
  expect(completionOf('active', { done: 3, total: 8, signedOff: false })).toBe(38);
  expect(completionOf('planned', { done: 0, total: 5, signedOff: false })).toBe(0);
  expect(completionOf('active', { done: 2, total: 8, signedOff: true })).toBe(100);
  expect(completionOf('completed', { done: 1, total: 8, signedOff: false })).toBe(100);
  expect(completionOf('completed', undefined)).toBe(100);
  expect(completionOf('planned', { done: 0, total: 0, signedOff: false })).toBeUndefined();
  expect(completionOf('planned', undefined)).toBeUndefined();
});
