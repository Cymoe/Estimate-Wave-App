/** Versioned scope wording shared by the contractor page, client page and signing snapshot.
 * Never change a published version's wording: introduce a new ID instead.
 */
export interface ContractTemplate {
  id: string;
  label: string;
  stages: Array<{ title: string; steps: Array<{ label: string; text: string }> }>;
}

const template = (id: string, label: string, preparation: string, work: string, completion: string): ContractTemplate => ({
  id,
  label,
  stages: [
    { title: 'Stage 1 - Preparation', steps: [{ label: 'Preparation', text: preparation }] },
    { title: 'Stage 2 - Work', steps: [{ label: label === 'General / multiple trades' ? 'Agreed work' : label, text: work }] },
    { title: 'Stage 3 - Completion', steps: [{ label: 'Final review and cleanup', text: completion }] },
  ],
});

export const CONTRACT_TEMPLATES: ContractTemplate[] = [
  template('general-v1', 'General / multiple trades',
    'Confirm the approved scope, site access, materials and any preparation included in the estimate. Protect the areas affected by the agreed work.',
    'Perform only the services and installations listed in the estimate and approved design. Coordinate the included trades as required by that scope.',
    'Review the completed scope with the Client, address agreed punch-list items and remove debris created by the included work.'),
  template('painting-v1', 'Painting',
    'Confirm the surfaces, colors and finishes included in the estimate. Protect adjacent surfaces and carry out the cleaning, patching, sanding and preparation specified in the scope.',
    'Apply the primers, coatings and finishes specified in the estimate to the included surfaces, following the product application instructions.',
    'Review the included painted surfaces, complete agreed touch-ups, remove masking and protection, and clean the work areas.'),
  template('landscaping-v1', 'Landscaping',
    'Confirm the approved outdoor layout and included site preparation. Identify existing features to protect and prepare only the areas listed in the estimate.',
    'Install the planting, ground cover, irrigation or landscape features expressly included in the estimate and approved design.',
    'Review the installed landscape features, test included irrigation work, remove work debris and provide care instructions for included materials.'),
  template('roofing-v1', 'Roofing',
    'Confirm the roof areas, materials and removal or repair work included in the estimate. Protect the property and prepare the included roof surfaces.',
    'Install or repair the roofing, underlayment, flashing and related components specified in the estimate, following the applicable product instructions.',
    'Review the included roof work, address agreed completion items and remove roofing debris from the work areas.'),
  template('electrical-v1', 'Electrical',
    'Confirm the circuits, fixtures and equipment included in the estimate, access requirements and the isolation needed for the agreed electrical work.',
    'Carry out the electrical installations or repairs expressly listed in the estimate, including any specified wiring, fixtures and connections.',
    'Test the included electrical work, complete any inspections required for that scope, review its operation and clean the work areas.'),
  template('plumbing-v1', 'Plumbing',
    'Confirm the fixtures, piping and repairs included in the estimate. Arrange access and isolation of the services affected by the agreed work.',
    'Install or repair the plumbing components specified in the estimate, including only the listed fixtures, piping and connections.',
    'Test the included work for leaks and operation, complete any inspections required for that scope and clean the work areas.'),
  template('hvac-v1', 'HVAC',
    'Confirm the heating, cooling or ventilation equipment and services included in the estimate. Protect affected areas and arrange access to the included systems.',
    'Install, service or repair only the HVAC equipment, ductwork, controls and connections specified in the estimate.',
    'Test and commission the included work as applicable, review controls and maintenance instructions with the Client and clean the work areas.'),
  template('flooring-v1', 'Flooring',
    'Confirm the floor areas, materials and finish included in the estimate. Complete the removal, substrate preparation or moisture checks specified in the scope.',
    'Install or refinish the flooring and related trim expressly included in the estimate, following the applicable product instructions.',
    'Review the included flooring, complete agreed finishing items, remove work debris and provide applicable care instructions.'),
  template('carpentry-v1', 'Carpentry',
    'Confirm the dimensions, materials and design for the carpentry included in the estimate. Protect adjacent areas and prepare the specified work areas.',
    'Build, install or repair the framing, joinery, trim or other carpentry expressly listed in the estimate and approved design.',
    'Review the included carpentry, complete agreed adjustment and finishing items and clean the work areas.'),
  template('drywall-v1', 'Drywall',
    'Confirm the walls, ceilings, repairs and finish level included in the estimate. Protect adjacent areas and prepare the specified work surfaces.',
    'Install or repair the drywall, then tape, finish and sand the included areas to the finish level specified in the estimate.',
    'Review the included surfaces, complete agreed finishing items and remove dust and debris created by the included work.'),
];

export const LEGACY_CONTRACT_TEMPLATE = 'legacy-v0';
export const isContractTemplate = (id: string): boolean => CONTRACT_TEMPLATES.some(template => template.id === id);

const categoryRules: Array<[string, RegExp]> = [
  ['painting-v1', /\bpaint(?:ing)?\b/i],
  ['landscaping-v1', /\b(?:landscap\w*|irrigation|sod|turf|planting)\b/i],
  ['roofing-v1', /\broof\w*\b/i],
  ['electrical-v1', /\belectrical\b/i],
  ['plumbing-v1', /\bplumb\w*\b/i],
  ['hvac-v1', /\b(?:hvac|heating|cooling|ventilation|air conditioning)\b/i],
  ['flooring-v1', /\b(?:floor\w*|tile|carpet\w*)\b/i],
  ['carpentry-v1', /\b(?:carpentry|framing|cabinet\w*|woodwork|trim)\b/i],
  ['drywall-v1', /\b(?:drywall|plaster\w*)\b/i],
];

/** Mixed, absent or unrecognised categories use the neutral scope. Never guess from free text. */
export function suggestedContractTemplate(items: Array<{ category?: string }>): string {
  const categories = items.map(item => item.category?.trim()).filter(category => category && category.toLowerCase() !== 'other');
  if (!categories.length) return 'general-v1';
  const trades = categories.map(category => {
    const matches = categoryRules.filter(([, pattern]) => pattern.test(category!));
    return matches.length === 1 ? matches[0][0] : 'general-v1';
  });
  return trades.every(trade => trade === trades[0]) ? trades[0] : 'general-v1';
}

export function resolveContractTemplate(selected: string | undefined, items: Array<{ category?: string }>, signed = false): string {
  if (selected === LEGACY_CONTRACT_TEMPLATE) return selected;
  if (selected && isContractTemplate(selected)) return selected;
  // Old signed agreements must retain the wording their clients accepted.
  return signed ? LEGACY_CONTRACT_TEMPLATE : suggestedContractTemplate(items);
}
