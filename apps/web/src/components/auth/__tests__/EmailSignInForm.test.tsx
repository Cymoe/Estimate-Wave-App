import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const signInWithPassword = jest.fn();
jest.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ signInWithPassword }) }));
jest.mock('../../../lib/convex', () => ({ convexConfigured: true, convexHost: 'convex.example' }));

import { EmailSignInForm } from '../EmailSignInForm';

const flush = () => act(async () => { for (let i = 0; i < 3; i++) await Promise.resolve(); });
function type(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}
const input = (selector: string) => document.body.querySelector(selector) as HTMLInputElement;
const submit = async (form: string) => {
  await act(async () => (document.body.querySelector(form) as HTMLFormElement).requestSubmit());
  await flush();
};

afterEach(() => {
  document.body.innerHTML = '';
  jest.clearAllMocks();
});

describe('email sign-in', () => {
  it('asks for the emailed code when the server wants the address proven, then signs in with it', async () => {
    signInWithPassword.mockResolvedValueOnce({ signingIn: false }).mockResolvedValueOnce({ signingIn: true });
    const onDone = jest.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => createRoot(container).render(<MemoryRouter><EmailSignInForm onDone={onDone} /></MemoryRouter>));
    await act(async () => type(input('input[type="email"]'), 'ana@basinpaint.example'));
    await act(async () => type(input('input[type="password"]'), 'correct horse'));
    await submit('[data-testid="email-signin-form"]');
    expect(signInWithPassword).toHaveBeenCalledWith({ email: 'ana@basinpaint.example', password: 'correct horse', flow: 'signIn', name: undefined });
    expect(onDone).not.toHaveBeenCalled();
    expect(document.body.textContent).toContain('We emailed a 6-digit code to ana@basinpaint.example');
    const code = input('input[aria-label="6-digit code"]');
    expect(code).not.toBeNull();
    await act(async () => type(code, '48 2910'));
    expect(code.value).toBe('482910');
    await submit('[data-testid="email-code-form"]');
    expect(signInWithPassword).toHaveBeenLastCalledWith({ email: 'ana@basinpaint.example', flow: 'email-verification', code: '482910' });
    expect(onDone).toHaveBeenCalled();
  });

  it('says plainly when the code is wrong, and can send a new one', async () => {
    signInWithPassword
      .mockResolvedValueOnce({ signingIn: false })
      .mockRejectedValueOnce(new Error('[CONVEX M(auth:signIn)] Could not verify code'))
      .mockResolvedValueOnce({ signingIn: false });
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => createRoot(container).render(<MemoryRouter><EmailSignInForm /></MemoryRouter>));
    await act(async () => type(input('input[type="email"]'), 'ana@basinpaint.example'));
    await act(async () => type(input('input[type="password"]'), 'correct horse'));
    await submit('[data-testid="email-signin-form"]');
    await act(async () => type(input('input[aria-label="6-digit code"]'), '000000'));
    await submit('[data-testid="email-code-form"]');
    expect(document.body.textContent).toContain("That code isn't right or has expired");
    await act(async () => (Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent === 'Send a new code') as HTMLButtonElement).click());
    await flush();
    expect(signInWithPassword).toHaveBeenCalledTimes(3);
    expect(signInWithPassword.mock.calls[2][0]).toMatchObject({ flow: 'signIn', email: 'ana@basinpaint.example' });
  });
});
