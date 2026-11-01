import { createRoot } from 'react-dom/client';
import { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let groups: Array<Record<string, unknown>> = [];
const setPickBy = jest.fn(async () => null);
const record = jest.fn(async () => null);
const approve = jest.fn(async () => null);
const reopen = jest.fn(async () => null);
jest.mock('../../../lib/api', () => ({
  selectionsAPI: {
    forProject: async () => groups,
    setPickBy: (...a: unknown[]) => setPickBy(...(a as [])),
    record: (...a: unknown[]) => record(...(a as [])),
    approve: (...a: unknown[]) => approve(...(a as [])),
    reopen: (...a: unknown[]) => reopen(...(a as [])),
  },
}));
const signoffProps: Array<Record<string, unknown>> = [];
jest.mock('../../estimates/SignoffControls', () => ({
  SignoffControls: (props: Record<string, unknown>) => {
    signoffProps.push(props);
    return <div data-testid="send-difference">{String(props.disabledReason ?? 'ready')}</div>;
  },
}));

import { ProjectSelections } from '../ProjectSelections';

const flush = () =>
  act(async () => {
    for (let i = 0; i < 6; i++) await Promise.resolve();
  });
const type = async (input: HTMLInputElement, value: string) =>
  act(async () => {
    Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(input, value);
    input.dispatchEvent(new Event('input', { bubbles: true }));
  });
const button = (text: string, within: ParentNode = document.body) =>
  Array.from(within.querySelectorAll('button')).find((b) => b.textContent?.trim() === text) as HTMLButtonElement;

// The signed estimate: the faucet line now differs from what was signed.
const estimate = {
  id: 'e1',
  status: 'accepted',
  issue_date: '2026-10-01',
  subtotal: 0,
  total_amount: 1620,
  client: { name: 'Ann Miller', language: 'en' },
  items: [{ id: 'faucet', description: 'Faucet allowance', quantity: 1, unit_price: 420, total_price: 420 }],
  contract_snapshot: { totalAmount: 1550, items: [{ _id: 'faucet', description: 'Faucet allowance', quantity: 1, unitPrice: 350, totalPrice: 350 }] },
} as never;

async function render(props: { onAsk?: jest.Mock } = {}) {
  const onCount = jest.fn();
  const onEstimatesChanged = jest.fn();
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () =>
    createRoot(container).render(
      <ProjectSelections projectId="p1" estimates={[estimate]} onEstimatesChanged={onEstimatesChanged} onCount={onCount} onAsk={props.onAsk} />,
    ),
  );
  await flush();
  return { onCount, onEstimatesChanged };
}

afterEach(() => {
  document.body.innerHTML = '';
  groups = [];
  signoffProps.length = 0;
  jest.clearAllMocks();
});

describe('Selections on the project', () => {
  it('says how to start when nothing is to pick', async () => {
    await render();
    expect(document.body.textContent).toContain('Nothing to pick yet');
  });

  it('lists each allowance with where it stands, counts what needs you, and offers the difference for one signature', async () => {
    groups = [
      {
        estimateId: 'e1',
        estimateNumber: 'EST-1',
        title: 'Bathroom',
        allowances: [
          { itemId: 'vanity', description: 'Vanity allowance', quantity: 1, allowanceUnitPrice: 800, allowanceTotal: 800, pickBy: '2020-01-01' },
          {
            itemId: 'tile',
            description: 'Tile allowance',
            quantity: 300,
            allowanceUnitPrice: 4,
            allowanceTotal: 1200,
            pick: { id: 's1', status: 'asked', askedAt: '2026-11-01T12:00:00Z' },
          },
          {
            itemId: 'mirror',
            description: 'Mirror allowance',
            quantity: 1,
            allowanceUnitPrice: 200,
            allowanceTotal: 200,
            pick: { id: 's2', url: 'https://homedepot.com/p/m', name: 'Round mirror', unitPrice: 260, status: 'picked', difference: 60 },
          },
          {
            itemId: 'faucet',
            description: 'Faucet allowance',
            quantity: 1,
            allowanceUnitPrice: 350,
            allowanceTotal: 350,
            pick: { id: 's3', name: 'Delta Trinsic', status: 'approved', entered: true, approvedUnitPrice: 420, difference: 70 },
          },
        ],
      },
    ];
    const { onCount } = await render();
    const [vanity, tile, mirror, faucet] = Array.from(document.body.querySelectorAll('[data-testid="selection"]'));
    expect(onCount).toHaveBeenLastCalledWith(2); // the overdue vanity and the mirror to approve
    expect(vanity.textContent).toContain('Overdue: pick by');
    expect(vanity.textContent).toContain('Not asked yet');
    expect(tile.textContent).toContain('$1,200.00 included (300 × $4.00)');
    expect(tile.textContent).toMatch(/Asked Nov 1: waiting for the client/);
    expect(mirror.textContent).toContain('The client picked: waiting for you');
    expect(mirror.textContent).toContain('They saw $260.00 · $60.00 over');
    expect(faucet.textContent).toContain('Entered and approved at $420.00 · $70.00 over');
    expect(document.body.textContent).toContain('1 change since the client last signed');
    expect(signoffProps.at(-1)).toMatchObject({ estimateId: 'e1', kind: 'change_order', clientName: 'Ann Miller', disabledReason: undefined });
  });

  it('sets the pick-by date, approves at a price, reopens, and reloads the estimates', async () => {
    groups = [
      {
        estimateId: 'e1',
        estimateNumber: 'EST-1',
        allowances: [
          {
            itemId: 'mirror',
            description: 'Mirror allowance',
            quantity: 1,
            allowanceUnitPrice: 200,
            allowanceTotal: 200,
            pick: { id: 's2', unitPrice: 260, status: 'picked' },
          },
          {
            itemId: 'faucet',
            description: 'Faucet allowance',
            quantity: 1,
            allowanceUnitPrice: 350,
            allowanceTotal: 350,
            pick: { id: 's3', status: 'approved', approvedUnitPrice: 300 },
          },
        ],
      },
    ];
    const { onEstimatesChanged } = await render();
    const [mirror, faucet] = Array.from(document.body.querySelectorAll('[data-testid="selection"]'));
    const date = mirror.querySelector('input[type="date"]') as HTMLInputElement;
    await act(async () => {
      Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!.call(date, '2026-12-01');
      date.dispatchEvent(new Event('change', { bubbles: true }));
    });
    await flush();
    expect(setPickBy).toHaveBeenCalledWith('e1', 'mirror', '2026-12-01');

    await type(mirror.querySelector('input[aria-label="Approved price for Mirror allowance"]') as HTMLInputElement, '240');
    expect(mirror.textContent).toContain('$40.00 over');
    await act(async () => button('Approve', mirror).click());
    await flush();
    expect(approve).toHaveBeenCalledWith('s2', 240);
    expect(onEstimatesChanged).toHaveBeenCalled();

    await act(async () => button('Reopen', faucet).click());
    await flush();
    expect(reopen).toHaveBeenCalledWith('s3');
  });

  it('enters the pick for the client, which approves it', async () => {
    groups = [
      {
        estimateId: 'e1',
        estimateNumber: 'EST-1',
        allowances: [{ itemId: 'tile', description: 'Tile allowance', quantity: 300, allowanceUnitPrice: 4, allowanceTotal: 1200 }],
      },
    ];
    await render();
    await act(async () => button('Enter it yourself').click());
    const form = document.body.querySelector('[data-testid="enter-pick"]')!;
    expect(button('Save', form).disabled).toBe(true); // a link or a name first
    await type(form.querySelector('input[aria-label="What they picked"]') as HTMLInputElement, 'Daltile marble');
    await type(form.querySelector('input[aria-label="Price"]') as HTMLInputElement, '5.40');
    expect(form.textContent).toContain('$420.00 over');
    await act(async () => button('Save', form).click());
    await flush();
    expect(record).toHaveBeenCalledWith('e1', 'tile', { url: undefined, name: 'Daltile marble', unitPrice: 5.4, note: undefined });
    expect(document.body.querySelector('[data-testid="enter-pick"]')).toBeNull();
  });

  it('asks the client when the page can', async () => {
    groups = [
      {
        estimateId: 'e1',
        estimateNumber: 'EST-1',
        allowances: [{ itemId: 'tile', description: 'Tile allowance', quantity: 1, allowanceUnitPrice: 1200, allowanceTotal: 1200 }],
      },
    ];
    const onAsk = jest.fn(async () => {});
    await render({ onAsk });
    await act(async () => button('Ask the client').click());
    await flush();
    expect(onAsk).toHaveBeenCalledWith('e1', expect.objectContaining({ itemId: 'tile' }));
  });
});
