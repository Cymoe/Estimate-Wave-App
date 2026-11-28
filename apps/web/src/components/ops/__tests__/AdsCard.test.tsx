import { createRoot } from 'react-dom/client';
import { act } from 'react';
import {
  AdsCard,
  type AdAsset,
  type AdJob,
  type AdIdeas,
  type AdBatch,
  type AdHook,
  type AdSettings,
  type LiveAd,
  type Playbook,
  type Readiness,
  type ResearchRun,
  type Swipe,
} from '../AdsCard';

let batches: AdBatch[] = [];
let ideas: AdIdeas | undefined = { round: null, ideas: [] };
/** Which trade each list was asked for, in order. */
const asked: string[] = [];
let live: LiveAd[] = [];
let assets: AdAsset[] = [];
let jobs: AdJob[] = [];
let hooks: AdHook[] = [];
let swipes: Swipe[] = [];
let playbooks: Playbook[] = [];
let runs: ResearchRun[] = [];
let readiness: Readiness[] | undefined;
let settings: AdSettings | undefined;

const activate = jest.fn(async () => undefined);
const reject = jest.fn(async () => undefined);
const retire = jest.fn(async () => undefined);
const ideasNow = jest.fn(async (..._args: unknown[]) => undefined);
const decideIdea = jest.fn(async () => undefined);
const makeKept = jest.fn(async (..._args: unknown[]) => 2);
const makeKeptImages = jest.fn(async (..._args: unknown[]) => ({ made: 1, held: [] as string[] }));
const seedHooks = jest.fn(async () => 6);
const saveHook = jest.fn(async () => 'h9');
const saveSettings = jest.fn(async () => undefined);
/**
 * The browser's upload with progress, faked: each send reports half-way, then waits for finishSends (or finishes
 * at once when sendsWait is off) with a storage id, or fails when sendsFail is on.
 */
let sendsWait = false;
let sendsFail = false;
/** How many sends from now fail before they work again. */
let failNext = 0;
const pendingSends: Array<() => void> = [];
const finishSends = () => pendingSends.splice(0).forEach((f) => f());
class FakeXHR {
  status = 0;
  responseText = '';
  timeout = 0;
  upload: { onprogress?: (e: { lengthComputable: boolean; loaded: number; total: number }) => void } = {};
  onload?: () => void;
  onerror?: () => void;
  ontimeout?: () => void;
  onabort?: () => void;
  open() {}
  setRequestHeader() {}
  send() {
    const done = () => {
      if (sendsFail) return this.onerror?.();
      if (failNext > 0) {
        failNext -= 1;
        return this.onerror?.();
      }
      this.status = 200;
      this.responseText = JSON.stringify({ storageId: 's1' });
      this.onload?.();
    };
    queueMicrotask(() => {
      this.upload.onprogress?.({ lengthComputable: true, loaded: 50, total: 100 });
      if (sendsWait) pendingSends.push(done);
      else done();
    });
  }
}
(globalThis as unknown as { XMLHttpRequest: unknown }).XMLHttpRequest = FakeXHR;
// Making a big clip smaller, faked: it reports a step, then gives back the clip, or a small one when shrinkTo is set.
let shrinkTo: number | null = null;
const shrinkClip = jest.fn(async (f: File, onProgress?: (x: number) => void) => {
  onProgress?.(0.4);
  if (shrinkTo === null) return f;
  const small = new File(['v'], f.name.replace(/\.[a-z0-9]+$/i, '') + '.mp4', { type: 'video/mp4' });
  Object.defineProperty(small, 'size', { value: shrinkTo });
  return small;
});
jest.mock('../../../lib/shrinkClip', () => ({ shrinkClip: (f: File, p?: (x: number) => void) => shrinkClip(f, p) }));
const tagAsset = jest.fn(async () => undefined);
const removeAsset = jest.fn(async (_id: string) => undefined);
const uploadNote = jest.fn(async (_n: unknown) => undefined);
let drive: unknown = { setupMissing: [], connected: null, imports: [] };
const driveConnect = jest.fn(async (_trade: string) => 'https://accounts.google.com/o/oauth2/v2/auth?x');
const driveRetry = jest.fn(async (_id: string) => undefined);
const addAsset = jest.fn(async () => 'a9');
const uploadUrl = jest.fn(async () => 'https://upload.example/u1');
const seedSwipes = jest.fn(async () => 30);
const importSwipes = jest.fn(async () => ({ added: 1, updated: 1 }));
const starSwipe = jest.fn(async () => undefined);
const researchNow = jest.fn(async (..._args: unknown[]) => undefined);
const savePlaybook = jest.fn(async () => undefined);
const rewritePlaybook = jest.fn(async () => undefined);
const checkActors = jest.fn(async () => undefined);
const creatorBrief = jest.fn(async (..._args: unknown[]) => 'GoodFit Pros: on-camera read');
const addTake = jest.fn(async (..._args: unknown[]) => 2);
const makeFootage = jest.fn(async (..._args: unknown[]) => ({ batchId: 'b9', builtOn: 'Rodgers Painting' }));
const addJob = jest.fn(async (..._args: unknown[]) => 'j2');
const setItems = jest.fn(async (..._args: unknown[]) => undefined);
const groupIntoJob = jest.fn(async (..._args: unknown[]) => ({ jobId: 'j3', moved: 2 }));
const setAssetJob = jest.fn(async (..._args: unknown[]) => undefined);
const removeJob = jest.fn(async (..._args: unknown[]) => undefined);
const saveMetaToken = jest.fn(async (..._args: unknown[]) => ({ name: 'GoodFit ads' }));
const metaLookup = jest.fn(async () => ({
  who: 'GoodFit ads',
  accounts: [
    { id: '123', name: 'GoodFit Pros', status: 'ACTIVE', adsets: [{ id: '900', name: 'Midland homeowners', status: 'PAUSED', campaign: 'Leads' }] },
    { id: '456', name: 'Old account', status: '2', adsets: [] },
  ],
  pages: [{ id: '55', name: 'GoodFit Pros page', forms: [{ id: 'f1', name: 'Free quote', status: 'ACTIVE' }] }],
  problems: ['Instant forms of Other page: no access'],
}));
const campaignOf = (on: boolean) => ({
  campaign: { id: 'c7', name: 'GoodFit Pros – Leads', on },
  adset: { id: '900', name: 'Midland / Odessa homeowners', on: true },
  dailyBudget: 20,
  delivery: on ? 'ACTIVE' : 'CAMPAIGN_PAUSED',
  approved: 2,
});
const campaignState = jest.fn(async () => campaignOf(false));
const setCampaign = jest.fn(async (on: boolean) => campaignOf(on));
const createImageAd = jest.fn(async (..._args: unknown[]) => ({ made: [{ name: 'WL_x_45_photo', headline: 'Cabinets, freshly painted' }, { name: 'WL_y_45_photo', headline: 'Two' }, { name: 'WL_z_45_photo', headline: 'Three' }], missed: [] }));
const setBest = jest.fn(async (..._args: unknown[]) => undefined);
const saveScrapeKey = jest.fn(async (..._args: unknown[]) => ({ credits: 99 }));
const pairPhotos = jest.fn(async (..._args: unknown[]) => undefined);
const splitPair = jest.fn(async (..._args: unknown[]) => undefined);
const swapPair = jest.fn(async (..._args: unknown[]) => undefined);
const makeFor = jest.fn(async (..._args: unknown[]) => ({ link: 'https://app.example/ads/tok' }));
let requests: Array<{ ask: string; createdAt: string; stage: string; link: string }> = [];

jest.mock('../../../lib/api', () => ({
  adsAPI: {
    activate: (id: string) => activate(id),
    reject: (id: string) => reject(id),
    retire: (id: string) => retire(id),
    ideasNow: (...args: unknown[]) => ideasNow(...args),
    decideIdea: (...args: unknown[]) => decideIdea(...args),
    makeKept: (...args: unknown[]) => makeKept(...args),
    makeKeptImages: (...args: unknown[]) => makeKeptImages(...args),
    seedHooks: () => seedHooks(),
    saveHook: (args: unknown) => saveHook(args),
    saveSettings: (args: unknown) => saveSettings(args),
    tagAsset: (...args: unknown[]) => tagAsset(...args),
    addAsset: (args: unknown) => addAsset(args),
    uploadUrl: () => uploadUrl(),
    removeAsset: (id: string) => removeAsset(id),
    uploadNote: (n: unknown) => uploadNote(n),
    driveConnect: (t: string) => driveConnect(t),
    driveDisconnect: async () => undefined,
    driveRetry: (id: string) => driveRetry(id),
    removeHook: async () => undefined,
    seedSwipes: () => seedSwipes(),
    importSwipes: (...args: unknown[]) => importSwipes(...args),
    starSwipe: (...args: unknown[]) => starSwipe(...args),
    removeSwipe: async () => undefined,
    researchNow: (...args: unknown[]) => researchNow(...args),
    savePlaybook: (...args: unknown[]) => savePlaybook(...args),
    rewritePlaybook: (...args: unknown[]) => rewritePlaybook(...args),
    checkActors: () => checkActors(),
    creatorBrief: (...args: unknown[]) => creatorBrief(...args),
    addTake: (...args: unknown[]) => addTake(...args),
    makeFootage: (...args: unknown[]) => makeFootage(...args),
    makeFor: (...args: unknown[]) => makeFor(...args),
    addJob: (...args: unknown[]) => addJob(...args),
    setAssetJob: (...args: unknown[]) => setAssetJob(...args),
    groupIntoJob: (...args: unknown[]) => groupIntoJob(...args),
    setItems: (...args: unknown[]) => setItems(...args),
    removeJob: (...args: unknown[]) => removeJob(...args),
    pairPhotos: (...args: unknown[]) => pairPhotos(...args),
    saveMetaToken: (...args: unknown[]) => saveMetaToken(...args),
    removeMetaToken: async () => undefined,
    saveScrapeKey: (...args: unknown[]) => saveScrapeKey(...args),
    removeScrapeKey: async () => undefined,
    setBest: (...args: unknown[]) => setBest(...args),
    createImageAd: (...args: unknown[]) => createImageAd(...args),
    metaLookup: () => metaLookup(),
    campaignState: () => campaignState(),
    setCampaign: (on: boolean) => setCampaign(on),
    splitPair: (...args: unknown[]) => splitPair(...args),
    swapPair: (...args: unknown[]) => swapPair(...args),
    renameJob: async () => undefined,
  },
}));
jest.mock('../../../lib/live', () => ({
  useAdsBatches: (trade?: string) => (asked.push(`batches:${trade}`), batches),
  useAdsIdeas: (trade?: string) => (asked.push(`ideas:${trade}`), ideas),
  useAdsLive: () => live,
  useAdsLibrary: (trade?: string) => (asked.push(`library:${trade}`), assets),
  useAdsHooks: (trade?: string) => (asked.push(`hooks:${trade}`), hooks),
  useAdsSettings: () => settings,
  useAdsSwipes: () => swipes,
  useAdsPlaybooks: () => playbooks,
  useAdsResearchRuns: () => runs,
  useAdsReadiness: () => readiness,
  useAdRequests: () => requests,
  useAdJobs: (trade?: string) => (asked.push(`jobs:${trade}`), jobs),
  useAdDrive: () => drive,
}));

const flush = () =>
  act(async () => {
    for (let i = 0; i < 5; i++) await Promise.resolve();
  });
const buttons = () => Array.from(document.body.querySelectorAll('button'));
const groupPhotosBy = (value: 'job' | 'work') =>
  act(async () => {
    const sel = document.body.querySelector('select[aria-label="Group photos"]') as HTMLSelectElement;
    sel.value = value;
    sel.dispatchEvent(new Event('change', { bubbles: true }));
  });
const heads = () => Array.from(document.body.querySelectorAll('[aria-label="Library"] h3')).map((h) => h.textContent);
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

/** Opens a library file's window, or the upload window. */
const openFile = (fileName: string) => act(async () => (document.body.querySelector(`[aria-label="Open ${fileName}"]`) as HTMLButtonElement).click());
const openAdd = () => act(async () => (document.body.querySelector('[aria-label="Add photos or clips"]') as HTMLButtonElement).click());
const dialog = () => document.body.querySelector('[role="dialog"]') as HTMLElement;
const closeDialog = () => act(async () => (dialog().querySelector('[aria-label="Close"]') as HTMLButtonElement).click());

async function render(owner = true, { openAds = true } = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => createRoot(container).render(<AdsCard owner={owner} />));
  await flush();
  // This week shows each ad as a tile; its sizes, script and the competitor ad open in a window. Most tests read
  // those, so every tile is opened unless a test is about the grid itself.
  if (openAds) await openAllAds();
  return container;
}

async function openAllAds() {
  for (const b of Array.from(document.body.querySelectorAll('[data-testid="ad-tile"] > button'))) await act(async () => (b as HTMLButtonElement).click());
  await flush();
}

const creative = (over: Partial<AdBatch['creatives'][number]>): AdBatch['creatives'][number] => ({
  id: 'c1',
  batchId: 'b1',
  name: 'WL_abc123_916_20261102',
  shots: [
    { fileName: 'kitchen-before.jpg', voice: 'Dark oak cabinets, worn at the edges.', onScreen: 'Before', start: 0, end: 2.4 },
    { fileName: 'kitchen-after.jpg', voice: 'Same kitchen, painted white.', onScreen: 'After', start: 2.6, end: 4.8 },
  ],
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
  jobs = [];
  hooks = [];
  swipes = [];
  settings = {
    brand: 'Permian Home Quotes',
    keys: { anthropic: true, elevenlabs: true, renderer: false, meta: false, apify: false, bunny: false },
    primaryColor: '#336699',
    accentColor: '#8fb6e0',
    voiceSource: 'elevenlabs',
    tesseractFootage: true,
    actorVoice: 'middleAgeMale',
    actorLanguage: 'eng-us',
    weeklyEnabled: false,
    hooksPerWeek: 2,
    liveTarget: 6,
    researchKeywords: ['cabinet painting', 'house painter'],
    researchMarkets: ['Midland', 'Odessa'],
    researchMinDays: 90,
    researchMonthly: false,
  };
  swipes = [];
  playbooks = [];
  runs = [];
  readiness = undefined;
  requests = [];
});

describe('Ops → Ads', () => {
  it('the top of the page goes straight to the tabs: no readiness strip, no "Make an ad for" box', async () => {
    readiness = [{ key: 'keys', label: 'Services', ok: true, hard: true, tab: 'settings', detail: 'set' }];
    await render();
    expect(document.body.querySelector('[aria-label="Ready for Monday"]')).toBeNull();
    expect(document.body.querySelector('section[aria-label="Make an ad for"]')).toBeNull();
    expect(document.body.querySelector('[role="tablist"][aria-label="Ads"]')).not.toBeNull();
  });

  it('Create an ad: the owner picks a type of image and, if they like, a competitor ad to model; staff never see it', async () => {
    swipes = [
      { id: 's1', company: 'Carolina Cabinet Pros', paintingType: 'Cabinets', hook: 'Keep layout, fix ugly cabinets', offer: 'Free quote', creative: 'image', area: '', cta: '', adaptation: '', starred: false, source: 'research', daysRunning: 751 },
    ] as never;
    await render();
    await act(async () => (Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent?.trim() === 'Create ads') as HTMLButtonElement).click());
    // What it's about comes first, and nothing can be made until it's chosen.
    const about = Array.from(dialog().querySelectorAll('[aria-label="What it is about"] [role="radio"]'));
    expect(about.map((b) => b.textContent)).toEqual(['Cabinet painting', 'Exterior painting']);
    expect((byText('Choose what it is about first') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => (about[0] as HTMLButtonElement).click());
    const types = Array.from(dialog().querySelectorAll('[aria-label="Type of ad"] [role="radio"]'));
    expect(types.map((b) => b.querySelector('span')!.textContent)).toEqual(['Mix (recommended)', 'Plain photo', 'Plain before and after', 'Finished photo', 'Before and after', 'Showcase', 'Offer', 'Seasonal offer']);
    // A mix of kinds is the usual; one kind can be picked.
    expect(types[0].getAttribute('aria-checked')).toBe('true');
    await act(async () => (types[5] as HTMLButtonElement).click());
    const models = () => Array.from(dialog().querySelectorAll('[aria-label="Competitor ad to model"] [role="radio"]'));
    // The app's own pick of the best long-running image ads is the usual; none, or one by hand, can be chosen.
    expect(models()[0].textContent).toContain('Best match (recommended)');
    expect(models()[0].getAttribute('aria-checked')).toBe('true');
    expect(models()[1].textContent).toBe('None: write it fresh, without competitor ads');
    expect(models()[2].textContent).toContain('Carolina Cabinet Pros · Cabinets · running 751 days');
    await act(async () => (models()[2] as HTMLButtonElement).click());
    // Three at once is the usual; one or six can be picked.
    expect(Array.from(dialog().querySelectorAll('[aria-label="How many"] [role="radio"]')).map((b) => [b.textContent, b.getAttribute('aria-checked')])).toEqual([['1', 'false'], ['3', 'true'], ['6', 'false']]);
    // The brand guide every ad is checked against is there to read before making one.
    expect(dialog().textContent).toMatch(/Brand guide \(\d+ rules every ad is checked against\)/);
    expect(dialog().textContent).toContain('Headline in heavy condensed capitals.');
    await act(async () => byText('Create 3 cabinet painting ads')!.click());
    await flush();
    expect(createImageAd).toHaveBeenCalledWith('cabinets', 'showcase', 's1', undefined, 3);
    expect(document.body.querySelector('[role="status"]')?.textContent).toContain('3 image ads are written');

    document.body.innerHTML = '';
    await render(false);
    expect(Array.from(document.body.querySelectorAll('button')).some((b) => b.textContent?.trim() === 'Create ads')).toBe(false);
  });

  it('This week shows each ad as a tile: picture, title, kind; Approve takes all its sizes; tapping opens the rest', async () => {
    batches = [
      {
        id: 'b1',
        weekOf: '2026-11-02',
        status: 'ready',
        createdAt: new Date().toISOString(),
        creatives: [
          creative({}),
          creative({ id: 'c2', ratio: '4x5', name: 'WL_abc123_45_20261102' }),
        ],
      },
    ];
    await render(true, { openAds: false });
    const tiles = Array.from(document.body.querySelectorAll('[data-testid="ad-tile"]'));
    expect(tiles).toHaveLength(1);
    expect(tiles[0].textContent).toContain('2 sizes');
    // Nothing else until it's opened: no script, no competitor ad, no shot list.
    expect(document.body.querySelector('[data-testid="hook-group"]')).toBeNull();
    expect(document.body.querySelector('[aria-label="Shot list"]')).toBeNull();
    activate.mockClear();
    await act(async () => (Array.from(tiles[0].querySelectorAll('button')).find((b) => b.textContent === 'Approve') as HTMLButtonElement).click());
    await flush();
    expect(activate.mock.calls.map((c) => c[0]).sort()).toEqual(['c1', 'c2']);
    await act(async () => (tiles[0].querySelector('button') as HTMLButtonElement).click());
    expect(dialog().querySelector('[data-testid="hook-group"]')).not.toBeNull();
    expect(dialog().querySelectorAll('[data-testid="creative"]')).toHaveLength(2);
  });

  it('ads from separate runs sit side by side in one grid, grouped by what the owner does with them', async () => {
    const one = (id: string, status: AdBatch['creatives'][number]['status'], createdAt: string) =>
      creative({ id, status, createdAt, kind: 'image', name: `WL_${id}_45`, hook: { id: `h${id}`, family: 'visual', familyLabel: 'Visual', scope: 'cabinets', textEn: `Ad ${id}` }, script: { voice: '', onScreen: [`Ad ${id}`], headline: `Ad ${id}`, primaryText: 'Tired of them? Get a free quote.' } });
    const batch = (id: string, c: AdBatch['creatives'][number]): AdBatch => ({ id, weekOf: '2026-11-23', status: 'ready', createdAt: c.createdAt, creatives: [c] });
    batches = [
      batch('b1', one('a', 'paused', '2026-11-27T10:00:00Z')),
      batch('b2', one('b', 'rendered', '2026-11-27T12:00:00Z')),
      batch('b3', one('c', 'paused', '2026-11-27T11:00:00Z')),
      batch('b4', one('d', 'live', '2026-11-27T09:00:00Z')),
      batch('b5', one('e', 'voiced', '2026-11-27T13:00:00Z')),
      batch('b6', one('f', 'rejected', '2026-11-27T08:00:00Z')),
    ];
    await render();
    const titles = (label: string) => Array.from(document.body.querySelectorAll(`[aria-label="${label}"] [data-testid="ad-tile"] p:first-of-type`)).map((p) => p.textContent);
    // The three waiting on the owner are one row, newest first, whichever run made them.
    expect(titles('Ads to review')).toEqual(['Ad b', 'Ad c', 'Ad a']);
    expect(document.body.querySelector('[aria-label="To review"] header')!.textContent).toBe('To review · 32 in Meta, paused · 1 drawn, not in Meta yet');
    expect(titles('Ads running')).toEqual(['Ad d']);
    // A still's tile carries the text that runs above the picture.
    expect(document.body.querySelector('[aria-label="Ads to review"] [data-testid="primary-text"]')!.textContent).toBe('Tired of them? Get a free quote.');
    expect(titles('Ads being made')).toEqual(['Ad e']);
    expect(titles('Ads stopped or set aside')).toEqual(['Ad f']);
    expect(document.body.textContent).not.toContain('Week of');
  });

  it("shows the week's batch grouped by hook, approves both sizes at once or one at a time, rejects", async () => {
    batches = [
      {
        id: 'b1',
        weekOf: '2026-11-02',
        status: 'ready',
        summary: '2 paused in Meta',
        skipped: ['"Get the outside painted before the first freeze": Claude passed: no exterior in this footage'],
        createdAt: new Date().toISOString(),
        creatives: [
          creative({}),
          creative({
            id: 'c2',
            ratio: '4x5',
            name: 'WL_abc123_45_20261102',
            script: { voice: 'Paint them.', onScreen: ['Paint them'], headline: 'Cabinets, kitchen transformed', primaryText: 'A fresh finish.' },
          }),
        ],
      },
    ];
    await render();
    const groups = document.body.querySelectorAll('[data-testid="hook-group"]');
    expect(groups.length).toBe(1);
    expect(groups[0].textContent).toContain('Before / after · Cabinets · Paint them');
    const cards = document.body.querySelectorAll('[data-testid="creative"]');
    expect(cards.length).toBe(2);
    expect(cards[1].textContent).toContain('4x5');
    expect(cards[1].textContent).toContain('Cabinets, kitchen transformed');
    // No box per week: the ad sits in the one grid of ads to review.
    expect(document.body.textContent).not.toContain('Week of');
    expect(document.body.querySelector('[aria-label="To review"] h3')!.textContent).toBe('To review · 1');
    expect(document.body.querySelector('[aria-label="Passed over"]')!.textContent).toBe(
      'Passed over "Get the outside painted before the first freeze": Claude passed: no exterior in this footage',
    );
    const shots = groups[0].querySelector('[aria-label="Shot list"]')!.querySelectorAll('li');
    expect(Array.from(shots).map((li) => li.textContent)).toEqual([
      '1. kitchen-before.jpg · 0.0–2.4s“Dark oak cabinets, worn at the edges.”On screen: Before',
      '2. kitchen-after.jpg · 2.6–4.8s“Same kitchen, painted white.”On screen: After',
    ]);
    await act(async () => byText('Approve both')!.click());
    await flush();
    expect(activate).toHaveBeenCalledWith('c1');
    expect(activate).toHaveBeenCalledWith('c2');
    expect(document.body.querySelector('[role="status"]')?.textContent).toBe('Both sizes are live.');
    activate.mockClear();
    await act(async () => (cards[0].querySelector('button') as HTMLButtonElement).click());
    await flush();
    expect(activate).toHaveBeenCalledWith('c1');
    expect(activate).not.toHaveBeenCalledWith('c2');
    await act(async () =>
      Array.from(cards[1].querySelectorAll('button'))
        .find((b) => b.textContent === 'Reject')!
        .click(),
    );
    expect(reject).toHaveBeenCalledWith('c2');
  });

  it('campaign switch: the owner turns the ads on after a confirm, and off in one tap; staff never see it', async () => {
    await render();
    const box = () => document.body.querySelector('[aria-label="Campaign"]')!;
    expect(box().textContent).toContain('Ads are off');
    expect(box().textContent).toContain('$20 a day');
    expect(box().textContent).toContain('2 approved ads');
    await act(async () => byText('Turn ads on')!.click());
    expect(setCampaign).not.toHaveBeenCalled();
    expect(box().textContent).toContain('Start spending up to $20 a day?');
    await act(async () => byText('Yes, turn on')!.click());
    await flush();
    expect(setCampaign).toHaveBeenLastCalledWith(true);
    expect(box().textContent).toContain('Ads are running');
    await act(async () => byText('Turn ads off')!.click());
    await flush();
    expect(setCampaign).toHaveBeenLastCalledWith(false);
    expect(box().textContent).toContain('Ads are off');

    document.body.innerHTML = '';
    campaignState.mockClear();
    await render(false);
    expect(document.body.querySelector('[aria-label="Campaign"]')).toBeNull();
    expect(campaignState).not.toHaveBeenCalled();
  });

  it('idea cards: the owner asks for ideas, keeps or kills each, and makes only the kept ones; staff only read', async () => {
    ideas = { round: null, ideas: [] };
    await render();
    const panel = () => document.body.querySelector('[aria-label="Ad ideas"]')!;
    expect(panel().textContent).toContain('No ideas waiting.');
    await act(async () => byText('Get ad ideas')!.click());
    await flush();
    expect(ideasNow).toHaveBeenCalled();
    expect(document.body.querySelector('[role="status"]')?.textContent).toBe('Writing ideas. They show here in about a minute.');

    document.body.innerHTML = '';
    ideas = { round: { status: 'writing', startedAt: new Date().toISOString() }, ideas: [] };
    await render();
    expect(panel().textContent).toContain('Writing ideas… about a minute.');
    expect((byText('Get ad ideas') as HTMLButtonElement).disabled).toBe(true);

    document.body.innerHTML = '';
    ideas = {
      round: { status: 'ready', startedAt: new Date().toISOString() },
      taste: 'Keeps plain openings about mess.',
      ideas: [
        {
          id: 'i1',
          line: 'Cabinet doors drying in rows off site while the family still cooks dinner.',
          opening: 'Your kitchen stays open.',
          familyLabel: 'Respect for your home',
          scope: 'cabinets',
          status: 'new',
          basedOn: { company: 'Rodgers Painting', daysRunning: 160, offer: 'Free estimate' },
        },
        { id: 'i2', line: 'A sun-faded fence beside fresh siding.', opening: 'Left side, right side.', familyLabel: 'Before / after', scope: 'exterior', status: 'new' },
        {
          id: 'i3',
          line: 'How a painter gets checked first.',
          opening: 'Who checked this painter?',
          familyLabel: 'Trust and proof',
          scope: 'general',
          status: 'kept',
          note: 'no photo tagged exterior',
        },
      ],
    };
    await render();
    const toDecide = document.body.querySelector('[aria-label="Ideas to decide"]')!.querySelectorAll('li');
    expect(toDecide.length).toBe(2);
    expect(toDecide[0].textContent).toContain('“Your kitchen stays open.”');
    expect(toDecide[0].textContent).toContain('Cabinet doors drying in rows');
    expect(toDecide[0].textContent).toContain("From Rodgers Painting's ad, running 160 days");
    await act(async () => (document.body.querySelector('[aria-label="Keep: Your kitchen stays open."]') as HTMLButtonElement).click());
    expect(decideIdea).toHaveBeenCalledWith('i1', 'kept');
    await act(async () => (document.body.querySelector('[aria-label="Kill: Left side, right side."]') as HTMLButtonElement).click());
    expect(decideIdea).toHaveBeenCalledWith('i2', 'killed');
    // A kept idea can be put back, says why it couldn't be made last time, and is what Make turns into an ad.
    const kept = document.body.querySelector('[aria-label="Kept ideas"]')!;
    expect(kept.textContent).toContain("Couldn't be made last time: no photo tagged exterior");
    await act(async () => (document.body.querySelector('[aria-label="Put back: Who checked this painter?"]') as HTMLButtonElement).click());
    expect(decideIdea).toHaveBeenCalledWith('i3', 'new');
    expect(panel().textContent).toContain('Kept (1)');
    await act(async () => byText('Make this ad')!.click());
    await flush();
    // Kept ideas are made as static image ads, not the old videos.
    expect(makeKeptImages).toHaveBeenCalled();
    expect(makeKept).not.toHaveBeenCalled();
    expect(panel().textContent).toContain('What it has learned about your taste: Keeps plain openings about mess.');
    expect(byText('Get new ideas')).toBeDefined();

    document.body.innerHTML = '';
    await render(false);
    expect(byText('Get new ideas')).toBeUndefined();
    expect(byText('Make this ad')).toBeUndefined();
    expect(document.body.querySelector('[aria-label="Keep: Your kitchen stays open."]')).toBeNull();
    expect(panel().textContent).toContain('Your kitchen stays open.');
    ideas = { round: null, ideas: [] };
  });

  it('the trade switch: the page works in one trade at a time, remembers the choice, and each list and upload follows it', async () => {
    window.localStorage.clear();
    ideas = { round: null, ideas: [] };
    asked.length = 0;
    await render();
    const trade = () => document.body.querySelector('select[aria-label="Trade"]') as HTMLSelectElement;
    expect(trade().value).toBe('painting');
    expect(asked).toContain('ideas:painting');
    expect(asked).toContain('batches:painting');

    await act(async () => {
      trade().value = 'outdoor-construction';
      trade().dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(trade().value).toBe('outdoor-construction');
    expect(asked).toContain('ideas:outdoor-construction');
    expect(asked).toContain('batches:outdoor-construction');
    await act(async () => byText('Get ad ideas')!.click());
    expect(ideasNow).toHaveBeenLastCalledWith('outdoor-construction');

    // The Library offers the trade's own labels and files an upload under it.
    await tab('Library');
    expect(asked).toContain('library:outdoor-construction');
    await openAdd();
    const labels = Array.from(dialog().querySelectorAll('button')).map((b) => b.textContent);
    expect(labels).toEqual(expect.arrayContaining(['patio', 'wall', 'outdoor-living', 'crew', 'before']));
    expect(labels).not.toContain('cabinets');
    await closeDialog();
    // Hooks start on the trade's first subject, with no offer of painting's six.
    await tab('Hooks');
    expect(asked).toContain('hooks:outdoor-construction');
    expect(byText('Add the six painting hooks')).toBeUndefined();
    expect((document.body.querySelector('select[aria-label="Scope"]') as HTMLSelectElement | null)?.value ?? 'patio').toBe('patio');
    // Competitors says none are on file yet, in place of painting's.
    await tab('Competitors');
    expect(document.body.textContent).toContain('No competitor ads on file for hardscaping yet.');
    // The owner can search for this trade's own competitor ads from here.
    await act(async () => byText('Search the niche')!.click());
    expect(researchNow).toHaveBeenLastCalledWith('outdoor-construction');

    // The choice is remembered for the next visit.
    document.body.innerHTML = '';
    asked.length = 0;
    await render();
    expect(asked).toContain('ideas:outdoor-construction');
    window.localStorage.clear();
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
        suggestRetire: '7 live, the target is 6; this one has the lowest click-through this week',
        week: { at: '', spendCents: 2500, impressions: 1200, clicks: 18, frequency: 3.1, ctr: 0.67, leadsMeta: 2 },
        intake: { leads: 3, confirmed: 2, sold: 1, revenueCents: 6500 },
      },
      { ...creative({ id: 'c2', name: 'WL_x_45', ratio: '4x5' }), intake: { leads: 0, confirmed: 0, sold: 0, revenueCents: 0 } },
    ];
    await render();
    await tab('Live');
    const rows = document.body.querySelectorAll('[data-testid="live-ad"]');
    expect(rows.length).toBe(2);
    expect(rows[0].textContent).toContain('$25.00');
    expect(rows[0].textContent).toContain('0.67%');
    expect(rows[0].textContent).toContain('fatigued');
    expect(rows[0].textContent).toContain('retire?');
    expect(rows[1].textContent).not.toContain('retire?');
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

  it('Library: photos not in a job are grouped by type of work, each named on its card', async () => {
    const photo = (id: string, fileName: string, tags: string[]) => ({ id, kind: 'photo' as const, fileName, tags, createdAt: new Date().toISOString() });
    jobs = [];
    assets = [
      photo('f1', 'fence1.jpg', ['exterior', 'fence-stain', 'after']),
      photo('c1', 'cab1.jpg', ['cabinets', 'cabinets-stained']),
      photo('f2', 'fence2.jpg', ['exterior', 'fence-stain']),
      photo('x1', 'other.jpg', ['interior']),
    ];
    await render();
    await tab('Library');
    // By type of work: a big heading per type, counting its finished photos; those with none last.
    expect(heads()).toEqual(['Cabinets stained 1', 'Fence stain 2', 'No type of work yet 1']);
    expect(document.body.querySelectorAll('[aria-label="Fence stain"] [data-testid="asset"]')).toHaveLength(2);
    // A chip per group (wrapping, not scrolling): tapping one shows that group alone.
    expect(Array.from(document.body.querySelectorAll('[aria-label="Groups"] button')).map((b) => b.textContent)).toEqual(['All', 'Cabinets stained', 'Fence stain', 'No type of work yet']);
    await act(async () => (Array.from(document.body.querySelectorAll('[aria-label="Groups"] button')).find((b) => b.textContent === 'Fence stain') as HTMLButtonElement).click());
    expect(heads()).toEqual(['Fence stain 2']);
    await act(async () => byText('All groups')!.click());
    // By project: those in none together.
    await groupPhotosBy('job');
    expect(heads()).toEqual(['Not in a project 4']);
  });

  it('Library: "By type of work" groups every photo, jobs\' too, each keeping its job chip', async () => {
    const photo = (id: string, fileName: string, tags: string[], jobId?: string) => ({ id, kind: 'photo' as const, fileName, tags, jobId, createdAt: new Date().toISOString() });
    jobs = [{ id: 'j1', name: 'Smith fence', photos: 1, createdAt: new Date().toISOString() }];
    assets = [photo('f1', 'fence1.jpg', ['exterior', 'fence-stain'], 'j1'), photo('f2', 'fence2.jpg', ['exterior', 'fence-stain'])];
    await render();
    await tab('Library');
    // It opens by type of work, a project's photo among them with its project on it.
    expect(heads()).toEqual(['Fence stain 2']);
    expect(document.body.querySelector('[aria-label="Fence stain"]')!.textContent).toContain('Smith fence');
    expect(document.body.querySelector('[data-testid="job"]')).toBeNull();
    await groupPhotosBy('job');
    expect(heads()).toEqual(['Smith fence 1', 'Not in a project 1']);
    expect(document.body.querySelector('[data-testid="job"]')).not.toBeNull();
  });

  it('Library: a best shot shows a star on its tile, and the photo window marks or unmarks one', async () => {
    const photo = (id: string, fileName: string, tags: string[], best?: boolean) => ({ id, kind: 'photo' as const, fileName, tags, best, createdAt: new Date().toISOString() });
    jobs = [];
    assets = [photo('c1', 'cab1.jpg', ['cabinets', 'cabinets-painted', 'after'], true), photo('c2', 'cab2.jpg', ['cabinets', 'cabinets-painted', 'after'])];
    await render();
    await tab('Library');
    const tile = (name: string) => (document.body.querySelector(`[aria-label="Open ${name}"]`) as HTMLElement).closest('li')!;
    expect(tile('cab1.jpg').querySelector('[data-testid="best"]')).not.toBeNull();
    expect(tile('cab2.jpg').querySelector('[data-testid="best"]')).toBeNull();
    await openFile('cab2.jpg');
    await act(async () => (document.body.querySelector('[aria-label="Mark as a best shot"]') as HTMLButtonElement).click());
    await flush();
    expect(setBest).toHaveBeenCalledWith('c2', true);
  });

  it('Library: an open photo flips to the next and previous, in the order the page shows them', async () => {
    const photo = (id: string, fileName: string, tags: string[]) => ({ id, kind: 'photo' as const, fileName, tags, createdAt: new Date().toISOString() });
    jobs = [];
    assets = [photo('f1', 'fence1.jpg', ['exterior', 'fence-stain']), photo('c1', 'cab1.jpg', ['cabinets', 'cabinets-stained']), photo('f2', 'fence2.jpg', ['exterior', 'fence-stain'])];
    await render();
    await tab('Library');
    // By type of work: Cabinets stained first, then Fence stain.
    await act(async () => (document.body.querySelector('[aria-label="Open cab1.jpg"]') as HTMLButtonElement).click());
    expect(document.body.querySelector('[data-testid="flip-place"]')!.textContent).toContain('Photo 1 of 3');
    expect((document.body.querySelector('[aria-label="Previous"]') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => (document.body.querySelector('[aria-label="Next"]') as HTMLButtonElement).click());
    expect(document.body.querySelector('[data-testid="flip-place"]')!.textContent).toContain('Photo 2 of 3');
    expect(dialog().getAttribute('aria-label')).toBe('fence1.jpg');
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })));
    expect(document.body.querySelector('[data-testid="flip-place"]')!.textContent).toContain('Photo 3 of 3');
    expect((document.body.querySelector('[aria-label="Next"]') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' })));
    expect(document.body.querySelector('[data-testid="flip-place"]')!.textContent).toContain('Photo 2 of 3');
    // No note to fill in; the small copy shows at once, softened, until the full photo has loaded.
    expect(dialog().querySelector('input[aria-label^="Note"]')).toBeNull();
    expect(dialog().textContent).not.toContain('Note');
  });

  it('Library: befores and afters show together at the top, split or swapped there; two picked photos pair by hand', async () => {
    const photo = (id: string, fileName: string, tags: string[], more: Partial<AdAsset> = {}) => ({ id, kind: 'photo' as const, fileName, tags, createdAt: new Date().toISOString(), ...more });
    jobs = [];
    assets = [
      photo('b1', 'fence-before.jpg', ['fence-stain', 'before'], { pairKey: 'p1' }),
      photo('a1', 'fence-after.jpg', ['fence-stain', 'after'], { pairKey: 'p1' }),
      photo('b2', 'door-before.jpg', ['doors', 'before'], { pairKey: 'p2', pairSetBy: 'person' }),
      photo('a2', 'door-after.jpg', ['doors', 'after'], { pairKey: 'p2', pairSetBy: 'person' }),
      photo('j1', 'side-by-side.jpg', ['cabinets-painted', 'before', 'after']),
      photo('lone', 'kitchen-before.jpg', ['cabinets-painted', 'before']),
      photo('x', 'trim.jpg', ['interior-walls', 'after']),
    ];
    await render();
    await tab('Library');
    // In Photos, a type of work's befores sit apart, after its finished photos, and aren't counted with them.
    expect(document.body.querySelector('[aria-label="Cabinets painted"] h3')!.textContent).toBe('Cabinets painted 1');
    // A before carries its stage on the photo.
    expect(document.body.querySelector('[aria-label="Cabinets painted"]')!.textContent).toContain('Before');
    await act(async () => (Array.from(document.body.querySelectorAll('[aria-label="Groups"] button')).find((b) => b.textContent === 'Cabinets painted') as HTMLButtonElement).click());
    const cabinets = document.body.querySelector('[aria-label="Cabinets painted"]')!;
    const apart = cabinets.querySelector('[aria-label="Cabinets painted befores"]')!;
    expect(apart.textContent).toContain('used in ads only beside their after');
    expect(Array.from(apart.querySelectorAll('[aria-label^="Open "]')).map((b) => b.getAttribute('aria-label'))).toEqual(['Open kitchen-before.jpg']);
    // Its own place in the Show switch, with how many; the Photos view doesn't carry it.
    expect(document.body.querySelector('[aria-label="Pairs"]')).toBeNull();
    const show = Array.from(document.body.querySelectorAll('[aria-label="Show"] button')).find((b) => b.textContent?.startsWith('Before & after')) as HTMLButtonElement;
    expect(show.textContent).toBe('Before & after 3');
    await act(async () => show.click());
    const group = document.body.querySelector('[aria-label="Pairs"]')!;
    const tiles = Array.from(group.querySelectorAll('[data-testid="pair"]')).map((t) => t.textContent);
    expect(tiles.some((t) => t!.includes('Fence stain') && t!.includes('Paired by Claude'))).toBe(true);
    expect(tiles.some((t) => t!.includes('Paired by you'))).toBe(true);
    expect(tiles.some((t) => t!.includes('Before and after in one'))).toBe(true);
    // A before with no after yet is listed apart, so it can be shot.
    const lone = document.body.querySelector('[aria-label="Befores with no after yet"]')!;
    expect(lone.querySelectorAll('[data-testid="asset"]')).toHaveLength(1);
    expect(document.body.querySelector('[aria-label="Library"]')).toBeNull();
    // A pair opens side by side, with its fixes.
    await act(async () => (group.querySelector('[aria-label="Open the before and after: fence-before.jpg"]') as HTMLButtonElement).click());
    expect(dialog().textContent).toContain('Claude paired these');
    await act(async () => byText('Swap before and after')!.click());
    await flush();
    expect(swapPair).toHaveBeenLastCalledWith('b1');
    await act(async () => byText('Not a pair')!.click());
    await flush();
    expect(splitPair).toHaveBeenLastCalledWith('b1');
    expect(dialog()).toBeNull();
    // Tapping one side opens that photo.
    await act(async () => (group.querySelector('[aria-label="Open the before and after: door-before.jpg"]') as HTMLButtonElement).click());
    await act(async () => (dialog().querySelector('[aria-label="Open the after: door-after.jpg"]') as HTMLButtonElement).click());
    expect(dialog().getAttribute('aria-label')).toBe('door-after.jpg');
    await closeDialog();
    // Select two: "Pair these two".
    await act(async () => byText('Select')!.click());
    expect(document.body.querySelector('[aria-label="Pairs"]')).toBeNull();
    // While picking, the afters with no before show too.
    expect(document.body.querySelector('[aria-label="Afters with no before"]')!.textContent).toContain('1');
    const pickIt = (f: string) => act(async () => (document.body.querySelector(`[aria-label="Pick ${f}"]`) as HTMLButtonElement).click());
    await pickIt('kitchen-before.jpg');
    expect(byText('Pair these two as a before and after')).toBeFalsy();
    await pickIt('trim.jpg');
    await act(async () => byText('Pair these two as a before and after')!.click());
    await flush();
    expect(pairPhotos).toHaveBeenLastCalledWith(['lone', 'x']);
    expect(document.body.querySelector('[aria-label="Tag picked photos"]')).toBeNull();
  });

  it('Before & after: a before with no after gets "Add its after": pick its after (same job first) or upload it, and it is paired', async () => {
    const photo = (id: string, fileName: string, tags: string[], more: Partial<AdAsset> = {}) => ({ id, kind: 'photo' as const, fileName, tags, createdAt: '2026-11-01T00:00:00Z', ...more });
    jobs = [{ id: 'j1', name: 'Elm hall', createdAt: '2026-11-01' } as never];
    assets = [
      photo('b', 'hall-before.jpg', ['interior-walls', 'before'], { jobId: 'j1' }),
      photo('far', 'far-after.jpg', ['doors', 'after'], { createdAt: '2025-01-01T00:00:00Z' }),
      photo('same', 'same-job-after.jpg', ['interior-walls', 'after'], { jobId: 'j1' }),
      photo('work', 'walls-after.jpg', ['interior-walls', 'after']),
    ];
    pairPhotos.mockClear();
    addAsset.mockClear();
    await render();
    await tab('Library');
    await act(async () => (Array.from(document.body.querySelectorAll('[aria-label="Show"] button')).find((b) => b.textContent?.startsWith('Before & after')) as HTMLButtonElement).click());
    await act(async () => (document.body.querySelector('[aria-label="Add the after for hall-before.jpg"]') as HTMLButtonElement).click());
    expect(dialog().textContent).toContain('Add its after');
    const picks = Array.from(dialog().querySelectorAll('[aria-label^="Pair with"]')).map((b) => b.getAttribute('aria-label'));
    expect(picks).toEqual(['Pair with same-job-after.jpg', 'Pair with walls-after.jpg', 'Pair with far-after.jpg']);
    await act(async () => (dialog().querySelector('[aria-label="Pair with same-job-after.jpg"]') as HTMLButtonElement).click());
    await flush();
    expect(pairPhotos).toHaveBeenLastCalledWith(['b', 'same']);
    expect(dialog()).toBeNull();
    // Upload it: sent as the after, with the before's work and job, then paired with the new photo.
    await act(async () => (document.body.querySelector('[aria-label="Add the after for hall-before.jpg"]') as HTMLButtonElement).click());
    const input = dialog().querySelector('input[aria-label="Upload the after"]') as HTMLInputElement;
    Object.defineProperty(input, 'files', { value: [new File(['x'], 'hall-after.jpg', { type: 'image/jpeg' })] });
    await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
    await flush();
    await flush();
    expect(addAsset).toHaveBeenLastCalledWith(expect.objectContaining({ fileName: 'hall-after.jpg', tags: ['interior-walls', 'after'], jobId: 'j1', trade: 'painting' }));
    expect(pairPhotos).toHaveBeenLastCalledWith(['b', await addAsset.mock.results.at(-1)!.value]);
    // The photo window of a lone before has the same.
    await act(async () => (document.body.querySelector('[aria-label="Open hall-before.jpg"]') as HTMLButtonElement).click());
    expect(dialog().textContent).toContain('Pick after');
  });

  it('Library: in a batch, the next clip is made smaller while the one before is sent', async () => {
    jobs = [];
    assets = [];
    shrinkClip.mockClear();
    addAsset.mockClear();
    await render();
    await tab('Library');
    await act(async () => (Array.from(document.body.querySelectorAll('[aria-label="Show"] button')).find((b) => b.textContent?.startsWith('Clips')) as HTMLButtonElement).click());
    const tile = document.body.querySelector('input[aria-label="Add clips"]') as HTMLInputElement;
    const clip = (name: string) => {
      const f = new File(['v'], name, { type: 'video/quicktime' });
      Object.defineProperty(f, 'size', { value: 120 * 1024 * 1024 });
      return f;
    };
    shrinkTo = 12 * 1024 * 1024;
    sendsWait = true;
    await act(async () => {
      Object.defineProperty(tile, 'files', { value: [clip('one.mov'), clip('two.mov')], configurable: true });
      tile.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => new Promise((r) => setTimeout(r, 10)));
    // One is being sent, and two is already being made smaller.
    expect(shrinkClip).toHaveBeenCalledTimes(2);
    expect(document.body.querySelector('[data-testid="sending"]')!.textContent).toContain('Uploading one.mov (1 of 2)');
    expect(document.body.querySelector('[data-testid="sending-next"]')!.textContent).toContain('making a smaller copy of two.mov (2 of 2)');
    await act(async () => finishSends());
    await act(async () => new Promise((r) => setTimeout(r, 10)));
    await act(async () => finishSends());
    await flush();
    expect(addAsset.mock.calls.map((c) => (c[0] as { fileName: string }).fileName)).toEqual(['one.mp4', 'two.mp4']);
    expect(document.body.querySelector('[data-testid="sending"]')).toBeNull();
    sendsWait = false;
    shrinkTo = null;
  });

  it('Clips: the Google Drive folder, to connect; once connected, what is coming in and what could not', async () => {
    jobs = [];
    assets = [];
    drive = { setupMissing: [], connected: null, imports: [] };
    await render();
    await tab('Library');
    await act(async () => (Array.from(document.body.querySelectorAll('[aria-label="Show"] button')).find((b) => b.textContent?.startsWith('Clips')) as HTMLButtonElement).click());
    const box = () => document.body.querySelector('[aria-label="Google Drive folder"]')!;
    expect(box().textContent).toContain('Upload with the page closed');
    expect(box().textContent).toContain('Ad clips');
    const connect = Array.from(box().querySelectorAll('button')).find((b) => b.textContent === 'Connect Google Drive') as HTMLButtonElement;
    expect(connect.disabled).toBe(false);
    drive = {
      setupMissing: [],
      connected: { email: 'owner@gmail.com', folderName: 'Ad clips', found: true, lastCheckedAt: new Date().toISOString() },
      imports: [
        { id: 'i1', name: 'deck.mov', status: 'working', updatedAt: new Date().toISOString() },
        { id: 'i2', name: 'huge.mov', status: 'failed', error: "It's over 2 GB: trim it into shorter clips.", updatedAt: new Date().toISOString() },
      ],
    };
    await render();
    await tab('Library');
    await act(async () => (Array.from(document.body.querySelectorAll('[aria-label="Show"] button')).find((b) => b.textContent?.startsWith('Clips')) as HTMLButtonElement).click());
    expect(box().textContent).toContain('Google Drive · Ad clips');
    expect(box().querySelector('[data-testid="drive-busy"]')!.textContent).toContain('Bringing in 1 clip: deck.mov');
    const failedLine = box().querySelector('[data-testid="drive-failed"]')!;
    expect(failedLine.textContent).toContain("huge.mov couldn’t come in: It's over 2 GB");
    await act(async () => (Array.from(failedLine.querySelectorAll('button')).find((b) => b.textContent === 'Try again') as HTMLButtonElement).click());
    await flush();
    expect(driveRetry).toHaveBeenCalledWith('i2');
    drive = { setupMissing: [], connected: null, imports: [] };
  });

  it('Library: deleting a photo asks first; Keep it backs out, Delete removes it and opens the next', async () => {
    const photo = (id: string, fileName: string) => ({ id, kind: 'photo' as const, fileName, tags: ['exterior', 'fence-stain'], createdAt: new Date().toISOString(), uses: 2 });
    jobs = [];
    assets = [photo('f1', 'fence1.jpg'), photo('f2', 'fence2.jpg')];
    await render();
    await tab('Library');
    await act(async () => (document.body.querySelector('[aria-label="Open fence1.jpg"]') as HTMLButtonElement).click());
    const trash = () => dialog().querySelector('[aria-label="Remove fence1.jpg"]') as HTMLButtonElement;
    await act(async () => trash().click());
    expect(removeAsset).not.toHaveBeenCalled();
    const warning = () => dialog().querySelector('[role="alertdialog"]');
    expect(warning()!.textContent).toContain('Delete this photo for good?');
    expect(warning()!.textContent).toContain("It's been used in 2 ads.");
    await act(async () => (Array.from(warning()!.querySelectorAll('button')).find((b) => b.textContent === 'Keep it') as HTMLButtonElement).click());
    expect(warning()).toBeNull();
    await act(async () => trash().click());
    await act(async () => (Array.from(warning()!.querySelectorAll('button')).find((b) => b.textContent === 'Delete') as HTMLButtonElement).click());
    await flush();
    expect(removeAsset).toHaveBeenCalledWith('f1');
    expect(dialog().getAttribute('aria-label')).toBe('fence2.jpg');
  });

  it('Library: a clip being sent shows how far along it is; one too big is stopped before sending; a dropped one says so', async () => {
    jobs = [];
    assets = [];
    (global as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({ ok: true, json: async () => ({ storageId: 's1' }) }));
    await render();
    await tab('Library');
    await act(async () => (Array.from(document.body.querySelectorAll('[aria-label="Show"] button')).find((b) => b.textContent?.startsWith('Clips')) as HTMLButtonElement).click());
    const tile = () => document.body.querySelector('input[aria-label="Add clips"]') as HTMLInputElement;
    const pick = (f: File) =>
      act(async () => {
        Object.defineProperty(tile(), 'files', { value: [f], configurable: true });
        tile().dispatchEvent(new Event('change', { bubbles: true }));
      });
    sendsWait = true;
    await pick(new File(['v'], 'walk.mov', { type: 'video/quicktime' }));
    await flush();
    await act(async () => new Promise((r) => setTimeout(r, 5)));
    expect(document.body.querySelector('[data-testid="sending"]')!.textContent).toContain('Uploading walk.mov');
    expect(document.body.querySelector('[data-testid="sending"]')!.textContent).toContain('50%');
    // While it's on its way, closing or reloading the page asks first.
    const leaving = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(leaving);
    expect(leaving.defaultPrevented).toBe(true);
    await act(async () => finishSends());
    await flush();
    expect(document.body.querySelector('[data-testid="sending"]')).toBeNull();
    const after = new Event('beforeunload', { cancelable: true });
    window.dispatchEvent(after);
    expect(after.defaultPrevented).toBe(false);
    expect(addAsset).toHaveBeenLastCalledWith(expect.objectContaining({ fileName: 'walk.mov' }));
    sendsWait = false;
    // A big clip is made smaller on the device first, then sent smaller.
    addAsset.mockClear();
    const fourK = new File(['v'], 'deck.mov', { type: 'video/quicktime' });
    Object.defineProperty(fourK, 'size', { value: 120 * 1024 * 1024 });
    shrinkTo = 12 * 1024 * 1024;
    sendsWait = true;
    await pick(fourK);
    await flush();
    await act(async () => new Promise((r) => setTimeout(r, 5)));
    expect(shrinkClip).toHaveBeenCalled();
    expect(document.body.querySelector('[data-testid="sending"]')!.textContent).toContain('Uploading deck.mov');
    await act(async () => finishSends());
    await flush();
    expect(addAsset).toHaveBeenLastCalledWith(expect.objectContaining({ fileName: 'deck.mp4' }));
    sendsWait = false;
    // Still too big after: said, nothing sent.
    addAsset.mockClear();
    shrinkTo = null;
    const big = new File(['v'], 'long.mov', { type: 'video/quicktime' });
    Object.defineProperty(big, 'size', { value: 450 * 1024 * 1024 });
    await pick(big);
    await flush();
    await act(async () => new Promise((r) => setTimeout(r, 5)));
    expect(document.body.textContent).toContain("long.mov is 450 MB and couldn't be made smaller on this device. A clip must be 200 MB or less");
    expect(addAsset).not.toHaveBeenCalled();
    // A drop is tried again by itself, and noted for the logs.
    failNext = 1;
    await pick(new File(['v'], 'porch.mov', { type: 'video/quicktime' }));
    await act(async () => new Promise((r) => setTimeout(r, 20)));
    await flush();
    expect(addAsset).toHaveBeenLastCalledWith(expect.objectContaining({ fileName: 'porch.mov' }));
    expect(uploadNote).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'porch.mov', step: 'send 1/3' }));
    // Several at once: one that keeps failing doesn't stop the others, and the end says which.
    addAsset.mockClear();
    failNext = 3;
    await act(async () => {
      Object.defineProperty(tile(), 'files', {
        value: [new File(['v'], 'yard.mov', { type: 'video/quicktime' }), new File(['v'], 'hall.mov', { type: 'video/quicktime' })],
        configurable: true,
      });
      tile().dispatchEvent(new Event('change', { bubbles: true }));
    });
    await act(async () => new Promise((r) => setTimeout(r, 30)));
    await flush();
    expect(addAsset.mock.calls.map((c) => (c[0] as { fileName: string }).fileName)).toEqual(['hall.mov']);
    expect(document.body.textContent).toContain("1 of 2 uploaded. This one didn't, try it again: yard.mov: The upload stopped before it finished"); 
  });

  it('Library: an opened photo shows its small copy first, then the full one once loaded', async () => {
    jobs = [];
    assets = [{ id: 'p1', kind: 'photo' as const, fileName: 'p1.jpg', tags: ['interior'], url: 'https://cdn.example/p1.jpg', thumbUrl: 'https://cdn.example/p1-small.jpg', createdAt: new Date().toISOString() }];
    await render();
    await tab('Library');
    await act(async () => (document.body.querySelector('[aria-label="Open p1.jpg"]') as HTMLButtonElement).click());
    const box = dialog().querySelector('[data-testid="progressive"]')!;
    expect(box.getAttribute('data-ready')).toBe('no');
    expect(box.querySelector('img[aria-hidden="true"]')!.getAttribute('src')).toBe('https://cdn.example/p1-small.jpg');
    await act(async () => box.querySelector('img[alt="p1.jpg"]')!.dispatchEvent(new Event('load')));
    expect(box.getAttribute('data-ready')).toBe('yes');
    expect(box.querySelector('img[aria-hidden="true"]')).toBeNull();
  });

  it('Library: photos in their job boxes, quiet cards; a job is a tag in a photo\'s window; + job names one; an upload can carry one; a job is taken away', async () => {
    const photo = (id: string, fileName: string, tags: string[], jobId?: string) => ({ id, kind: 'photo' as const, fileName, tags, jobId, createdAt: new Date().toISOString() });
    // The job about to be added is already listed, as it is once the add comes back.
    jobs = [
      { id: 'j1', name: 'Smith kitchen', photos: 2, createdAt: new Date().toISOString() },
      { id: 'j2', name: 'Jones exterior', photos: 0, createdAt: new Date().toISOString() },
    ];
    // Claude matched the before with the after of the same spot.
    assets = [
      { ...photo('a1', 'before.jpg', ['cabinets', 'before'], 'j1'), pairKey: 'p-1' },
      { ...photo('a2', 'after.jpg', ['cabinets', 'after'], 'j1'), pairKey: 'p-1', thumbUrl: 'https://cdn.example/a2-small.jpg' },
      photo('a3', 'loose.jpg', []),
    ];
    (global as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({ ok: true, json: async () => ({ storageId: 's1' }) }));
    await render();
    await tab('Library');
    await groupPhotosBy('job');
    const group = document.body.querySelector('[data-testid="job"]')!;
    expect(group.textContent).toContain('Smith kitchen');
    expect(group.textContent).toContain('2 photos · 1 before/after pair');
    expect(group.textContent).toContain('once it has 3 photos or more');
    expect(group.querySelectorAll('[data-testid="asset"]')).toHaveLength(2);
    const looseCard = document.body.querySelector('[aria-label="Not in a project"] [data-testid="asset"]')!;
    expect(looseCard.textContent).toContain('No tags yet');
    // The cards have nothing to fill in: no tag buttons, no inputs.
    expect(document.body.querySelector('[aria-label="Library"] [data-testid="asset"] input')).toBeNull();
    expect(document.body.querySelector('[aria-label^="Project Smith kitchen for"]')).toBeNull();
    // In a photo's window the job is one plain choice; picking one files the photo there at once.
    const jobTag = (job: string, where: string) => dialog().querySelector(`[aria-label="Project ${job} for ${where}"]`) as HTMLButtonElement;
    const change = (where: string) => act(async () => (dialog().querySelector(`[aria-label="Change the project for ${where}"]`) as HTMLButtonElement).click());
    const jobRow = () => dialog().querySelector('[data-testid="row-job"]') as HTMLButtonElement;
    const openJobs = () => act(async () => jobRow().click());
    await openFile('loose.jpg');
    expect(jobRow().textContent).toContain('Assign');
    await openJobs();
    expect(jobTag('Smith kitchen', 'loose.jpg').getAttribute('aria-pressed')).toBe('false');
    await act(async () => jobTag('Smith kitchen', 'loose.jpg').click());
    await flush();
    expect(setAssetJob).toHaveBeenLastCalledWith('a3', 'j1');
    // A new project by name, and the photo goes in it.
    await openJobs();
    const name = dialog().querySelector('input[aria-label="New project for loose.jpg"]') as HTMLInputElement;
    await act(async () => type(name, 'Jones exterior'));
    await act(async () => (name.form as HTMLFormElement).requestSubmit());
    await flush();
    expect(addJob).toHaveBeenCalledWith('Jones exterior', 'painting');
    expect(setAssetJob).toHaveBeenLastCalledWith('a3', 'j2');
    await closeDialog();
    await openFile('before.jpg');
    // Its other half shows in the Before & after card, and opens the after.
    const pair = dialog().querySelector('[data-testid="pair"]')!;
    expect(pair.getAttribute('aria-label')).toBe('Open its after: after.jpg');
    expect(pair.querySelector('img')!.getAttribute('src')).toBe('https://cdn.example/a2-small.jpg');
    await act(async () => (pair as HTMLButtonElement).click());
    expect(dialog().getAttribute('aria-label')).toBe('after.jpg');
    await closeDialog();
    await openFile('before.jpg');
    expect(jobRow().textContent).toContain('Smith kitchen');
    await openJobs();
    expect(jobTag('Smith kitchen', 'before.jpg').getAttribute('aria-pressed')).toBe('true');
    // Tapping its project again takes it out.
    await act(async () => jobTag('Smith kitchen', 'before.jpg').click());
    await flush();
    expect(setAssetJob).toHaveBeenLastCalledWith('a1', undefined);
    await closeDialog();
    // The upload window can carry a job too.
    await openAdd();
    await change('the next upload');
    await act(async () => jobTag('Jones exterior', 'the next upload').click());
    const fileInput = dialog().querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', { value: [new File(['x'], 'house.jpg', { type: 'image/jpeg' }), new File(['v'], 'walk.mov', { type: 'video/quicktime' })] });
    await act(async () => fileInput.dispatchEvent(new Event('change', { bubbles: true })));
    await flush();
    expect(addAsset).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'house.jpg', jobId: 'j2', trade: 'painting' }));
    // A clip goes up without the job: jobs are for photos.
    expect(addAsset.mock.calls.map((c) => c[0] as { fileName: string; jobId?: string }).find((x) => x.fileName === 'walk.mov')!.jobId).toBeUndefined();
    expect(dialog()).toBeNull();
    // Select: tap several photos, then one job tag tags them all.
    await act(async () => byText('Select')!.click());
    // While selecting, a tap picks a photo instead of opening it.
    expect(document.body.querySelector('[aria-label="Open loose.jpg"]')).toBeNull();
    const pickIt = (f: string) => act(async () => (document.body.querySelector(`[aria-label="Pick ${f}"]`) as HTMLButtonElement).click());
    await pickIt('loose.jpg');
    await pickIt('after.jpg');
    await pickIt('before.jpg');
    await pickIt('before.jpg');
    const bar = document.body.querySelector('[aria-label="Tag picked photos"]')!;
    expect(bar.textContent).toContain('2 photos picked');
    await act(async () => (bar.querySelector('[aria-label="Project Jones exterior for the picked photos"]') as HTMLButtonElement).click());
    await flush();
    expect(groupIntoJob).toHaveBeenLastCalledWith(['a3', 'a2'], { jobId: 'j2' }, 'painting');
    expect(document.body.querySelector('[aria-label="Tag picked photos"]')).toBeNull();
    expect(document.body.textContent).toContain('2 photos tagged Jones exterior.');
    // A new job for the picked ones.
    await act(async () => byText('Select')!.click());
    await pickIt('loose.jpg');
    const named = document.body.querySelector('input[aria-label="New project for the picked photos"]') as HTMLInputElement;
    await act(async () => type(named, 'Garage door'));
    await act(async () => (named.form as HTMLFormElement).requestSubmit());
    await flush();
    expect(groupIntoJob).toHaveBeenLastCalledWith(['a3'], { name: 'Garage door' }, 'painting');
    // Photos go straight into a job from the dotted tile, the first square of its box, untagged so Claude tags them.
    addAsset.mockClear();
    const box = document.body.querySelector('[aria-label="Project Smith kitchen"]')!;
    const cells = Array.from(box.querySelectorAll('li'));
    expect(cells[0].getAttribute('data-testid')).toBe('add-tile');
    const into = box.querySelector('input[aria-label="Add photos to Smith kitchen"]') as HTMLInputElement;
    Object.defineProperty(into, 'files', { value: [new File(['x'], 'sink.jpg', { type: 'image/jpeg' })] });
    await act(async () => into.dispatchEvent(new Event('change', { bubbles: true })));
    await flush();
    expect(addAsset).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'sink.jpg', jobId: 'j1', tags: [] }));
    expect(document.body.textContent).toContain('✓ Sent. You can leave this page: Claude tags it in the background.');
    // The Add window adds with no job and no tags: Claude sorts them.
    await openAdd();
    expect(dialog().textContent).toContain('Claude looks at each one and sorts it by type of work');
    const loose = dialog().querySelector('input[aria-label="Upload photos or clips"]') as HTMLInputElement;
    Object.defineProperty(loose, 'files', { value: [new File(['x'], 'yard.jpg', { type: 'image/jpeg' })] });
    await act(async () => loose.dispatchEvent(new Event('change', { bubbles: true })));
    await flush();
    expect((addAsset.mock.calls.map((c) => c[0]) as Array<{ fileName: string; jobId?: string }>).find((x) => x.fileName === 'yard.jpg')!.jobId).toBeUndefined();
    // New job: a name, and its box is there with its own tile.
    await act(async () => byText('New project')!.click());
    await act(async () => type(dialog().querySelector('input[aria-label="Project name"]') as HTMLInputElement, 'Jones exterior'));
    await act(async () => (dialog().querySelector('form') as HTMLFormElement).requestSubmit());
    await flush();
    expect(addJob).toHaveBeenLastCalledWith('Jones exterior', 'painting');
    expect(dialog()).toBeNull();
    expect(document.body.querySelector('input[aria-label="Add photos to Jones exterior"]')).not.toBeNull();
    await act(async () => byText('Take away job')!.click());
    await flush();
    expect(removeJob).toHaveBeenCalledWith('j1');
    expect(asked).toContain('jobs:painting');
  });

  it('Library: no filter row of pills; the headings group the photos; what is visible is in the window', async () => {
    const photo = (id: string, fileName: string, tags: string[], items: string[]) => ({ id, kind: 'photo' as const, fileName, tags, items, createdAt: new Date().toISOString() });
    jobs = [];
    assets = [
      photo('d1', 'door.jpg', ['exterior', 'doors'], ['front door', 'brick']),
      photo('d2', 'door2.jpg', ['exterior', 'doors'], ['front door']),
      photo('f1', 'fence.jpg', ['exterior', 'fence-stain'], ['fence']),
      photo('n1', 'new.jpg', [], []),
    ];
    await render();
    await tab('Library');
    expect(document.body.querySelector('[aria-label="Show work"]')).toBeNull();
    expect(document.body.querySelector('[aria-label="Show photos of"]')).toBeNull();
    expect(heads()).toEqual(['Doors 2', 'Fence stain 1', 'No type of work yet 1']);
    // The square is the picture alone; what it shows is in its tooltip and the window.
    expect(document.body.querySelector('[aria-label="Open door.jpg"]')!.getAttribute('title')).toContain('front door · brick');
    expect(document.body.querySelector('[aria-label="Open door.jpg"]')!.textContent).toBe('');
    // The window is the photo first, with one plain bar: type of work, stage, crew, job. No lists of pills.
    await openFile('door.jpg');
    expect(dialog().querySelector('[aria-label="Change the type of work"]')!.textContent).toContain('Doors');
    // Tapping it lists the types of work; one tapped is saved.
    await act(async () => (dialog().querySelector('[aria-label="Change the type of work"]') as HTMLButtonElement).click());
    await act(async () => (Array.from(dialog().querySelectorAll('button')).find((b) => b.textContent === 'Fence stain') as HTMLButtonElement).click());
    await flush();
    expect(tagAsset).toHaveBeenLastCalledWith('d1', ['fence-stain', 'doors', 'exterior', 'interior'], undefined, undefined);
    expect(Array.from(dialog().querySelectorAll('[aria-label="Stage"] button')).map((b) => b.textContent)).toEqual(['Before', 'In progress', 'After', 'Both in one']);
    expect(dialog().querySelector('[aria-label="Save & next"]')).toBeNull();
  });

  it('Library uploads a file with the chosen tags; a photo opened is retagged and saved, with no pair key to type', async () => {
    assets = [
      {
        id: 'a1',
        url: 'https://cdn.example/a1.jpg',
        posterUrl: 'https://cdn.example/a1-still.jpg',
        kind: 'photo',
        fileName: 'kitchen.jpg',
        tags: ['cabinets'],
        description: 'White shaker cabinets in a bright kitchen.',
        suggestedTags: ['cabinets', 'after'],
        uses: 2,
        createdAt: new Date().toISOString(),
      },
    ];
    (global as unknown as { fetch: unknown }).fetch = jest.fn(async () => ({ ok: true, json: async () => ({ storageId: 's1' }) }));
    await render();
    await tab('Library');
    // Nothing is on by default; pick a type of work (its scope comes with it) and "Before", then upload.
    await openAdd();
    const upTag = (t: string) =>
      act(async () =>
        Array.from(dialog().querySelectorAll('[aria-label="Tags for the next upload"] button'))
          .find((b) => b.textContent === t)!
          .click(),
      );
    await upTag('Rooms painted');
    await upTag('Before');
    const fileInput = dialog().querySelector('input[type="file"]') as HTMLInputElement;
    Object.defineProperty(fileInput, 'files', { value: [new File(['x'], 'hall.jpg', { type: 'image/jpeg' })] });
    await act(async () => fileInput.dispatchEvent(new Event('change', { bubbles: true })));
    await flush();
    expect(uploadUrl).toHaveBeenCalled();
    expect(addAsset).toHaveBeenCalledWith({
      storageId: 's1',
      fileName: 'hall.jpg',
      tags: ['interior-walls', 'interior', 'before'],
      pairKey: undefined,
      note: undefined,
      trade: 'painting',
    });
    expect(document.body.querySelector('[role="status"]')?.textContent).toBe('✓ Sent. You can leave this page: Claude tags it in the background.');

    // The square is quiet: the picture, and on it only how many ads it's in (its stage when not finished, its project).
    const card = document.body.querySelector('[data-testid="asset"]')!;
    expect(card.textContent).toBe('in 2 ads');
    // With no small copy yet, the card shows the still, loading only as it scrolls near; the page makes the small
    // copy from the still, quietly.
    expect(card.querySelector('img')!.getAttribute('src')).toBe('https://cdn.example/a1-still.jpg');
    expect(card.querySelector('img')!.getAttribute('loading')).toBe('lazy');
    expect((global as unknown as { fetch: jest.Mock }).fetch.mock.calls.map((c) => c[0])).toContain('https://cdn.example/a1-still.jpg');
    // Opened, it says what Claude saw and offers its tags.
    await openFile('kitchen.jpg');
    // Its own tags differ from Claude's: "Use Claude's tags" puts them on, saved at once. No pair key to type.
    expect(tagAsset).not.toHaveBeenCalled();
    expect(dialog().querySelector('input[aria-label^="Pair key"]')).toBeNull();
    await act(async () =>
      Array.from(dialog().querySelectorAll('button'))
        .find((b) => b.textContent === "Use Claude's tags")!
        .click(),
    );
    await flush();
    expect(tagAsset).toHaveBeenLastCalledWith('a1', ['cabinets', 'after'], undefined, undefined);
    // A stage is one choice, saved at once: Before takes After's place. "Both in one" is a side-by-side.
    const stage = (name: string) => act(async () => (Array.from(dialog().querySelectorAll('[aria-label="Stage"] button')).find((b) => b.textContent === name) as HTMLButtonElement).click());
    await stage('Before');
    await flush();
    expect(tagAsset).toHaveBeenLastCalledWith('a1', ['cabinets', 'before'], undefined, undefined);
    await stage('Both in one');
    await flush();
    expect(tagAsset).toHaveBeenLastCalledWith('a1', ['cabinets', 'before', 'after'], undefined, undefined);
    // Tapped again, it comes off.
    await stage('Both in one');
    await flush();
    expect(tagAsset).toHaveBeenLastCalledWith('a1', ['cabinets'], undefined, undefined);
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
        basedOn: { company: 'Squeegee Squad', daysRunning: 745, offer: 'Free in-home estimate' },
      },
    ];
    document.body.innerHTML = '';
    await render();
    await tab('Hooks');
    expect(byText('Add the six painting hooks')).toBeUndefined();
    const row = document.body.querySelector('[data-testid="hook"]')!;
    expect(row.textContent).toContain('Cost education · Interior · used 1 · 1 won · 0 lost');
    // An idea that came from a competitor's ad says which, and how long it has run.
    expect(row.textContent).toContain("From Squeegee Squad's ad, running 745 days");
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

  it('Competitors loads the research, filters and searches, stars one, and starts a hook from an angle', async () => {
    await render();
    await tab('Competitors');
    await act(async () => byText('Load the October 10 research')!.click());
    expect(seedSwipes).toHaveBeenCalled();
    expect(document.body.querySelector('[role="status"]')?.textContent).toBe('The October 10 research is in.');

    const swipe = (over: Partial<Swipe>): Swipe => ({
      id: 's1',
      company: 'Rodgers Painting',
      paintingType: 'Cabinets',
      scope: 'cabinets',
      hook: 'Cost of new cabinets vs painting',
      offer: 'Free quote',
      creative: 'Before/after reel',
      area: 'Tulsa, OK',
      cta: 'Get quote',
      adaptation: 'Lead with the price gap.',
      startedAt: '2026-09-01',
      metaAdId: '111',
      pageUrl: 'https://www.facebook.com/rodgers',
      adCopy: 'Tired of dark cabinets? We paint them.',
      transcript: '[00:00] Hi there. [00:03] Paint them.',
      durationSec: 14,
      starred: false,
      source: 'research 2026-10-10',
      ...over,
    });
    swipes = [
      swipe({}),
      swipe({
        id: 's2',
        company: 'Marian Painting',
        paintingType: 'Exterior',
        scope: 'exterior',
        hook: 'Owner selfie walk-through',
        transcript: undefined,
        adCopy: 'Meet the owner.',
      }),
    ];
    document.body.innerHTML = '';
    await render();
    await tab('Competitors');
    expect(byText('Load the October 10 research')).toBeUndefined();
    const cards = () => Array.from(document.body.querySelectorAll('[data-testid="swipe"]'));
    expect(cards().length).toBe(2);
    const first = cards()[0];
    expect(first.textContent).toContain('Rodgers Painting · Cabinets · Tulsa, OK · since 2026-09-01');
    expect(first.textContent).toContain('Cost of new cabinets vs painting');
    expect(first.textContent).toContain('Script · 14s');
    expect(first.querySelector('a[href="https://www.facebook.com/ads/library/?id=111"]')).not.toBeNull();
    expect(first.querySelector('a[href="https://www.facebook.com/rodgers"]')).not.toBeNull();

    await act(async () => byText('Exterior')!.click());
    expect(cards().length).toBe(1);
    expect(cards()[0].textContent).toContain('Marian Painting');
    await act(async () => byText('All')!.click());
    type(document.body.querySelector('input[type="search"]') as HTMLInputElement, 'dark cabinets');
    await flush();
    expect(cards().length).toBe(1);
    expect(cards()[0].textContent).toContain('Rodgers Painting');

    await act(async () => (cards()[0].querySelector('[aria-label="Star Rodgers Painting"]') as HTMLButtonElement).click());
    expect(starSwipe).toHaveBeenCalledWith('s1', true);

    await act(async () => byText('Make a hook')!.click());
    const form = document.body.querySelector('form[aria-label="New hook"]')!;
    expect(form).not.toBeNull();
    expect((form.querySelector('textarea') as HTMLTextAreaElement).value).toBe('Cost of new cabinets vs painting');
    const selects = form.querySelectorAll('select');
    expect((selects[0] as HTMLSelectElement).value).toBe('education');
    expect((selects[1] as HTMLSelectElement).value).toBe('cabinets');
  });

  it('Competitors: the owner searches the niche, the last run shows, no Local tag or filter, the playbook is edited and rewritten', async () => {
    swipes = [
      {
        id: 's1',
        company: 'Jesse McCandless Painting',
        paintingType: 'Cabinets',
        scope: 'cabinets',
        hook: 'Owner to camera',
        offer: 'Free quote',
        creative: 'video',
        area: 'Midland, TX',
        cta: 'Get quote',
        adaptation: 'Open on the owner.',
        metaAdId: '9001',
        starred: false,
        source: 'research 2026-10-30',
        daysRunning: 140,
        variants: 3,
        pageLikes: 1200,
        posterUrl: 'https://img.example/9001.jpg',
        family: 'owner_story',
        opening: 'owner',
        footage: ['owner_to_camera', 'before_after'],
        claims: ['$500 off this month'],
        quality: 48,
        local: true,
        score: 72,
      },
      {
        id: 's2',
        company: 'Lubbock Cabinet Co',
        paintingType: 'Cabinets',
        scope: 'cabinets',
        hook: 'Paint, do not replace',
        offer: 'Quote',
        creative: 'image',
        area: '',
        cta: 'Learn more',
        adaptation: '',
        metaAdId: '9002',
        starred: false,
        source: 'research 2026-10-30',
        daysRunning: 40,
        endedAt: '2026-11-20',
        local: false,
        score: 44,
      },
    ];
    playbooks = [
      {
        id: 'p1',
        scope: 'cabinets',
        text: 'Winners open on the owner, then a before/after.',
        footagePrefs: ['before', 'after'],
        angleFamilies: ['owner_story'],
        localCompetitors: [{ company: 'Jesse McCandless Painting', angle: 'owner story', daysRunning: 140 }],
        missingFootage: ['A clip of the owner talking to camera'],
        basis: { ads: 5, local: 1, oldestDays: 300 },
        writtenAt: new Date().toISOString(),
      },
    ];
    runs = [
      {
        id: 'r1',
        startedAt: '2026-10-30T06:00:00Z',
        finishedAt: '2026-10-30T06:04:00Z',
        keywords: ['cabinet painting'],
        scanned: 760,
        kept: 48,
        added: 31,
        junk: 9,
        unreadable: 2,
        stopped: 3,
      },
    ];
    await render();
    await tab('Competitors');
    expect(document.body.querySelector('[data-testid="research-run"]')!.textContent).toBe(
      'Oct 30 · scanned 760 · 48 past the bar · 31 new · 3 stopped · 9 junk dropped · 2 unreadable',
    );
    // A kept ad that has stopped says so, with how long it ran, instead of "since".
    const stoppedCard = [...document.body.querySelectorAll('[data-testid="swipe"]')].find((el) => el.textContent?.includes('Stopped'))!;
    expect(stoppedCard.textContent).toContain('Stopped Nov 20 · ran 40 days');
    await act(async () => byText('Search the niche')!.click());
    expect(researchNow).toHaveBeenCalled();

    const card = document.body.querySelector('[data-testid="playbook"]')!;
    expect(card.textContent).toContain('What works: cabinets');
    expect(card.textContent).toContain('Winners open on the owner, then a before/after.');
    expect(card.textContent).toContain('Footage the winners use: before, after');
    expect(card.textContent).toContain('A clip of the owner talking to camera');
    expect(card.textContent).not.toContain('Advertising in your markets');
    await act(async () => (Array.from(card.querySelectorAll('button')).find((b) => b.textContent === 'Rewrite') as HTMLButtonElement).click());
    expect(rewritePlaybook).toHaveBeenCalledWith('cabinets');
    await act(async () => (Array.from(card.querySelectorAll('button')).find((b) => b.textContent === 'Edit') as HTMLButtonElement).click());
    const form = document.body.querySelector('form[aria-label="Edit what works: cabinets"]')!;
    const textarea = form.querySelector('textarea') as HTMLTextAreaElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(textarea, 'Our read: owner first, then the kitchen.');
      textarea.dispatchEvent(new Event('input', { bubbles: true }));
    });
    await act(async () => form.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })));
    await flush();
    expect(savePlaybook).toHaveBeenCalledWith('cabinets', 'Our read: owner first, then the kitchen.');

    const cards = () => Array.from(document.body.querySelectorAll('[data-testid="swipe"]'));
    expect(cards().length).toBe(2);
    expect(cards()[0].textContent).toContain('Jesse McCandless Painting · Cabinets · Midland, TX · 140 days · 3 versions · 1,200 page likes');
    // No Local tag and no Local filter.
    expect(cards()[0].textContent).not.toContain('Local');
    expect(byText('Local')).toBeUndefined();
    expect(cards()[0].textContent).toContain('Owner story · Opens with: the owner talking · owner to camera, before / after · fit 72/100');
    expect(cards()[0].textContent).toContain('Never copy$500 off this month');
    expect(cards()[0].querySelector('img')!.getAttribute('src')).toBe('https://img.example/9001.jpg');
    await act(async () => byText('90+ days')!.click());
    expect(cards().length).toBe(1);
    expect(cards()[0].textContent).toContain('Jesse McCandless Painting');
    await act(async () => byText('90+ days')!.click());

    // The table: a row per ad, sortable; the choice is remembered.
    await act(async () => byText('Table')!.click());
    expect(cards().length).toBe(0);
    const rows = () => Array.from(document.body.querySelectorAll('[data-testid="swipe-row"]'));
    expect(rows().length).toBe(2);
    expect(document.body.querySelector('[data-testid="swipe-table"] img')).toBeNull();
    expect(rows()[0].textContent).toContain('Jesse McCandless Painting');
    expect(rows()[0].textContent).toContain('140');
    expect(rows()[1].textContent).toContain('Stopped Nov 20');
    const headButton = (label: string) =>
      Array.from(document.body.querySelectorAll('[data-testid="swipe-table"] th button')).find((b) => b.textContent?.startsWith(label)) as HTMLButtonElement;
    await act(async () => headButton('Company').click());
    expect(rows()[0].textContent).toContain('Jesse McCandless Painting');
    await act(async () => headButton('Company').click());
    expect(rows()[0].textContent).toContain('Lubbock Cabinet Co');
    expect(window.localStorage.getItem('ads.swipeView')).toBe('table');
    await act(async () => byText('Cards')!.click());
    expect(cards().length).toBe(2);

    document.body.innerHTML = '';
    await render(false);
    await tab('Competitors');
    expect(byText('Search the niche')).toBeUndefined();
  });

  it('Competitors imports the research sheet from its CSV tabs, merged by #, under "Other ways to add ads"', async () => {
    swipes = [];
    await render();
    await tab('Competitors');
    const fileInput = document.body.querySelector('input[type="file"]') as HTMLInputElement;
    const ads = new File(
      [
        '#,Company,Painting type,Hook / angle,Offer,Creative,Area evidence,CTA,Client adaptation,Started (Meta),Status when observed,Advertiser page,Destination,Ad ID\n1,Acme,Cabinets,Cost,Free quote,Reel,Odessa,Get quote,Try it,,,,,111',
      ],
      'Painting ads.csv',
      { type: 'text/csv' },
    );
    const copy = new File(['#,Company,Ad copy and card text\n1,Acme,"Tired of dark cabinets?"'], 'Ad copy.csv', { type: 'text/csv' });
    Object.defineProperty(fileInput, 'files', { value: [ads, copy] });
    await act(async () => fileInput.dispatchEvent(new Event('change', { bubbles: true })));
    await flush();
    await flush();
    expect(importSwipes).toHaveBeenCalledWith(
      [expect.objectContaining({ company: 'Acme', scope: 'cabinets', metaAdId: '111', adCopy: 'Tired of dark cabinets?' })],
      'Painting ads, Ad copy',
    );
    expect(Array.from(document.body.querySelectorAll('[role="status"]')).map((s) => s.textContent)).toContain(
      '1 ads read from 2 files: 1 added, 1 updated.',
    );
  });

  it("an image ad from before still shows as its picture with the words printed on it, in a group of its own beside the same idea's video", async () => {
    const words = { voice: '', onScreen: ['Paint them, do not replace them', 'One vetted Midland painter.'], headline: 'Cabinets painted', primaryText: 'A fresh finish.' };
    const photo = [{ fileName: 'kitchen-after.jpg', voice: '', onScreen: 'Paint them, do not replace them' }];
    batches = [
      {
        id: 'b1',
        weekOf: '2026-11-02',
        status: 'ready',
        createdAt: new Date().toISOString(),
        creatives: [
          creative({ id: 'v1', kind: 'video' }),
          creative({ id: 'i1', kind: 'image', name: 'WL_abc123_916_20261102_img', videoUrl: undefined, imageUrl: 'https://cdn.example/i1.jpg', script: words, shots: photo }),
          creative({ id: 'i2', kind: 'image', ratio: '4x5', name: 'WL_abc123_45_20261102_img', videoUrl: undefined, imageUrl: 'https://cdn.example/i2.jpg', script: words, shots: photo }),
        ],
      },
    ];
    await render();
    const groups = Array.from(document.body.querySelectorAll('[data-testid="hook-group"]'));
    expect(groups.length).toBe(2);
    expect(groups[0].querySelectorAll('video').length).toBe(1);
    expect(groups[0].textContent).toContain('Video · Before / after');
    const image = groups[1];
    expect(image.textContent).toContain('Image · Before / after');
    expect(Array.from(image.querySelectorAll('img')).map((i) => i.getAttribute('src'))).toEqual(['https://cdn.example/i1.jpg', 'https://cdn.example/i2.jpg']);
    expect(image.querySelector('img')!.getAttribute('alt')).toBe('Paint them, do not replace them');
    expect(image.querySelectorAll('video').length).toBe(0);
    expect(image.querySelector('summary')!.textContent).toBe('Words on the image');
    expect(image.textContent).toContain('Under it: One vetted Midland painter.');
    expect(image.textContent).toContain('kitchen-after.jpg');
    // Both sizes are approved together, like a video's.
    expect(Array.from(image.querySelectorAll('button')).some((b) => b.textContent === 'Approve both')).toBe(true);
  });

  it('an animated ad that is voiced says it is waiting to be drawn, with its style, the words at the top and each line with its label', async () => {
    const lines = [
      { fileName: 'kitchen-after.jpg', voice: 'Thinking about new cabinets?', onScreen: '', start: 0, end: 2.4 },
      { fileName: 'kitchen-after.jpg', voice: 'A fresh finish changes the whole kitchen.', onScreen: 'No tear-out', start: 2.6, end: 6.1 },
    ];
    const animated = {
      status: 'voiced' as const,
      style: { id: 'lightUp', label: 'Light-up' },
      videoUrl: undefined,
      meta: undefined,
      shots: lines,
      script: { voice: 'x', onScreen: ['Paint them, do not replace', 'No tear-out'], headline: 'Cabinets painted', primaryText: 'A fresh finish.' },
      hook: {
        id: 'h1',
        family: 'before_after',
        familyLabel: 'Before / after',
        scope: 'cabinets',
        textEn: 'Paint instead of replace',
        basedOn: {
          company: 'Precision Painting NY INC.',
          daysRunning: 1659,
          offer: 'Free estimate; replacement-cost alternative',
          angle: 'Paint instead of replace',
          written: 'Why replace when you can refinish?',
          link: 'https://www.facebook.com/ads/library/?id=123',
          imageUrl: 'https://example.com/their-ad.jpg',
        },
      },
    };
    batches = [
      {
        id: 'b1',
        weekOf: '2026-11-16',
        status: 'drafting',
        createdAt: new Date().toISOString(),
        creatives: [creative({ id: 'a1', ...animated }), creative({ id: 'a2', ratio: '4x5', ...animated, status: 'rendering' })],
      },
    ];
    await render();
    const [group] = Array.from(document.body.querySelectorAll('[data-testid="hook-group"]'));
    expect(group.textContent).toContain('Light-up style · Before / after · ');
    // Which competitor ad it is built around, and how long that one has run.
    expect(group.textContent).toContain("Built around Precision Painting NY INC.'s ad, running 1,659 days. Their offer: Free estimate; replacement-cost alternative");
    // Their ad's words beside ours, to see what was taken from it and what was written new.
    const compare = group.querySelector('[data-testid="compare"]')!;
    expect(compare.textContent).toContain('Their ad · Precision Painting NY INC.');
    expect(compare.textContent).toContain('Angle: Paint instead of replace');
    expect(compare.textContent).toContain('Written: “Why replace when you can refinish?”');
    expect(compare.textContent).not.toContain('Said:');
    // Their real ad opens from here, and its picture shows when we kept it.
    const open = Array.from(compare.querySelectorAll('a')).find((x) => x.textContent?.includes('Open their ad'))!;
    expect(open.getAttribute('href')).toBe('https://www.facebook.com/ads/library/?id=123');
    expect(compare.querySelector('img')!.getAttribute('src')).toBe('https://example.com/their-ad.jpg');
    expect(compare.textContent).toContain('Our ad');
    expect(Array.from(compare.querySelectorAll('ol li')).map((li) => li.textContent)).toEqual(['“Thinking about new cabinets?”', '“A fresh finish changes the whole kitchen.”']);
    expect(Array.from(group.querySelectorAll('[data-testid="creative"]')).map((c) => c.textContent)).toEqual([
      expect.stringContaining('Waiting to render'),
      expect.stringContaining('Rendering'),
    ]);
    // Nothing to watch or approve yet.
    expect(group.querySelectorAll('video').length).toBe(0);
    expect(Array.from(group.querySelectorAll('button')).some((b) => b.textContent === 'Approve both')).toBe(false);
    expect(group.querySelector('summary')!.textContent).toBe('Lines');
    expect(group.textContent).toContain('At the top: Paint them, do not replace');
    expect(group.textContent).toContain('Label: No tear-out');
    // A line with no label says nothing in its place.
    expect(group.textContent!.match(/Label:/g)!.length).toBe(1);
    expect(group.textContent).not.toContain('On screen:');
  });

  it('Settings: the owner pastes the Meta token, then picks the ad account, Page, ad set and form from what Meta lists', async () => {
    saveSettings.mockClear();
    await render();
    await tab('Settings');
    const meta = () => document.body.querySelector('[aria-label="Meta"]')!;
    // No token yet: no lookup, the ids can still be typed.
    expect(byText('Find my accounts')).toBeUndefined();
    const tokenBox = meta().querySelector('input[aria-label="Meta token"]') as HTMLInputElement;
    expect(tokenBox.type).toBe('password');
    await act(async () => type(tokenBox, 'EAAG-the-token'));
    await act(async () => byText('Save token')!.click());
    await flush();
    expect(saveMetaToken).toHaveBeenCalledWith('EAAG-the-token');
    expect(document.body.textContent).toContain('Meta took the token: it is saved.');
    // Saved: the live settings now say so, and Meta lists what it reaches.
    settings = { ...settings!, keys: { ...settings!.keys, meta: true }, metaToken: { hint: 'oken', setAt: new Date().toISOString(), fromServer: false } };
    document.body.innerHTML = '';
    await render();
    await tab('Settings');
    expect(meta().textContent).toContain('Token saved');
    expect(meta().textContent).toContain('ends …oken');
    expect(meta().querySelector('input[aria-label="Meta token"]')).toBeNull();
    await act(async () => byText('Find my accounts')!.click());
    await flush();
    const select = (label: string) => meta().querySelector(`select[aria-label="${label}"]`) as HTMLSelectElement;
    const choose = (label: string, value: string) =>
      act(async () => {
        select(label).value = value;
        select(label).dispatchEvent(new Event('change', { bubbles: true }));
      });
    expect(Array.from(select('Ad account').options).map((o) => o.textContent)).toEqual(['Choose…', 'GoodFit Pros', 'Old account · not active']);
    await choose('Ad account', '123');
    expect(Array.from(select('Ad set the ads go into').options).map((o) => o.textContent)).toEqual(['Choose…', 'Midland homeowners · Leads, paused']);
    await choose('Ad set the ads go into', '900');
    await choose('Facebook Page', '55');
    await choose('Instant form (optional)', 'f1');
    expect(meta().textContent).toContain('Instant forms of Other page: no access');
    await act(async () =>
      document.body.querySelector('form[aria-label="Ad settings"]')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    );
    await flush();
    expect(saveSettings).toHaveBeenLastCalledWith(expect.objectContaining({ adAccountId: '123', adsetId: '900', pageId: '55', leadFormId: 'f1' }));
    expect(saveSettings.mock.calls.at(-1)![0]).not.toHaveProperty('metaToken');
  });

  it('Settings shows which keys are set, and the owner saves the ids; the Monday batch has no switch', async () => {
    await render();
    await tab('Settings');
    expect(document.body.textContent).toContain('Homeowners see the ads as Permian Home Quotes');
    expect(document.body.textContent).toContain('ADS_RENDER_TOKEN: missing');
    expect(document.body.textContent).toContain('a batch shows Waiting to render until the drawing is started by hand');
    expect(document.body.textContent).not.toContain('What a batch makes');
    expect(document.body.textContent).toContain('ANTHROPIC_API_KEY: set');
    await act(async () => type(document.body.querySelector('input[aria-label="Ad account id"]') as HTMLInputElement, 'act_123'));
    // The Monday batch is gone: nothing in Settings switches it on or sets its size.
    expect(document.body.textContent).not.toContain('Draft a batch every Monday');
    expect(document.body.querySelector('input[aria-label="Ads to write each Monday"]')).toBeNull();
    await act(async () =>
      document.body.querySelector('form[aria-label="Ad settings"]')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    );
    await flush();
    expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({ adAccountId: 'act_123' }));
    expect(saveSettings.mock.calls[0][0]).not.toHaveProperty('keys');
    expect(document.body.textContent).toContain('Competitor search key: missing');
    // The competitor search key is pasted, checked and saved; the box empties.
    const scrapeInput = () => document.body.querySelector('input[aria-label="ScrapeCreators key"]') as HTMLInputElement;
    await act(async () => type(scrapeInput(), 'sc_live_abcdefghijkl1234'));
    await act(async () => byText('Save key')!.click());
    await flush();
    expect(saveScrapeKey).toHaveBeenCalledWith('sc_live_abcdefghijkl1234');
    expect(document.body.textContent).toContain('ScrapeCreators took the key: it is saved.');
    expect(scrapeInput().value).toBe('');
    await act(async () =>
      type(document.body.querySelector('input[aria-label="Search words"]') as HTMLInputElement, 'cabinet painting, deck staining,'),
    );
    await act(async () => type(document.body.querySelector('input[aria-label="Your markets"]') as HTMLInputElement, 'Midland'));
    await act(async () =>
      document.body.querySelector('form[aria-label="Ad settings"]')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    );
    await flush();
    expect(saveSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({
        researchKeywords: ['cabinet painting', 'deck staining'],
        researchMarkets: ['Midland'],
        researchMinDays: 90,
        researchMonthly: false,
      }),
    );

    document.body.innerHTML = '';
    await render(false);
    await tab('Settings');
    expect(byText('Save settings')).toBeUndefined();
    expect((document.body.querySelector('input[aria-label="Page id"]') as HTMLInputElement).disabled).toBe(true);
  });

  it('a voice actor: Settings switches who reads and how; an ad waiting on the read says so, checks now, and copies the on-camera brief', async () => {
    await render();
    await tab('Settings');
    // The ElevenLabs voice by default: no voice actor fields, no Bunny Studio key asked for.
    expect(document.body.querySelector('select[aria-label="Who reads"]')).toBeNull();
    expect(document.body.textContent).not.toContain('BUNNY_STUDIO_TOKEN');
    const source = document.body.querySelector('select[aria-label="Who reads the ads"]') as HTMLSelectElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLSelectElement.prototype, 'value')!.set!.call(source, 'actor');
      source.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(document.body.textContent).toContain('BUNNY_STUDIO_TOKEN: missing');
    expect(document.body.textContent).toContain('A read that skips or changes the words is held back');
    await act(async () => type(document.body.querySelector('input[aria-label="Notes for the voice actor"]') as HTMLInputElement, 'West Texas, easygoing'));
    await act(async () =>
      document.body.querySelector('form[aria-label="Ad settings"]')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    );
    await flush();
    expect(saveSettings).toHaveBeenLastCalledWith(
      expect.objectContaining({ voiceSource: 'actor', actorVoice: 'middleAgeMale', actorLanguage: 'eng-us', actorNotes: 'West Texas, easygoing' }),
    );

    document.body.innerHTML = '';
    batches = [
      {
        id: 'b1',
        weekOf: '2026-11-23',
        status: 'drafting',
        createdAt: new Date().toISOString(),
        creatives: [creative({ status: 'recording', videoUrl: undefined, meta: undefined, actor: { orderedAt: new Date().toISOString(), price: 31 } })],
      },
    ];
    const writeText = jest.fn(async () => undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    await render();
    const card = document.body.querySelector('[data-testid="creative"]')!;
    expect(card.textContent).toContain('With the voice actor');
    expect(card.textContent).toContain('Voice actor ordered');
    expect(card.textContent).toContain('$31.00');
    expect(byText('Approve')).toBeUndefined();
    await act(async () => byText('Check now')!.click());
    await flush();
    expect(checkActors).toHaveBeenCalled();
    await act(async () => byText('Copy on-camera brief')!.click());
    await flush();
    expect(creatorBrief).toHaveBeenCalledWith('c1');
    expect(writeText).toHaveBeenCalledWith('GoodFit Pros: on-camera read');
  });

  it("an on-camera take: uploaded and put on the ad; an ad timing its take says so; none can be added once it's in Meta", async () => {
    batches = [
      {
        id: 'b1',
        weekOf: '2026-11-23',
        status: 'drafting',
        createdAt: new Date().toISOString(),
        creatives: [creative({ id: 'c1', status: 'voiced', videoUrl: undefined, meta: undefined })],
      },
    ];
    const posted: Array<{ url: string; type: string | null }> = [];
    const realFetch = global.fetch;
    global.fetch = jest.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      posted.push({ url: String(url), type: new Headers(init?.headers).get('Content-Type') });
      return { ok: true, status: 200, json: async () => ({ storageId: 'st1' }) } as Response;
    }) as unknown as typeof fetch;
    try {
      await render();
      const input = document.body.querySelector('input[aria-label="On-camera take for WL_abc123_916_20261102"]') as HTMLInputElement;
      expect(input.closest('label')!.textContent).toContain('Add on-camera take');
      const file = new File(['take'], 'IMG_0412.MOV', { type: 'video/quicktime' });
      Object.defineProperty(input, 'files', { value: [file], configurable: true });
      await act(async () => input.dispatchEvent(new Event('change', { bubbles: true })));
      await flush();
      expect(posted).toEqual([{ url: 'https://upload.example/u1', type: 'video/quicktime' }]);
      expect(addTake).toHaveBeenCalledWith('c1', 'st1', 'IMG_0412.MOV');
    } finally {
      global.fetch = realFetch;
    }

    document.body.innerHTML = '';
    batches = [
      {
        id: 'b1',
        weekOf: '2026-11-23',
        status: 'drafting',
        createdAt: new Date().toISOString(),
        creatives: [
          creative({ id: 'c1', status: 'recording', videoUrl: undefined, meta: undefined, presenter: { addedAt: new Date().toISOString() } }),
          creative({ id: 'c2', ratio: '4x5', status: 'paused' }),
        ],
      },
    ];
    await render();
    const [timing, inMeta] = Array.from(document.body.querySelectorAll('[data-testid="creative"]'));
    expect(timing.textContent).toContain('Timing the take');
    expect(timing.textContent).toContain('On camera');
    expect(timing.textContent).not.toContain('With the voice actor');
    expect(timing.textContent).not.toContain('Check now');
    expect(timing.textContent).toContain('Replace on-camera take');
    expect(inMeta.textContent).not.toContain('on-camera take');

    // A job site video is the crew's own footage: no brief to send a creator, and no take to add.
    document.body.innerHTML = '';
    batches = [{ id: 'b2', weekOf: '2026-11-23', status: 'ready', createdAt: new Date().toISOString(), creatives: [creative({ id: 'f1', status: 'rendered', style: { id: 'footage', label: 'Job site video' } })] }];
    await render();
    const site = document.body.querySelector('[data-testid="creative"]')!;
    expect(site.textContent).not.toContain('Copy on-camera brief');
    expect(site.textContent).not.toContain('on-camera take');
  });

  it('a job site video: clips are on their own; a clip is made into an ad as it was shot, and has no job or before/after', async () => {
    assets = [
      { id: 'v1', kind: 'video', fileName: 'spraying.mp4', tags: ['cabinets'], durationSec: 12.4, createdAt: new Date().toISOString() },
      { id: 'p1', kind: 'photo', fileName: 'kitchen.jpg', url: 'https://cdn.example/p1.jpg', thumbUrl: 'https://cdn.example/p1-small.jpg', tags: ['cabinets'], createdAt: new Date().toISOString() },
    ];
    jobs = [{ id: 'j1', name: 'Smith kitchen', photos: 0, createdAt: new Date().toISOString() }];
    await render();
    await tab('Library');
    const show = (label: string) => Array.from(document.body.querySelectorAll('[aria-label="Show"] button')).find((b) => b.textContent?.startsWith(label)) as HTMLButtonElement;
    expect(show('Photos').textContent).toBe('Photos 1');
    expect(show('Clips').textContent).toBe('Clips 1');
    // A card shows the small copy, never the full photo.
    expect(document.body.querySelector('[aria-label="Open kitchen.jpg"] img')!.getAttribute('src')).toBe('https://cdn.example/p1-small.jpg');
    // Photos first: the clip isn't among them.
    expect(document.body.querySelector('[aria-label="Open spraying.mp4"]')).toBeNull();
    expect(document.body.textContent).not.toContain('Make a job site ad');
    await act(async () => show('Clips').click());
    expect(document.body.querySelector('[aria-label="Open kitchen.jpg"]')).toBeNull();
    const clip = document.body.querySelector('[data-testid="asset"]')!;
    expect(clip.textContent).toContain('12s');
    expect((document.body.querySelector('[aria-label="Clips"] input[aria-label="Add clips"]') as HTMLInputElement).accept).toBe('video/*');
    await act(async () => Array.from(clip.querySelectorAll('button')).find((b) => b.textContent === 'Make a job site ad')!.click());
    await flush();
    expect(makeFootage).toHaveBeenCalledWith('v1');
    expect(document.body.textContent).toContain('Making a job site ad from this clip');
    await openFile('spraying.mp4');
    expect(dialog().querySelector('[aria-label^="Project Smith kitchen"]')).toBeNull();
    expect(Array.from(dialog().querySelectorAll('[aria-label="Tags for spraying.mp4"] button')).map((b) => b.textContent)).not.toContain('before');
  });
});
