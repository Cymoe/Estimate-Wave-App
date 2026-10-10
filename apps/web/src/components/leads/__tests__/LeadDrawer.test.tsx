import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react';
import type { Lead } from '../leadTypes';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const update = jest.fn(async () => ({}));
const create = jest.fn(async () => ({}));
jest.mock('../../../lib/api', () => ({
  leadsAPI: { update: (...args: unknown[]) => update(...(args as [])), create: (...args: unknown[]) => create(...(args as [])) },
}));

import { LeadDrawer } from '../LeadDrawer';

const lead: Lead = {
  id: 'l1',
  name: 'Rocky Vansau',
  phone: '(936) 240-0388',
  address: '3809 Crestline Ave',
  city: 'Midland',
  status: 'scheduled',
  notes: 'Wants trim done.\nBest time to call? Evenings',
  createdAt: '2026-10-01T12:00:00Z',
  estimate: null,
};

/** Types into an input the way a person does, so React's onChange fires. */
function type(input: HTMLInputElement | HTMLTextAreaElement, value: string) {
  const proto = input instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype;
  Object.getOwnPropertyDescriptor(proto, 'value')!.set!.call(input, value);
  input.dispatchEvent(new Event('input', { bubbles: true }));
}
const blur = (el: Element) => el.dispatchEvent(new FocusEvent('focusout', { bubbles: true }));
const field = (label: string) => document.body.querySelector(`[aria-label="${label}"]`) as HTMLInputElement;

let root: Root;
function open(props: Partial<React.ComponentProps<typeof LeadDrawer>> = {}) {
  const container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  const handlers = { onClose: jest.fn(), onCreated: jest.fn(), onChanged: jest.fn(), onStatus: jest.fn() };
  act(() => root.render(<LeadDrawer organizationId="org1" lead={lead} trades={[]} {...handlers} {...props} />));
  return handlers;
}

describe('LeadDrawer', () => {
  beforeEach(() => {
    update.mockClear();
    create.mockClear();
  });
  afterEach(() => {
    act(() => root.unmount());
    document.body.innerHTML = '';
  });

  it('shows the lead as a note: title, stage, details and notes with form questions greyed', () => {
    open();
    expect(field('Name').value).toBe('Rocky Vansau');
    expect(document.body.textContent).toContain('Estimate Scheduled');
    expect(field('City').value).toBe('Midland');
    const question = Array.from(document.body.querySelectorAll('span')).find((s) => s.textContent === 'Best time to call?');
    expect(question?.className).toContain('text-gray-500');
    // No Save button for an existing lead.
    expect(document.body.textContent).not.toContain('Save lead');
  });

  it('saves just the field you changed when you leave it', async () => {
    const { onChanged } = open();
    act(() => type(field('Email'), ' rocky@example.com '));
    expect(update).not.toHaveBeenCalled();
    await act(async () => blur(field('Email')));
    expect(update).toHaveBeenCalledWith('l1', { email: 'rocky@example.com' });
    expect(onChanged).toHaveBeenCalledWith(lead, { email: 'rocky@example.com' });
    expect(document.body.textContent).toContain('✓ Saved');

    // Leaving an unchanged field saves nothing.
    update.mockClear();
    await act(async () => blur(field('Phone')));
    expect(update).not.toHaveBeenCalled();
  });

  it('keeps the name when it is cleared, and saves typing that was not left before closing', async () => {
    open();
    act(() => type(field('Name'), '  '));
    await act(async () => blur(field('Name')));
    expect(update).not.toHaveBeenCalled();
    expect(field('Name').value).toBe('Rocky Vansau');

    act(() => type(field('Estimated value'), '$4,200'));
    await act(async () => root.unmount());
    expect(update).toHaveBeenCalledWith('l1', { estimatedValue: 4200 });
    root = createRoot(document.createElement('div')); // for afterEach
  });

  it('changes the stage through the board', () => {
    const { onStatus } = open();
    const stage = field('Stage') as unknown as HTMLSelectElement;
    act(() => {
      stage.value = 'quoted';
      stage.dispatchEvent(new Event('change', { bubbles: true }));
    });
    expect(onStatus).toHaveBeenCalledWith(lead, 'quoted');
  });

  it('adds a new lead with the button', async () => {
    jest.useFakeTimers();
    try {
      const { onCreated } = open({ lead: null });
      expect(document.body.textContent).toContain('Add lead');
      act(() => type(field('Name'), 'Pat Lee'));
      act(() => type(field('Address'), '12 Main St'));
      await act(async () => {
        (document.body.querySelector('form') as HTMLFormElement).dispatchEvent(new Event('submit', { bubbles: true, cancelable: true }));
      });
      expect(create).toHaveBeenCalledWith('org1', expect.objectContaining({ name: 'Pat Lee', address: '12 Main St', status: 'new', phone: null }));
      act(() => jest.advanceTimersByTime(200));
      expect(onCreated).toHaveBeenCalled();
    } finally {
      jest.useRealTimers();
    }
  });
});
