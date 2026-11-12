import { useEffect, useState } from 'react';

/** How long drawers and sheets take to slide, in ms (Tailwind's default transition). */
export const SLIDE_MS = 150;

/**
 * For panels driven by an isOpen prop: `mounted` keeps the panel on the page
 * while it slides out, and `shown` flips a frame after mounting so it slides
 * in instead of appearing.
 */
export function usePresence(isOpen: boolean, ms = SLIDE_MS) {
  const [mounted, setMounted] = useState(isOpen);
  const [shown, setShown] = useState(false);
  useEffect(() => {
    if (isOpen) {
      setMounted(true);
      let inner = 0;
      const outer = requestAnimationFrame(() => {
        inner = requestAnimationFrame(() => setShown(true));
      });
      return () => {
        cancelAnimationFrame(outer);
        cancelAnimationFrame(inner);
      };
    }
    setShown(false);
    const timer = setTimeout(() => setMounted(false), ms);
    return () => clearTimeout(timer);
  }, [isOpen, ms]);
  return { mounted, shown };
}
