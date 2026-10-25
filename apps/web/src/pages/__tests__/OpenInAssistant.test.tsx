import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter, Route, Routes } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const goTo = jest.fn<void, [string]>();
jest.mock('../../lib/goTo', () => ({ goTo: (url: string) => goTo(url) }));

import OpenInAssistant from '../OpenInAssistant';

async function open(path: string) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () =>
    createRoot(container).render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/open/:app/:leadId" element={<OpenInAssistant />} />
          <Route path="/leads" element={<p>Leads page</p>} />
        </Routes>
      </MemoryRouter>,
    ),
  );
  return container;
}

afterEach(() => {
  document.body.innerHTML = '';
  jest.clearAllMocks();
});

describe('open a lead in an assistant', () => {
  it('starts a Claude or ChatGPT chat asking about the lead', async () => {
    await open('/open/claude/lead123');
    const claude = new URL(goTo.mock.calls[0][0]);
    expect(`${claude.origin}${claude.pathname}`).toBe('https://claude.ai/new');
    expect(claude.searchParams.get('q')).toBe('Use FieldQuote to show me my lead lead123, then help me call the homeowner.');
    document.body.innerHTML = '';
    const page = await open('/open/chatgpt/lead123');
    expect(goTo.mock.calls[1][0]).toMatch(/^https:\/\/chatgpt\.com\/\?q=Use%20FieldQuote/);
    expect(page.textContent).toContain('Opening ChatGPT');
  });

  it('any other app opens the lead in FieldQuote', async () => {
    const page = await open('/open/other/lead123');
    expect(goTo).not.toHaveBeenCalled();
    expect(page.textContent).toBe('Leads page');
  });
});
