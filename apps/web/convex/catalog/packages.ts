// Built-in packages: the jobs a trade does most, ready to start a project
// from on day one. Each hangs off a kind of job (projectTypes.ts) and brings
// its own estimate lines, its tasks as days from the start, and how long it
// takes, because the starter price book only covers a few trades.
//
// Prices are the starting (cap) price for a line; the red line is 15% under.
// Companies change any of it on the estimate, and can save their own version
// of a job as a template (convex/projectTemplates.ts).

export interface PackageLine {
  description: string;
  quantity: number;
  unit: string;
  unitPrice: number;
  redLinePrice: number;
  capPrice: number;
}
export interface PackageTask {
  title: string;
  startOffset?: number;
  days?: number;
}
export interface BuiltInPackage {
  id: string;
  trade: string;
  type: string;
  name: string;
  description: string;
  days: number;
  lines: PackageLine[];
  tasks: PackageTask[];
}

// [description, quantity, unit, price]
type L = [string, number, string, number];
// [title, days after the start, how many days]
type T = [string, number?, number?];

const slug = (s: string) =>
  s
    .toLowerCase()
    .replace(/&/g, "and")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");

function pkg(trade: string, type: string, name: string, days: number, description: string, lines: L[], tasks: T[]): BuiltInPackage {
  return {
    id: `${trade}/${slug(type)}/${slug(name)}`,
    trade,
    type,
    name,
    description,
    days,
    lines: lines.map(([description, quantity, unit, price]) => ({
      description,
      quantity,
      unit,
      unitPrice: price,
      redLinePrice: Math.round(price * 0.85 * 100) / 100,
      capPrice: price,
    })),
    tasks: tasks.map(([title, startOffset, days]) => ({ title, startOffset, days })),
  };
}

const GC = "general-construction";
const RC = "residential-construction";
const CC = "commercial-construction";
const OC = "outdoor-construction";
const KR = "kitchen-remodeling";
const BR = "bathroom-remodeling";

// Jobs several trades share, so a remodeler and a GC offer the same package.
const kitchenRemodel = (trade: string, type: string) =>
  pkg(
    trade,
    type,
    "Kitchen Remodel",
    20,
    "New cabinets, quartz counters, tile backsplash, sink and faucet, lighting and paint in an average kitchen.",
    [
      ["Demo and haul-off of existing cabinets, counters and flooring", 1, "job", 1800],
      ["Rough plumbing and electrical changes", 1, "job", 3200],
      ["Semi-custom cabinets, supplied and installed", 22, "lf", 385],
      ["Quartz countertops, fabricated and installed", 45, "sf", 95],
      ["Tile backsplash, supplied and installed", 30, "sf", 38],
      ["Undermount sink, faucet and disposal, installed", 1, "job", 950],
      ["Recessed LED lighting and under-cabinet lights", 1, "job", 1400],
      ["Luxury vinyl plank flooring, supplied and installed", 180, "sf", 7.5],
      ["Drywall repair, prime and paint", 1, "job", 1600],
      ["Appliance set and hookup", 1, "job", 450],
      ["Permit and inspections", 1, "job", 650],
    ],
    [
      ["Order cabinets and counters", 0, 1],
      ["Demo", 14, 2],
      ["Rough plumbing and electrical", 16, 2],
      ["Drywall repair and paint", 18, 2],
      ["Cabinet install", 20, 2],
      ["Counter template", 22, 1],
      ["Flooring", 23, 2],
      ["Counter install", 29, 1],
      ["Backsplash, plumbing and electrical trim", 30, 2],
      ["Appliances and punch list", 32, 1],
    ],
  );

const bathroomRemodel = (trade: string, type: string, name = "Bathroom Remodel") =>
  pkg(
    trade,
    type,
    name,
    12,
    "Full hall bath: new tub or shower, tile, vanity, toilet, fixtures, fan, flooring and paint.",
    [
      ["Demo to studs and haul-off", 1, "job", 1200],
      ["Rough plumbing: relocate or replace valves, drain and supplies", 1, "job", 1800],
      ["Electrical: GFCI outlets, vanity light and exhaust fan", 1, "job", 900],
      ["Cement board and waterproofing", 1, "job", 850],
      ["Tub or shower base, supplied and installed", 1, "each", 1450],
      ["Wall tile to ceiling, supplied and installed", 90, "sf", 32],
      ["Floor tile, supplied and installed", 45, "sf", 28],
      ["Vanity with top, faucet and mirror, installed", 1, "each", 1650],
      ["Toilet, installed", 1, "each", 525],
      ["Shower valve trim, door and accessories", 1, "job", 1100],
      ["Drywall, prime and paint", 1, "job", 850],
      ["Permit and inspections", 1, "job", 450],
    ],
    [
      ["Order tile, vanity and fixtures", 0, 1],
      ["Demo", 10, 1],
      ["Rough plumbing and electrical", 11, 2],
      ["Cement board and waterproofing", 13, 1],
      ["Tile", 14, 3],
      ["Drywall and paint", 17, 2],
      ["Vanity, toilet and trim", 19, 2],
      ["Shower door and punch list", 21, 1],
    ],
  );

const showerConversion = (trade: string, type: string) =>
  pkg(
    trade,
    type,
    "Tub-to-Shower Conversion",
    6,
    "Pull the tub and build a tiled walk-in shower with a glass door in its place.",
    [
      ["Remove tub, surround and haul-off", 1, "job", 650],
      ["Rough plumbing: new valve and shower drain", 1, "job", 1250],
      ["Shower pan, curb and waterproofing", 1, "job", 1400],
      ["Wall tile, supplied and installed", 80, "sf", 34],
      ["Niche, bench or grab bar blocking", 1, "job", 450],
      ["Valve trim, head and hand shower", 1, "job", 650],
      ["Frameless glass door, supplied and installed", 1, "each", 1600],
      ["Drywall patch and paint", 1, "job", 450],
    ],
    [
      ["Order tile, valve and glass", 0, 1],
      ["Demo and rough plumbing", 7, 1],
      ["Pan and waterproofing", 8, 1],
      ["Tile", 9, 3],
      ["Trim and paint", 12, 1],
      ["Glass door", 19, 1],
    ],
  );

const basementFinish = (trade: string, type: string) =>
  pkg(
    trade,
    type,
    "Basement Finish",
    30,
    "Frame, insulate, wire and finish about 800 square feet into living space with a half bath.",
    [
      ["Framing and blocking", 800, "sf", 9.5],
      ["Insulation and vapor barrier", 800, "sf", 2.25],
      ["Electrical: outlets, lighting, smoke detectors and panel work", 1, "job", 6500],
      ["Plumbing: half bath rough-in and fixtures", 1, "job", 5800],
      ["HVAC supply and return extensions", 1, "job", 2800],
      ["Drywall, hung and finished", 2400, "sf", 3.25],
      ["Interior doors and trim", 1, "job", 2900],
      ["Paint, walls, ceiling and trim", 1, "job", 3400],
      ["Luxury vinyl plank flooring, supplied and installed", 800, "sf", 7.5],
      ["Egress window, supplied and installed", 1, "each", 4200],
      ["Permit and inspections", 1, "job", 1200],
    ],
    [
      ["Permit", 0, 1],
      ["Egress window", 10, 2],
      ["Framing", 12, 4],
      ["Rough electrical, plumbing and HVAC", 16, 5],
      ["Rough inspection", 21, 1],
      ["Insulation", 22, 1],
      ["Drywall", 23, 7],
      ["Paint", 30, 3],
      ["Doors and trim", 33, 2],
      ["Flooring", 35, 3],
      ["Fixtures, trim-out and final inspection", 38, 2],
    ],
  );

const roomAddition = (trade: string, type: string, name = "Room Addition") =>
  pkg(
    trade,
    type,
    name,
    55,
    "A 300 square foot addition on slab: foundation, framing, roof tie-in, exterior finish, and a finished interior.",
    [
      ["Plans, engineering and permit", 1, "job", 4500],
      ["Excavation and concrete slab with footings", 300, "sf", 18],
      ["Framing, walls and roof, tied into the existing roof", 300, "sf", 32],
      ["Windows and exterior door", 1, "job", 4800],
      ["Roofing to match", 5, "sq", 525],
      ["Siding, trim and paint to match", 1, "job", 6800],
      ["Electrical: circuits, outlets, lighting", 1, "job", 4200],
      ["HVAC extension or mini-split", 1, "job", 4500],
      ["Insulation", 1, "job", 1900],
      ["Drywall, hung and finished", 1100, "sf", 3.25],
      ["Interior doors, trim and paint", 1, "job", 4100],
      ["Flooring, supplied and installed", 300, "sf", 8],
    ],
    [
      ["Plans and permit", 0, 1],
      ["Excavation and slab", 21, 4],
      ["Framing", 28, 7],
      ["Roof tie-in and roofing", 35, 4],
      ["Windows, door and dry-in", 39, 2],
      ["Rough mechanical, electrical and plumbing", 41, 5],
      ["Inspections", 46, 1],
      ["Insulation and drywall", 47, 8],
      ["Siding and exterior paint", 55, 5],
      ["Interior finish: trim, paint, flooring", 60, 8],
      ["Final inspection and punch list", 68, 2],
    ],
  );

const generalRepair = (trade: string, type: string, name: string, description: string) =>
  pkg(
    trade,
    type,
    name,
    2,
    description,
    [
      ["Lead carpenter", 16, "hour", 95],
      ["Helper", 16, "hour", 55],
      ["Materials allowance", 1, "allowance", 650],
      ["Dump and haul-off", 1, "job", 150],
    ],
    [
      ["Walk-through and materials", 0, 1],
      ["Repairs", 1, 2],
    ],
  );

export const BUILT_IN_PACKAGES: BuiltInPackage[] = [
  // General construction
  kitchenRemodel(GC, "Remodel"),
  bathroomRemodel(GC, "Remodel"),
  showerConversion(GC, "Remodel"),
  basementFinish(GC, "Remodel"),
  pkg(
    GC,
    "Remodel",
    "Garage Conversion",
    25,
    "Turn a two-car garage into a finished room: slab leveled, wall where the door was, insulation, power, HVAC and finishes.",
    [
      ["Plans and permit", 1, "job", 2800],
      ["Remove garage door and frame the opening with a window", 1, "job", 3800],
      ["Level and insulate the slab, sleepers and subfloor", 400, "sf", 9],
      ["Insulation, walls and ceiling", 1, "job", 2600],
      ["Electrical: outlets, lighting, circuits", 1, "job", 3800],
      ["Mini-split heat pump, installed", 1, "each", 4200],
      ["Drywall, hung and finished", 1300, "sf", 3.25],
      ["Siding and exterior paint to match", 1, "job", 2900],
      ["Interior doors, trim and paint", 1, "job", 3600],
      ["Flooring, supplied and installed", 400, "sf", 7.5],
    ],
    [
      ["Permit", 0, 1],
      ["Framing and window", 14, 3],
      ["Floor system", 17, 2],
      ["Rough electrical and mini-split", 19, 3],
      ["Insulation and drywall", 22, 7],
      ["Exterior finish", 29, 3],
      ["Trim, paint and flooring", 32, 6],
      ["Final inspection", 38, 1],
    ],
  ),
  roomAddition(GC, "Addition"),
  pkg(
    GC,
    "Addition",
    "Covered Patio Addition",
    15,
    "A 16 by 20 attached patio cover with a shingle roof, ceiling, fan and lights over a new slab.",
    [
      ["Plans and permit", 1, "job", 1800],
      ["Concrete slab, 320 sf broom finish", 320, "sf", 11],
      ["Posts, beams and rafters, attached to the house", 1, "job", 7800],
      ["Roofing and flashing to match", 4, "sq", 525],
      ["Tongue-and-groove ceiling, stained", 320, "sf", 14],
      ["Electrical: two fans, lights and outlets", 1, "job", 2400],
      ["Fascia, trim and paint", 1, "job", 1900],
    ],
    [
      ["Permit", 0, 1],
      ["Slab", 10, 2],
      ["Framing", 17, 4],
      ["Roofing", 21, 2],
      ["Ceiling and electrical", 23, 3],
      ["Trim and paint", 26, 2],
    ],
  ),
  pkg(
    GC,
    "New Build",
    "Detached Garage / Shop",
    45,
    "A 24 by 30 detached garage on slab with an overhead door, a walk door, power and a metal roof.",
    [
      ["Plans, engineering and permit", 1, "job", 3800],
      ["Site prep and concrete slab with turned-down footing", 720, "sf", 12],
      ["Framing, walls and trusses", 720, "sf", 24],
      ["Metal roofing", 9, "sq", 475],
      ["Siding, trim and paint", 1, "job", 9800],
      ["16x8 insulated overhead door with opener", 1, "each", 3200],
      ["Walk door and two windows", 1, "job", 2600],
      ["Electrical: subpanel, outlets, lighting", 1, "job", 5400],
      ["Gutters and downspouts", 110, "lf", 11],
    ],
    [
      ["Plans and permit", 0, 1],
      ["Site prep and slab", 21, 4],
      ["Framing", 28, 8],
      ["Roofing", 36, 3],
      ["Siding, doors and windows", 39, 7],
      ["Electrical", 46, 3],
      ["Overhead door and gutters", 49, 2],
      ["Final inspection", 52, 1],
    ],
  ),
  pkg(
    GC,
    "New Build",
    "ADU / Casita",
    120,
    "A 600 square foot one-bedroom accessory dwelling: full kitchen and bath, mini-split, on its own slab.",
    [
      ["Plans, engineering and permits", 1, "job", 9500],
      ["Utilities: water, sewer and electrical to the unit", 1, "job", 12500],
      ["Foundation and slab", 600, "sf", 16],
      ["Framing, walls, roof and sheathing", 600, "sf", 38],
      ["Roofing", 8, "sq", 525],
      ["Windows and doors", 1, "job", 8200],
      ["Siding, trim and exterior paint", 1, "job", 14500],
      ["Plumbing, rough and finish", 1, "job", 13500],
      ["Electrical, rough and finish", 1, "job", 11500],
      ["Mini-split HVAC, two zones", 1, "job", 6800],
      ["Insulation and drywall", 1, "job", 12500],
      ["Kitchen: cabinets, counters, appliances", 1, "job", 16500],
      ["Bathroom: tile, fixtures, vanity", 1, "job", 9500],
      ["Interior doors, trim, paint and flooring", 1, "job", 14500],
    ],
    [
      ["Plans and permits", 0, 1],
      ["Utilities", 45, 5],
      ["Foundation", 50, 6],
      ["Framing", 58, 15],
      ["Roofing, windows and dry-in", 73, 6],
      ["Rough mechanical, electrical and plumbing", 79, 10],
      ["Inspections", 89, 1],
      ["Insulation and drywall", 90, 12],
      ["Exterior finish", 102, 10],
      ["Kitchen and bath", 112, 12],
      ["Trim, paint and flooring", 124, 12],
      ["Final inspection and punch list", 136, 3],
    ],
  ),
  generalRepair(
    GC,
    "General Repair",
    "Handyman Repair Day",
    "Two days of carpentry repairs: doors, trim, drywall, rot, hardware. Materials billed as used.",
  ),
  pkg(
    GC,
    "General Repair",
    "Water Damage Repair",
    5,
    "Dry out, remove and replace damaged drywall, insulation and trim after a leak, then paint.",
    [
      ["Demo of wet drywall, insulation and trim", 1, "job", 850],
      ["Drying equipment, 3 days", 3, "day", 180],
      ["Antimicrobial treatment", 1, "job", 350],
      ["Insulation replacement", 1, "job", 450],
      ["Drywall, hung and finished", 160, "sf", 4.5],
      ["Baseboard and trim replacement", 60, "lf", 9],
      ["Prime and paint affected rooms", 1, "job", 950],
    ],
    [
      ["Demo and drying", 0, 3],
      ["Drywall", 3, 2],
      ["Trim and paint", 5, 2],
    ],
  ),
  pkg(
    GC,
    "General Repair",
    "Rot & Siding Repair",
    3,
    "Replace rotted trim, fascia or siding sections, prime and paint to match.",
    [
      ["Remove rotted material and haul-off", 1, "job", 450],
      ["Fiber cement siding replacement", 120, "sf", 12],
      ["Trim and fascia replacement", 60, "lf", 14],
      ["Caulk, prime and paint to match", 1, "job", 850],
    ],
    [
      ["Demo and replacement", 0, 2],
      ["Paint", 2, 1],
    ],
  ),

  // Residential construction
  pkg(
    RC,
    "Whole-Home Remodel",
    "Whole-Home Refresh",
    20,
    "Paint, floors, lighting and fixtures through a 2,000 square foot home, no walls moved.",
    [
      ["Interior paint, walls, ceilings and trim", 2000, "sf", 3.75],
      ["Luxury vinyl plank flooring, supplied and installed", 1800, "sf", 7.5],
      ["Light fixtures and ceiling fans, 12 supplied and installed", 12, "each", 285],
      ["Plumbing fixtures: 3 faucets and 2 toilets", 1, "job", 2900],
      ["Interior doors and hardware, 10", 10, "each", 425],
      ["Baseboard replacement", 400, "lf", 8.5],
    ],
    [
      ["Order flooring, doors and fixtures", 0, 1],
      ["Doors and baseboard", 10, 4],
      ["Paint", 14, 6],
      ["Flooring", 20, 5],
      ["Fixtures and punch list", 25, 3],
    ],
  ),
  pkg(
    RC,
    "Whole-Home Remodel",
    "Full Gut Remodel",
    90,
    "Strip a 1,800 square foot home to the studs and rebuild: new systems, kitchen, two baths, finishes.",
    [
      ["Plans and permits", 1, "job", 6500],
      ["Demo to studs and haul-off", 1800, "sf", 6],
      ["Structural changes and framing", 1, "job", 14500],
      ["Electrical, rewire with new panel", 1, "job", 18500],
      ["Plumbing, repipe and new fixtures", 1, "job", 16500],
      ["HVAC system and ductwork", 1, "job", 14500],
      ["Insulation", 1, "job", 5200],
      ["Drywall, hung and finished", 6500, "sf", 3.25],
      ["Kitchen: cabinets, counters, backsplash, appliances", 1, "job", 32000],
      ["Two bathrooms: tile, fixtures, vanities", 1, "job", 24000],
      ["Interior doors, trim and paint", 1, "job", 16500],
      ["Flooring, supplied and installed", 1800, "sf", 8.5],
      ["Windows and exterior doors", 1, "job", 14500],
    ],
    [
      ["Plans and permits", 0, 1],
      ["Demo", 21, 5],
      ["Framing", 26, 10],
      ["Rough mechanical, electrical and plumbing", 36, 12],
      ["Windows and doors", 48, 4],
      ["Inspections", 52, 1],
      ["Insulation and drywall", 53, 14],
      ["Kitchen and baths", 67, 18],
      ["Trim, paint and flooring", 85, 15],
      ["Final inspection and punch list", 100, 5],
    ],
  ),
  roomAddition(RC, "Addition", "Primary Suite Addition"),
  basementFinish(RC, "Basement Finish"),
  pkg(
    RC,
    "Basement Finish",
    "Basement Bathroom Add",
    14,
    "A full bath in an existing finished basement, with a sewage ejector where needed.",
    [
      ["Saw-cut slab, trench and patch", 1, "job", 2400],
      ["Sewage ejector pit and pump", 1, "each", 2800],
      ["Plumbing rough-in and fixtures", 1, "job", 5200],
      ["Framing and drywall", 1, "job", 2600],
      ["Electrical: GFCI, light, fan", 1, "job", 1100],
      ["Shower, tile and door", 1, "job", 4800],
      ["Vanity, toilet and accessories", 1, "job", 1900],
      ["Paint and flooring", 1, "job", 1200],
      ["Permit and inspections", 1, "job", 600],
    ],
    [
      ["Permit", 0, 1],
      ["Saw-cut and plumbing rough", 7, 3],
      ["Framing and electrical", 10, 2],
      ["Drywall", 12, 4],
      ["Tile", 16, 3],
      ["Fixtures and paint", 19, 2],
    ],
  ),
  generalRepair(
    RC,
    "General Repair",
    "Handyman Repair Day",
    "Two days of carpentry repairs: doors, trim, drywall, rot, hardware. Materials billed as used.",
  ),
  pkg(
    RC,
    "General Repair",
    "Storm Damage Repair",
    7,
    "Tarp, then repair roof, fascia, siding, gutters and interior ceiling damage after a storm.",
    [
      ["Emergency tarp and dry-in", 1, "job", 650],
      ["Roof repair, shingles and flashing", 1, "job", 2800],
      ["Fascia, soffit and gutter replacement", 80, "lf", 22],
      ["Siding repair", 150, "sf", 12],
      ["Interior ceiling drywall and paint", 1, "job", 1650],
      ["Debris removal", 1, "job", 450],
    ],
    [
      ["Tarp and debris", 0, 1],
      ["Roof repair", 2, 2],
      ["Exterior repairs", 4, 2],
      ["Interior repairs", 6, 2],
    ],
  ),

  // Commercial construction
  pkg(
    CC,
    "Tenant Improvement",
    "Office Build-out",
    40,
    "A 2,500 square foot office: demising walls, offices, break room, ACT ceiling, lighting, HVAC and finishes.",
    [
      ["Plans, engineering and permit", 1, "job", 8500],
      ["Demo and haul-off", 2500, "sf", 3],
      ["Metal stud framing and drywall", 2500, "sf", 14],
      ["Acoustic ceiling grid and tile", 2500, "sf", 5.5],
      ["Electrical: lighting, power, data rough", 2500, "sf", 11],
      ["HVAC: diffusers, ductwork, controls", 2500, "sf", 8],
      ["Fire sprinkler modifications", 2500, "sf", 3.5],
      ["Plumbing: break room sink and restroom work", 1, "job", 6800],
      ["Doors, frames and hardware, 8", 8, "each", 1150],
      ["Paint", 2500, "sf", 2.25],
      ["Carpet tile and LVT flooring", 2500, "sf", 6.5],
      ["Break room cabinets and counter", 1, "job", 5200],
    ],
    [
      ["Permit", 0, 1],
      ["Demo", 21, 3],
      ["Framing", 24, 8],
      ["Rough mechanical, electrical, plumbing, sprinkler", 32, 10],
      ["Inspections", 42, 1],
      ["Drywall and ceiling grid", 43, 8],
      ["Paint", 51, 4],
      ["Flooring, doors and trim-out", 55, 6],
      ["Final inspection", 61, 1],
    ],
  ),
  pkg(
    CC,
    "Tenant Improvement",
    "Retail Build-out",
    35,
    "A 1,800 square foot retail space: storefront ready, sales floor, stockroom, restroom, lighting and finishes.",
    [
      ["Plans and permit", 1, "job", 6500],
      ["Demo and haul-off", 1800, "sf", 3],
      ["Framing and drywall", 1800, "sf", 12],
      ["Electrical: track and recessed lighting, power", 1800, "sf", 12],
      ["HVAC adjustments", 1, "job", 7800],
      ["ADA restroom, fixtures and finishes", 1, "job", 9500],
      ["Doors, frames and hardware", 4, "each", 1150],
      ["Paint", 1800, "sf", 2.25],
      ["Polished concrete or LVT flooring", 1800, "sf", 6],
      ["Fire alarm and sprinkler modifications", 1, "job", 5500],
    ],
    [
      ["Permit", 0, 1],
      ["Demo", 18, 2],
      ["Framing and rough-in", 20, 10],
      ["Inspections", 30, 1],
      ["Drywall and paint", 31, 8],
      ["Flooring, restroom and trim-out", 39, 7],
      ["Final inspection", 46, 1],
    ],
  ),
  pkg(
    CC,
    "New Build",
    "Metal Building Shell",
    75,
    "A 5,000 square foot pre-engineered metal building on slab, with doors, insulation and basic electrical.",
    [
      ["Plans, engineering and permit", 1, "job", 14500],
      ["Site prep and grading", 1, "job", 18500],
      ["Concrete slab and footings", 5000, "sf", 9.5],
      ["Pre-engineered metal building, supplied and erected", 5000, "sf", 32],
      ["Insulation, roof and walls", 5000, "sf", 2.75],
      ["Overhead doors, 2, and walk doors, 2", 1, "job", 14500],
      ["Electrical service and basic lighting", 1, "job", 22000],
      ["Gutters and downspouts", 300, "lf", 12],
    ],
    [
      ["Plans and permit", 0, 1],
      ["Site prep", 30, 5],
      ["Slab", 36, 8],
      ["Building erection", 50, 15],
      ["Doors and insulation", 65, 6],
      ["Electrical", 71, 8],
      ["Final inspection", 80, 1],
    ],
  ),
  pkg(
    CC,
    "Repair & Maintenance",
    "Commercial Repair Call",
    1,
    "A service visit for doors, drywall, ceiling tile, fixtures or minor plumbing and electrical.",
    [
      ["Trip charge", 1, "each", 125],
      ["Technician", 4, "hour", 110],
      ["Materials allowance", 1, "allowance", 350],
    ],
    [["Service visit", 0, 1]],
  ),

  // Outdoor construction
  pkg(
    OC,
    "Deck Construction",
    "Composite Deck",
    10,
    "A 300 square foot composite deck with aluminum railing, stairs and footings.",
    [
      ["Plans and permit", 1, "job", 850],
      ["Footings and treated frame", 300, "sf", 22],
      ["Composite decking, supplied and installed", 300, "sf", 24],
      ["Aluminum railing, supplied and installed", 60, "lf", 85],
      ["Stairs, 4 treads", 1, "set", 1450],
      ["Ledger flashing and hardware", 1, "job", 650],
    ],
    [
      ["Permit", 0, 1],
      ["Footings", 7, 1],
      ["Framing", 8, 3],
      ["Decking", 11, 3],
      ["Railing and stairs", 14, 2],
      ["Inspection", 16, 1],
    ],
  ),
  pkg(
    OC,
    "Deck Construction",
    "Treated Wood Deck",
    8,
    "A 300 square foot pressure-treated deck with wood railing and stairs.",
    [
      ["Plans and permit", 1, "job", 850],
      ["Footings and treated frame", 300, "sf", 20],
      ["Treated decking, installed", 300, "sf", 12],
      ["Wood railing, installed", 60, "lf", 48],
      ["Stairs, 4 treads", 1, "set", 1100],
      ["Stain and seal", 1, "job", 950],
    ],
    [
      ["Permit", 0, 1],
      ["Footings and framing", 7, 3],
      ["Decking, railing and stairs", 10, 4],
      ["Stain", 21, 1],
    ],
  ),
  pkg(
    OC,
    "Concrete & Patio",
    "Stamped Concrete Patio",
    4,
    "A 400 square foot stamped and colored concrete patio with sealed finish.",
    [
      ["Excavation and base", 400, "sf", 3.5],
      ["Forms, rebar and 4-inch pour", 400, "sf", 9],
      ["Stamp pattern, color and release", 400, "sf", 6.5],
      ["Saw-cut joints and sealer", 400, "sf", 1.75],
    ],
    [
      ["Excavation and forms", 0, 1],
      ["Pour and stamp", 1, 1],
      ["Cut joints", 2, 1],
      ["Seal", 7, 1],
    ],
  ),
  pkg(
    OC,
    "Concrete & Patio",
    "Concrete Driveway",
    5,
    "Tear out and replace a 600 square foot driveway, broom finish with control joints.",
    [
      ["Demo and haul-off of existing driveway", 600, "sf", 3],
      ["Base and grading", 600, "sf", 2.5],
      ["Forms, rebar and 4-inch pour, broom finish", 600, "sf", 9.5],
      ["Saw-cut control joints", 1, "job", 350],
      ["Apron and sidewalk tie-in", 1, "job", 650],
    ],
    [
      ["Demo", 0, 1],
      ["Base and forms", 1, 1],
      ["Pour", 2, 1],
      ["Cut joints and strip forms", 3, 1],
    ],
  ),
  pkg(
    OC,
    "Outdoor Kitchen",
    "Outdoor Kitchen",
    15,
    "A 12-foot L-shaped outdoor kitchen: block base, stone veneer, granite counter, built-in grill, sink and fridge, gas and power.",
    [
      ["Concrete footing and slab", 1, "job", 1800],
      ["Block base and stone veneer", 12, "lf", 425],
      ["Granite countertop, fabricated and installed", 36, "sf", 110],
      ["Built-in gas grill, 36-inch, supplied and installed", 1, "each", 3200],
      ["Outdoor fridge and access doors", 1, "job", 2400],
      ["Sink, faucet and plumbing", 1, "job", 1900],
      ["Gas line and electrical", 1, "job", 2800],
    ],
    [
      ["Slab", 0, 2],
      ["Gas and electrical rough", 5, 2],
      ["Block and veneer", 7, 5],
      ["Counter template", 12, 1],
      ["Counter and appliances", 19, 2],
      ["Plumbing and trim-out", 21, 1],
    ],
  ),
  pkg(
    OC,
    "Pergola & Shade",
    "Cedar Pergola",
    5,
    "A 12 by 16 freestanding cedar pergola on concrete footings, stained.",
    [
      ["Footings, 4", 4, "each", 285],
      ["Cedar posts, beams and rafters, built", 192, "sf", 42],
      ["Hardware and post bases", 1, "job", 450],
      ["Stain and seal", 1, "job", 850],
    ],
    [
      ["Footings", 0, 1],
      ["Build", 3, 2],
      ["Stain", 5, 1],
    ],
  ),
  pkg(
    OC,
    "Pergola & Shade",
    "Covered Patio",
    15,
    "A 16 by 20 attached patio cover with a shingle roof, ceiling, fan and lights over an existing slab.",
    [
      ["Plans and permit", 1, "job", 1800],
      ["Posts, beams and rafters, attached to the house", 1, "job", 7800],
      ["Roofing and flashing to match", 4, "sq", 525],
      ["Tongue-and-groove ceiling, stained", 320, "sf", 14],
      ["Electrical: two fans, lights and outlets", 1, "job", 2400],
      ["Fascia, trim and paint", 1, "job", 1900],
    ],
    [
      ["Permit", 0, 1],
      ["Framing", 10, 4],
      ["Roofing", 14, 2],
      ["Ceiling and electrical", 16, 3],
      ["Trim and paint", 19, 2],
    ],
  ),

  // Kitchen remodeling
  kitchenRemodel(KR, "Kitchen Remodel"),
  pkg(
    KR,
    "Kitchen Remodel",
    "Kitchen Refresh",
    8,
    "Keep the layout: paint the cabinets, new counters, backsplash, sink, faucet, hardware and lighting.",
    [
      ["Cabinet painting, doors and boxes, sprayed", 1, "job", 4800],
      ["Quartz countertops, fabricated and installed", 45, "sf", 95],
      ["Tile backsplash, supplied and installed", 30, "sf", 38],
      ["Undermount sink, faucet and disposal, installed", 1, "job", 950],
      ["Cabinet hardware, 40 pieces", 40, "each", 12],
      ["Under-cabinet and pendant lighting", 1, "job", 950],
      ["Counter demo and haul-off", 1, "job", 450],
    ],
    [
      ["Order counters and tile", 0, 1],
      ["Cabinet painting", 7, 4],
      ["Counter template", 11, 1],
      ["Counter install", 18, 1],
      ["Backsplash, plumbing and lighting", 19, 2],
    ],
  ),
  pkg(
    KR,
    "Cabinet & Counter Refresh",
    "Cabinet Reface & Quartz",
    10,
    "New doors, drawer fronts and veneer on existing boxes, with quartz counters and a new sink.",
    [
      ["Cabinet refacing, doors, fronts and veneer", 22, "lf", 290],
      ["Soft-close hinges and drawer glides", 1, "job", 850],
      ["Quartz countertops, fabricated and installed", 45, "sf", 95],
      ["Undermount sink, faucet and disposal, installed", 1, "job", 950],
      ["Counter demo and haul-off", 1, "job", 450],
    ],
    [
      ["Measure and order", 0, 1],
      ["Refacing", 14, 4],
      ["Counter template", 18, 1],
      ["Counter and plumbing", 25, 2],
    ],
  ),
  pkg(
    KR,
    "Cabinet & Counter Refresh",
    "Countertop Replacement",
    3,
    "Replace laminate counters with quartz, new sink and faucet.",
    [
      ["Counter demo and haul-off", 1, "job", 450],
      ["Quartz countertops, fabricated and installed", 45, "sf", 95],
      ["Undermount sink, faucet and disposal, installed", 1, "job", 950],
      ["Plywood substrate where needed", 1, "job", 350],
    ],
    [
      ["Template", 0, 1],
      ["Demo and install", 7, 1],
      ["Plumbing reconnect", 8, 1],
    ],
  ),
  pkg(
    KR,
    "Backsplash & Finishes",
    "Backsplash & Fixtures",
    3,
    "A tile backsplash with new faucet, hardware and lighting.",
    [
      ["Tile backsplash, supplied and installed", 30, "sf", 38],
      ["Faucet, supplied and installed", 1, "each", 425],
      ["Cabinet hardware, 40 pieces", 40, "each", 12],
      ["Under-cabinet LED lighting", 1, "job", 650],
      ["Caulk and touch-up paint", 1, "job", 250],
    ],
    [
      ["Tile", 0, 2],
      ["Fixtures and lighting", 2, 1],
    ],
  ),

  // Bathroom remodeling
  bathroomRemodel(BR, "Bathroom Remodel", "Hall Bath Remodel"),
  pkg(
    BR,
    "Bathroom Remodel",
    "Primary Bath Remodel",
    18,
    "Walk-in tile shower with glass, freestanding tub, double vanity, tile floor, lighting, fan and paint.",
    [
      ["Demo to studs and haul-off", 1, "job", 1800],
      ["Rough plumbing: shower, tub filler, double vanity", 1, "job", 3400],
      ["Electrical: outlets, vanity lights, fan, recessed cans", 1, "job", 1800],
      ["Shower pan, curb and waterproofing", 1, "job", 1600],
      ["Wall tile, supplied and installed", 140, "sf", 34],
      ["Floor tile, supplied and installed", 90, "sf", 28],
      ["Freestanding tub and filler, supplied and installed", 1, "each", 3200],
      ["Double vanity with top, faucets and mirrors", 1, "each", 3800],
      ["Toilet, installed", 1, "each", 525],
      ["Frameless glass enclosure", 1, "each", 2400],
      ["Shower trim, accessories and hardware", 1, "job", 1250],
      ["Drywall, prime and paint", 1, "job", 1200],
      ["Permit and inspections", 1, "job", 450],
    ],
    [
      ["Order tile, vanity, tub and fixtures", 0, 1],
      ["Demo", 14, 2],
      ["Rough plumbing and electrical", 16, 3],
      ["Waterproofing", 19, 1],
      ["Tile", 20, 5],
      ["Drywall and paint", 25, 2],
      ["Vanity, tub, toilet and trim", 27, 3],
      ["Glass and punch list", 35, 1],
    ],
  ),
  showerConversion(BR, "Shower / Tub Conversion"),
  pkg(
    BR,
    "Shower / Tub Conversion",
    "Walk-in Shower, Acrylic",
    3,
    "Replace a tub with a low-threshold acrylic shower base and wall system, new valve and door.",
    [
      ["Remove tub and surround, haul-off", 1, "job", 650],
      ["Rough plumbing: new valve and drain", 1, "job", 1100],
      ["Acrylic base and wall system, supplied and installed", 1, "each", 3400],
      ["Valve trim and hand shower", 1, "job", 550],
      ["Semi-frameless glass door", 1, "each", 1100],
      ["Drywall patch and paint", 1, "job", 400],
    ],
    [
      ["Demo and plumbing", 0, 1],
      ["Base and walls", 1, 1],
      ["Door and trim", 2, 1],
    ],
  ),
  pkg(
    BR,
    "Vanity & Fixtures",
    "Vanity & Fixture Swap",
    2,
    "New vanity, faucet, mirror, light, toilet and accessories in a day or two.",
    [
      ["Remove and haul-off old vanity and toilet", 1, "job", 250],
      ["Vanity with top, faucet and mirror, supplied and installed", 1, "each", 1650],
      ["Toilet, supplied and installed", 1, "each", 525],
      ["Vanity light and exhaust fan", 1, "job", 650],
      ["Towel bars, paper holder and hooks", 1, "job", 225],
      ["Caulk and touch-up paint", 1, "job", 200],
    ],
    [
      ["Demo and install", 0, 1],
      ["Electrical and accessories", 1, 1],
    ],
  ),

  // Electrical
  pkg(
    "electrical",
    "Service Call / Repair",
    "Service Call",
    1,
    "Diagnose and repair an outlet, switch, breaker or circuit problem.",
    [
      ["Service call and diagnosis", 1, "each", 145],
      ["Electrician", 2, "hour", 115],
      ["Materials allowance", 1, "allowance", 120],
    ],
    [["Service visit", 0, 1]],
  ),
  pkg(
    "electrical",
    "Service Call / Repair",
    "Outlets & Switches",
    1,
    "Add or replace up to six outlets and switches, GFCI where required.",
    [
      ["Electrician", 5, "hour", 115],
      ["GFCI and standard devices, plates", 6, "each", 28],
      ["Wire and boxes", 1, "allowance", 160],
    ],
    [["Install", 0, 1]],
  ),
  pkg(
    "electrical",
    "Panel Upgrade",
    "200A Panel Upgrade",
    2,
    "Replace the main panel with a 200-amp panel, new meter base and grounding, with permit and inspection.",
    [
      ["200A panel, breakers, meter base and grounding", 1, "job", 2600],
      ["Electrician", 14, "hour", 115],
      ["Permit, inspection and utility coordination", 1, "job", 350],
      ["Surge protector", 1, "each", 285],
    ],
    [
      ["Permit and utility", 0, 1],
      ["Panel change", 7, 1],
      ["Inspection", 8, 1],
    ],
  ),
  pkg(
    "electrical",
    "Panel Upgrade",
    "EV Charger Circuit",
    1,
    "A 50-amp circuit and NEMA 14-50 outlet or hardwired charger in the garage.",
    [
      ["Electrician", 5, "hour", 115],
      ["Breaker, 6-gauge wire, conduit and outlet", 1, "job", 420],
      ["Permit and inspection", 1, "job", 185],
    ],
    [["Install", 0, 1]],
  ),
  pkg(
    "electrical",
    "Rewire",
    "Whole-House Rewire",
    10,
    "Rewire a 1,500 square foot home with new circuits, devices, panel and smoke detectors, patching as needed.",
    [
      ["Rewire, 1,500 sf, labor and wire", 1500, "sf", 9.5],
      ["200A panel and service", 1, "job", 2900],
      ["Devices, plates and fixtures allowance", 1, "allowance", 1400],
      ["Smoke and CO detectors, 6", 6, "each", 85],
      ["Drywall patching", 1, "job", 1800],
      ["Permit and inspections", 1, "job", 450],
    ],
    [
      ["Permit", 0, 1],
      ["Rough wiring", 7, 6],
      ["Rough inspection", 13, 1],
      ["Devices and panel", 14, 2],
      ["Patching and final", 16, 2],
    ],
  ),
  pkg(
    "electrical",
    "Lighting & Fixtures",
    "Recessed Lighting, 8 Cans",
    1,
    "Eight LED recessed lights on a dimmer in one room, patched and ready for paint.",
    [
      ["LED recessed lights, 6-inch", 8, "each", 65],
      ["Electrician", 7, "hour", 115],
      ["Dimmer and wire", 1, "job", 140],
      ["Drywall patch", 1, "job", 250],
    ],
    [["Install", 0, 1]],
  ),
  pkg(
    "electrical",
    "Lighting & Fixtures",
    "Ceiling Fan Install",
    1,
    "Hang a ceiling fan on a new fan-rated box with a wall control.",
    [
      ["Electrician", 2.5, "hour", 115],
      ["Fan-rated box and control", 1, "job", 95],
    ],
    [["Install", 0, 1]],
  ),

  // Plumbing
  pkg(
    "plumbing",
    "Service Call / Repair",
    "Drain Clearing",
    1,
    "Clear a clogged drain line with a cable machine, with a camera look where needed.",
    [
      ["Service call", 1, "each", 125],
      ["Cable machine, main or branch line", 1, "each", 285],
      ["Camera inspection", 1, "each", 195],
    ],
    [["Service visit", 0, 1]],
  ),
  pkg(
    "plumbing",
    "Service Call / Repair",
    "Leak Repair",
    1,
    "Find and fix a supply or drain leak, including access and parts.",
    [
      ["Service call", 1, "each", 125],
      ["Plumber", 3, "hour", 125],
      ["Parts allowance", 1, "allowance", 180],
    ],
    [["Service visit", 0, 1]],
  ),
  pkg(
    "plumbing",
    "Water Heater",
    "50-Gallon Tank Water Heater",
    1,
    "Replace a tank water heater with a 50-gallon gas or electric unit, pan, valves and haul-off.",
    [
      ["50-gallon water heater", 1, "each", 1350],
      ["Install, pan, valves, flex lines, expansion tank", 1, "job", 850],
      ["Haul-off and permit", 1, "job", 185],
    ],
    [["Replace", 0, 1]],
  ),
  pkg(
    "plumbing",
    "Water Heater",
    "Tankless Water Heater",
    2,
    "Convert to a gas tankless unit with new gas line, venting and condensate.",
    [
      ["Tankless gas water heater", 1, "each", 2400],
      ["Install, venting, gas line and condensate", 1, "job", 1900],
      ["Electrical outlet", 1, "job", 285],
      ["Haul-off and permit", 1, "job", 225],
    ],
    [["Install", 0, 2]],
  ),
  pkg(
    "plumbing",
    "Repipe",
    "PEX Repipe, 2-Bath Home",
    4,
    "Replace all supply lines with PEX through a two-bath home, with drywall patching.",
    [
      ["PEX repipe, labor and material", 1, "job", 7800],
      ["New stops and supply lines at fixtures", 1, "job", 650],
      ["Drywall patching", 1, "job", 1400],
      ["Permit and inspection", 1, "job", 350],
    ],
    [
      ["Repipe", 0, 2],
      ["Inspection", 2, 1],
      ["Patching", 3, 2],
    ],
  ),
  pkg(
    "plumbing",
    "Fixture Install",
    "Toilet & Faucet Swap",
    1,
    "Replace a toilet and a bathroom faucet, owner-supplied or ours.",
    [
      ["Toilet, supplied and installed", 1, "each", 525],
      ["Bathroom faucet, supplied and installed", 1, "each", 385],
      ["Supply lines and stops", 1, "job", 85],
    ],
    [["Install", 0, 1]],
  ),

  // HVAC
  pkg(
    "hvac",
    "System Replacement",
    "3-Ton Split System",
    2,
    "Replace a 3-ton condenser, air handler and coil, 16 SEER, with a new thermostat and pad.",
    [
      ["3-ton 16 SEER condenser, air handler and coil", 1, "each", 7200],
      ["Install: refrigerant lines, pad, disconnect, drain", 1, "job", 2400],
      ["Smart thermostat", 1, "each", 285],
      ["Haul-off, permit and startup", 1, "job", 450],
    ],
    [["Install", 0, 2]],
  ),
  pkg(
    "hvac",
    "System Replacement",
    "Heat Pump System",
    2,
    "Replace a split system with a 3-ton heat pump and air handler.",
    [
      ["3-ton heat pump and air handler", 1, "each", 8400],
      ["Install: lines, pad, disconnect, drain, electrical", 1, "job", 2600],
      ["Smart thermostat", 1, "each", 285],
      ["Haul-off, permit and startup", 1, "job", 450],
    ],
    [["Install", 0, 2]],
  ),
  pkg(
    "hvac",
    "Repair",
    "Diagnostic & Repair",
    1,
    "Diagnose a no-cool or no-heat call and repair it: capacitor, contactor, motor or refrigerant.",
    [
      ["Diagnostic visit", 1, "each", 125],
      ["Technician", 2, "hour", 125],
      ["Parts allowance", 1, "allowance", 320],
    ],
    [["Service visit", 0, 1]],
  ),
  pkg(
    "hvac",
    "Maintenance",
    "Seasonal Tune-up",
    1,
    "Clean coils, check refrigerant, test components and change the filter.",
    [
      ["Tune-up, one system", 1, "each", 165],
      ["Filter", 1, "each", 28],
    ],
    [["Service visit", 0, 1]],
  ),
  pkg(
    "hvac",
    "Ductwork",
    "Duct Replacement",
    3,
    "Replace the attic ductwork with new insulated flex, plenums and registers, sealed.",
    [
      ["Ductwork, R-8 flex, plenums and boots", 1, "job", 5800],
      ["Registers and grilles", 12, "each", 45],
      ["Seal and balance", 1, "job", 650],
      ["Haul-off", 1, "job", 250],
    ],
    [["Replace ductwork", 0, 3]],
  ),

  // Roofing
  pkg(
    "roofing",
    "Roof Replacement",
    "Architectural Shingle Roof",
    3,
    "Tear off and replace a 25-square roof with architectural shingles, synthetic underlayment, ice and water, and new vents.",
    [
      ["Tear-off and haul-off, one layer", 25, "sq", 85],
      ["Architectural shingles, supplied and installed", 25, "sq", 365],
      ["Synthetic underlayment", 25, "sq", 38],
      ["Ice and water shield, valleys and eaves", 200, "lf", 3.5],
      ["Drip edge", 220, "lf", 2.75],
      ["Ridge vent and cap", 60, "lf", 12],
      ["Pipe boots and flashing", 1, "job", 450],
      ["Decking replacement allowance", 4, "sheet", 95],
      ["Permit", 1, "job", 250],
    ],
    [
      ["Material delivery", 0, 1],
      ["Tear-off and dry-in", 1, 1],
      ["Shingles", 2, 2],
      ["Cleanup and magnet sweep", 3, 1],
    ],
  ),
  pkg(
    "roofing",
    "Roof Replacement",
    "Standing Seam Metal Roof",
    6,
    "Tear off and replace a 25-square roof with 24-gauge standing seam panels and matching trim.",
    [
      ["Tear-off and haul-off, one layer", 25, "sq", 85],
      ["Standing seam panels, 24-gauge, supplied and installed", 25, "sq", 1150],
      ["Synthetic underlayment, high-temp", 25, "sq", 65],
      ["Ridge, eave, rake and valley trim", 1, "job", 2800],
      ["Pipe boots and flashing", 1, "job", 650],
      ["Decking replacement allowance", 4, "sheet", 95],
      ["Permit", 1, "job", 250],
    ],
    [
      ["Tear-off and dry-in", 0, 1],
      ["Panels", 1, 4],
      ["Trim and cleanup", 5, 1],
    ],
  ),
  pkg(
    "roofing",
    "Roof Repair",
    "Leak Repair",
    1,
    "Find and repair a roof leak: flashing, boots, a few shingles and sealant.",
    [
      ["Inspection and leak repair, up to 2 hours", 1, "each", 385],
      ["Shingles, flashing and sealant", 1, "allowance", 150],
    ],
    [["Repair", 0, 1]],
  ),
  pkg(
    "roofing",
    "Roof Repair",
    "Storm Damage Repair",
    2,
    "Replace wind-damaged shingles, ridge and flashing across several areas, with a tarp first if needed.",
    [
      ["Emergency tarp", 1, "job", 350],
      ["Shingle replacement", 3, "sq", 425],
      ["Ridge cap replacement", 40, "lf", 14],
      ["Flashing and boots", 1, "job", 450],
    ],
    [
      ["Tarp", 0, 1],
      ["Repairs", 2, 1],
    ],
  ),
  pkg(
    "roofing",
    "Gutters",
    "Seamless Gutters",
    1,
    "150 feet of 5-inch seamless aluminum gutters with downspouts and guards.",
    [
      ["5-inch seamless aluminum gutter, installed", 150, "lf", 11],
      ["3x4 downspouts", 6, "each", 95],
      ["Gutter guards", 150, "lf", 8],
      ["Removal of old gutters", 150, "lf", 2],
    ],
    [["Install", 0, 1]],
  ),

  // Flooring
  pkg(
    "flooring",
    "Flooring Installation",
    "Luxury Vinyl Plank, 1,000 sf",
    3,
    "Tear out carpet, prep the subfloor and install 1,000 square feet of LVP with new base.",
    [
      ["Carpet and pad removal, haul-off", 1000, "sf", 0.75],
      ["Subfloor prep and leveling", 1000, "sf", 0.85],
      ["Luxury vinyl plank, supplied and installed", 1000, "sf", 6.75],
      ["Transitions and quarter round", 1, "job", 650],
      ["Move and reset furniture", 1, "job", 350],
    ],
    [
      ["Tear-out and prep", 0, 1],
      ["Install", 1, 2],
    ],
  ),
  pkg(
    "flooring",
    "Flooring Installation",
    "Hardwood, 600 sf",
    5,
    "Install 600 square feet of 3/4-inch solid oak, site-finished.",
    [
      ["Existing flooring removal", 600, "sf", 1],
      ["Solid oak 3/4-inch, supplied and installed", 600, "sf", 9.5],
      ["Sand, stain and three coats of finish", 600, "sf", 4.25],
      ["Transitions and base shoe", 1, "job", 550],
    ],
    [
      ["Removal and install", 0, 2],
      ["Sand and finish", 2, 3],
    ],
  ),
  pkg(
    "flooring",
    "Flooring Installation",
    "Tile Floor, 400 sf",
    4,
    "Porcelain tile over cement board in a kitchen and entry, with new base.",
    [
      ["Existing flooring removal", 400, "sf", 1.25],
      ["Cement board or decoupling membrane", 400, "sf", 2.5],
      ["Porcelain tile, supplied and installed", 400, "sf", 13],
      ["Grout, seal and transitions", 1, "job", 550],
    ],
    [
      ["Removal and prep", 0, 1],
      ["Tile", 1, 2],
      ["Grout and seal", 3, 1],
    ],
  ),
  pkg(
    "flooring",
    "Refinish",
    "Hardwood Refinish, 600 sf",
    4,
    "Sand existing hardwood to bare wood, stain and apply three coats of finish.",
    [
      ["Sand, stain and three coats of finish", 600, "sf", 4.75],
      ["Board replacement allowance", 1, "allowance", 350],
      ["Base shoe removal and reinstall", 1, "job", 300],
    ],
    [["Sand and finish", 0, 4]],
  ),
  pkg(
    "flooring",
    "Repair",
    "Subfloor & Flooring Repair",
    2,
    "Replace a damaged section of subfloor and patch the flooring to match.",
    [
      ["Remove damaged flooring and subfloor", 1, "job", 450],
      ["Subfloor replacement", 64, "sf", 8],
      ["Flooring patch to match", 64, "sf", 12],
    ],
    [["Repair", 0, 2]],
  ),

  // Landscaping
  pkg(
    "landscaping",
    "Landscape Install",
    "Front Yard Install",
    5,
    "Beds, shrubs, trees, mulch, edging and sod for an average front yard, with drip irrigation.",
    [
      ["Bed prep, grading and soil", 1, "job", 1400],
      ["Shrubs, 5-gallon", 18, "each", 65],
      ["Trees, 15-gallon", 2, "each", 325],
      ["Mulch, installed", 6, "yard", 95],
      ["Steel edging", 120, "lf", 9],
      ["Sod, supplied and installed", 1200, "sf", 1.35],
      ["Drip irrigation for beds", 1, "job", 1100],
    ],
    [
      ["Prep and grading", 0, 1],
      ["Irrigation", 1, 1],
      ["Plants and mulch", 2, 2],
      ["Sod", 4, 1],
    ],
  ),
  pkg(
    "landscaping",
    "Irrigation",
    "Sprinkler System, 6 Zones",
    3,
    "A six-zone sprinkler system with smart controller, backflow and rain sensor.",
    [
      ["Sprinkler system, 6 zones, installed", 6, "zone", 850],
      ["Smart controller and rain sensor", 1, "each", 385],
      ["Backflow preventer and permit", 1, "job", 650],
    ],
    [
      ["Trenching and pipe", 0, 2],
      ["Heads, controller and test", 2, 1],
    ],
  ),
  pkg(
    "landscaping",
    "Hardscape",
    "Paver Patio",
    4,
    "A 300 square foot paver patio on compacted base with edge restraint and polymeric sand.",
    [
      ["Excavation and compacted base", 300, "sf", 5],
      ["Pavers, supplied and installed", 300, "sf", 16],
      ["Edge restraint and polymeric sand", 1, "job", 650],
    ],
    [
      ["Excavation and base", 0, 2],
      ["Pavers", 2, 2],
    ],
  ),
  pkg(
    "landscaping",
    "Maintenance",
    "Monthly Maintenance",
    1,
    "Mow, edge, trim, blow and bed care, four visits a month.",
    [
      ["Mow, edge and blow", 4, "visit", 65],
      ["Shrub trimming and bed weeding", 1, "visit", 145],
    ],
    [["First visit", 0, 1]],
  ),

  // Solar
  pkg(
    "solar",
    "Solar Install",
    "8 kW Rooftop Solar",
    3,
    "An 8 kW rooftop system, 20 panels, with microinverters, monitoring, permit and interconnection.",
    [
      ["Panels, 400W, 20", 20, "each", 285],
      ["Microinverters and racking", 1, "job", 4800],
      ["Installation labor", 1, "job", 5200],
      ["Electrical: disconnect, conduit, panel work", 1, "job", 2400],
      ["Permit, engineering and interconnection", 1, "job", 1800],
    ],
    [
      ["Permit and engineering", 0, 1],
      ["Install", 30, 2],
      ["Inspection and permission to operate", 35, 1],
    ],
  ),
  pkg(
    "solar",
    "Battery Storage",
    "13 kWh Battery",
    2,
    "A 13.5 kWh battery with backup gateway and critical loads panel.",
    [
      ["Battery and gateway", 1, "each", 11500],
      ["Installation and electrical", 1, "job", 3200],
      ["Permit and inspection", 1, "job", 650],
    ],
    [["Install", 0, 2]],
  ),
  pkg(
    "solar",
    "Service & Repair",
    "Solar Service Call",
    1,
    "Diagnose a production drop or inverter fault and repair it.",
    [
      ["Service call and diagnosis", 1, "each", 225],
      ["Technician", 2, "hour", 125],
      ["Parts allowance", 1, "allowance", 250],
    ],
    [["Service visit", 0, 1]],
  ),

  // Handyman
  pkg(
    "handyman",
    "General Repair",
    "Half-Day Handyman",
    1,
    "Four hours of repairs and small jobs around the house.",
    [
      ["Handyman", 4, "hour", 85],
      ["Materials allowance", 1, "allowance", 120],
    ],
    [["Visit", 0, 1]],
  ),
  pkg(
    "handyman",
    "General Repair",
    "Full-Day Handyman",
    1,
    "Eight hours of repairs and small jobs around the house.",
    [
      ["Handyman", 8, "hour", 85],
      ["Materials allowance", 1, "allowance", 240],
    ],
    [["Visit", 0, 1]],
  ),
  pkg(
    "handyman",
    "Interior Painting",
    "Two Rooms, Walls & Trim",
    2,
    "Prep, patch and paint the walls and trim of two average rooms.",
    [
      ["Walls, two coats", 800, "sf", 2.25],
      ["Trim and doors", 1, "job", 450],
      ["Patching and prep", 1, "job", 250],
      ["Paint and supplies", 1, "allowance", 320],
    ],
    [["Paint", 0, 2]],
  ),
  pkg(
    "handyman",
    "Exterior Painting",
    "Trim & Doors",
    2,
    "Scrape, prime and paint exterior trim, fascia and doors.",
    [
      ["Exterior trim and fascia", 250, "lf", 6.5],
      ["Exterior doors, 2", 2, "each", 225],
      ["Scrape, caulk and prime", 1, "job", 450],
      ["Paint and supplies", 1, "allowance", 280],
    ],
    [["Paint", 0, 2]],
  ),
  pkg(
    "handyman",
    "Assembly & Install",
    "TV Mount & Furniture",
    1,
    "Mount a TV with hidden wiring and assemble two pieces of furniture.",
    [
      ["TV mount, supplied and installed, wires concealed", 1, "each", 285],
      ["Furniture assembly", 2, "each", 95],
    ],
    [["Visit", 0, 1]],
  ),

  // Garage door
  pkg(
    "garage-door",
    "Door Replacement",
    "16x7 Insulated Door",
    1,
    "Replace a double garage door with an insulated steel door, new tracks, springs and seals.",
    [
      ["16x7 insulated steel door, supplied and installed", 1, "each", 2400],
      ["Tracks, springs, rollers and weatherseal", 1, "job", 450],
      ["Haul-off", 1, "job", 95],
    ],
    [["Replace", 0, 1]],
  ),
  pkg(
    "garage-door",
    "Opener Install",
    "Belt-Drive Opener",
    1,
    "A quiet belt-drive opener with Wi-Fi, two remotes and a keypad.",
    [
      ["Belt-drive opener, supplied and installed", 1, "each", 650],
      ["Keypad and extra remote", 1, "job", 85],
    ],
    [["Install", 0, 1]],
  ),
  pkg(
    "garage-door",
    "Repair",
    "Spring Replacement",
    1,
    "Replace both torsion springs, balance the door and lube the hardware.",
    [
      ["Torsion springs, pair, installed", 1, "set", 385],
      ["Service call and tune-up", 1, "each", 95],
    ],
    [["Repair", 0, 1]],
  ),

  // Fence
  pkg(
    "fence-services",
    "New Fence",
    "Cedar Privacy Fence",
    3,
    "150 feet of 6-foot cedar privacy fence on steel posts with one gate.",
    [
      ["6-foot cedar privacy fence on steel posts, installed", 150, "lf", 42],
      ["Walk gate, 4-foot", 1, "each", 450],
      ["Old fence removal and haul-off", 150, "lf", 5],
    ],
    [
      ["Posts", 0, 1],
      ["Rails, pickets and gate", 1, 2],
    ],
  ),
  pkg(
    "fence-services",
    "New Fence",
    "Chain Link Fence",
    2,
    "150 feet of 4-foot galvanized chain link with one gate.",
    [
      ["4-foot chain link, installed", 150, "lf", 22],
      ["Walk gate", 1, "each", 285],
    ],
    [
      ["Posts", 0, 1],
      ["Fabric and gate", 1, 1],
    ],
  ),
  pkg(
    "fence-services",
    "Fence Repair",
    "Section Repair",
    1,
    "Replace leaning posts and broken pickets on up to three sections.",
    [
      ["Post replacement, set in concrete", 3, "each", 165],
      ["Pickets and rails", 1, "allowance", 220],
      ["Labor", 4, "hour", 75],
    ],
    [["Repair", 0, 1]],
  ),
  pkg(
    "fence-services",
    "Gate",
    "Wood Gate",
    1,
    "A new 4-foot cedar gate on a steel frame with latch and hinges.",
    [
      ["Cedar gate on steel frame, installed", 1, "each", 525],
      ["Latch and hardware", 1, "job", 85],
    ],
    [["Install", 0, 1]],
  ),

  // Painting
  pkg(
    "painting",
    "Interior Painting",
    "Whole Interior, 2,000 sf",
    6,
    "Walls, ceilings, trim and doors through a 2,000 square foot home, two coats, with patching.",
    [
      ["Walls, two coats", 6000, "sf", 1.65],
      ["Ceilings, one coat", 2000, "sf", 1.1],
      ["Trim, doors and baseboard", 1, "job", 2200],
      ["Patching and prep", 1, "job", 650],
      ["Paint and supplies", 1, "allowance", 1400],
    ],
    [
      ["Prep and patch", 0, 1],
      ["Ceilings and walls", 1, 3],
      ["Trim and doors", 4, 2],
    ],
  ),
  pkg(
    "painting",
    "Interior Painting",
    "Single Room",
    1,
    "Walls and trim of one average room, two coats.",
    [
      ["Walls, two coats", 400, "sf", 1.85],
      ["Trim, door and baseboard", 1, "job", 280],
      ["Paint and supplies", 1, "allowance", 160],
    ],
    [["Paint", 0, 1]],
  ),
  pkg(
    "painting",
    "Exterior Painting",
    "Exterior Repaint, 2,000 sf",
    5,
    "Pressure wash, scrape, caulk, prime and two coats on siding, trim and doors of a one-story home.",
    [
      ["Pressure wash", 1, "job", 450],
      ["Scrape, caulk and spot prime", 1, "job", 950],
      ["Siding, two coats", 2000, "sf", 2.1],
      ["Trim, fascia and soffit", 1, "job", 1600],
      ["Doors and shutters", 1, "job", 450],
      ["Paint and supplies", 1, "allowance", 1300],
    ],
    [
      ["Wash", 0, 1],
      ["Prep", 2, 1],
      ["Siding", 3, 2],
      ["Trim and doors", 5, 1],
    ],
  ),
  pkg(
    "painting",
    "Cabinets & Trim",
    "Kitchen Cabinet Repaint",
    5,
    "Clean, sand, prime and spray the doors, drawers and boxes of an average kitchen.",
    [
      ["Cabinet doors and drawer fronts, sprayed", 30, "each", 95],
      ["Cabinet boxes and face frames", 22, "lf", 55],
      ["Hardware removal and reinstall", 1, "job", 250],
      ["Masking and cleanup", 1, "job", 350],
    ],
    [
      ["Remove doors and prep", 0, 1],
      ["Prime and paint", 1, 3],
      ["Reinstall", 4, 1],
    ],
  ),

  // Drywall
  pkg(
    "drywall",
    "Drywall Install",
    "Hang & Finish, 1,000 sf",
    5,
    "Hang, tape and finish 1,000 square feet of new drywall to a level 4 finish.",
    [
      ["Drywall, hung", 1000, "sf", 1.4],
      ["Tape, mud and sand to level 4", 1000, "sf", 1.6],
      ["Corner bead and materials", 1, "allowance", 320],
    ],
    [
      ["Hang", 0, 1],
      ["Tape and finish", 1, 4],
    ],
  ),
  pkg(
    "drywall",
    "Repair & Patch",
    "Patch & Repair Visit",
    1,
    "Repair up to five holes or cracks, textured and ready for paint.",
    [
      ["Drywall finisher", 4, "hour", 85],
      ["Materials", 1, "allowance", 85],
    ],
    [["Repair", 0, 1]],
  ),
  pkg(
    "drywall",
    "Texture",
    "Popcorn Ceiling Removal",
    3,
    "Scrape popcorn texture from 800 square feet of ceiling, skim, retexture and prime.",
    [
      ["Scrape and skim", 800, "sf", 2.25],
      ["Retexture and prime", 800, "sf", 1.5],
      ["Masking and cleanup", 1, "job", 350],
    ],
    [
      ["Scrape", 0, 1],
      ["Skim and texture", 1, 2],
    ],
  ),

  // Concrete
  pkg(
    "concrete",
    "Flatwork",
    "Driveway, 600 sf",
    5,
    "Tear out and replace a 600 square foot driveway, broom finish with control joints.",
    [
      ["Demo and haul-off of existing driveway", 600, "sf", 3],
      ["Base and grading", 600, "sf", 2.5],
      ["Forms, rebar and 4-inch pour, broom finish", 600, "sf", 9.5],
      ["Saw-cut control joints", 1, "job", 350],
    ],
    [
      ["Demo", 0, 1],
      ["Base and forms", 1, 1],
      ["Pour", 2, 1],
      ["Cut joints", 3, 1],
    ],
  ),
  pkg(
    "concrete",
    "Flatwork",
    "Patio Slab, 400 sf",
    3,
    "A 400 square foot broom-finish patio slab with rebar.",
    [
      ["Excavation and base", 400, "sf", 3.5],
      ["Forms, rebar and 4-inch pour, broom finish", 400, "sf", 9],
      ["Saw-cut joints", 1, "job", 250],
    ],
    [
      ["Excavation and forms", 0, 1],
      ["Pour", 1, 1],
      ["Cut joints", 2, 1],
    ],
  ),
  pkg(
    "concrete",
    "Foundation",
    "Shop Slab, 24x30",
    5,
    "A monolithic slab with turned-down footings for a 24 by 30 building.",
    [
      ["Excavation and grading", 1, "job", 1400],
      ["Forms, rebar and vapor barrier", 720, "sf", 4.5],
      ["Monolithic pour with turned-down footings", 720, "sf", 11],
      ["Anchor bolts and finish", 1, "job", 650],
      ["Permit and inspection", 1, "job", 350],
    ],
    [
      ["Excavation", 0, 1],
      ["Forms and rebar", 1, 2],
      ["Inspection", 3, 1],
      ["Pour", 4, 1],
    ],
  ),
  pkg(
    "concrete",
    "Concrete Repair",
    "Crack & Spall Repair",
    1,
    "Route and seal cracks and patch spalled areas on a driveway or walk.",
    [
      ["Crack routing and sealing", 60, "lf", 9],
      ["Spall patching", 20, "sf", 28],
      ["Labor and cleanup", 1, "job", 250],
    ],
    [["Repair", 0, 1]],
  ),

  // Tiling
  pkg(
    "tiling",
    "Floor Tile",
    "Tile Floor, 400 sf",
    4,
    "Porcelain tile over cement board in a kitchen and entry, with new base.",
    [
      ["Existing flooring removal", 400, "sf", 1.25],
      ["Cement board or decoupling membrane", 400, "sf", 2.5],
      ["Porcelain tile, supplied and installed", 400, "sf", 13],
      ["Grout, seal and transitions", 1, "job", 550],
    ],
    [
      ["Removal and prep", 0, 1],
      ["Tile", 1, 2],
      ["Grout and seal", 3, 1],
    ],
  ),
  pkg(
    "tiling",
    "Shower & Tub Tile",
    "Tile Shower Surround",
    4,
    "Cement board, waterproofing and tile to the ceiling on three shower walls, with a niche.",
    [
      ["Cement board and waterproofing", 1, "job", 850],
      ["Wall tile, supplied and installed", 90, "sf", 34],
      ["Niche", 1, "each", 350],
      ["Grout, seal and caulk", 1, "job", 300],
    ],
    [
      ["Board and waterproofing", 0, 1],
      ["Tile", 1, 2],
      ["Grout", 3, 1],
    ],
  ),
  pkg(
    "tiling",
    "Backsplash",
    "Kitchen Backsplash",
    2,
    "A tile backsplash from counter to cabinets, around the range and window.",
    [
      ["Tile backsplash, supplied and installed", 30, "sf", 38],
      ["Outlet extenders and caulk", 1, "job", 120],
    ],
    [["Tile and grout", 0, 2]],
  ),

  // Siding
  pkg(
    "siding",
    "Siding Replacement",
    "Fiber Cement Siding, 1,800 sf",
    10,
    "Remove old siding, wrap, and install fiber cement lap siding and trim, painted.",
    [
      ["Siding removal and haul-off", 1800, "sf", 1.5],
      ["House wrap and flashing", 1800, "sf", 0.9],
      ["Fiber cement lap siding, supplied and installed", 1800, "sf", 9.5],
      ["Trim, corners and fascia", 1, "job", 4200],
      ["Caulk, prime and paint", 1800, "sf", 2.4],
    ],
    [
      ["Removal and wrap", 0, 2],
      ["Siding and trim", 2, 6],
      ["Paint", 8, 2],
    ],
  ),
  pkg(
    "siding",
    "Siding Repair",
    "Siding Repair",
    2,
    "Replace damaged sections of siding and trim, primed and painted to match.",
    [
      ["Siding replacement", 150, "sf", 12],
      ["Trim replacement", 40, "lf", 14],
      ["Prime and paint to match", 1, "job", 650],
    ],
    [["Repair and paint", 0, 2]],
  ),

  // Window and door
  pkg(
    "window-door",
    "Window Replacement",
    "10 Replacement Windows",
    2,
    "Ten vinyl double-hung replacement windows, low-E, installed and trimmed.",
    [
      ["Vinyl double-hung windows, low-E, supplied and installed", 10, "each", 785],
      ["Interior and exterior trim and caulk", 10, "each", 85],
      ["Haul-off", 1, "job", 150],
    ],
    [
      ["Measure and order", 0, 1],
      ["Install", 28, 2],
    ],
  ),
  pkg(
    "window-door",
    "Door Install",
    "Entry Door",
    1,
    "A pre-hung fiberglass entry door with new hardware, trimmed and painted.",
    [
      ["Fiberglass entry door, pre-hung, supplied and installed", 1, "each", 1850],
      ["Lockset and deadbolt", 1, "set", 225],
      ["Trim, caulk and paint", 1, "job", 350],
    ],
    [["Install", 0, 1]],
  ),
  pkg(
    "window-door",
    "Door Install",
    "Sliding Patio Door",
    1,
    "A 6-foot vinyl sliding patio door, installed and trimmed.",
    [
      ["Vinyl sliding patio door, supplied and installed", 1, "each", 2400],
      ["Trim, caulk and haul-off", 1, "job", 350],
    ],
    [["Install", 0, 1]],
  ),
  pkg(
    "window-door",
    "Window & Door Repair",
    "Glass & Hardware Repair",
    1,
    "Replace a failed glass unit or door hardware and reseal.",
    [
      ["Service call", 1, "each", 125],
      ["Insulated glass unit, supplied and installed", 1, "each", 385],
      ["Hardware and weatherstripping", 1, "allowance", 120],
    ],
    [["Repair", 0, 1]],
  ),
];

/** The packages for one kind of job in a trade, in the order written. */
export function packagesFor(trade: string, type: string): BuiltInPackage[] {
  return BUILT_IN_PACKAGES.filter((p) => p.trade === trade && p.type === type);
}

export function findPackage(id: string): BuiltInPackage | undefined {
  return BUILT_IN_PACKAGES.find((p) => p.id === id);
}

/** The total of a package's lines at their starting price. */
export function packageTotal(p: BuiltInPackage): number {
  return Math.round(p.lines.reduce((sum, l) => sum + l.quantity * l.unitPrice, 0) * 100) / 100;
}
