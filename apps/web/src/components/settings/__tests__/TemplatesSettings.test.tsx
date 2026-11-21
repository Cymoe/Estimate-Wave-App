import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { MemoryRouter } from 'react-router-dom';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let rows: Array<Record<string, unknown>> = [];
const update = jest.fn(async (id: string, data: Record<string, unknown>) => ({ ...rows.find((r) => r.id === id), ...data }));
const remove = jest.fn<Promise<void>, [string]>(async () => undefined);
jest.mock('../../../lib/api', () => ({
  templatesAPI: {
    list: async () => rows,
    update: (id: string, data: Record<string, unknown>) => update(id, data),
    remove: (id: string) => remove(id),
  },
}));

import { TemplatesSettings } from '../TemplatesSettings';

const flush = () =>
  act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
const button = (label: string) => document.body.querySelector(`button[aria-label="${label}"]`) as HTMLButtonElement;

async function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () =>
    createRoot(container).render(
      <MemoryRouter>
        <TemplatesSettings organizationId="o1" />
      </MemoryRouter>,
    ),
  );
  await flush();
}

afterEach(() => {
  document.body.innerHTML = '';
  rows = [];
  jest.clearAllMocks();
});

describe('Settings → Templates', () => {
  it('explains how to make one when there are none', async () => {
    await render();
    expect(document.body.textContent).toContain('No templates yet');
    expect(document.body.textContent).toContain('Save as template');
  });

  it('lists each template with what it holds, and renames or removes it', async () => {
    rows = [
      {
        id: 'tpl1',
        name: 'Re-roof, 20 squares',
        category: 'Roof Replacement',
        days: 5,
        total: 8100,
        itemCount: 2,
        taskCount: 3,
        usageCount: 4,
        updatedAt: '',
      },
      { id: 'tpl2', name: 'Fence repair', total: 0, itemCount: 0, taskCount: 1, usageCount: 0, updatedAt: '' },
    ];
    await render();
    const text = document.body.textContent ?? '';
    expect(text).toContain('Re-roof, 20 squares');
    expect(text).toContain('Roof Replacement');
    expect(text).toContain('2 estimate lines · 3 tasks · 5 days · used 4 times');
    expect(text).toContain('$8,100.00');
    expect(text).toContain('1 task');

    jest.spyOn(window, 'prompt').mockReturnValue(' Re-roof ');
    await act(async () => button('Rename Re-roof, 20 squares').click());
    await flush();
    expect(update).toHaveBeenCalledWith('tpl1', { name: 'Re-roof' });
    expect(document.body.textContent).toContain('Re-roof');
    expect(document.body.textContent).not.toContain('20 squares');

    jest.spyOn(window, 'confirm').mockReturnValue(true);
    await act(async () => button('Remove Fence repair').click());
    await flush();
    expect(remove).toHaveBeenCalledWith('tpl2');
    expect(document.body.textContent).not.toContain('Fence repair');
  });
});
