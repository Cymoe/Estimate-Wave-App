import React from 'react';
import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { ItemPricingDrawer } from '../ItemPricingDrawer';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const item = { description: 'THHN wire', quantity: 2, unit_price: 187.5, red_line_price: 87.5, cap_price: 187.5 };

function type(input: HTMLInputElement, value: string) {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')!.set!;
  setter.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}

function setup() {
  const onSave = jest.fn();
  const container = document.createElement('div');
  document.body.appendChild(container);
  const root = createRoot(container);
  act(() => root.render(<ItemPricingDrawer item={item} onClose={() => {}} onSave={onSave} />));
  const dialog = document.querySelector('[role="dialog"]')!;
  const button = (text: string) =>
    [...dialog.querySelectorAll('button')].find(b => b.textContent?.includes(text))!;
  const priceInput = dialog.querySelector('input[inputmode="decimal"]') as HTMLInputElement;
  return { onSave, dialog, button, priceInput, unmount: () => act(() => root.unmount()) };
}

describe('ItemPricingDrawer', () => {
  it('shows the commission at cap and each option priced for this item', () => {
    const { dialog, button, unmount } = setup();
    expect(dialog.textContent).toContain('$200.00'); // (187.50 - 87.50) × 2
    expect(button('Need Job').textContent).toContain('$97.50');
    expect(button('Redline').textContent).toContain('$87.50');
    unmount();
  });

  it('picking an option and saving sets that price', () => {
    const { onSave, button, unmount } = setup();
    act(() => button('Need Job').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    act(() => button('Save').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onSave).toHaveBeenCalledWith({ unit_price: 97.5, quantity: 2 });
    unmount();
  });

  it('never saves a price below red line', () => {
    const { onSave, dialog, button, priceInput, unmount } = setup();
    act(() => type(priceInput, '50'));
    expect(dialog.textContent).toContain("can't go below red line");
    act(() => button('Save').dispatchEvent(new MouseEvent('click', { bubbles: true })));
    expect(onSave).toHaveBeenCalledWith({ unit_price: 87.5, quantity: 2 });
    unmount();
  });
});
