import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter } from 'react-router-dom';
import { AppErrorBoundary } from '../AppErrorBoundary';
import { NotFound } from '../../../pages/NotFound';

jest.mock('../../../contexts/AuthContext', () => ({ useAuth: () => ({ user: null }) }));

let root: Root;
let host: HTMLDivElement;
const mount = async (node: React.ReactNode) => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () => root.render(node));
};
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

const Boom: React.FC<{ when: boolean }> = ({ when }) => {
  if (when) throw new Error('kaboom');
  return <p>fine</p>;
};

describe('when a page breaks or does not exist', () => {
  it('a render error shows a message with the reason and a way back, not a blank screen', async () => {
    const quiet = jest.spyOn(console, 'error').mockImplementation(() => {});
    await mount(
      <AppErrorBoundary>
        <Boom when />
      </AppErrorBoundary>,
    );
    const alert = host.querySelector('[data-testid="app-crashed"]')!;
    expect(alert.textContent).toContain('Something broke on this page');
    expect(alert.textContent).toContain('kaboom');
    expect(Array.from(alert.querySelectorAll('button')).map((b) => b.textContent)).toEqual(['Try again', 'Reload the page']);
    quiet.mockRestore();
  });

  it('an unknown address gets a 404 page that points home', async () => {
    await mount(
      <MemoryRouter initialEntries={['/no/such/page']}>
        <NotFound />
      </MemoryRouter>,
    );
    const page = host.querySelector('[data-testid="not-found"]')!;
    expect(page.textContent).toContain('nothing at this address');
    expect(page.textContent).toContain('/no/such/page');
    expect(page.querySelector('a')!.getAttribute('href')).toBe('/');
  });
});
