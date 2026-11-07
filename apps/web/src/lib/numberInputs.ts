/**
 * Scrolling the mouse wheel over a focused number field changes its value in
 * most desktop browsers: an amount typed as 1200 quietly becomes 1199 while
 * scrolling the page. Blurring the field on wheel keeps the typed number and
 * lets the page scroll as expected. Installed once at startup.
 */
export function guardNumberInputsFromWheel(doc: Document = document): () => void {
  const onWheel = (event: WheelEvent) => {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.type === 'number' && doc.activeElement === target) target.blur();
  };
  doc.addEventListener('wheel', onWheel, { passive: true, capture: true });
  return () => doc.removeEventListener('wheel', onWheel, { capture: true });
}
