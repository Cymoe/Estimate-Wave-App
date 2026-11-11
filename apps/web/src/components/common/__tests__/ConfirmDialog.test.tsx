import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { useConfirm } from '../ConfirmDialog';

const answers: boolean[] = [];
let ask: ReturnType<typeof useConfirm>[0];

const Host: React.FC = () => {
  const [confirm, dialog] = useConfirm();
  ask = confirm;
  return <>{dialog}</>;
};

const dialog = () => document.body.querySelector('[role="alertdialog"]');
const button = (label: string) => Array.from(dialog()!.querySelectorAll('button')).find((b) => b.textContent === label)!;
const open = async () => {
  await act(async () => {
    ask({ title: 'Remove this?', message: 'Detail line.', confirmLabel: 'Remove' }).then((yes) => answers.push(yes));
  });
};

describe('useConfirm', () => {
  it('answers yes only from the confirm button, and no from Cancel, Escape or a tap outside', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    await act(async () => root.render(<Host />));
    expect(dialog()).toBeNull();

    await open();
    expect(dialog()?.textContent).toContain('Remove this?');
    expect(dialog()?.textContent).toContain('Detail line.');
    expect(dialog()?.getAttribute('aria-modal')).toBe('true');
    // The box keeps its own background: not the table rows' entrance, whose wash ends transparent and wiped it out.
    const panel = dialog()!.querySelector('[data-testid="confirm-panel"]')!;
    expect(panel.className).toContain('bg-[#1E1E1E]');
    expect(panel.className).not.toContain('animate-row-in');
    expect(panel.className).not.toContain('animate-wash');
    expect(document.activeElement?.textContent).toBe('Cancel');
    await act(async () => button('Cancel').click());
    expect(dialog()).toBeNull();

    await open();
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true })); });
    expect(dialog()).toBeNull();

    await open();
    await act(async () => (document.body.querySelector('[data-testid="confirm-backdrop"]') as HTMLElement).click());
    expect(dialog()).toBeNull();

    await open();
    await act(async () => button('Remove').click());
    expect(dialog()).toBeNull();

    expect(answers).toEqual([false, false, false, true]);
    await act(async () => root.unmount());
  });
});
