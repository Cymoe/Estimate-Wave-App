import React, { useEffect, useRef } from 'react';

type Point = { x: number; y: number };

const LINE = { width: 2.5, color: '#111827' };
const mid = (a: Point, b: Point): Point => ({ x: (a.x + b.x) / 2, y: (a.y + b.y) / 2 });

/**
 * A box to sign in with a finger, pen or mouse; reports the drawing as a PNG
 * data URL ('' when cleared). The canvas is sized to the screen at full pixel
 * density, every pointer sample is drawn (coalesced moves included), and the
 * strokes live in refs, so nothing re-renders while a finger is moving.
 */
export function SignaturePad({
  onChange,
  label = 'Your signature',
  clearLabel = 'Clear',
}: {
  onChange: (dataUrl: string) => void;
  label?: string;
  clearLabel?: string;
}) {
  const canvas = useRef<HTMLCanvasElement>(null);
  const strokes = useRef<Point[][]>([]);
  const drawing = useRef(false);

  const context = () => {
    const ctx = canvas.current?.getContext('2d');
    if (!ctx) return null;
    ctx.lineWidth = LINE.width;
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';
    ctx.strokeStyle = LINE.color;
    ctx.fillStyle = LINE.color;
    return ctx;
  };

  // One segment per new point: from the last midpoint, through the last point, to the new midpoint.
  const drawSegment = (ctx: CanvasRenderingContext2D, stroke: Point[]) => {
    const n = stroke.length;
    if (n === 1) {
      ctx.beginPath();
      ctx.arc(stroke[0].x, stroke[0].y, LINE.width / 2, 0, Math.PI * 2);
      ctx.fill();
      return;
    }
    const from = n === 2 ? stroke[0] : mid(stroke[n - 3], stroke[n - 2]);
    ctx.beginPath();
    ctx.moveTo(from.x, from.y);
    ctx.quadraticCurveTo(
      stroke[n - 2].x,
      stroke[n - 2].y,
      ...(n === 2 ? [stroke[1].x, stroke[1].y] : [mid(stroke[n - 2], stroke[n - 1]).x, mid(stroke[n - 2], stroke[n - 1]).y]),
    );
    ctx.stroke();
  };

  const redraw = (ctx: CanvasRenderingContext2D) => {
    for (const stroke of strokes.current) {
      for (let i = 1; i <= stroke.length; i++) drawSegment(ctx, stroke.slice(0, i));
    }
  };

  // Match the canvas to its box on screen at device pixels, so the line is crisp and under the finger.
  useEffect(() => {
    const el = canvas.current;
    if (!el) return;
    const fit = () => {
      const box = el.getBoundingClientRect();
      const dpr = window.devicePixelRatio || 1;
      const width = Math.max(1, Math.round(box.width * dpr));
      const height = Math.max(1, Math.round(box.height * dpr));
      if (el.width === width && el.height === height) return;
      el.width = width;
      el.height = height;
      const ctx = context();
      if (!ctx) return;
      ctx.scale(dpr, dpr);
      redraw(ctx);
    };
    fit();
    if (typeof ResizeObserver !== 'undefined') {
      const watcher = new ResizeObserver(fit);
      watcher.observe(el);
      return () => watcher.disconnect();
    }
    window.addEventListener('resize', fit);
    return () => window.removeEventListener('resize', fit);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const point = (e: { clientX: number; clientY: number }, el: HTMLCanvasElement): Point => {
    const box = el.getBoundingClientRect();
    return { x: e.clientX - box.left, y: e.clientY - box.top };
  };
  const add = (p: Point) => {
    const ctx = context();
    if (!ctx) return;
    const stroke = strokes.current[strokes.current.length - 1];
    stroke.push(p);
    drawSegment(ctx, stroke);
  };

  const start = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (e.button > 0) return;
    drawing.current = true;
    e.currentTarget.setPointerCapture?.(e.pointerId);
    strokes.current.push([]);
    add(point(e, e.currentTarget));
  };
  const move = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    const native = e.nativeEvent as PointerEvent & { getCoalescedEvents?: () => PointerEvent[] };
    const samples = native.getCoalescedEvents?.() ?? [];
    for (const sample of samples.length ? samples : [native]) add(point(sample, e.currentTarget));
  };
  const end = (e: React.PointerEvent<HTMLCanvasElement>) => {
    if (!drawing.current) return;
    drawing.current = false;
    onChange(e.currentTarget.toDataURL('image/png'));
  };
  const clear = () => {
    const el = canvas.current;
    const ctx = el?.getContext('2d');
    if (el && ctx) ctx.clearRect(0, 0, el.width, el.height);
    strokes.current = [];
    onChange('');
  };

  return (
    <div>
      <div className="flex items-center justify-between mb-2">
        <span className="text-sm font-medium text-gray-700">{label}</span>
        <button type="button" onClick={clear} className="text-sm text-gray-500 underline underline-offset-2">
          {clearLabel}
        </button>
      </div>
      <canvas
        ref={canvas}
        aria-label={label}
        className="w-full h-32 rounded-lg border border-gray-300 bg-white touch-none select-none cursor-crosshair"
        style={{ touchAction: 'none' }}
        onPointerDown={start}
        onPointerMove={move}
        onPointerUp={end}
        onPointerCancel={end}
      />
    </div>
  );
}
