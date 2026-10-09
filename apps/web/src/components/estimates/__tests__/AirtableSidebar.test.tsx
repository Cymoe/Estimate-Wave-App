import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { AirtableSidebar } from '../AirtableSidebar';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

function highlighted(itemsTotal: number) {
  const container = document.createElement('div');
  const root = createRoot(container);
  act(() => {
    root.render(<AirtableSidebar onViewChange={() => {}} itemsTotal={itemsTotal} capTotal={1000} redlineTotal={700} />);
  });
  const selected = [...container.querySelectorAll('button')]
    .filter(button => button.className.includes('bg-[#336699]'))
    .map(button => button.textContent);
  act(() => root.unmount());
  return selected;
}

describe('AirtableSidebar', () => {
  it('highlights the option the current prices match', () => {
    expect(highlighted(1000)).toEqual(['CAP Price (100%)']);
    expect(highlighted(880)).toEqual(['Busy Season (60%)']);
    expect(highlighted(700)).toEqual(['Redline (0%)']);
  });

  it('highlights nothing when prices were edited by hand', () => {
    expect(highlighted(912.5)).toEqual([]);
  });
});
