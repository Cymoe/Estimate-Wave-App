import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { AdsCard, type AdAsset, type AdBatch, type AdHook, type AdSettings, type LiveAd } from '../AdsCard';

let batches: AdBatch[] = [];
let live: LiveAd[] = [];
let assets: AdAsset[] = [];
let hooks: AdHook[] = [];
let settings: AdSettings | undefined;

const activate = jest.fn(async () => undefined);
const reject = jest.fn(async () => undefined);
const retire = jest.fn(async () => undefined);
const draftNow = jest.fn(async () => undefined);
const seedHooks = jest.fn(async () => 6);
const saveHook = jest.fn(async () => 'h9');
const saveSettings = jest.fn(async () => undefined);
const tagAsset = jest.fn(async () => undefined);
const addAsset = jest.fn(async () => 'a9');
const uploadUrl = jest.fn(async () => 'https://upload.example/u1');

jest.mock('../../../lib/api', () => ({
  adsAPI: {
    activate: (id: string) => activate(id),
    reject: (id: string) => reject(id),
    retire: (id: string) => retire(id),
    draftNow: () => draftNow(),
    seedHooks: () => seedHooks(),
    saveHook: (args: unknown) => saveHook(args),
    saveSettings: (args: unknown) => saveSettings(args),
    tagAsset: (...args: unknown[]) => tagAsset(...args),
    addAsset: (args: unknown) => addAsset(args),
    uploadUrl: () => uploadUrl(),
    removeAsset: async () => undefined,
    removeHook: async () => undefined,
  },
}));
jest.mock('../../../lib/live', () => ({
  useAdsBatches: () => batches,
  useAdsLive: () => live,
  useAdsLibrary: () => assets,
  useAdsHooks: () => hooks,
  useAdsSettings: () => settings,
}));

const flush = () =>
  act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
const buttons = () => Array.from(document.body.querySelectorAll('button'));
const byText = (text: string) => buttons().find((b) => b.textContent?.includes(text));
const tab = (label: string) =>
  act(async () =>
    Array.from(document.body.querySelectorAll('[role="tab"]'))
      .find((t) => t.textContent === label)!
      .click(),
  );
function type(el: HTMLInputElement, value: string) {
  Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(el, value);
  el.dispatchEvent(new Event('input', { bubbles: true }));
}

async function render(owner = true) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => createRoot(container).render(<AdsCard owner={owner} />));
  await flush();
  return container;
}

const creative = (over: Partial<AdBatch['creatives'][number]>): AdBatch['creatives'][number] => ({
  id: 'c1',
  batchId: 'b1',
  name: 'WL_abc123_EN_916_20261102',
  language: 'en',
  ratio: '9x16',
  status: 'paused',
  script: {
    voice: 'Paint them, do not replace them.',
    onScreen: ['Paint, do not replace'],
    headline: 'Cabinets painted',
    primaryText: 'A fresh finish on the cabinets you have.',
  },
  hook: { id: 'h1', family: 'before_after', familyLabel: 'Before / after', scope: 'cabinets', textEn: 'Paint them' },
  videoUrl: 'https://cdn.example/c1.mp4',
  meta: { adId: 'ad1' },
  fatigued: false,
  createdAt: new Date().toISOString(),
  ...over,
});

beforeEach(() => {
  document.body.innerHTML = '';
  jest.clearAllMocks();
  batches = [];
  live = [];
  assets = [];
  hooks = [];
  settings = {
    brand: 'Permian Home Quotes',
    keys: { anthropic: true, elevenlabs: true, shotstack: false, meta: false },
    primaryColor: '#336699',
    accentColor: '#8fb6e0',
    weeklyEnabled: false,
    hooksPerWeek: 2,
    liveTarget: 6,
  };
});

describe('Ops → Ads', () => {
  it("shows the week's batch, approves a paused creative and rejects another; Draft now is the owner's", async () => {
    batches = [
      {
        id: 'b1',
        weekOf: '2026-11-02',
        status: 'ready',
        summary: '2 paused in Meta',
        createdAt: new Date().toISOString(),
        creatives: [
          creative({}),
          creative({
            id: 'c2',
            language: 'es',
            name: 'WL_abc123_ES_916_20261102',
            script: { voice: 'Píntalos.', onScreen: ['Píntalos'], headline: 'Gabinetes pintados', primaryText: 'Un acabado nuevo.' },
          }),
        ],
      },
    ];
    await render();
    const cards = document.body.querySelectorAll('[data-testid="creative"]');
    expect(cards.length).toBe(2);
    expect(cards[1].textContent).toContain('Español');
    expect(cards[1].textContent).toContain('Gabinetes pintados');
    expect(document.body.textContent).toContain('Week of 2026-11-02');
    await act(async () => (cards[0].querySelector('button') as HTMLButtonElement).click());
    await flush();
    expect(activate).toHaveBeenCalledWith('c1');
    expect(document.body.querySelector('[role="status"]')?.textContent).toContain('is live');
    await act(async () =>
      Array.from(cards[1].querySelectorAll('button'))
        .find((b) => b.textContent === 'Reject')!
        .click(),
    );
    expect(reject).toHaveBeenCalledWith('c2');
    await act(async () => byText('Draft now')!.click());
    expect(draftNow).toHaveBeenCalled();

    document.body.innerHTML = '';
    await render(false);
    expect(byText('Draft now')).toBeUndefined();
  });

  it('a rendered creative with no Meta ad cannot be approved', async () => {
    batches = [
      {
        id: 'b1',
        weekOf: '2026-11-02',
        status: 'ready',
        createdAt: new Date().toISOString(),
        creatives: [creative({ status: 'rendered', meta: undefined, error: "Meta isn't set up" })],
      },
    ];
    await render();
    const approve = document.body.querySelector('[data-testid="creative"] button') as HTMLButtonElement;
    expect(approve.textContent).toBe('Approve');
    expect(approve.disabled).toBe(true);
    expect(document.body.textContent).toContain("Meta isn't set up");
  });

  it('Live lists each ad with spend, clicks, what intake brought and a fatigue flag, and retires one', async () => {
    live = [
      {
        ...creative({ status: 'live' }),
        fatigued: true,
        week: { at: '', spendCents: 2500, impressions: 1200, clicks: 18, frequency: 3.1, ctr: 0.67, leadsMeta: 2 },
        intake: { leads: 3, confirmed: 2, sold: 1, revenueCents: 6500 },
      },
      { ...creative({ id: 'c2', name: 'WL_x_ES_45', language: 'es', ratio: '4x5' }), intake: { leads: 0, confirmed: 0, sold: 0, revenueCents: 0 } },
    ];
    await render();
    await tab('Live');
    const rows = document.body.querySelectorAll('[data-testid="live-ad"]');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('$25.00');
    expect(rows[0].textContent).toContain('0.67%');
    expect(rows[0].textContent).toContain('fatigued');
    expect(rows[0].textContent).toContain('$65.00');
    expect(rows[1].textContent).toContain('—');
    await act(async () =>
      Array.from(rows[0].querySelectorAll('button'))
        .find((b) => b.textContent === 'Retire')!
        .click(),
    );
    expect(retire).toHaveBeenCalledWith('c1');
    expect(rows[1].querySelector('button')).toBeNull();
  });

  it('Library uploads a file with the chosen tags and retags one already there', async () => {
    assets = [
      {
        id: 'a1',
        url: 'https://cdn.example/a1.jpg',
        kind: 'photo',
        fileName: 'kitchen.jpg',
        tags: ['cabinets'],
        createdAt: new Date().toISOString(),
      },
    ];
    (global as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({ ok: true, json: async () => ({ storageId: 's1' }) }));
    await render();
    await tab('Library');
    // "interior" is on by default; add "before", then upload.
    await act(async () =>
      Array.from(document.body.querySelectorAll('[aria-label="Tags for the next upload"] button'))
        .find((b) => b.textContent === 'before')!
        .click(),
    );
    const fileInput = document.body.querySelector('input[type="file"]') as HTMLInputElement;
    const file = new File(['x'], 'hall.jpg', { type: 'image/jpeg' });
    Object.defineProperty(fileInput, 'files', { value: [file] });
    await act(async () => fileInput.dispatchEvent(new Event('change', { bubbles: true })));
    await flush();
    expect(uploadUrl).toHaveBeenCalled();
    expect(addAsset).toHaveBeenCalledWith({
      storageId: 's1',
      fileName: 'hall.jpg',
      tags: ['interior', 'before'],
      pairKey: undefined,
      note: undefined,
    });
    expect(document.body.querySelector('[role="status"]')?.textContent).toBe('1 file in the library.');

    const card = document.body.querySelector('[data-testid="asset"]')!;
    expect(card.textContent).toContain('kitchen.jpg');
    await act(async () =>
      Array.from(card.querySelectorAll('button'))
        .find((b) => b.textContent === 'after')!
        .click(),
    );
    await act(async () => type(card.querySelector('input[aria-label="Pair key for kitchen.jpg"]') as HTMLInputElement, 'elm'));
    await act(async () =>
      Array.from(card.querySelectorAll('button'))
        .find((b) => b.textContent === 'Save')!
        .click(),
    );
    expect(tagAsset).toHaveBeenCalledWith('a1', ['cabinets', 'after'], 'elm', undefined);
  });

  it('Hooks seeds the six, adds one, and switches one off', async () => {
    await render();
    await tab('Hooks');
    await act(async () => byText('Add the six painting hooks')!.click());
    expect(seedHooks).toHaveBeenCalled();
    hooks = [
      {
        id: 'h1',
        family: 'education',
        familyLabel: 'Cost education',
        scope: 'interior',
        trade: 'painting',
        textEn: 'What does it cost to paint a house in Midland?',
        active: true,
        uses: 1,
        wins: 1,
        losses: 0,
      },
    ];
    document.body.innerHTML = '';
    await render();
    await tab('Hooks');
    expect(byText('Add the six painting hooks')).toBeUndefined();
    const row = document.body.querySelector('[data-testid="hook"]')!;
    expect(row.textContent).toContain('Cost education · interior · used 1 · 1 won · 0 lost');
    await act(async () => (row.querySelector('input[type="checkbox"]') as HTMLInputElement).click());
    expect(saveHook).toHaveBeenCalledWith(expect.objectContaining({ id: 'h1', active: false }));
    const form = document.body.querySelector('form[aria-label="New hook"]')!;
    const textarea = form.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, 'Get the outside painted before the freeze.');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await flush();
    expect(saveHook).toHaveBeenLastCalledWith(
      expect.objectContaining({ family: 'before_after', scope: 'cabinets', textEn: 'Get the outside painted before the freeze.', active: true }),
    );
  });

  it('Settings shows which keys are set, and the owner saves the ids and the Monday switch', async () => {
    await render();
    await tab('Settings');
    expect(document.body.textContent).toContain('Homeowners see the ads as Permian Home Quotes');
    expect(document.body.textContent).toContain('SHOTSTACK_API_KEY: missing');
    expect(document.body.textContent).toContain('ANTHROPIC_API_KEY: set');
    await act(async () => type(document.body.querySelector('input[aria-label="Ad account id"]') as HTMLInputElement, 'act_123'));
    await act(async () => (Array.from(document.body.querySelectorAll('input[type="checkbox"]'))[0] as HTMLInputElement).click());
    await act(async () =>
      document.body.querySelector('form[aria-label="Ad settings"]')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    );
    await flush();
    expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({ adAccountId: 'act_123', weeklyEnabled: true, hooksPerWeek: 2 }));
    expect(saveSettings.mock.calls[0][0]).not.toHaveProperty('keys');

    document.body.innerHTML = '';
    await render(false);
    await tab('Settings');
    expect(byText('Save settings')).toBeUndefined();
    expect((document.body.querySelector('input[aria-label="Page id"]') as HTMLInputElement).disabled).toBe(true);
  });
});
