import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { askConfirm, notify } from '../appDialogs';
import { AppDialogs } from '../AppDialogsHost';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('the app-wide confirm and toast', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it("asks with the app's dialog, not the browser's, and answers with the button pressed", async () => {
    window.confirm = jest.fn(() => true);
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(<AppDialogs />));

    let answer: boolean | undefined;
    await act(async () => {
      askConfirm({ title: 'Delete this photo?', confirmLabel: 'Delete' }).then((yes) => (answer = yes));
    });
    const dialog = document.body.querySelector('[role="alertdialog"]')!;
    expect(dialog.textContent).toContain('Delete this photo?');
    expect(window.confirm).not.toHaveBeenCalled();
    await act(async () => (Array.from(dialog.querySelectorAll('button')).find((b) => b.textContent === 'Delete') as HTMLButtonElement).click());
    expect(answer).toBe(true);
    expect(document.body.querySelector('[role="alertdialog"]')).toBeNull();

    await act(async () => {
      askConfirm({ title: 'Delete this task?' }).then((yes) => (answer = yes));
    });
    await act(async () => (Array.from(document.body.querySelectorAll('[role="alertdialog"] button')).find((b) => b.textContent === 'Cancel') as HTMLButtonElement).click());
    expect(answer).toBe(false);
    act(() => root.unmount());
  });

  it('notify shows a toast instead of an alert', async () => {
    window.alert = jest.fn();
    const host = document.createElement('div');
    document.body.appendChild(host);
    const root = createRoot(host);
    await act(async () => root.render(<AppDialogs />));
    await act(async () => notify('Link copied. Paste it into a text or email to your client.'));
    expect(document.body.querySelector('[role="status"]')!.textContent).toContain('Link copied');
    expect(window.alert).not.toHaveBeenCalled();
    act(() => root.unmount());
  });
});
