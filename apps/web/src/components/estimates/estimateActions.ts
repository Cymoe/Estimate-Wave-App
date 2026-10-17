import { EstimateService, Estimate } from '../../services/EstimateService';

/** Copies text, falling back to a hidden textarea where the clipboard API isn't allowed. */
export async function copyText(text: string) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    document.execCommand('copy');
    document.body.removeChild(textArea);
  }
}

/**
 * Sends the client the estimate's link: the share sheet (Messages, Mail,
 * AirDrop…) where there is one, otherwise the link is copied. A draft
 * becomes Sent. Returns the link, or null if the share sheet was closed.
 */
export async function sendEstimateLink(estimate: Estimate): Promise<string | null> {
  if (!estimate.id) return null;
  const url = await EstimateService.shareUrl(estimate.id);
  let shared = false;
  if (typeof navigator.share === 'function') {
    try {
      const name = estimate.client?.name?.split(' ')[0];
      await navigator.share({
        title: `Estimate ${estimate.estimate_number ?? ''}`.trim(),
        text: `${name ? `Hi ${name}, here` : 'Here'}'s your estimate. You can review and accept it here:`,
        url,
      });
      shared = true;
    } catch (err) {
      if ((err as Error)?.name === 'AbortError') return null; // closed the share sheet
    }
  }
  if (!shared) {
    await copyText(url);
    alert('Link copied. Paste it into a text or email to your client.');
  }
  if (estimate.status === 'draft') await EstimateService.updateStatus(estimate.id, 'sent');
  return url;
}

const isoDate = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** A new draft with the same client, project and items, dated today. */
export async function duplicateEstimate(estimate: Estimate, organizationId: string): Promise<Estimate> {
  const today = new Date();
  return EstimateService.create({
    organization_id: organizationId,
    client_id: estimate.client_id,
    project_id: estimate.project_id,
    title: estimate.title ? `${estimate.title} (copy)` : '',
    description: estimate.description,
    notes: estimate.notes,
    terms: estimate.terms,
    tax_rate: estimate.tax_rate,
    status: 'draft',
    issue_date: isoDate(today),
    expiry_date: isoDate(new Date(today.getFullYear(), today.getMonth(), today.getDate() + 30)),
    subtotal: 0,
    total_amount: 0,
    items: (estimate.items || []).map((item, index) => ({
      description: item.description,
      quantity: item.quantity,
      unit_price: item.unit_price,
      total_price: item.total_price,
      red_line_price: item.red_line_price,
      cap_price: item.cap_price,
      cost_code: item.cost_code,
      product_id: item.product_id,
      display_order: item.display_order ?? index,
    })),
  });
}
