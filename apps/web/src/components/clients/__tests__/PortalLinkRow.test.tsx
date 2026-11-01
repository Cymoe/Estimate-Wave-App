import { createRoot } from 'react-dom/client';
import { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let token: string | null = null;
const link = jest.fn(async () => (token = 'abc'));
const turnOff = jest.fn(async () => ((token = null), null));
jest.mock('../../../lib/api', () => ({
  portalAPI: { current: async () => token, link: () => link(), turnOff: () => turnOff() },
  portalUrl: (t: string) => `https://app.example/portal/${t}`,
}));
const shared: Array<[string, string, string]> = [];
jest.mock('../../estimates/estimateActions', () => ({
  shareOrCopy: async (url: string, title: string, text: string) => (shared.push([url, title, text]), 'copied'),
}));

import { PortalLinkRow } from '../PortalLinkRow';

const flush = () =>
  act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
async function render(language: 'en' | 'es' = 'en') {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => createRoot(container).render(<PortalLinkRow clientId="c1" clientName="Ann Miller" language={language} />));
  await flush();
}
const button = (text: string) => Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent === text) as HTMLButtonElement;

afterEach(() => {
  document.body.innerHTML = '';
  token = null;
  shared.length = 0;
  jest.clearAllMocks();
  jest.restoreAllMocks();
});

describe("the client's portal link", () => {
  it('makes the link the first time and shares it with a note in their language', async () => {
    await render();
    expect(document.body.textContent).toContain('Not shared yet');
    await act(async () => button('Get link').click());
    await flush();
    expect(link).toHaveBeenCalled();
    expect(shared[0]).toEqual(['https://app.example/portal/abc', 'Your job page', "Hi Ann, here's your page with everything for your job:"]);
    expect(document.body.textContent).toContain('Link copied');
    expect(button('Share link')).toBeTruthy();
  });

  it('turns it off after asking; sharing again makes a new one', async () => {
    token = 'abc';
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    await render('es');
    await act(async () => button('Share link').click());
    await flush();
    expect(link).not.toHaveBeenCalled();
    expect(shared[0][2]).toBe('Hola Ann, aquí está tu página con todo lo de tu trabajo:');
    await act(async () => button('Turn off').click());
    await flush();
    expect(turnOff).toHaveBeenCalled();
    expect(document.body.textContent).toContain('Turned off');
    expect(button('Get link')).toBeTruthy();
  });
});
