import { createRoot } from 'react-dom/client';
import { act, useState } from 'react';
import { Dialog } from '../ui';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function Page() {
  const [open, setOpen] = useState(false);
  return (
    <>
      <button type="button" onClick={() => setOpen(true)}>
        Open
      </button>
      {open && (
        <Dialog title="New company" onClose={() => setOpen(false)}>
          <p>Form</p>
        </Dialog>
      )}
    </>
  );
}

afterEach(() => {
  document.body.innerHTML = '';
});

describe('Ops dialogs and panels', () => {
  it('take focus when they open, close on Escape, and hand focus back', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => createRoot(container).render(<Page />));
    const opener = container.querySelector('button')!;
    opener.focus();
    await act(async () => opener.click());
    const dialog = document.body.querySelector('[role="dialog"]')!;
    expect(dialog.getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(dialog);
    // The close button is a full-size tap target.
    expect(dialog.querySelector('button[aria-label="Close"]')!.className).toContain('min-h-[44px]');
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })));
    expect(document.body.querySelector('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(opener);
  });
});
