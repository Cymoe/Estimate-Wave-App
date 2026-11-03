import React from 'react';
import { mapsSearchUrl } from '../../lib/mapsLinks';

/**
 * Any address in the app: one tap opens it in Apple Maps (iPhone, iPad, Mac)
 * or Google Maps (everything else). A tap here never reaches a clickable card around it.
 */
export const AddressLink: React.FC<{
  /** The whole address (fullAddress from lib/mapsLinks). */
  address: string;
  className?: string;
  'aria-label'?: string;
  children: React.ReactNode;
}> = ({ address, className, children, ...rest }) => {
  if (!address.trim()) return <>{children}</>;
  const label = rest['aria-label'] ?? `Open ${address} in Maps`;
  return (
    <a
      href={mapsSearchUrl(address)}
      target="_blank"
      rel="noreferrer"
      onClick={(e) => e.stopPropagation()}
      className={className}
      aria-label={label}
      title={label}
    >
      {children}
    </a>
  );
};
