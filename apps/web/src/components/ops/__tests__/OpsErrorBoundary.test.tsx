import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { OpsErrorBoundary } from '../OpsErrorBoundary';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let broken = true;
function Tab() {
  if (broken) throw new Error('Cannot read properties of undefined');
  return <p>Intake queue</p>;
}

afterEach(() => {
  document.body.innerHTML = '';
  broken = true;
});

describe('a tab that crashes', () => {
  it('says what broke and offers Go to Intake, which clears the error and moves on', async () => {
    jest.spyOn(console, 'error').mockImplementation(() => {});
    const onHome = jest.fn(() => {
      broken = false;
    });
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => createRoot(container).render(<OpsErrorBoundary onHome={onHome}><Tab /></OpsErrorBoundary>));
    const alert = container.querySelector('[data-testid="ops-crashed"]')!;
    expect(alert.textContent).toContain('Cannot read properties of undefined');
    const labels = Array.from(alert.querySelectorAll('button')).map((b) => b.textContent);
    expect(labels).toEqual(['Try again', 'Go to Intake', 'Reload the page']);
    await act(async () => (Array.from(alert.querySelectorAll('button')).find((b) => b.textContent === 'Go to Intake') as HTMLButtonElement).click());
    expect(onHome).toHaveBeenCalled();
    expect(container.textContent).toBe('Intake queue');
  });
});
