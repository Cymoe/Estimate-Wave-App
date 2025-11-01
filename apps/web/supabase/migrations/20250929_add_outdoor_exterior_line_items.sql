-- Add outdoor/exterior line items with CAP and RED LINE pricing
-- Based on provided screenshots for outdoor construction items

-- First, ensure we have the Landscaping/Outdoor Construction industry
INSERT INTO industries (id, name, slug, description, icon, color, display_order, is_active)
VALUES (
  'a1b2c3d4-5678-90ab-cdef-123456789012',
  'Outdoor Construction',
  'outdoor-construction',
  'Outdoor construction including concrete, carpentry, kitchens, and landscaping',
  '🏡',
  '#4CAF50',
  13,
  true
)
ON CONFLICT (slug) DO UPDATE 
SET name = EXCLUDED.name,
    description = EXCLUDED.description,
    icon = EXCLUDED.icon;

-- Add cost codes for outdoor construction if they don't exist
INSERT INTO cost_codes (code, name, industry_id, category, created_at, updated_at)
VALUES 
  ('OC200', 'Outdoor Installation', 'a1b2c3d4-5678-90ab-cdef-123456789012', 'installation', NOW(), NOW()),
  ('OC300', 'Outdoor Services', 'a1b2c3d4-5678-90ab-cdef-123456789012', 'services', NOW(), NOW()),
  ('OC500', 'Outdoor Materials', 'a1b2c3d4-5678-90ab-cdef-123456789012', 'materials', NOW(), NOW())
ON CONFLICT (code) DO NOTHING;

-- Get the cost code IDs for inserting line items
WITH cost_code_ids AS (
  SELECT 
    id as installation_id,
    (SELECT id FROM cost_codes WHERE code = 'OC300') as services_id,
    (SELECT id FROM cost_codes WHERE code = 'OC500') as materials_id
  FROM cost_codes 
  WHERE code = 'OC200'
)
-- Insert line items with RED LINE and CAP pricing from screenshots
INSERT INTO line_items (
  name, 
  description, 
  base_price, 
  red_line_price, 
  cap_price,
  unit, 
  cost_code_id,
  pricing_factors,
  created_at, 
  updated_at
)
SELECT * FROM (
  VALUES
    -- Concrete/Foundation Items
    ('Footing', 'Concrete footing installation', 11.00, 8.00, 15.00, 'linear ft', 
     (SELECT installation_id FROM cost_code_ids), 
     '{"complexity": "standard", "material_grade": "standard"}'::jsonb),
    
    ('Retaining Wall', 'Retaining wall construction', 75.00, 55.00, 95.00, 'sq ft',
     (SELECT installation_id FROM cost_code_ids),
     '{"complexity": "complex", "material_grade": "premium"}'),
    
    ('Pier', 'Concrete pier installation', 150.00, 110.00, 190.00, 'each',
     (SELECT installation_id FROM cost_code_ids),
     '{"complexity": "standard", "depth": "standard"}'),
    
    ('Foundation', 'Foundation concrete work', 12.00, 9.00, 16.00, 'sq ft',
     (SELECT installation_id FROM cost_code_ids),
     '{"complexity": "standard", "thickness": "standard"}'),
    
    ('Monolithic Slab', 'Monolithic concrete slab', 8.50, 6.00, 11.00, 'sq ft',
     (SELECT installation_id FROM cost_code_ids),
     '{"complexity": "standard", "finish": "broom"}'),
    
    ('Concrete Pump - Mobile', 'Mobile concrete pump service', 850.00, 650.00, 1050.00, 'day',
     (SELECT services_id FROM cost_code_ids),
     '{"equipment_type": "mobile", "capacity": "standard"}'),
    
    ('Trench', 'Trenching service', 45.00, 35.00, 60.00, 'linear ft',
     (SELECT services_id FROM cost_code_ids),
     '{"depth": "standard", "width": "standard"}'),
    
    -- Rough Carpentry Items  
    ('Concrete Formwork', 'Formwork for concrete', 12.75, 9.50, 16.00, 'sq ft',
     (SELECT installation_id FROM cost_code_ids),
     '{"complexity": "standard", "reusability": "single"}'),
    
    ('Framing', 'Rough framing work', 8.00, 6.00, 10.50, 'sq ft',
     (SELECT installation_id FROM cost_code_ids),
     '{"lumber_grade": "standard", "complexity": "standard"}'),
    
    ('Double Top Plate', 'Double top plate installation', 4.25, 3.00, 5.50, 'linear ft',
     (SELECT installation_id FROM cost_code_ids),
     '{"lumber_size": "2x4", "treatment": "standard"}'),
    
    ('Bottom Plate', 'Bottom plate installation', 3.75, 2.75, 4.75, 'linear ft',
     (SELECT installation_id FROM cost_code_ids),
     '{"lumber_size": "2x4", "treatment": "pressure_treated"}'),
    
    ('Decking - Composite', 'Composite decking installation', 18.50, 14.00, 24.00, 'sq ft',
     (SELECT installation_id FROM cost_code_ids),
     '{"material": "composite", "grade": "premium"}'),
    
    ('Decking - Wood', 'Wood decking installation', 12.00, 9.00, 16.00, 'sq ft',
     (SELECT installation_id FROM cost_code_ids),
     '{"material": "wood", "species": "pressure_treated"}'),
    
    ('Rafter', 'Rafter installation', 125.00, 95.00, 165.00, 'each',
     (SELECT installation_id FROM cost_code_ids),
     '{"size": "2x8", "span": "standard"}'),
    
    ('Joist', 'Floor joist installation', 85.00, 65.00, 110.00, 'each',
     (SELECT installation_id FROM cost_code_ids),
     '{"size": "2x10", "spacing": "16_inch"}'),
    
    ('Beam', 'Structural beam installation', 285.00, 215.00, 375.00, 'each',
     (SELECT installation_id FROM cost_code_ids),
     '{"type": "laminated", "size": "standard"}'),
    
    ('Post', 'Structural post installation', 165.00, 125.00, 215.00, 'each',
     (SELECT installation_id FROM cost_code_ids),
     '{"size": "6x6", "height": "8ft"}'),
    
    ('Stud', 'Wall stud installation', 12.50, 9.50, 16.50, 'each',
     (SELECT installation_id FROM cost_code_ids),
     '{"size": "2x4", "spacing": "16_inch"}'),
    
    -- Outdoor Kitchen Items
    ('Outdoor Kitchen - Basic', 'Basic outdoor kitchen setup', 8500.00, 6500.00, 11000.00, 'each',
     (SELECT installation_id FROM cost_code_ids),
     '{"level": "basic", "appliances": "standard"}'),
    
    ('Outdoor Kitchen - Premium', 'Premium outdoor kitchen with all features', 18500.00, 14000.00, 24000.00, 'each',
     (SELECT installation_id FROM cost_code_ids),
     '{"level": "premium", "appliances": "high_end"}'),
    
    ('BBQ Island', 'Built-in BBQ island', 4850.00, 3650.00, 6350.00, 'each',
     (SELECT installation_id FROM cost_code_ids),
     '{"size": "standard", "features": "basic"}'),
    
    ('Pizza Oven', 'Outdoor pizza oven installation', 3250.00, 2450.00, 4250.00, 'each',
     (SELECT installation_id FROM cost_code_ids),
     '{"type": "wood_fired", "size": "residential"}'),
    
    ('Outdoor Refrigerator', 'Outdoor rated refrigerator', 2150.00, 1625.00, 2825.00, 'each',
     (SELECT materials_id FROM cost_code_ids),
     '{"type": "under_counter", "capacity": "standard"}'),
    
    ('Fire Pit', 'Fire pit installation', 1850.00, 1400.00, 2425.00, 'each',
     (SELECT installation_id FROM cost_code_ids),
     '{"type": "gas", "size": "standard"}'),
    
    -- Landscaping Items
    ('Artificial Turf', 'Artificial turf installation', 12.50, 9.50, 16.50, 'sq ft',
     (SELECT installation_id FROM cost_code_ids),
     '{"quality": "premium", "pile_height": "standard"}'),
    
    ('Putting Green', 'Professional putting green', 28.50, 21.50, 37.50, 'sq ft',
     (SELECT installation_id FROM cost_code_ids),
     '{"quality": "tour_grade", "contours": "moderate"}'),
    
    ('Sod Installation', 'Natural sod installation', 3.25, 2.45, 4.25, 'sq ft',
     (SELECT installation_id FROM cost_code_ids),
     '{"type": "bermuda", "grade": "premium"}'),
    
    ('Irrigation System', 'Complete irrigation system', 8.75, 6.60, 11.50, 'sq ft',
     (SELECT installation_id FROM cost_code_ids),
     '{"type": "smart_system", "zones": "standard"}'),
    
    ('Landscape Lighting', 'LED landscape lighting system', 45.00, 34.00, 59.00, 'fixture',
     (SELECT installation_id FROM cost_code_ids),
     '{"type": "led", "voltage": "low_voltage"}'),
    
    ('Paver Patio', 'Paver patio installation', 18.50, 14.00, 24.50, 'sq ft',
     (SELECT installation_id FROM cost_code_ids),
     '{"pattern": "standard", "material": "concrete_pavers"}'),
    
    ('Pergola', 'Pergola construction', 4850.00, 3650.00, 6375.00, 'each',
     (SELECT installation_id FROM cost_code_ids),
     '{"size": "12x12", "material": "cedar"}'),
    
    ('Outdoor Storage', 'Outdoor storage shed', 2450.00, 1850.00, 3225.00, 'each',
     (SELECT installation_id FROM cost_code_ids),
     '{"size": "8x10", "material": "resin"}')
    
) AS items(name, desc, base, red, cap, unit, cc_id, factors)
ON CONFLICT (cost_code_id, name) DO UPDATE
SET 
  base_price = EXCLUDED.base_price,
  red_line_price = EXCLUDED.red_line_price,
  cap_price = EXCLUDED.cap_price,
  pricing_factors = EXCLUDED.pricing_factors,
  updated_at = NOW();

-- Add comment explaining the pricing structure
COMMENT ON TABLE line_items IS 'Line items with CAP/RED LINE pricing. RED LINE is the absolute minimum (floor), BASE is the standard price, CAP is the absolute maximum (ceiling). Organizations can price within this range using pricing strategies.';