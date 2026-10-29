import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import { LegalLinks, PrivacyPage, TermsPage } from '../Legal';

let root: Root;
let host: HTMLDivElement;
const open = async (path: string) => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  await act(async () =>
    root.render(
      <MemoryRouter initialEntries={[path]}>
        <Routes>
          <Route path="/terms" element={<TermsPage />} />
          <Route path="/privacy" element={<PrivacyPage />} />
          <Route path="/share" element={<LegalLinks />} />
        </Routes>
      </MemoryRouter>,
    ),
  );
};
afterEach(() => {
  act(() => root.unmount());
  host.remove();
});

describe('legal pages', () => {
  it('shows the Terms with the lead credit rule and a contact', async () => {
    await open('/terms');
    expect(host.querySelector('h1')!.textContent).toBe('Terms of Service');
    expect(host.textContent).toContain('within 3 days of receiving it');
    expect(host.querySelector('a[href^="mailto:"]')).not.toBeNull();
  });

  it('shows the Privacy Policy covering homeowners, texts and connected assistants', async () => {
    await open('/privacy');
    expect(host.querySelector('h1')!.textContent).toBe('Privacy Policy');
    for (const phrase of ['Homeowner leads', 'Reply STOP', 'Connected assistants', 'Stripe']) expect(host.textContent).toContain(phrase);
  });

  it('reads in Spanish from ?lang=es, says the English governs, and links in Spanish', async () => {
    await open('/terms?lang=es');
    expect(host.querySelector('h1')!.textContent).toBe('Términos de servicio');
    expect(host.textContent).toContain('La versión en inglés es la que rige');
    expect(host.textContent).toContain('dentro de los 3 días de recibirla');
    expect(Array.from(host.querySelectorAll('a')).map((a) => a.getAttribute('href'))).toEqual(
      expect.arrayContaining(['/terms?lang=es', '/privacy?lang=es']),
    );
    act(() => root.unmount());
    host.remove();
    await open('/privacy?lang=es');
    expect(host.querySelector('h1')!.textContent).toBe('Política de privacidad');
    for (const phrase of ['Solicitudes de propietarios', 'Responde STOP', 'Asistentes conectados', 'Stripe'])
      expect(host.textContent).toContain(phrase);
  });

  it('LegalLinks points at both pages', async () => {
    await open('/share');
    const hrefs = Array.from(host.querySelectorAll('a')).map((a) => a.getAttribute('href'));
    expect(hrefs).toEqual(['/terms', '/privacy']);
  });
});
