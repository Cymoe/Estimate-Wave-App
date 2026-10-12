import { CONTRACT_TEMPLATES, LEGACY_CONTRACT_TEMPLATE, resolveContractTemplate, suggestedContractTemplate } from '../../../convex/lib/contractTemplates';

describe('contract trade selection', () => {
  it.each([
    ['Interior Painting', 'painting-v1'], ['Exterior Painting', 'painting-v1'],
    ['Landscaping', 'landscaping-v1'], ['Roofing', 'roofing-v1'],
    ['Electrical', 'electrical-v1'], ['Plumbing', 'plumbing-v1'],
    ['HVAC', 'hvac-v1'], ['Flooring', 'flooring-v1'],
    ['Carpentry', 'carpentry-v1'], ['Drywall', 'drywall-v1'],
    ['Unknown', 'general-v1'], ['Other', 'general-v1'],
  ])('suggests a scope for %s', (category, expected) => {
    expect(suggestedContractTemplate([{ category }])).toBe(expected);
  });
  it('uses neutral wording for mixed or absent trades', () => {
    expect(suggestedContractTemplate([{ category: 'Painting' }, { category: 'Plumbing' }])).toBe('general-v1');
    expect(suggestedContractTemplate([{ category: 'Painting' }, { category: 'Unknown' }])).toBe('general-v1');
    expect(suggestedContractTemplate([])).toBe('general-v1');
  });
  it('uses an explicit selection over the suggested trade', () => {
    expect(resolveContractTemplate('painting-v1', [{ category: 'Landscaping' }])).toBe('painting-v1');
  });
  it('retains original wording for previously signed contracts without a selection', () => {
    expect(resolveContractTemplate(undefined, [{ category: 'Painting' }], true)).toBe(LEGACY_CONTRACT_TEMPLATE);
    expect(resolveContractTemplate('painting-v1', [{ category: 'Landscaping' }], true)).toBe('painting-v1');
  });
  it('keeps three stages in every trade template', () => {
    for (const template of CONTRACT_TEMPLATES) expect(template.stages).toHaveLength(3);
  });
});
