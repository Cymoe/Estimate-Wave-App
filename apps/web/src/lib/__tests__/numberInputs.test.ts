import { guardNumberInputsFromWheel } from '../numberInputs';

describe('number fields and the mouse wheel', () => {
  it('a wheel over a focused number field blurs it instead of changing the amount', () => {
    const stop = guardNumberInputsFromWheel(document);
    const amount = document.createElement('input');
    amount.type = 'number';
    amount.value = '1200';
    const name = document.createElement('input');
    document.body.append(amount, name);

    amount.focus();
    amount.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 40 }));
    expect(document.activeElement).not.toBe(amount);
    expect(amount.value).toBe('1200');

    name.focus();
    name.dispatchEvent(new WheelEvent('wheel', { bubbles: true, deltaY: 40 }));
    expect(document.activeElement).toBe(name); // other fields keep focus
    stop();
    document.body.innerHTML = '';
  });
});
