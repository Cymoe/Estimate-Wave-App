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
const seedHooks = jest.fn(async () => 6);
const saveHook = jest.fn(async () => 'h9');
const saveSettings = jest.fn(async () => undefined);
const tagAsset = jest.fn(async () => undefined);
const removeAsset = jest.fn(async (_id: string) => undefined);
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
    seedHooks: () => seedHooks(),
    saveHook: (args: unknown) => saveHook(args),
    saveSettings: (args: unknown) => saveSettings(args),
    tagAsset: (...args: unknown[]) => tagAsset(...args),
    addAsset: (args: unknown) => addAsset(args),
    uploadUrl: () => uploadUrl(),
    removeAsset: (id: string) => removeAsset(id),
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

/** Opens a library file's window, or the upload window. */
const openFile = (fileName: string) => act(async () => (document.body.querySelector(`[aria-label="Open ${fileName}"]`) as HTMLButtonElement).click());
const openAdd = () => act(async () => byText('Add photos or clips')!.click());
const dialog = () => document.body.querySelector('[role="dialog"]') as HTMLElement;
const closeDialog = () => act(async () => (dialog().querySelector('[aria-label="Close"]') as HTMLButtonElement).click());

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
  it('"Make an ad for…" starts one from a line and lists the latest with their private links', async () => {
    requests = [
      { ask: 'cabinet painting in Odessa', createdAt: new Date().toISOString(), stage: 'drawing', link: 'https://app.example/ads/abc' },
      { ask: 'roof repair', createdAt: new Date().toISOString(), stage: 'failed', link: 'https://app.example/ads/def' },
    ];
    await render();
    const box = document.body.querySelector('section[aria-label="Make an ad for"]')!;
    expect(box.textContent).toContain('"cabinet painting in Odessa"');
    expect(box.textContent).toContain('Drawing');
    expect(box.textContent).toContain("Couldn't be made");
    expect(box.querySelector('a[href="https://app.example/ads/abc"]')).not.toBeNull();
    const field = box.querySelector('#make-an-ad') as HTMLInputElement;
    await act(async () => type(field, 'paver patio in Midland'));
    await act(async () => (box.querySelector('form') as HTMLFormElement).requestSubmit());
    await flush();
    expect(makeFor).toHaveBeenCalledWith('paver patio in Midland');
    expect(field.value).toBe('');
  });

  it('the readiness strip says whether Monday will draft, and each check opens the tab that fixes it', async () => {
    readiness = [
      { key: 'keys', label: 'Services', ok: true, hard: true, tab: 'settings', detail: 'Claude and ElevenLabs are set' },
      { key: 'library', label: 'Library', ok: true, hard: true, tab: 'library', detail: '5 files, 3 tagged by room' },
      { key: 'hooks', label: 'Hooks', ok: false, hard: true, tab: 'hooks', detail: '1 active, need 2' },
      { key: 'playbook', label: 'What works', ok: false, hard: false, tab: 'swipes', detail: 'None yet: load or search competitor ads' },
      { key: 'meta', label: 'Meta account', ok: false, hard: false, tab: 'settings', detail: 'Token, ad account, page and ad set needed' },
    ];
    await render();
    const strip = document.body.querySelector('[aria-label="Ready for Monday"]')!;
    expect(strip.textContent).toContain('Monday will skip: Hooks. 1 active, need 2.');
    await act(async () => (Array.from(strip.querySelectorAll('button')).find((b) => b.textContent?.includes('Hooks')) as HTMLButtonElement).click());
    expect(document.body.querySelector('form[aria-label="New hook"]')).not.toBeNull();

    readiness = readiness.map((c) => ({ ...c, ok: true }));
    document.body.innerHTML = '';
    await render();
    expect(document.body.querySelector('[aria-label="Ready for Monday"]')!.textContent).toContain('Monday will draft.');
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
    expect(document.body.textContent).toContain('Week of 2026-11-02');
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
    expect(makeKept).toHaveBeenCalled();
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
    const pick = (label: string) =>
      Array.from(document.body.querySelector('[aria-label="Trade"]')!.querySelectorAll('button')).find((b) => b.textContent === label) as HTMLButtonElement;
    expect(pick('Painting').getAttribute('aria-pressed')).toBe('true');
    expect(asked).toContain('ideas:painting');
    expect(asked).toContain('batches:painting');

    await act(async () => pick('Hardscaping').click());
    expect(pick('Hardscaping').getAttribute('aria-pressed')).toBe('true');
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
    await act(async () => (Array.from(document.body.querySelectorAll('[aria-label="Group photos"] button')).find((b) => b.textContent === 'By job') as HTMLButtonElement).click());
    const loose = document.body.querySelector('[aria-label="Not in a job"]')!;
    expect(Array.from(loose.querySelectorAll('h4')).map((h) => h.textContent)).toEqual(['Cabinets stained 1', 'Fence stain 2', 'No type of work yet']);
    expect(loose.querySelectorAll('[aria-label="Fence stain"] [data-testid="asset"]')).toHaveLength(2);
    expect(loose.querySelector('[aria-label="Fence stain"] [data-testid="work"]')!.textContent).toBe('Fence stain');
  });

  it('Library: "By type of work" groups every photo, jobs\' too, each keeping its job chip', async () => {
    const photo = (id: string, fileName: string, tags: string[], jobId?: string) => ({ id, kind: 'photo' as const, fileName, tags, jobId, createdAt: new Date().toISOString() });
    jobs = [{ id: 'j1', name: 'Smith fence', photos: 1, createdAt: new Date().toISOString() }];
    assets = [photo('f1', 'fence1.jpg', ['exterior', 'fence-stain'], 'j1'), photo('f2', 'fence2.jpg', ['exterior', 'fence-stain'])];
    await render();
    await tab('Library');
    // It opens by type of work.
    const all = document.body.querySelector('[aria-label="By type of work"]')!;
    expect(all.querySelector('[aria-label="Fence stain"] h4')!.textContent).toBe('Fence stain 2');
    expect(all.textContent).toContain('Smith fence');
    expect(document.body.querySelector('[data-testid="job"]')).toBeNull();
    await act(async () => (Array.from(document.body.querySelectorAll('[aria-label="Group photos"] button')).find((b) => b.textContent === 'By job') as HTMLButtonElement).click());
    expect(document.body.querySelector('[aria-label="Not in a job"] [aria-label="Fence stain"] h4')!.textContent).toBe('Fence stain 1');
    expect(document.body.querySelector('[data-testid="job"]')).not.toBeNull();
  });

  it('Library: an open photo flips to the next and previous, in the order the page shows them', async () => {
    const photo = (id: string, fileName: string, tags: string[]) => ({ id, kind: 'photo' as const, fileName, tags, createdAt: new Date().toISOString() });
    jobs = [];
    assets = [photo('f1', 'fence1.jpg', ['exterior', 'fence-stain']), photo('c1', 'cab1.jpg', ['cabinets', 'cabinets-stained']), photo('f2', 'fence2.jpg', ['exterior', 'fence-stain'])];
    await render();
    await tab('Library');
    // By type of work: Cabinets stained first, then Fence stain.
    await act(async () => (document.body.querySelector('[aria-label="Open cab1.jpg"]') as HTMLButtonElement).click());
    expect(document.body.querySelector('[data-testid="flip-place"]')!.textContent).toBe('01/03');
    expect((document.body.querySelector('[aria-label="Previous"]') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => (document.body.querySelector('[aria-label="Next"]') as HTMLButtonElement).click());
    expect(document.body.querySelector('[data-testid="flip-place"]')!.textContent).toBe('02/03');
    expect(dialog().getAttribute('aria-label')).toBe('fence1.jpg');
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight' })));
    expect(document.body.querySelector('[data-testid="flip-place"]')!.textContent).toBe('03/03');
    expect((document.body.querySelector('[aria-label="Next"]') as HTMLButtonElement).disabled).toBe(true);
    await act(async () => window.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowLeft' })));
    expect(document.body.querySelector('[data-testid="flip-place"]')!.textContent).toBe('02/03');
    // No note to fill in; the small copy shows at once, softened, until the full photo has loaded.
    expect(dialog().querySelector('input[aria-label^="Note"]')).toBeNull();
    expect(dialog().textContent).not.toContain('Note');
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
    expect(warning()!.textContent).toContain('Delete this photo?');
    expect(warning()!.textContent).toContain("It's been used in 2 ads.");
    await act(async () => (Array.from(warning()!.querySelectorAll('button')).find((b) => b.textContent === 'Keep it') as HTMLButtonElement).click());
    expect(warning()).toBeNull();
    await act(async () => trash().click());
    await act(async () => (Array.from(warning()!.querySelectorAll('button')).find((b) => b.textContent === 'Delete') as HTMLButtonElement).click());
    await flush();
    expect(removeAsset).toHaveBeenCalledWith('f1');
    expect(dialog().getAttribute('aria-label')).toBe('fence2.jpg');
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
    await act(async () => (Array.from(document.body.querySelectorAll('[aria-label="Group photos"] button')).find((b) => b.textContent === 'By job') as HTMLButtonElement).click());
    const group = document.body.querySelector('[data-testid="job"]')!;
    expect(group.textContent).toContain('Smith kitchen');
    expect(group.textContent).toContain('2 photos · 1 before/after pair');
    expect(group.textContent).toContain('once it has 3 photos or more');
    expect(group.querySelectorAll('[data-testid="asset"]')).toHaveLength(2);
    const looseCard = document.body.querySelector('[aria-label="Not in a job"] [data-testid="asset"]')!;
    expect(looseCard.textContent).toContain('No tags yet');
    // The cards have nothing to fill in: no tag buttons, no inputs.
    expect(document.body.querySelector('[aria-label="Library"] [data-testid="asset"] input')).toBeNull();
    expect(document.body.querySelector('[aria-label^="Job Smith kitchen for"]')).toBeNull();
    // In a photo's window the job is one row; tapping it lists the jobs as big rows to pick from.
    const jobTag = (job: string, where: string) => dialog().querySelector(`[aria-label="Job ${job} for ${where}"]`) as HTMLButtonElement;
    const change = (where: string) => act(async () => (dialog().querySelector(`[aria-label="Change the job for ${where}"]`) as HTMLButtonElement).click());
    const jobRow = () => dialog().querySelector('[data-testid="row-job"]') as HTMLButtonElement;
    const openJobs = () => act(async () => jobRow().click());
    await openFile('loose.jpg');
    expect(jobRow().textContent).toContain('Unassigned');
    expect(jobTag('Smith kitchen', 'loose.jpg')).toBeNull();
    await openJobs();
    expect(jobTag('Smith kitchen', 'loose.jpg').getAttribute('aria-pressed')).toBe('false');
    expect(jobTag('Smith kitchen', 'loose.jpg').textContent).toContain('2 photos');
    await act(async () => jobTag('Smith kitchen', 'loose.jpg').click());
    await flush();
    expect(setAssetJob).toHaveBeenLastCalledWith('a3', 'j1');
    // A new job by name, and the photo goes in it.
    await openJobs();
    const name = dialog().querySelector('input[aria-label="New job for loose.jpg"]') as HTMLInputElement;
    await act(async () => type(name, 'Jones exterior'));
    await act(async () => (name.form as HTMLFormElement).requestSubmit());
    await flush();
    expect(addJob).toHaveBeenCalledWith('Jones exterior', 'painting');
    expect(setAssetJob).toHaveBeenLastCalledWith('a3', 'j2');
    await closeDialog();
    await openFile('before.jpg');
    // Its match shows, and opens the after.
    const pair = dialog().querySelector('[data-testid="pair"]')!;
    expect(pair.textContent).toContain('Same spot as this after photo');
    expect(pair.querySelector('img')!.getAttribute('src')).toBe('https://cdn.example/a2-small.jpg');
    await act(async () => (pair as HTMLButtonElement).click());
    expect(dialog().getAttribute('aria-label')).toBe('after.jpg');
    await closeDialog();
    await openFile('before.jpg');
    expect(jobRow().textContent).toContain('Smith kitchen');
    await openJobs();
    expect(jobTag('Smith kitchen', 'before.jpg').getAttribute('aria-pressed')).toBe('true');
    // Tapping its job again takes it out.
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
    await act(async () => (bar.querySelector('[aria-label="Job Jones exterior for the picked photos"]') as HTMLButtonElement).click());
    await flush();
    expect(groupIntoJob).toHaveBeenLastCalledWith(['a3', 'a2'], { jobId: 'j2' }, 'painting');
    expect(document.body.querySelector('[aria-label="Tag picked photos"]')).toBeNull();
    expect(document.body.textContent).toContain('2 photos tagged Jones exterior.');
    // A new job for the picked ones.
    await act(async () => byText('Select')!.click());
    await pickIt('loose.jpg');
    const named = document.body.querySelector('input[aria-label="New job for the picked photos"]') as HTMLInputElement;
    await act(async () => type(named, 'Garage door'));
    await act(async () => (named.form as HTMLFormElement).requestSubmit());
    await flush();
    expect(groupIntoJob).toHaveBeenLastCalledWith(['a3'], { name: 'Garage door' }, 'painting');
    // Photos go straight into a job from the dotted tile at the end of its box, untagged so Claude tags them.
    addAsset.mockClear();
    const box = document.body.querySelector('[aria-label="Job Smith kitchen"]')!;
    const cells = Array.from(box.querySelectorAll('li'));
    expect(cells[cells.length - 1].getAttribute('data-testid')).toBe('add-tile');
    const into = box.querySelector('input[aria-label="Add photos to Smith kitchen"]') as HTMLInputElement;
    Object.defineProperty(into, 'files', { value: [new File(['x'], 'sink.jpg', { type: 'image/jpeg' })] });
    await act(async () => into.dispatchEvent(new Event('change', { bubbles: true })));
    await flush();
    expect(addAsset).toHaveBeenCalledWith(expect.objectContaining({ fileName: 'sink.jpg', jobId: 'j1', tags: [] }));
    expect(document.body.textContent).toContain('1 file in the library. Claude is tagging it.');
    // Not in a job has its own tile, with no job.
    const loose = document.body.querySelector('[aria-label="Not in a job"] input[aria-label="Add photos"]') as HTMLInputElement;
    Object.defineProperty(loose, 'files', { value: [new File(['x'], 'yard.jpg', { type: 'image/jpeg' })] });
    await act(async () => loose.dispatchEvent(new Event('change', { bubbles: true })));
    await flush();
    expect((addAsset.mock.calls.map((c) => c[0]) as Array<{ fileName: string; jobId?: string }>).find((x) => x.fileName === 'yard.jpg')!.jobId).toBeUndefined();
    // New job: a name, and its box is there with its own tile.
    await act(async () => byText('New job')!.click());
    await act(async () => type(dialog().querySelector('input[aria-label="Job name"]') as HTMLInputElement, 'Jones exterior'));
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

  it('Library labels: each card says what it shows, a filter row shows only those photos, and the window fixes a label', async () => {
    const photo = (id: string, fileName: string, items: string[]) => ({ id, kind: 'photo' as const, fileName, tags: ['exterior'], items, createdAt: new Date().toISOString() });
    assets = [photo('d1', 'door.jpg', ['front door', 'brick']), photo('d2', 'door2.jpg', ['front door']), photo('f1', 'fence.jpg', ['fence']), photo('n1', 'new.jpg', [])];
    await render();
    await tab('Library');
    expect(document.body.querySelector('[aria-label="Open door.jpg"] [data-testid="items"]')!.textContent).toBe('front door · brick');
    // The filter row: labels in use, most used first.
    const filters = () => Array.from(document.body.querySelectorAll('[aria-label="Show photos of"] button')) as HTMLButtonElement[];
    expect(filters().map((b) => b.textContent)).toEqual(['All', 'front door 2', 'brick 1', 'fence 1']);
    await act(async () => filters()[1].click());
    expect(Array.from(document.body.querySelectorAll('[data-testid="asset"]')).map((c) => c.querySelector('button')!.getAttribute('aria-label'))).toEqual(['Open door.jpg', 'Open door2.jpg']);
    await act(async () => filters()[0].click());
    expect(document.body.querySelectorAll('[data-testid="asset"]')).toHaveLength(4);
    // In the window: the In frame row opens the list, and a tap saves.
    await openFile('new.jpg');
    expect(dialog().querySelector('[data-testid="read-label"]')!.textContent).toBe('Claude is still looking');
    expect(dialog().querySelector('[data-testid="row-frame"]')!.textContent).toContain('Add what’s visible');
    await act(async () => (dialog().querySelector('[data-testid="row-frame"]') as HTMLButtonElement).click());
    await act(async () => Array.from(dialog().querySelectorAll('button')).find((b) => b.textContent === 'Garage door')!.click());
    await flush();
    expect(setItems).toHaveBeenCalledWith('n1', ['garage door']);
    // A clean list, Inside / Outside / Rooms, not a field of pills.
    expect(Array.from(dialog().querySelectorAll(`[aria-label="What's in new.jpg"] p`)).map((p) => p.textContent)).toEqual(['Inside', 'Outside', 'Rooms']);
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
    await upTag('Interior walls');
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
    expect(document.body.querySelector('[role="status"]')?.textContent).toBe('1 file in the library.');

    // The card is quiet: the picture, its tags, how many ads, and a mark when Claude suggests other tags.
    const card = document.body.querySelector('[data-testid="asset"]')!;
    expect(card.textContent).toContain('in 2 ads');
    expect(card.textContent).toContain('cabinets');
    expect(card.textContent).not.toContain('White shaker cabinets');
    // With no small copy yet, the card shows the still, loading only as it scrolls near; the page makes the small
    // copy from the still, quietly.
    expect(card.querySelector('img')!.getAttribute('src')).toBe('https://cdn.example/a1-still.jpg');
    expect(card.querySelector('img')!.getAttribute('loading')).toBe('lazy');
    expect((global as unknown as { fetch: jest.Mock }).fetch.mock.calls.map((c) => c[0])).toContain('https://cdn.example/a1-still.jpg');
    expect(card.querySelector('[data-testid="suggested-mark"]')).not.toBeNull();
    // Opened, it says what Claude saw and offers its tags.
    await openFile('kitchen.jpg');
    // Its own tags differ from Claude's read: "Use Claude's read" puts Claude's on, and Confirm keeps them.
    expect(dialog().querySelector('[data-testid="read-label"]')!.textContent).toBe('Your tags');
    const save = () => dialog().querySelector('[aria-label="Confirm"]') as HTMLButtonElement;
    // Nothing changed: Save only closes.
    await act(async () => save().click());
    expect(tagAsset).not.toHaveBeenCalled();
    await openFile('kitchen.jpg');
    await act(async () =>
      Array.from(dialog().querySelectorAll('button'))
        .find((b) => b.textContent === "Use Claude's read")!
        .click(),
    );
    expect(dialog().querySelector('[data-testid="read-label"]')!.textContent).toBe("Claude's read");
    expect(dialog().querySelector('[data-testid="read"]')!.textContent).toContain('After');
    expect(dialog().querySelector('input[aria-label^="Pair key"]')).toBeNull();
    await act(async () => save().click());
    expect(tagAsset).toHaveBeenLastCalledWith('a1', ['cabinets', 'after'], undefined, undefined);
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

  it('Competitors: the owner searches the niche, the last run shows, Local filters, the playbook is edited and rewritten', async () => {
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
      },
    ];
    await render();
    await tab('Competitors');
    expect(document.body.querySelector('[data-testid="research-run"]')!.textContent).toBe(
      'Oct 30 · scanned 760 · 48 past the bar · 31 new · 9 junk dropped · 2 unreadable',
    );
    await act(async () => byText('Search the niche')!.click());
    expect(researchNow).toHaveBeenCalled();

    const card = document.body.querySelector('[data-testid="playbook"]')!;
    expect(card.textContent).toContain('What works: cabinets');
    expect(card.textContent).toContain('Winners open on the owner, then a before/after.');
    expect(card.textContent).toContain('Footage the winners use: before, after');
    expect(card.textContent).toContain('A clip of the owner talking to camera');
    expect(card.textContent).toContain('Advertising in your markets: Jesse McCandless Painting (owner story, 140 days)');
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
    expect(cards()[0].textContent).toContain('Local');
    expect(cards()[0].textContent).toContain('Owner story · Opens with: the owner talking · owner to camera, before / after · fit 72/100');
    expect(cards()[0].textContent).toContain('Never copy$500 off this month');
    expect(cards()[0].querySelector('img')!.getAttribute('src')).toBe('https://img.example/9001.jpg');
    await act(async () => byText('Local')!.click());
    expect(cards().length).toBe(1);
    await act(async () => byText('Local')!.click());
    await act(async () => byText('90+ days')!.click());
    expect(cards().length).toBe(1);
    expect(cards()[0].textContent).toContain('Jesse McCandless Painting');

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

  it('Settings shows which keys are set, and the owner saves the ids and the Monday switch', async () => {
    await render();
    await tab('Settings');
    expect(document.body.textContent).toContain('Homeowners see the ads as Permian Home Quotes');
    expect(document.body.textContent).toContain('ADS_RENDER_TOKEN: missing');
    expect(document.body.textContent).toContain('a batch shows Waiting to render until the drawing is started by hand');
    expect(document.body.textContent).not.toContain('What a batch makes');
    expect(document.body.textContent).toContain('ANTHROPIC_API_KEY: set');
    await act(async () => type(document.body.querySelector('input[aria-label="Ad account id"]') as HTMLInputElement, 'act_123'));
    await act(async () => (Array.from(document.body.querySelectorAll('input[type="checkbox"]'))[0] as HTMLInputElement).click());
    await act(async () =>
      document.body.querySelector('form[aria-label="Ad settings"]')!.dispatchEvent(new Event('submit', { bubbles: true, cancelable: true })),
    );
    await flush();
    expect(saveSettings).toHaveBeenCalledWith(expect.objectContaining({ adAccountId: 'act_123', weeklyEnabled: true, hooksPerWeek: 2 }));
    expect(saveSettings.mock.calls[0][0]).not.toHaveProperty('keys');
    expect(document.body.textContent).toContain('APIFY_TOKEN: missing');
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
    expect(show('Photos').textContent).toBe('Photos (1)');
    expect(show('Clips').textContent).toBe('Clips (1)');
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
    expect(dialog().querySelector('[aria-label^="Job Smith kitchen"]')).toBeNull();
    expect(Array.from(dialog().querySelectorAll('[aria-label="Tags for spraying.mp4"] button')).map((b) => b.textContent)).not.toContain('before');
  });
});
