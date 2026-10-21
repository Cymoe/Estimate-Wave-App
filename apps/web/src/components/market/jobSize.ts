/** A lead's job size and kind, in the words the app uses (mirrors convex/lib/auction.ts). */
export const SIZES = ['small', 'medium', 'large'] as const;
export type Size = (typeof SIZES)[number];
export const KINDS = ['new', 'remodel', 'repair'] as const;
export type Kind = (typeof KINDS)[number];

export const SIZE_LABELS: Record<Size, string> = { small: 'Small', medium: 'Medium', large: 'Large' };
export const SIZE_RANGES: Record<Size, string> = { small: 'under $2K', medium: '$2K–$15K', large: '$15K and up' };
export const KIND_LABELS: Record<Kind, string> = { new: 'New build', remodel: 'Remodel', repair: 'Repair' };

/** "Medium · Remodel", "Large", "Repair", or null when neither is known. */
export function jobLabel(size?: Size | string, kind?: Kind | string): string | null {
  const parts = [size && SIZE_LABELS[size as Size], kind && KIND_LABELS[kind as Kind]].filter(Boolean);
  return parts.length ? parts.join(' · ') : null;
}
