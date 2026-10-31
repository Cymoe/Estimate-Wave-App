/**
 * The kinds of job in each trade, by trade slug, offered when a project is
 * started. Built-in packages (convex/catalog/packages.ts) hang off these.
 * A trade that isn't listed gets one general type named after it.
 */
export const PROJECT_TYPES: Record<string, { name: string; description: string }[]> = {
  "general-construction": [
    { name: "New Build", description: "Ground-up construction" },
    { name: "Addition", description: "Adding space to an existing building" },
    { name: "Remodel", description: "Renovating existing space" },
    { name: "General Repair", description: "Repairs and punch-list work" },
  ],
  "residential-construction": [
    { name: "Whole-Home Remodel", description: "Renovation across several rooms" },
    { name: "Addition", description: "New room or second story" },
    { name: "Basement Finish", description: "Turning a basement into living space" },
    { name: "General Repair", description: "Repairs and punch-list work" },
  ],
  "commercial-construction": [
    { name: "Tenant Improvement", description: "Build-out for a commercial tenant" },
    { name: "New Build", description: "Ground-up commercial construction" },
    { name: "Repair & Maintenance", description: "Ongoing or one-off repairs" },
  ],
  "outdoor-construction": [
    { name: "Deck Construction", description: "New deck or deck rebuild" },
    { name: "Concrete & Patio", description: "Slabs, patios and walkways" },
    { name: "Outdoor Kitchen", description: "Built-in grill and outdoor living" },
    { name: "Pergola & Shade", description: "Pergolas, covers and shade structures" },
  ],
  "kitchen-remodeling": [
    { name: "Kitchen Remodel", description: "Full kitchen renovation" },
    { name: "Cabinet & Counter Refresh", description: "New cabinets, counters or both" },
    { name: "Backsplash & Finishes", description: "Tile, paint and fixtures" },
  ],
  "bathroom-remodeling": [
    { name: "Bathroom Remodel", description: "Full bathroom renovation" },
    { name: "Shower / Tub Conversion", description: "Replace or convert the shower or tub" },
    { name: "Vanity & Fixtures", description: "Vanity, toilet and fixture updates" },
  ],
  electrical: [
    { name: "Service Call / Repair", description: "Troubleshooting and repairs" },
    { name: "Panel Upgrade", description: "Panel replacement or service upgrade" },
    { name: "Rewire", description: "Partial or whole-home rewiring" },
    { name: "Lighting & Fixtures", description: "New lighting, fans and devices" },
  ],
  plumbing: [
    { name: "Service Call / Repair", description: "Leaks, clogs and repairs" },
    { name: "Water Heater", description: "Water heater replacement or install" },
    { name: "Repipe", description: "Partial or whole-home repipe" },
    { name: "Fixture Install", description: "Sinks, toilets and faucets" },
  ],
  hvac: [
    { name: "System Replacement", description: "New AC, furnace or heat pump" },
    { name: "Repair", description: "Diagnose and repair a system" },
    { name: "Maintenance", description: "Tune-ups and service plans" },
    { name: "Ductwork", description: "New or repaired ductwork" },
  ],
  roofing: [
    { name: "Roof Replacement", description: "Tear-off and new roof" },
    { name: "Roof Repair", description: "Leaks, storm damage and patches" },
    { name: "Gutters", description: "Gutter install or repair" },
  ],
  flooring: [
    { name: "Flooring Installation", description: "New hardwood, LVP, tile or carpet" },
    { name: "Refinish", description: "Sand and refinish existing floors" },
    { name: "Repair", description: "Patch and repair flooring" },
  ],
  landscaping: [
    { name: "Landscape Install", description: "New beds, sod and plantings" },
    { name: "Irrigation", description: "Sprinkler install or repair" },
    { name: "Hardscape", description: "Pavers, walls and edging" },
    { name: "Maintenance", description: "Recurring yard care" },
  ],
  solar: [
    { name: "Solar Install", description: "New panel system" },
    { name: "Battery Storage", description: "Add battery backup" },
    { name: "Service & Repair", description: "Inspect and repair a system" },
  ],
  handyman: [
    { name: "General Repair", description: "Assorted repairs and small jobs" },
    { name: "Interior Painting", description: "Walls, trim and ceilings" },
    { name: "Exterior Painting", description: "Siding, trim and doors" },
    { name: "Assembly & Install", description: "Fixtures, shelving and furniture" },
  ],
  "garage-door": [
    { name: "Door Replacement", description: "New garage door" },
    { name: "Opener Install", description: "New or replacement opener" },
    { name: "Repair", description: "Springs, cables and tracks" },
  ],
  "fence-services": [
    { name: "New Fence", description: "New fence install" },
    { name: "Fence Repair", description: "Replace boards, posts or sections" },
    { name: "Gate", description: "New gate or gate repair" },
  ],
  painting: [
    { name: "Interior Painting", description: "Walls, ceilings and trim inside" },
    { name: "Exterior Painting", description: "Siding, trim and doors outside" },
    { name: "Cabinets & Trim", description: "Cabinet, door and trim refinishing" },
  ],
  drywall: [
    { name: "Drywall Install", description: "Hang, tape and finish new drywall" },
    { name: "Repair & Patch", description: "Holes, cracks and water damage" },
    { name: "Texture", description: "Texture, skim coat or popcorn removal" },
  ],
  concrete: [
    { name: "Flatwork", description: "Driveways, slabs, walks and patios" },
    { name: "Foundation", description: "Footings, stem walls and slabs" },
    { name: "Concrete Repair", description: "Cracks, lifting and resurfacing" },
  ],
  tiling: [
    { name: "Floor Tile", description: "Tile floors in any room" },
    { name: "Shower & Tub Tile", description: "Shower walls, pans and surrounds" },
    { name: "Backsplash", description: "Kitchen and bath backsplashes" },
  ],
  siding: [
    { name: "Siding Replacement", description: "New siding on all or part of a home" },
    { name: "Siding Repair", description: "Rot, storm damage and sections" },
  ],
  "window-door": [
    { name: "Window Replacement", description: "Replacement windows, several at once" },
    { name: "Door Install", description: "Entry, patio and interior doors" },
    { name: "Window & Door Repair", description: "Glass, hardware and weatherstripping" },
  ],
};

export function projectTypesFor(industry: { slug: string; name: string }) {
  return PROJECT_TYPES[industry.slug] ?? [{ name: industry.name, description: "" }];
}
