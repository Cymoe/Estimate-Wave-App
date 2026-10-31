// Shared with the web app (src/services/contract.ts), so keep this file free of imports.

export const DEFAULT_PAYMENT_TERMS = "50% deposit upon signing, 50% upon completion";
export const DEFAULT_WARRANTY = "1 year";

/** The company's wording for the built-in agreement. */
export interface AgreementWording {
  paymentTerms?: string;
  warranty?: string;
  extraTerms?: string;
}

/** The terms one estimate carries; blanks fall back to the company's wording, then the defaults. */
export interface AgreedTerms {
  startDate?: string;
  completionDate?: string;
  paymentTerms?: string;
  warrantyPeriod?: string;
  workDescription?: string;
  propertyAddress?: string;
  extraTerms?: string;
}

/** What the agreement says: the estimate's own terms first, then the company's wording, then the defaults. */
export function resolveTerms(company: AgreementWording | undefined | null, terms: AgreedTerms | undefined | null): AgreedTerms {
  const own = terms ?? {};
  return {
    ...own,
    paymentTerms: own.paymentTerms || company?.paymentTerms || DEFAULT_PAYMENT_TERMS,
    warrantyPeriod: own.warrantyPeriod || company?.warranty || DEFAULT_WARRANTY,
    extraTerms: own.extraTerms || company?.extraTerms || undefined,
  };
}
