import React from 'react';
import { act } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { PhotosForAds } from '../PhotosForAds';

const jobForProject = jest.fn(async (..._args: unknown[]) => ({ jobId: 'j1', copied: ['ph1'] }));
const list = jest.fn(async (..._args: unknown[]) => [
  { id: 'ph1', url: 'https://files.example/1', fileName: 'old.jpg', contentType: 'image/jpeg', createdAt: '2026-11-01' },
  { id: 'ph2', url: 'https://files.example/2', fileName: 'before.jpg', contentType: 'image/jpeg', caption: 'Before', createdAt: '2026-11-02' },
  { id: 'ph3', url: 'https://files.example/3', fileName: 'after.heic', contentType: 'image/heic', createdAt: '2026-11-03' },
  { id: 'ph4', url: 'https://files.example/4', fileName: 'contract.pdf', contentType: 'application/pdf', createdAt: '2026-11-04' },
]);
const uploadAsset = jest.fn(async (..._args: unknown[]) => undefined);
jest.mock('../../../lib/api', () => ({
  adsAPI: { jobForProject: (...args: unknown[]) => jobForProject(...args) },
  photosAPI: { list: (...args: unknown[]) => list(...args) },
}));
jest.mock('../../../lib/adUpload', () => ({ uploadAsset: (...args: unknown[]) => uploadAsset(...args) }));

let root: Root;
let host: HTMLDivElement;
beforeEach(() => {
  host = document.createElement('div');
  document.body.appendChild(host);
  root = createRoot(host);
  (globalThis as { fetch: unknown }).fetch = jest.fn(async (url: string) => ({ ok: true, blob: async () => new Blob([url], { type: 'image/jpeg' }) }));
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  jest.clearAllMocks();
});
const flush = () =>
  act(async () => {
    for (let i = 0; i < 20; i++) await Promise.resolve();
  });

test("a project's photos go to the ad library as one job: each new photo once, PDFs left behind, in the trade chosen", async () => {
  await act(async () => root.render(<PhotosForAds projectId="p1" />));
  const select = host.querySelector('select[aria-label="Trade for the ads"]') as HTMLSelectElement;
  expect(Array.from(select.options).map((o) => o.value)).toContain('outdoor-construction');
  await act(async () => {
    select.value = 'outdoor-construction';
    select.dispatchEvent(new Event('change', { bubbles: true }));
  });
  const button = Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'Use these photos for ads')!;
  await act(async () => button.click());
  await flush();
  expect(jobForProject).toHaveBeenCalledWith('p1', 'outdoor-construction');
  expect(list).toHaveBeenCalledWith({ projectId: 'p1' });
  // The one already copied and the PDF stay; the others go up under the job, with the photo each came from.
  expect(uploadAsset.mock.calls.map((c) => [(c[0] as File).name, c[2], c[4], c[5]])).toEqual([
    ['before.jpg', 'outdoor-construction', 'Before', { jobId: 'j1', jobPhotoId: 'ph2' }],
    ['after.heic', 'outdoor-construction', undefined, { jobId: 'j1', jobPhotoId: 'ph3' }],
  ]);
  expect((uploadAsset.mock.calls[1][0] as File).type).toBe('image/heic');
  expect(host.querySelector('[role="status"]')!.textContent).toContain('2 photos sent to Ops → Ads → Library as one job');
});

test('a photo that cannot be read says so, and nothing claims it was sent', async () => {
  (globalThis as { fetch: unknown }).fetch = jest.fn(async () => ({ ok: false, status: 403 }));
  await act(async () => root.render(<PhotosForAds projectId="p1" />));
  await act(async () => Array.from(host.querySelectorAll('button')).find((b) => b.textContent === 'Use these photos for ads')!.click());
  await flush();
  expect(host.querySelector('[role="alert"]')!.textContent).toBe("A photo couldn't be read (403)");
  expect(host.querySelector('[role="status"]')).toBeNull();
});
