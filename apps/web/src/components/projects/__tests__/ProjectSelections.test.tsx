import { createRoot } from 'react-dom/client';
import { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let groups: Array<Record<string, unknown>> = [];
const calls: Array<[string, ...unknown[]]> = [];
const call =
  (name: string) =>
  async (...args: unknown[]) => {
    calls.push([name, ...args]);
    return null;
  };
jest.mock('../../../lib/api', () => ({
  selectionsAPI: {
    forProject: async () => groups,
    setPickBy: (...a: unknown[]) => call('setPickBy')(...a),
    ask: (...a: unknown[]) => call('ask')(...a),
    unqueue: (...a: unknown[]) => call('unqueue')(...a),
    record: (...a: unknown[]) => call('record')(...a),
    approve: (...a: unknown[]) => call('approve')(...a),
    reopen: (...a: unknown[]) => call('reopen')(...a),
    queueChangeOrder: (...a: unknown[]) => call('queueChangeOrder')(...a),
    unqueueChangeOrder: (...a: unknown[]) => call('unqueueChangeOrder')(...a),
  },
}));

import { ProjectSelections } from '../ProjectSelections';

const flush = () =>
  act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
const type = async (input: HTMLInputElement, value: string, event = 'input') =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event(event, { bubbles: true }));
  });
const button = (text: string, within: ParentNode = document.body) =>
  Array.from(within.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) as HTMLButtonElement;
const cards = () => Array.from(document.body.querySelectorAll('[data-testid="selection"]'));
const stage = (card: Element) => card.querySelector('[data-testid="selection-stage"]')!.textContent;

async function render(props: { onPreview?: () => void } = {}) {
  const onCount = jest.fn();
  const onEstimatesChanged = jest.fn();
  const onQueueChanged = jest.fn();
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () =>
    createRoot(container).render(
      <ProjectSelections
        projectId="p1"
        portalClientName="Ann Miller"
        onEstimatesChanged={onEstimatesChanged}
        onCount={onCount}
        onQueueChanged={onQueueChanged}
        onPreview={props.onPreview}
      />,
    ),
  );
  await flush();
  return { onCount, onEstimatesChanged, onQueueChanged };
}

const group = (allowances: unknown[], extra: Record<string, unknown> = {}) => ({
  estimateId: 'e1',
  estimateNumber: 'EST-1',
  title: 'Kitchen',
  allowances,
  picksDifference: 0,
  changes: 0,
  changeOrderQueued: false,
  changeOrderWaiting: false,
  ...extra,
});
const line = (itemId: string, description: string, pick?: Record<string, unknown>, extra: Record<string, unknown> = {}) => ({
  itemId,
  description,
  quantity: 1,
  allowanceUnitPrice: 350,
  allowanceTotal: 350,
  ...(pick ? { pick } : {}),
  ...extra,
});

afterEach(() => {
  document.body.innerHTML = '';
  groups = [];
  calls.length = 0;
});

describe('Selections on the project', () => {
  it('says how to start when nothing is to pick', async () => {
    await render();
    expect(document.body.textContent).toContain('Nothing to pick yet');
  });

  it('shows each item as a card with where it stands, and counts what needs you', async () => {
    groups = [
      group([
        line('vanity', 'Vanity allowance', undefined, { pickBy: '2020-01-01' }),
        line('tile', 'Tile allowance', { id: 's1', status: 'asked', queued: true }, { quantity: 300, allowanceUnitPrice: 4, allowanceTotal: 1200 }),
        line('sink', 'Sink allowance', { id: 's4', status: 'asked', askedAt: '2026-11-01T12:00:00Z' }),
        line('mirror', 'Mirror allowance', {
          id: 's2',
          url: 'https://homedepot.com/p/m',
          name: 'Round mirror',
          unitPrice: 410,
          status: 'picked',
          difference: 60,
        }),
        line('faucet', 'Faucet allowance', { id: 's3', name: 'Delta', status: 'approved', entered: true, approvedUnitPrice: 420, difference: 70 }),
      ]),
    ];
    const { onCount } = await render();
    const [vanity, tile, sink, mirror, faucet] = cards();
    expect(onCount).toHaveBeenLastCalledWith(2); // the overdue vanity and the mirror to approve
    expect(stage(vanity)).toBe('Overdue');
    expect(vanity.querySelector('[data-testid="pick-by"]')!.textContent).toBe('Overdue: pick by Jan 1');
    expect(button('Ask Ann', vanity)).toBeDefined();
    expect(stage(tile)).toBe('Queued');
    expect(tile.textContent).toContain('$1,200.00 included · 300 × $4.00');
    expect(tile.textContent).toContain('Goes out when you send');
    expect(stage(sink)).toBe('Waiting on client');
    expect(sink.textContent).toMatch(/Sent Nov 1: waiting on Ann/);
    expect(stage(mirror)).toBe('Ready to approve');
    expect(mirror.textContent).toContain('They saw $410.00 · $60.00 over');
    expect(stage(faucet)).toBe('Approved');
    expect(faucet.textContent).toContain('Entered and approved at $420.00 · $70.00 over');
    expect(faucet.querySelector('[data-testid="pick-by"]')).toBeNull();
  });

  it('asks (queues), undoes, sets a pick-by date, approves and reopens', async () => {
    groups = [
      group([
        line('vanity', 'Vanity allowance'),
        line('tile', 'Tile allowance', { id: 's1', status: 'asked', queued: true }),
        line('mirror', 'Mirror allowance', { id: 's2', unitPrice: 260, status: 'picked' }, { allowanceUnitPrice: 200, allowanceTotal: 200 }),
        line('faucet', 'Faucet allowance', { id: 's3', status: 'approved', approvedUnitPrice: 300 }),
      ]),
    ];
    const { onQueueChanged, onEstimatesChanged } = await render();
    const [vanity, tile, mirror, faucet] = cards();
    await act(async () => button('Ask Ann', vanity).click());
    await flush();
    expect(calls).toContainEqual(['ask', 'e1', 'vanity']);
    expect(onQueueChanged).toHaveBeenCalled();
    await act(async () => button('Undo', tile).click());
    await flush();
    expect(calls).toContainEqual(['unqueue', 'e1', 'tile']);

    await act(async () => (vanity.querySelector('[data-testid="pick-by"]') as HTMLButtonElement).click());
    await type(vanity.querySelector('input[type="date"]') as HTMLInputElement, '2026-12-01', 'change');
    await flush();
    expect(calls).toContainEqual(['setPickBy', 'e1', 'vanity', '2026-12-01']);

    await type(mirror.querySelector('input[aria-label="Approved price for Mirror allowance"]') as HTMLInputElement, '240');
    expect(mirror.textContent).toContain('$40.00 over');
    await act(async () => button('Approve', mirror).click());
    await flush();
    expect(calls).toContainEqual(['approve', 's2', 240]);
    expect(onEstimatesChanged).toHaveBeenCalled();

    await act(async () => button('Reopen', faucet).click());
    await flush();
    expect(calls).toContainEqual(['reopen', 's3']);
  });

  it('enters the pick for the client, which approves it', async () => {
    groups = [group([line('tile', 'Tile allowance', undefined, { quantity: 300, allowanceUnitPrice: 4, allowanceTotal: 1200 })])];
    await render();
    await act(async () => button('Enter it yourself').click());
    const form = document.body.querySelector('[data-testid="enter-pick"]')!;
    expect(button('Save', form).disabled).toBe(true); // a link or a name first
    await type(form.querySelector('input[aria-label="What they picked"]') as HTMLInputElement, 'Daltile marble');
    await type(form.querySelector('input[aria-label="Price"]') as HTMLInputElement, '5.40');
    expect(form.textContent).toContain('$420.00 over');
    await act(async () => button('Save', form).click());
    await flush();
    expect(calls).toContainEqual(['record', 'e1', 'tile', { url: undefined, name: 'Daltile marble', unitPrice: 5.4, note: undefined }]);
    expect(document.body.querySelector('[data-testid="enter-pick"]')).toBeNull();
  });

  it('sums the approved picks, queues the change order, and offers Open portal & send when anything is queued', async () => {
    groups = [
      group([line('faucet', 'Faucet allowance', { id: 's3', status: 'approved', approvedUnitPrice: 420, difference: 70 })], {
        picksDifference: 70,
        changes: 2,
      }),
    ];
    const onPreview = jest.fn();
    await render({ onPreview });
    const line1 = document.body.querySelector('[data-testid="change-order-line"]')!;
    expect(line1.textContent).toContain('Approved picks: +$70.00 vs. allowances, plus 1 other change since signing');
    expect(document.body.querySelector('[data-testid="send-bar"]')).toBeNull();
    await act(async () => button('Add change order to next send', line1).click());
    await flush();
    expect(calls).toContainEqual(['queueChangeOrder', 'e1']);

    document.body.innerHTML = '';
    groups = [group([line('tile', 'Tile allowance', { id: 's1', status: 'asked', queued: true })], { changes: 1, changeOrderQueued: true })];
    await render({ onPreview });
    expect(document.body.querySelector('[data-testid="change-order-line"]')!.textContent).toContain('Change order queued');
    const bar = document.body.querySelector('[data-testid="send-bar"]')!;
    expect(bar.textContent).toContain('2 things ready for Ann');
    await act(async () => button('Open portal & send', bar).click());
    expect(onPreview).toHaveBeenCalled();
  });
});
