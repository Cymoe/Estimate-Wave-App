import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, useNavigate } from 'react-router-dom';
import { ScrollRestoration } from '../ScrollRestoration';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let goTo: (to: string) => void = () => {};
const Nav = () => {
  goTo = useNavigate();
  return null;
};

describe('ScrollRestoration', () => {
  beforeEach(() => {
    window.scrollTo = jest.fn();
    jest.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
      cb(0);
      return 0;
    });
  });
  afterEach(() => {
    document.body.innerHTML = '';
    jest.restoreAllMocks();
  });

  it('keeps the estimates list where it was when an estimate opens and closes, but resets elsewhere', async () => {
    const list = document.createElement('div');
    list.className = 'overflow-y-auto';
    document.body.appendChild(list);
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () =>
      createRoot(container).render(
        <MemoryRouter initialEntries={['/work']}>
          <Nav />
          <ScrollRestoration />
        </MemoryRouter>,
      ),
    );

    list.scrollTop = 400;
    await act(async () => goTo('/estimates/e1'));
    expect(list.scrollTop).toBe(400);
    await act(async () => goTo('/work'));
    expect(list.scrollTop).toBe(400);

    await act(async () => goTo('/estimates/e1/contract'));
    expect(list.scrollTop).toBe(0);

    list.scrollTop = 250;
    await act(async () => goTo('/projects'));
    expect(list.scrollTop).toBe(0);
  });
});
