-- Add industry_id to invoice_templates table for industry-based filtering
-- This allows templates to be filtered by the organization's selected industries

-- Add industry_id column if it doesn't exist
DO $$
BEGIN
    IF NOT EXISTS (SELECT 1 FROM information_schema.columns 
                   WHERE table_name = 'invoice_templates' 
                   AND column_name = 'industry_id') THEN
        ALTER TABLE invoice_templates ADD COLUMN industry_id UUID REFERENCES industries(id) ON DELETE SET NULL;
        
        -- Create index for performance
        CREATE INDEX idx_invoice_templates_industry_id ON invoice_templates(industry_id);
        
        RAISE NOTICE 'Added industry_id column to invoice_templates table';
    ELSE
        RAISE NOTICE 'industry_id column already exists in invoice_templates table';
    END IF;
END $$;

-- Create some sample templates for different industries
-- These will be system templates (organization_id = NULL) that all organizations can use

DO $$
DECLARE
    v_general_construction_id UUID;
    v_electrical_id UUID;
    v_plumbing_id UUID;
    v_hvac_id UUID;
    v_roofing_id UUID;
    v_flooring_id UUID;
    v_landscaping_id UUID;
    v_kitchen_remodeling_id UUID;
    v_bathroom_remodeling_id UUID;
    v_siding_id UUID;
    v_concrete_id UUID;
    v_masonry_id UUID;
    v_painting_id UUID;
    v_solar_id UUID;
    v_handyman_id UUID;
    v_cleaning_id UUID;
    v_system_user_id UUID := '21471c0c-2492-4fdb-af77-ac0f2fd78ed5'::UUID;
BEGIN
    -- Get industry IDs
    SELECT id INTO v_general_construction_id FROM industries WHERE name = 'General Construction' LIMIT 1;
    SELECT id INTO v_electrical_id FROM industries WHERE name = 'Electrical' LIMIT 1;
    SELECT id INTO v_plumbing_id FROM industries WHERE name = 'Plumbing' LIMIT 1;
    SELECT id INTO v_hvac_id FROM industries WHERE name = 'HVAC' LIMIT 1;
    SELECT id INTO v_roofing_id FROM industries WHERE name = 'Roofing' LIMIT 1;
    SELECT id INTO v_flooring_id FROM industries WHERE name = 'Flooring' LIMIT 1;
    SELECT id INTO v_landscaping_id FROM industries WHERE name = 'Landscaping' LIMIT 1;
    SELECT id INTO v_kitchen_remodeling_id FROM industries WHERE name = 'Kitchen Remodeling' LIMIT 1;
    SELECT id INTO v_bathroom_remodeling_id FROM industries WHERE name = 'Bathroom Remodeling' LIMIT 1;
    SELECT id INTO v_siding_id FROM industries WHERE name = 'Siding' LIMIT 1;
    SELECT id INTO v_concrete_id FROM industries WHERE name = 'Concrete' LIMIT 1;
    SELECT id INTO v_masonry_id FROM industries WHERE name = 'Masonry' LIMIT 1;
    SELECT id INTO v_painting_id FROM industries WHERE name = 'Painting' LIMIT 1;
    SELECT id INTO v_solar_id FROM industries WHERE name = 'Solar' LIMIT 1;
    SELECT id INTO v_handyman_id FROM industries WHERE name = 'Handyman' LIMIT 1;
    SELECT id INTO v_cleaning_id FROM industries WHERE name = 'Cleaning Services' LIMIT 1;

    -- Insert sample templates for each industry
    -- Only insert if they don't already exist
    
    -- General Construction Templates
    IF v_general_construction_id IS NOT NULL THEN
        INSERT INTO invoice_templates (id, user_id, organization_id, industry_id, name, content, created_at)
        VALUES 
            (gen_random_uuid(), v_system_user_id, NULL, v_general_construction_id, 'Basic Electrical Package', 
             '{"description": "Standard electrical work and installations", "items": [], "total_amount": 0}', NOW()),
            (gen_random_uuid(), v_system_user_id, NULL, v_general_construction_id, 'Standard Flooring Package', 
             '{"description": "Complete flooring installation with standard materials", "items": [], "total_amount": 0}', NOW()),
            (gen_random_uuid(), v_system_user_id, NULL, v_general_construction_id, 'Interior Paint Package', 
             '{"description": "Complete interior painting service", "items": [], "total_amount": 0}', NOW()),
            (gen_random_uuid(), v_system_user_id, NULL, v_general_construction_id, 'Exterior Paint Package', 
             '{"description": "Complete exterior painting service", "items": [], "total_amount": 0}', NOW()),
            (gen_random_uuid(), v_system_user_id, NULL, v_general_construction_id, 'Whole House Electrical Upgrade', 
             '{"description": "Complete electrical system upgrade", "items": [], "total_amount": 0}', NOW()),
            (gen_random_uuid(), v_system_user_id, NULL, v_general_construction_id, 'Premium Flooring Package', 
             '{"description": "High-end flooring installation with premium materials", "items": [], "total_amount": 0}', NOW()),
            (gen_random_uuid(), v_system_user_id, NULL, v_general_construction_id, 'Kitchen Refresh Package', 
             '{"description": "Cabinet refacing and countertop replacement", "items": [], "total_amount": 15000}', NOW())
        ON CONFLICT DO NOTHING;
    END IF;

    -- Exterior/Outdoor Templates
    IF v_landscaping_id IS NOT NULL THEN
        INSERT INTO invoice_templates (id, user_id, organization_id, industry_id, name, content, created_at)
        VALUES 
            (gen_random_uuid(), v_system_user_id, NULL, v_landscaping_id, 'Outdoor Living Space', 
             '{"description": "Complete outdoor living area with patio, pergola, and landscaping", "items": [], "total_amount": 0}', NOW()),
            (gen_random_uuid(), v_system_user_id, NULL, v_landscaping_id, 'Landscape Design Package', 
             '{"description": "Professional landscape design and installation", "items": [], "total_amount": 0}', NOW()),
            (gen_random_uuid(), v_system_user_id, NULL, v_landscaping_id, 'Pool Area Landscaping', 
             '{"description": "Landscaping around pool and spa areas", "items": [], "total_amount": 0}', NOW()),
            (gen_random_uuid(), v_system_user_id, NULL, v_landscaping_id, 'Garden Installation', 
             '{"description": "Complete garden bed installation with plants and irrigation", "items": [], "total_amount": 0}', NOW())
        ON CONFLICT DO NOTHING;
    END IF;

    -- Siding Templates
    IF v_siding_id IS NOT NULL THEN
        INSERT INTO invoice_templates (id, user_id, organization_id, industry_id, name, content, created_at)
        VALUES 
            (gen_random_uuid(), v_system_user_id, NULL, v_siding_id, 'Vinyl Siding Installation', 
             '{"description": "Complete vinyl siding installation with trim", "items": [], "total_amount": 0}', NOW()),
            (gen_random_uuid(), v_system_user_id, NULL, v_siding_id, 'Fiber Cement Siding', 
             '{"description": "Fiber cement siding installation and painting", "items": [], "total_amount": 0}', NOW()),
            (gen_random_uuid(), v_system_user_id, NULL, v_siding_id, 'Wood Siding Replacement', 
             '{"description": "Wood siding replacement and weatherproofing", "items": [], "total_amount": 0}', NOW())
        ON CONFLICT DO NOTHING;
    END IF;

    -- Concrete Templates
    IF v_concrete_id IS NOT NULL THEN
        INSERT INTO invoice_templates (id, user_id, organization_id, industry_id, name, content, created_at)
        VALUES 
            (gen_random_uuid(), v_system_user_id, NULL, v_concrete_id, 'Concrete Patio Installation', 
             '{"description": "Poured concrete patio with finishing and sealing", "items": [], "total_amount": 0}', NOW()),
            (gen_random_uuid(), v_system_user_id, NULL, v_concrete_id, 'Concrete Driveway', 
             '{"description": "New concrete driveway installation", "items": [], "total_amount": 0}', NOW()),
            (gen_random_uuid(), v_system_user_id, NULL, v_concrete_id, 'Concrete Walkway', 
             '{"description": "Decorative concrete walkway installation", "items": [], "total_amount": 0}', NOW()),
            (gen_random_uuid(), v_system_user_id, NULL, v_concrete_id, 'Concrete Foundation Repair', 
             '{"description": "Foundation crack repair and waterproofing", "items": [], "total_amount": 0}', NOW())
        ON CONFLICT DO NOTHING;
    END IF;

    -- Masonry Templates
    IF v_masonry_id IS NOT NULL THEN
        INSERT INTO invoice_templates (id, user_id, organization_id, industry_id, name, content, created_at)
        VALUES 
            (gen_random_uuid(), v_system_user_id, NULL, v_masonry_id, 'Brick Patio Installation', 
             '{"description": "Brick patio with proper base and finishing", "items": [], "total_amount": 0}', NOW()),
            (gen_random_uuid(), v_system_user_id, NULL, v_masonry_id, 'Stone Retaining Wall', 
             '{"description": "Natural stone retaining wall construction", "items": [], "total_amount": 0}', NOW()),
            (gen_random_uuid(), v_system_user_id, NULL, v_masonry_id, 'Fireplace Installation', 
             '{"description": "Custom fireplace and chimney construction", "items": [], "total_amount": 0}', NOW())
        ON CONFLICT DO NOTHING;
    END IF;

    -- Roofing Templates
    IF v_roofing_id IS NOT NULL THEN
        INSERT INTO invoice_templates (id, user_id, organization_id, industry_id, name, content, created_at)
        VALUES 
            (gen_random_uuid(), v_system_user_id, NULL, v_roofing_id, 'Roof Replacement', 
             '{"description": "Complete roof replacement with new shingles", "items": [], "total_amount": 0}', NOW()),
            (gen_random_uuid(), v_system_user_id, NULL, v_roofing_id, 'Roof Repair Service', 
             '{"description": "Roof leak repair and maintenance", "items": [], "total_amount": 0}', NOW()),
            (gen_random_uuid(), v_system_user_id, NULL, v_roofing_id, 'Gutter Installation', 
             '{"description": "New gutter and downspout installation", "items": [], "total_amount": 0}', NOW())
        ON CONFLICT DO NOTHING;
    END IF;

    -- Painting Templates (Exterior)
    IF v_painting_id IS NOT NULL THEN
        INSERT INTO invoice_templates (id, user_id, organization_id, industry_id, name, content, created_at)
        VALUES 
            (gen_random_uuid(), v_system_user_id, NULL, v_painting_id, 'Exterior House Painting', 
             '{"description": "Complete exterior house painting with primer and topcoat", "items": [], "total_amount": 0}', NOW()),
            (gen_random_uuid(), v_system_user_id, NULL, v_painting_id, 'Deck and Fence Staining', 
             '{"description": "Deck and fence staining and weatherproofing", "items": [], "total_amount": 0}', NOW()),
            (gen_random_uuid(), v_system_user_id, NULL, v_painting_id, 'Commercial Exterior Painting', 
             '{"description": "Commercial building exterior painting", "items": [], "total_amount": 0}', NOW())
        ON CONFLICT DO NOTHING;
    END IF;

    -- Solar Templates
    IF v_solar_id IS NOT NULL THEN
        INSERT INTO invoice_templates (id, user_id, organization_id, industry_id, name, content, created_at)
        VALUES 
            (gen_random_uuid(), v_system_user_id, NULL, v_solar_id, 'Residential Solar Installation', 
             '{"description": "Complete residential solar panel system installation", "items": [], "total_amount": 0}', NOW()),
            (gen_random_uuid(), v_system_user_id, NULL, v_solar_id, 'Solar Panel Maintenance', 
             '{"description": "Solar panel cleaning and maintenance service", "items": [], "total_amount": 0}', NOW())
        ON CONFLICT DO NOTHING;
    END IF;

    RAISE NOTICE 'Sample templates created for all industries';
END $$;

-- Update RLS policies to allow system templates to be viewed by all organizations
DROP POLICY IF EXISTS "Users can view templates in their organizations" ON invoice_templates;
CREATE POLICY "Users can view templates in their organizations" ON invoice_templates
  FOR SELECT USING (
    -- Allow viewing system templates (organization_id IS NULL)
    organization_id IS NULL
    OR
    -- Allow viewing organization-specific templates
    EXISTS (
      SELECT 1 FROM user_organizations
      WHERE user_organizations.organization_id = invoice_templates.organization_id
      AND user_organizations.user_id = auth.uid()
    )
  );

