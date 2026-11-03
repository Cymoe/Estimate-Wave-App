import React, { Suspense, lazy, useCallback, useState } from 'react';

// The map (and MapLibre with it) downloads the first time someone opens one.
const MapModal = lazy(() => import('./MapModal'));

/**
 * Any address in the app: tapping it opens the map, with Directions in the
 * device's maps app. A tap here never reaches a clickable card around it.
 */
export const AddressLink: React.FC<{
  /** The whole address (fullAddress from lib/mapsLinks). */
  address: string;
  /** Whose place it is, shown on the pin. */
  title?: string;
  className?: string;
  'aria-label'?: string;
  children: React.ReactNode;
}> = ({ address, title, className, children, ...rest }) => {
  const [open, setOpen] = useState(false);
  const close = useCallback(() => setOpen(false), []);
  if (!address.trim()) return <>{children}</>;
  return (
    <>
      <button
        type="button"
        onClick={(e) => {
          e.stopPropagation();
          setOpen(true);
        }}
        className={className}
        aria-label={rest['aria-label'] ?? `Map of ${address}`}
        title={rest['aria-label'] ?? `Map of ${address}`}
      >
        {children}
      </button>
      {open && (
        <Suspense fallback={null}>
          <MapModal isOpen onClose={close} address={address} clientName={title} />
        </Suspense>
      )}
    </>
  );
};
