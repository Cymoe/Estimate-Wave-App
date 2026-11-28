import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { titleForPath, usePageTitle, useRouteTitle } from '../pageTitle';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const Page: React.FC<{ route: string; record?: string }> = ({ route, record }) => {
  useRouteTitle(titleForPath(route));
  return record ? <Record name={record} /> : null;
};
const Record: React.FC<{ name: string }> = ({ name }) => {
  usePageTitle(name);
  return null;
};

describe('browser tab names', () => {
  it('names the page from its address, and the open record on top of it', async () => {
    const root = createRoot(document.createElement('div'));
    await act(async () => root.render(<Page route="/work" />));
    expect(document.title).toBe('Estimates · Webb Leads');
    await act(async () => root.render(<Page route="/estimates/abc" record="EST-2026-002500" />));
    expect(document.title).toBe('EST-2026-002500 · Webb Leads');
    await act(async () => root.render(<Page route="/work" />)); // the drawer closes
    expect(document.title).toBe('Estimates · Webb Leads');
    await act(async () => root.render(<Page route="/projects/p1" record="Ann Miller job" />));
    expect(document.title).toBe('Ann Miller job · Webb Leads');
    act(() => root.unmount());
  });

  it('knows the main pages', () => {
    expect(titleForPath('/leads')).toBe('Leads');
    expect(titleForPath('/price-book/items')).toBe('Price Book');
    expect(titleForPath('/settings/organization')).toBe('Settings');
    expect(titleForPath('/somewhere-else')).toBeNull();
  });
});
