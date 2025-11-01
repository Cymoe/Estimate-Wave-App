-- Drop the existing function
DROP FUNCTION IF EXISTS get_organization_line_items(uuid);

-- Recreate the function with only existing columns
CREATE OR REPLACE FUNCTION get_organization_line_items(p_organization_id UUID)
RETURNS TABLE (
  id UUID,
  user_id UUID,
  organization_id UUID,
  name TEXT,
  description TEXT,
  price DECIMAL,
  base_price DECIMAL,
  red_line_price DECIMAL,
  cap_price DECIMAL,
  unit TEXT,
  cost_code_id UUID,
  cost_code JSONB, -- Include cost code as JSONB with category
  vendor_id UUID,
  favorite BOOLEAN,
  is_active BOOLEAN,
  service_category TEXT,
  is_package BOOLEAN,
  package_items JSONB,
  is_bundle BOOLEAN,
  bundle_items JSONB,
  bundle_discount_percentage DECIMAL,
  source_service_option_id UUID,
  source_service_package_id UUID,
  display_order INTEGER,
  warranty_months INTEGER,
  skill_level TEXT,
  estimated_hours DECIMAL,
  materials_list TEXT[],
  created_at TIMESTAMPTZ,
  updated_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT
    li.id,
    li.user_id,
    li.organization_id,
    li.name,
    li.description,
    li.price,
    li.base_price,
    li.red_line_price,
    li.cap_price,
    li.unit,
    li.cost_code_id,
    -- Include cost code details as JSONB
    CASE 
      WHEN cc.id IS NOT NULL THEN 
        jsonb_build_object(
          'id', cc.id,
          'code', cc.code,
          'name', cc.name,
          'category', cc.category
        )
      ELSE NULL
    END AS cost_code,
    li.vendor_id,
    li.favorite,
    li.is_active,
    li.service_category,
    li.is_package,
    li.package_items,
    li.is_bundle,
    li.bundle_items,
    li.bundle_discount_percentage,
    li.source_service_option_id,
    li.source_service_package_id,
    li.display_order,
    li.warranty_months,
    li.skill_level,
    li.estimated_hours,
    li.materials_list,
    li.created_at,
    li.updated_at
  FROM line_items li
  LEFT JOIN cost_codes cc ON li.cost_code_id = cc.id
  WHERE 
    li.is_active = true 
    AND (
      li.organization_id = p_organization_id 
      OR li.organization_id IS NULL
    )
  ORDER BY 
    li.organization_id DESC NULLS LAST,
    li.name ASC;
END;
$$;

-- Grant execute permission
GRANT EXECUTE ON FUNCTION get_organization_line_items TO authenticated;