import { useEffect, useRef } from 'react';
import { useLocation } from 'react-router-dom';

/** The estimates list and an estimate open in its drawer are the same page. */
const isEstimatesPage = (path: string) => path === '/work' || /^\/estimates\/[^/]+$/.test(path);

export function ScrollRestoration() {
  const { pathname } = useLocation();
  const previous = useRef(pathname);

  useEffect(() => {
    const from = previous.current;
    previous.current = pathname;
    // Opening or closing an estimate's drawer keeps the list where it was.
    if (from !== pathname && isEstimatesPage(from) && isEstimatesPage(pathname)) return;

    // Small delay to ensure DOM is updated
    const scrollToTop = () => {
      // Scroll the window
      window.scrollTo(0, 0);

      // Scroll all scrollable containers
      const scrollableElements = document.querySelectorAll('.overflow-y-auto, .overflow-y-scroll');
      scrollableElements.forEach(element => {
        element.scrollTop = 0;
      });

      // Specifically target the main content area
      const mainContent = document.querySelector('main');
      if (mainContent) {
        mainContent.scrollTop = 0;
      }
    };

    // Use requestAnimationFrame to ensure DOM is ready
    requestAnimationFrame(scrollToTop);
  }, [pathname]);

  return null;
}
