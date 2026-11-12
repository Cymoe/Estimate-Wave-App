/**
 * Brings a card into view and outlines it for a moment, so a link that
 * sends you to it ("Add client") visibly lands somewhere. Waits a frame
 * first, for a tab that has only just been switched to.
 */
export function pointTo(find: () => Element | null | undefined, focus?: () => HTMLElement | null | undefined) {
  requestAnimationFrame(() => {
    const el = find();
    if (!(el instanceof HTMLElement)) return;
    el.scrollIntoView?.({ behavior: 'smooth', block: 'center' });
    el.classList.add('ring-2', 'ring-[#336699]');
    window.setTimeout(() => el.classList.remove('ring-2', 'ring-[#336699]'), 1600);
    focus?.()?.focus({ preventScroll: true });
  });
}
