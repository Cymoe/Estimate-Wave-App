import { createRoot } from 'react-dom/client';
import { act } from 'react';
import { SignaturePad } from '../SignaturePad';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

// jsdom has no 2D canvas: a fake context records what the pad asks of it.
const calls: string[] = [];
const ctx = new Proxy({} as Record<string, unknown>, {
  get: (target, key: string) => {
    if (key in target) return target[key];
    return (...args: unknown[]) => calls.push(`${key}(${args.map((a) => (typeof a === 'number' ? Math.round(a) : a)).join(',')})`);
  },
  set: (target, key: string, value) => {
    target[key] = value;
    return true;
  },
});

const onChange = jest.fn();
let canvas: HTMLCanvasElement;

async function render() {
  jest.spyOn(HTMLCanvasElement.prototype, 'getContext').mockImplementation(() => ctx as unknown as CanvasRenderingContext2D);
  jest.spyOn(HTMLCanvasElement.prototype, 'toDataURL').mockImplementation(() => 'data:image/png;base64,SIG');
  Object.defineProperty(window, 'devicePixelRatio', { value: 2, configurable: true });
  const container = document.createElement('div');
  document.body.appendChild(container);
  await act(async () => createRoot(container).render(<SignaturePad onChange={onChange} />));
  canvas = document.body.querySelector('canvas')!;
  canvas.getBoundingClientRect = () => ({ left: 10, top: 20, width: 300, height: 128, right: 310, bottom: 148, x: 10, y: 20, toJSON: () => ({}) });
  // The box is only known once it's on screen, so size it again now.
  window.dispatchEvent(new Event('resize'));
  calls.length = 0;
}

// jsdom has no PointerEvent; React listens by event type, so a MouseEvent with the pointer fields does.
const pointer = (type: string, x: number, y: number, extra: Record<string, unknown> = {}) => {
  const e = new MouseEvent(type, { bubbles: true, clientX: x, clientY: y });
  Object.assign(e, { pointerId: 1, ...extra });
  canvas.dispatchEvent(e);
};

describe('SignaturePad', () => {
  afterEach(() => {
    document.body.innerHTML = '';
    onChange.mockClear();
    jest.restoreAllMocks();
  });

  it('sizes the canvas to its box at device pixels and draws in screen units', async () => {
    await render();
    expect(canvas.width).toBe(600);
    expect(canvas.height).toBe(256);
    await act(async () => pointer('pointerdown', 60, 70)); // 50,50 inside the box
    expect(calls).toContain('arc(50,50,1,0,6)'); // a tap leaves a dot
    expect(onChange).not.toHaveBeenCalled();
  });

  it('draws every coalesced sample as a smooth segment, then reports the PNG on lift', async () => {
    await render();
    await act(async () => pointer('pointerdown', 10, 20));
    calls.length = 0;
    await act(async () =>
      pointer('pointermove', 50, 60, {
        getCoalescedEvents: () => [
          { clientX: 30, clientY: 40 },
          { clientX: 50, clientY: 60 },
        ],
      }),
    );
    expect(calls.filter((c) => c.startsWith('quadraticCurveTo'))).toEqual(['quadraticCurveTo(0,0,20,20)', 'quadraticCurveTo(20,20,30,30)']);
    expect(calls.filter((c) => c === 'stroke()')).toHaveLength(2);
    await act(async () => pointer('pointerup', 50, 60));
    expect(onChange).toHaveBeenCalledWith('data:image/png;base64,SIG');
  });

  it('Clear wipes the drawing and reports an empty signature', async () => {
    await render();
    await act(async () => pointer('pointerdown', 10, 20));
    await act(async () => pointer('pointerup', 10, 20));
    calls.length = 0;
    const clear = Array.from(document.body.querySelectorAll('button')).find((b) => b.textContent === 'Clear')!;
    await act(async () => clear.click());
    expect(calls).toContain('clearRect(0,0,600,256)');
    expect(onChange).toHaveBeenLastCalledWith('');
  });
});
