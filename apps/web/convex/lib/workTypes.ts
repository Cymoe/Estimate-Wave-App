// Shared with the web app (the line editor's category list), so keep this file free of imports.

/**
 * The type of work an estimate line is, read from its wording: what the
 * agreement's scope, its price table and the client's summary group by.
 * First match wins, so the order settles overlaps ("Demo to studs and
 * haul-off" is Demolition, "Drywall, prime and paint" is Drywall).
 */
export const WORK_TYPES: Array<{ name: string; pattern: RegExp }> = [
  { name: "Permits & Fees", pattern: /\b(permit|engineering|survey|design fee|hoa\b)|(?<!camera )\binspections?\b(?! and leak)/i },
  { name: "Demolition", pattern: /\b(demo|tear[- ]?(out|off)|remove and dispose|removal)/i },
  { name: "Service Calls", pattern: /\b(service call|trip charge|diagnos|emergency|after[- ]hours)/i },
  { name: "Restoration", pattern: /\b(drying|dehumidif|antimicrobial|mold|water extraction)/i },
  { name: "Fire Protection", pattern: /\b(fire sprinkler|fire alarm|fire suppression)/i },
  { name: "Outdoor Kitchens", pattern: /\b(grill\b|outdoor kitchen|outdoor fridge)/i },
  { name: "Framing", pattern: /\b(framing|frame\b|studs|joist|header|beam|rafter|sheathing|blocking|metal building|steel building)/i },
  { name: "Insulation", pattern: /\b(insulation|spray foam|batts?\b|blown[- ]in)/i },
  { name: "Decks & Patios", pattern: /\b(deck|patio\b(?! door)|pergola|gazebo|ledger|paver|porch|polymeric sand|edge restraint)/i },
  {
    name: "Roofing",
    pattern: /\b(roof|shingle|underlayment|ridge|flashing|drip edge|ice and water|valley|eaves|gutter|downspout|tarp|skylight|soffit|standing seam)/i,
  },
  { name: "Garage Doors", pattern: /\b(garage door|opener|torsion|spring|keypad|remote)/i },
  { name: "Solar", pattern: /\b(solar|panels, \d|microinverter|inverter|racking|battery)/i },
  {
    name: "HVAC",
    pattern:
      /\b(hvac|furnace|air handler|condenser|heat pump|duct|mini[- ]split|thermostat|refrigerant|a\/c|ac unit|tune-up|filter|registers|grilles)/i,
  },
  { name: "Cabinets & Vanities", pattern: /\b(vanity with top|vanities with tops|double vanity with top)/i },
  {
    name: "Electrical",
    pattern:
      /\b(electric|wiring|wire\b|wire and|rewire|circuit|outlet|gfci|breaker|panel|lighting|lights?\b|switch|ev charger|conduit|gauge wire|surge|detector|dimmer|fan-rated|devices)/i,
  },
  {
    name: "Plumbing",
    pattern:
      /\b(plumb|repipe|pipe|piping|drain|supply lines|stops\b|valve|water heater|sewer|sewage|ejector|faucet|sump|gas line|shut[- ]?off|cable machine|camera inspection)/i,
  },
  { name: "Site Work", pattern: /\b(excavat|grading|compacted|site prep|clearing|trench)/i },
  {
    name: "Concrete",
    pattern: /\b(concrete|slab|footing|foundation|pour|flatwork|saw[- ]cut|spall|rebar|stamp|apron|sidewalk|driveway|anchor bolts|crack)/i,
  },
  { name: "Masonry", pattern: /\b(masonry|brick|block\b|block base|stone veneer|fire ?pit|retaining wall)/i },
  { name: "Countertops", pattern: /\b(countertop|quartz|granite|butcher block|solid surface)/i },
  { name: "Cabinets & Vanities", pattern: /\b(cabinet|vanity|vanities|pantry|hinges|drawer)/i },
  { name: "Tile", pattern: /\b(tile|backsplash|grout|cement board|waterproofing|mortar|niche|shower pan)/i },
  {
    name: "Fixtures & Appliances",
    pattern:
      /\b(toilet|tub\b|tub |shower|appliance|range hood|dishwasher|disposal|sink|mirror|accessories|fixtures|glass enclosure|acrylic|towel|grab bar|paper holder|hooks)/i,
  },
  { name: "Drywall", pattern: /\b(drywall|sheetrock|mud\b|tape\b|texture|skim|corner bead)/i },
  { name: "Windows & Doors", pattern: /\b(window|door|slider|weatherstrip|lockset|deadbolt|glass unit)/i },
  { name: "Painting", pattern: /\b(paint|prime\b|primer|stain|seal|coat|caulk|scrape|power wash|pressure wash)/i },
  { name: "Flooring", pattern: /\b(floor|carpet|pad\b|laminate|lvp|vinyl plank|hardwood|oak\b|subfloor|transitions|baseboard|move and reset)/i },
  { name: "Siding & Exterior", pattern: /\b(siding|fascia|stucco|hardie|house wrap|exterior)/i },
  {
    name: "Landscaping & Irrigation",
    pattern: /\b(landscap|sprinkler|irrigation|sod\b|turf|mulch|plant|shrub|tree|rock|gravel|zone|edging|mow|rain sensor|controller|weeding)/i,
  },
  {
    name: "Trim & Carpentry",
    pattern:
      /\b(trim\b|crown|molding|moulding|casing|carpent|shelving|shelves|stair|tread|railing|board replacement|built[- ]?in|tongue[- ]and[- ]groove|plywood|substrate)/i,
  },
  { name: "Fencing", pattern: /\b(fenc|chain link|gate\b|picket)/i },
  { name: "Cleanup & Haul-off", pattern: /\b(haul|dump|debris|clean[- ]?up|final clean|junk)/i },
  { name: "Labor & Handyman", pattern: /\b(lead carpenter|helper|handyman|laborer|technician|crew|assembly|tv mount)/i },
];

/** The type of work a line is: the first pattern its wording matches, else the fallback (its trade), else "General". */
export function workTypeOf(description: string, fallback?: string): string {
  const text = description ?? "";
  for (const { name, pattern } of WORK_TYPES) if (pattern.test(text)) return name;
  return fallback?.trim() || "General";
}

/** "kitchen-remodeling" → "Kitchen Remodeling": a package's trade, as a category to fall back on. */
export function tradeLabel(slug: string): string {
  return slug
    .split("-")
    .filter(Boolean)
    .map((w) => w[0].toUpperCase() + w.slice(1))
    .join(" ");
}

export const WORK_TYPE_NAMES = [...new Set(WORK_TYPES.map((t) => t.name))].sort();
