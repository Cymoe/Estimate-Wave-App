import React, { useEffect } from 'react';

/**
 * A page the public sees in light colours: an estimate, a sign-off, a payment link, the legal pages.
 * The app root is a flex column pinned to the viewport, so a plain min-h-screen box shrinks to one
 * screen and lets the dark body show under anything longer. This one keeps its full height and turns
 * the body light while it's open, so the space past the end of the page (iOS overscroll) is light too.
 */
export const LightPage: React.FC<{ className?: string; children: React.ReactNode }> = ({ className = '', children }) => {
  useEffect(() => {
    document.body.classList.add('light-page');
    return () => document.body.classList.remove('light-page');
  }, []);
  return <div className={`min-h-screen shrink-0 ${className}`}>{children}</div>;
};
