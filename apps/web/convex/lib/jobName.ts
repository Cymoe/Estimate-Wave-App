// What a project started from an estimate is called. No Convex imports, so
// the web app uses it too (EstimateProject) and the one-time rename in
// projects.ts reads the same rule.

/** The title an estimate gets when nobody names it: "Estimate 031934", "Presupuesto EST-2026-01". */
export const isPlaceholderTitle = (title: string | undefined | null): boolean =>
  !title?.trim() || /^(estimate|presupuesto)\s+[\w-]*\d[\w-]*$/i.test(title.trim());

/**
 * The estimate's own title when someone gave it one ("Kitchen Remodel");
 * otherwise the client ("Ann Miller job"), then the job's address, then the
 * estimate number.
 */
export function jobName(parts: { title?: string | null; clientName?: string | null; address?: string | null; estimateNumber?: string | null }): string {
  if (!isPlaceholderTitle(parts.title)) return parts.title!.trim();
  if (parts.clientName?.trim()) return `${parts.clientName.trim()} job`;
  if (parts.address?.trim()) return parts.address.trim();
  return parts.estimateNumber?.trim() ? `Job for ${parts.estimateNumber.trim()}` : 'New job';
}
