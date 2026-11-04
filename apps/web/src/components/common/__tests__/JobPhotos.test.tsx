import { createRoot } from 'react-dom/client';
import { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let photos: Array<Record<string, unknown>> = [];
const add = jest.fn(async (args: { fileName: string }) => {
  photos = [{ id: `p${photos.length + 1}`, url: `https://files/${args.fileName}`, fileName: args.fileName, createdAt: '2026-10-26T15:00:00Z' }, ...photos];
});
const setCaption = jest.fn(async (id: string, caption: string) => {
  photos = photos.map((p) => (p.id === id ? { ...p, caption } : p));
});
const remove = jest.fn(async (id: string) => {
  photos = photos.filter((p) => p.id !== id);
});
const setInContract = jest.fn(async (id: string, inContract: boolean) => {
  if (failSwitch) throw new Error('The contract is signed, so its files stay as they were signed');
  photos = photos.map((p) => (p.id === id ? { ...p, inContract } : p));
});
let failSwitch = false;
jest.mock('../../../lib/api', () => ({
  photosAPI: {
    list: async () => photos,
    uploadUrl: async () => 'https://upload',
    add: (args: { fileName: string }) => add(args),
    setCaption: (id: string, caption: string) => setCaption(id, caption),
    remove: (id: string) => remove(id),
    setInContract: (id: string, on: boolean) => setInContract(id, on),
  },
}));
jest.mock('../../../services/uploads', () => ({ uploadFile: async () => 'st1' }));

import React from 'react';
import { JobPhotos } from '../JobPhotos';

const flush = () => act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); });
const strip = () => document.body.querySelector('[data-testid="job-photos"]')!;
async function render(props: Partial<React.ComponentProps<typeof JobPhotos>> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => createRoot(container).render(<JobPhotos organizationId="o1" estimateId="e1" {...props} />));
  await flush();
}

afterEach(() => {
  document.body.innerHTML = '';
  photos = [];
  failSwitch = false;
  jest.clearAllMocks();
});

describe('job photos', () => {
  it('adds photos from the camera or library and shows them as thumbnails', async () => {
    await render();
    expect(strip().textContent).toContain('No photos yet.');
    const input = strip().querySelector('[data-testid="photo-file"]') as HTMLInputElement;
    expect(input.accept).toBe('image/*');
    expect(input.multiple).toBe(true);
    Object.defineProperty(input, 'files', { value: [new File(['a'], 'before.jpg', { type: 'image/jpeg' }), new File(['b'], 'after.jpg', { type: 'image/jpeg' })], configurable: true });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    await flush();
    expect(add).toHaveBeenCalledWith({ storageId: 'st1', fileName: 'before.jpg', estimateId: 'e1', projectId: undefined });
    expect(strip().querySelectorAll('li img')).toHaveLength(2);
    expect(strip().textContent).toContain('2 photos added.');
  });

  it('opens a photo full screen to caption or delete it', async () => {
    photos = [{ id: 'p1', url: 'https://files/roof.jpg', fileName: 'roof.jpg', createdAt: '2026-10-26T15:00:00Z' }];
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    await render();
    await act(async () => (strip().querySelector('li button') as HTMLButtonElement).click());
    const viewer = document.body.querySelector('[role="dialog"][aria-label="Photo"]')!;
    expect(viewer.querySelector('img')!.getAttribute('src')).toBe('https://files/roof.jpg');
    const caption = viewer.querySelector('input[aria-label="Caption"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(caption, 'North slope, hail');
      caption.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => caption.dispatchEvent(new FocusEvent('focusout', { bubbles: true })));
    await flush();
    expect(setCaption).toHaveBeenCalledWith('p1', 'North slope, hail');
    await act(async () => (document.body.querySelector('button[aria-label="Delete photo"]') as HTMLButtonElement).click());
    await flush();
    expect(remove).toHaveBeenCalledWith('p1');
    expect(document.body.querySelector('[role="dialog"][aria-label="Photo"]')).toBeNull();
    expect(strip().textContent).toContain('No photos yet.');
  });
});

describe('an estimate\'s files', () => {
  const sw = (name: string) => strip().querySelector(`[role="switch"][aria-label="${name} in contract"]`) as HTMLButtonElement;

  it('takes photos and PDFs, and says what In contract does before there are any', async () => {
    await render({ files: true, title: 'Files' });
    expect(strip().textContent).toContain('Mark any file In contract to attach it to the agreement.');
    const input = strip().querySelector('[data-testid="photo-file"]') as HTMLInputElement;
    expect(input.accept).toBe('image/*,application/pdf');
    Object.defineProperty(input, 'files', { value: [new File(['a'], 'specs.pdf', { type: 'application/pdf' })], configurable: true });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    await flush();
    expect(strip().textContent).toContain('1 file added.');
    // A PDF shows by name and opens on its own.
    expect(strip().querySelector('a[aria-label="specs.pdf"]')!.getAttribute('href')).toBe('https://files/specs.pdf');
  });

  it('puts a file on the contract with its switch, and tells the estimate', async () => {
    photos = [
      { id: 'p1', url: 'https://files/tile.jpg', fileName: 'tile.jpg', contentType: 'image/jpeg', createdAt: '2026-10-26T15:00:00Z' },
      { id: 'p2', url: 'https://files/plan.pdf', fileName: 'plan.pdf', contentType: 'application/pdf', inContract: true, createdAt: '2026-10-26T15:00:00Z' },
    ];
    const onContractChange = jest.fn();
    await render({ files: true, title: 'Files', onContractChange });
    expect(sw('tile.jpg').getAttribute('aria-checked')).toBe('false');
    expect(sw('plan.pdf').getAttribute('aria-checked')).toBe('true');
    await act(async () => sw('tile.jpg').click());
    await flush();
    expect(setInContract).toHaveBeenCalledWith('p1', true);
    expect(sw('tile.jpg').getAttribute('aria-checked')).toBe('true');
    expect(onContractChange).toHaveBeenCalled();

    // If saving fails, the switch goes back and says why.
    failSwitch = true;
    await act(async () => sw('plan.pdf').click());
    await flush();
    expect(sw('plan.pdf').getAttribute('aria-checked')).toBe('true');
    expect(strip().textContent).toContain('The contract is signed');
  });

  it('once signed, the switches stay as they were', async () => {
    photos = [{ id: 'p1', url: 'https://files/tile.jpg', fileName: 'tile.jpg', inContract: true, createdAt: '2026-10-26T15:00:00Z' }];
    await render({ files: true, title: 'Files', locked: true });
    expect(sw('tile.jpg').disabled).toBe(true);
    expect(strip().textContent).toContain('Signed: the files marked In contract went out with the agreement.');
  });

  it('shows the agreed design from before first, always on the contract, and can remove it', async () => {
    const onRemoveLegacyDesign = jest.fn(async () => {});
    jest.spyOn(window, 'confirm').mockReturnValue(true);
    await render({ files: true, title: 'Files', legacyDesign: { url: 'https://files/design.pdf', name: 'design.pdf', type: 'application/pdf' }, onRemoveLegacyDesign });
    const design = strip().querySelector('[data-testid="legacy-design"]')!;
    expect(design.textContent).toContain('design.pdf');
    expect(sw('design.pdf').getAttribute('aria-checked')).toBe('true');
    expect(sw('design.pdf').disabled).toBe(true);
    await act(async () => (design.querySelector('button[aria-label="Remove the agreed design"]') as HTMLButtonElement).click());
    await flush();
    expect(onRemoveLegacyDesign).toHaveBeenCalled();
  });

  it("a project's photos have no switch", async () => {
    photos = [{ id: 'p1', url: 'https://files/roof.jpg', fileName: 'roof.jpg', createdAt: '2026-10-26T15:00:00Z' }];
    await render({ estimateId: undefined, projectId: 'pr1' });
    expect(strip().querySelector('[role="switch"]')).toBeNull();
  });
});
