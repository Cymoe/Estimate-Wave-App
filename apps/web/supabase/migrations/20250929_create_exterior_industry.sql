-- Create Exterior industry
INSERT INTO industries (id, name, slug, category_type, description, created_at, updated_at)
VALUES (
  gen_random_uuid(),
  'Exterior',
  'exterior',
  'specialty_trade',
  'Exterior construction and renovation services',
  NOW(),
  NOW()
);

-- Create cost codes for Exterior
WITH industry_id AS (
  SELECT id FROM industries WHERE slug = 'exterior' LIMIT 1
)
INSERT INTO cost_codes (id, code, name, category, industry_id, organization_id, created_at, updated_at)
VALUES
  (gen_random_uuid(), 'EX100', 'Exterior Labor', 'labor', (SELECT id FROM industry_id), NULL, NOW(), NOW()),
  (gen_random_uuid(), 'EX200', 'Exterior Installation', 'service', (SELECT id FROM industry_id), NULL, NOW(), NOW()),
  (gen_random_uuid(), 'EX500', 'Exterior Materials', 'material', (SELECT id FROM industry_id), NULL, NOW(), NOW());

-- Add line items from the handwritten notes with CAP and RED LINE prices
WITH industry_id AS (
  SELECT id FROM industries WHERE slug = 'exterior' LIMIT 1
),
labor_code AS (
  SELECT id FROM cost_codes WHERE code = 'EX100' AND organization_id IS NULL
),
installation_code AS (
  SELECT id FROM cost_codes WHERE code = 'EX200' AND organization_id IS NULL
),
materials_code AS (
  SELECT id FROM cost_codes WHERE code = 'EX500' AND organization_id IS NULL
)
INSERT INTO line_items (
  id, name, description, price, red_line_price, cap_price, unit, category, 
  cost_code_id, industry_id, organization_id, created_at, updated_at
)
VALUES
  -- Labor items (using labor code)
  (gen_random_uuid(), 'Putting Green - Cups', 'Installation of putting green cups', 9.00, 9.00, 11.50, 'each', 'labor', (SELECT id FROM labor_code), (SELECT id FROM industry_id), NULL, NOW(), NOW()),
  
  -- Installation/Service items
  (gen_random_uuid(), 'Turf - Premium - Level 1', 'Premium synthetic turf installation level 1', 4.00, 4.00, 9.00, 'sqft', 'service', (SELECT id FROM installation_code), (SELECT id FROM industry_id), NULL, NOW(), NOW()),
  (gen_random_uuid(), 'Turf - Premium - Level 2', 'Premium synthetic turf installation level 2', 4.00, 4.00, 9.00, 'sqft', 'service', (SELECT id FROM installation_code), (SELECT id FROM industry_id), NULL, NOW(), NOW()),
  (gen_random_uuid(), 'Turf - Premium - Level 3', 'Premium synthetic turf installation level 3', 4.00, 4.00, 9.00, 'sqft', 'service', (SELECT id FROM installation_code), (SELECT id FROM industry_id), NULL, NOW(), NOW()),
  
  -- Materials
  (gen_random_uuid(), 'Limestone', 'Limestone material', 3.85, 3.85, 4.35, 'sqft', 'material', (SELECT id FROM materials_code), (SELECT id FROM industry_id), NULL, NOW(), NOW()),
  (gen_random_uuid(), 'Black Star 2"', 'Black Star stone 2 inch', 5.00, 5.00, 5.00, 'sqft', 'material', (SELECT id FROM materials_code), (SELECT id FROM industry_id), NULL, NOW(), NOW()),
  (gen_random_uuid(), 'Crushed Granite 1" - Red 3/8', 'Red crushed granite 1 inch to 3/8 inch', 5.00, 5.00, 5.00, 'sqft', 'material', (SELECT id FROM materials_code), (SELECT id FROM industry_id), NULL, NOW(), NOW()),
  (gen_random_uuid(), 'Crushed Granite - Black 3/8', 'Black crushed granite 3/8 inch', 5.00, 5.00, 5.00, 'sqft', 'material', (SELECT id FROM materials_code), (SELECT id FROM industry_id), NULL, NOW(), NOW()),
  
  -- Concrete items
  (gen_random_uuid(), 'Concrete - Stamped', 'Stamped decorative concrete', 8.50, 8.50, 13.75, 'sqft', 'service', (SELECT id FROM installation_code), (SELECT id FROM industry_id), NULL, NOW(), NOW()),
  
  -- Gazebo items (from the top of the handwritten note)
  (gen_random_uuid(), 'Gazebo Attached', 'Attached gazebo installation', 65.00, 65.00, 67.50, 'sqft', 'service', (SELECT id FROM installation_code), (SELECT id FROM industry_id), NULL, NOW(), NOW()),
  (gen_random_uuid(), 'Gazebo Free Standing', 'Free standing gazebo installation', 65.00, 65.00, 67.50, 'sqft', 'service', (SELECT id FROM installation_code), (SELECT id FROM industry_id), NULL, NOW(), NOW()),
  
  -- Pergola items
  (gen_random_uuid(), 'Pergola Attached', 'Attached pergola installation', 43.75, 43.75, 76.50, 'sqft', 'service', (SELECT id FROM installation_code), (SELECT id FROM industry_id), NULL, NOW(), NOW()),
  (gen_random_uuid(), 'Pergola Free Standing', 'Free standing pergola installation', 43.75, 43.75, 76.50, 'sqft', 'service', (SELECT id FROM installation_code), (SELECT id FROM industry_id), NULL, NOW(), NOW()),
  
  -- Kitchen
  (gen_random_uuid(), 'Kitchen', 'Outdoor kitchen installation', 485.00, 485.00, 485.00, 'sqft', 'service', (SELECT id FROM installation_code), (SELECT id FROM industry_id), NULL, NOW(), NOW()),
  
  -- Fencing items
  (gen_random_uuid(), 'Fencing - Cedar 6\'', 'Cedar fencing 6 feet height', 65.00, 65.00, 68.00, 'linear_foot', 'material', (SELECT id FROM materials_code), (SELECT id FROM industry_id), NULL, NOW(), NOW()),
  (gen_random_uuid(), 'Fencing - Dogear', 'Dogear style fencing', 54.00, 54.00, 79.00, 'linear_foot', 'material', (SELECT id FROM materials_code), (SELECT id FROM industry_id), NULL, NOW(), NOW()),
  (gen_random_uuid(), 'Fencing - Iron', 'Wrought iron fencing', 79.00, 79.00, 79.00, 'linear_foot', 'material', (SELECT id FROM materials_code), (SELECT id FROM industry_id), NULL, NOW(), NOW()),
  
  -- Additional items from second screenshot
  (gen_random_uuid(), 'Berg', 'Berg installation', 8.00, 8.00, 8.00, 'sqft', 'service', (SELECT id FROM installation_code), (SELECT id FROM industry_id), NULL, NOW(), NOW()),
  (gen_random_uuid(), 'Paving Walk', 'Paving walkway installation', 53.00, 53.00, 53.00, 'sqft', 'service', (SELECT id FROM installation_code), (SELECT id FROM industry_id), NULL, NOW(), NOW());