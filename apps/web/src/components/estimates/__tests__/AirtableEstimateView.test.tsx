import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { AirtableEstimateView } from '../AirtableEstimateView';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

/** Sets an input's value the way typing does, so React's onChange fires. */
function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

describe('AirtableEstimateView quantity editing', () => {
  it('keeps every digit typed into a quantity', () => {
    const onUpdateItem = jest.fn();
    const select = jest.spyOn(HTMLInputElement.prototype, 'select');
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <AirtableEstimateView
          items={[{ id: 'a', name: 'Wire', quantity: 1, price: 125, unit: 'ea', total: 125 }]}
          onUpdateItem={onUpdateItem}
          onAddItem={() => {}}
          isEditable
          subtotal={125}
          tax={0}
          total={125}
          showStickyFooter={false}
        />,
      );
    });

    const quantityCell = container.querySelectorAll('tbody tr')[0].querySelectorAll('td')[2];
    act(() => {
      quantityCell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    });
    const input = quantityCell.querySelector('input')!;
    expect(select).toHaveBeenCalledTimes(1);

    // Typing "1" then "2": the text must not be re-selected between keystrokes.
    act(() => type(input, '1'));
    act(() => type(input, '12'));
    expect(select).toHaveBeenCalledTimes(1);

    act(() => {
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    });
    expect(onUpdateItem).toHaveBeenCalledWith('a', 'quantity', 12);

    act(() => root.unmount());
    select.mockRestore();
  });
});

describe('AirtableEstimateView with a pricing drawer', () => {
  it('opens the item drawer from any cell and never edits inline', () => {
    const onEditPrice = jest.fn();
    const onUpdateItem = jest.fn();
    const container = document.createElement('div');
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => {
      root.render(
        <AirtableEstimateView
          items={[{ id: 'a', name: 'Wire', quantity: 2, price: 125, unit: 'ea', total: 250 }]}
          onUpdateItem={onUpdateItem}
          onAddItem={() => {}}
          isEditable
          subtotal={250}
          tax={0}
          total={250}
          showStickyFooter={false}
          onEditPrice={onEditPrice}
        />,
      );
    });
    const cells = container.querySelectorAll('tbody tr')[0].querySelectorAll('td');
    cells.forEach((cell) => {
      act(() => {
        cell.dispatchEvent(new MouseEvent('click', { bubbles: true }));
      });
    });
    expect(onEditPrice).toHaveBeenCalledTimes(4); // description, price, quantity, total
    expect(onEditPrice).toHaveBeenCalledWith('a');
    expect(container.querySelector('input')).toBeNull();
    expect(onUpdateItem).not.toHaveBeenCalled();
    act(() => root.unmount());
    container.remove();
  });
});

