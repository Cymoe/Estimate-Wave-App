import { createRoot } from 'react-dom/client';
import { act } from 'react';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let fail = true;
let notify: () => void = () => {};
const answer: unknown[] = [];
// One client for the whole test, as the real provider gives.
const client = {
  watchQuery: () => ({
    localQueryResult: () => {
      if (fail) throw new Error('[CONVEX Q(intake:queue)] [Request ID: abc] Server Error\nUncaught Error: Only FieldQuote staff can do this\n    at handler');
      return answer;
    },
    onUpdate: (cb: () => void) => {
      notify = cb;
      return () => {};
    },
  }),
};
jest.mock('convex/react', () => ({ useConvex: () => client }));

import { useIntakeQueue, useLiveErrors } from '../live';

function Probe() {
  useIntakeQueue('open');
  const errors = useLiveErrors();
  return <p>{JSON.stringify(errors)}</p>;
}

describe('live query errors', () => {
  it('are recorded by query name with the server message, and cleared once the query answers', async () => {
    const container = document.createElement('div');
    document.body.appendChild(container);
    await act(async () => createRoot(container).render(<Probe />));
    expect(JSON.parse(container.textContent!)).toEqual({ 'intake:queue': 'Only FieldQuote staff can do this' });
    fail = false;
    await act(async () => notify());
    expect(JSON.parse(container.textContent!)).toEqual({});
  });
});
