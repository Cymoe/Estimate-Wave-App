import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let asked: unknown = null;
const approve = jest.fn<Promise<string>, [Record<string, unknown>]>(async () => 'https://claude.ai/api/mcp/auth_callback?code=abc&state=s1');
const goTo = jest.fn<void, [string]>();
jest.mock('../../lib/api', () => ({
  assistantsAPI: {
    request: async () => asked,
    approve: (args: Record<string, unknown>) => approve(args),
  },
}));
jest.mock('../../lib/goTo', () => ({ goTo: (url: string) => goTo(url) }));

import ConnectAssistant from '../ConnectAssistant';

const CALLBACK = 'https://claude.ai/api/mcp/auth_callback';
const query = new URLSearchParams({
  client_id: 'fq_1',
  redirect_uri: CALLBACK,
  state: 's1',
  code_challenge: 'c'.repeat(43),
  resource: 'https://api.example/mcp',
}).toString();

const flush = () => act(async () => { for (let i = 0; i < 5; i++) await Promise.resolve(); });
const button = (text: string) => Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.includes(text))!;

async function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () =>
    createRoot(container).render(
      <MemoryRouter initialEntries={[`/connect?${query}`]}>
        <Routes>
          <Route path="/connect" element={<ConnectAssistant />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  await flush();
  return container;
}

afterEach(() => {
  document.body.innerHTML = '';
  jest.clearAllMocks();
});

const companies = [
  { id: 'org1', name: 'Basin Paint', canSpend: true },
  { id: 'org2', name: 'Peak Roofing', canSpend: false },
];

describe('connecting an assistant', () => {
  it('approves for the picked company, with spending and a daily limit, and goes back to Claude', async () => {
    asked = { ok: true, app: 'claude', appName: 'Claude', domain: 'claude.ai', issuer: 'https://api.example/oauth', companies };
    const page = await render();
    expect(page.textContent).toContain('Claude wants to use Tolliver');
    const spend = page.querySelector('input[type="checkbox"]') as HTMLInputElement;
    await act(async () => spend.click());
    const cap = page.querySelector('#connect-cap') as HTMLInputElement;
    expect(cap.value).toBe('500');
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(cap, '150');
      cap.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => button('Connect').click());
    await flush();
    expect(approve).toHaveBeenCalledWith({
      clientId: 'fq_1',
      redirectUri: CALLBACK,
      codeChallenge: 'c'.repeat(43),
      state: 's1',
      resource: 'https://api.example/mcp',
      organizationId: 'org1',
      spending: true,
      dailyCap: 150,
    });
    expect(goTo).toHaveBeenCalledWith('https://claude.ai/api/mcp/auth_callback?code=abc&state=s1');
  });

  it("doesn't offer spending for a company the person can't spend for, and Cancel tells the assistant no", async () => {
    asked = { ok: true, app: 'claude', appName: 'Claude', domain: 'claude.ai', issuer: 'https://api.example/oauth', companies: [companies[1]] };
    const page = await render();
    expect(page.querySelector('input[type="checkbox"]')).toBeNull();
    expect(page.textContent).toContain("only the company's owner or admins can turn them on");
    await act(async () => button('Cancel').click());
    const back = new URL(goTo.mock.calls[0][0]);
    expect(back.searchParams.get('error')).toBe('access_denied');
    expect(back.searchParams.get('state')).toBe('s1');
    expect(approve).not.toHaveBeenCalled();
  });

  it('a link that no longer checks out says so instead of asking', async () => {
    asked = { ok: false };
    const page = await render();
    expect(page.textContent).toContain("This connection link isn't valid");
    expect(page.querySelector('button')).toBeNull();
  });
});
