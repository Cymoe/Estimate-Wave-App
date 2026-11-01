import { createRoot } from 'react-dom/client';
import { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const getById = jest.fn(async (id: string) => ({ _id: id, name: "Dan's Company", email: 'dan@example.com' }));
const update = jest.fn(async (_id: string, data: Record<string, string>) => ({ _id: 'org1', ...data }));
jest.mock('../../../lib/api', () => ({
  organizationsAPI: {
    getById: (id: string) => getById(id),
    update: (id: string, data: Record<string, string>) => update(id, data),
    logoUploadUrl: async () => 'https://upload.example/1',
    setLogo: (id: string, storageId: string | null, name?: string) => setLogo(id, storageId, name),
  },
}));
const setLogo = jest.fn<Promise<string | null>, [string, string | null, string | undefined]>(async (_id, storageId) =>
  storageId ? 'https://files.example/logo.png' : null,
);
const uploadFile = jest.fn(async () => 'storage1');
jest.mock('../../../services/uploads', () => ({ uploadFile: (...args: unknown[]) => uploadFile(...(args as [])) }));

import { BusinessDetailsForm } from '../BusinessDetailsForm';

const field = (label: string) =>
  Array.from(document.body.querySelectorAll('label')).find((l) => l.textContent?.startsWith(label))!.querySelector('input')!;

async function type(input: HTMLInputElement, value: string) {
  await act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
}

describe('business details form', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    update.mockClear();
  });

  it('loads the business, asks for what contracts still need, and saves the changes', async () => {
    const onSaved = jest.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => createRoot(container).render(<BusinessDetailsForm organizationId="org1" onSaved={onSaved} />));
    await act(async () => {});

    expect(field('Business name').value).toBe("Dan's Company");
    expect(document.body.textContent).toContain('Add your address before sending estimates.');

    await type(field('Business name'), ' Shah Builders ');
    await type(field('Street address'), '9 Oak Ave');
    await type(field('City'), 'Austin');
    await act(async () => (document.body.querySelector('form') as HTMLFormElement).requestSubmit());

    expect(update).toHaveBeenCalledWith('org1', expect.objectContaining({ name: 'Shah Builders', address: '9 Oak Ave', city: 'Austin' }));
    expect(onSaved).toHaveBeenCalledWith(expect.objectContaining({ name: 'Shah Builders' }));
    expect(document.body.textContent).toContain('Saved');
    expect(document.body.textContent).not.toContain('before sending estimates');
  });

  it('uploads, shows and removes the logo, and refuses a file that is not an image', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => createRoot(container).render(<BusinessDetailsForm organizationId="org1" />));
    await act(async () => {});
    const box = () => document.body.querySelector('[data-testid="logo-setting"]')!;
    expect(box().textContent).toContain('No logo');
    const pick = async (file: File) => {
      const input = box().querySelector('[data-testid="logo-file"]') as HTMLInputElement;
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
      await act(async () => {});
    };
    await pick(new File(['%PDF'], 'contract.pdf', { type: 'application/pdf' }));
    expect(box().textContent).toContain('Pick an image');
    expect(setLogo).not.toHaveBeenCalled();
    await pick(new File(['png'], 'logo.png', { type: 'image/png' }));
    expect(uploadFile).toHaveBeenCalledWith('https://upload.example/1', expect.any(File));
    expect(setLogo).toHaveBeenLastCalledWith('org1', 'storage1', 'logo.png');
    expect(box().querySelector('img')!.getAttribute('src')).toBe('https://files.example/logo.png');
    await act(async () => Array.from(box().querySelectorAll('button')).find((b) => b.textContent === 'Remove')!.click());
    expect(setLogo).toHaveBeenLastCalledWith('org1', null, undefined);
    expect(box().textContent).toContain('No logo');
  });
});
