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
jest.mock('../../../lib/api', () => ({
  photosAPI: {
    list: async () => photos,
    uploadUrl: async () => 'https://upload',
    add: (args: { fileName: string }) => add(args),
    setCaption: (id: string, caption: string) => setCaption(id, caption),
    remove: (id: string) => remove(id),
  },
}));
jest.mock('../../../services/uploads', () => ({ uploadFile: async () => 'st1' }));

import { JobPhotos } from '../JobPhotos';

const flush = () => act(async () => { for (let i = 0; i < 8; i++) await Promise.resolve(); });
const strip = () => document.body.querySelector('[data-testid="job-photos"]')!;
async function render() {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => createRoot(container).render(<JobPhotos organizationId="o1" estimateId="e1" />));
  await flush();
}

afterEach(() => {
  document.body.innerHTML = '';
  photos = [];
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
