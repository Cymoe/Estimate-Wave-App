-- Migration to simplify service system to use only line items
-- Step 1: Add bundle fields to line_items table

ALTER TABLE line_items 
ADD COLUMN IF NOT EXISTS is_bundle BOOLEAN DEFAULT FALSE,
ADD COLUMN IF NOT EXISTS bundle_items JSONB,
ADD COLUMN IF NOT EXISTS bundle_discount_percentage NUMERIC(5,2) DEFAULT 0,
ADD COLUMN IF NOT EXISTS source_service_option_id UUID,
ADD COLUMN IF NOT EXISTS source_service_package_id UUID;

-- Step 2: Migrate service options to line items
INSERT INTO line_items (
  organization_id,
  name,
  description,
  price,
  unit,
  category,
  is_active,
  display_order,
  is_bundle,
  source_service_option_id,
  created_at,
  updated_at
)
SELECT 
  so.organization_id,
  so.name,
  so.description,
  so.price,
  so.unit,
  COALESCE(s.category, 'service'),
  so.is_active,
  so.display_order,
  CASE WHEN EXISTS (
    SELECT 1 FROM service_option_items soi 
    WHERE soi.service_option_id = so.id
  ) THEN TRUE ELSE FALSE END as is_bundle,
  so.id as source_service_option_id,
  so.created_at,
  so.updated_at
FROM service_options so
LEFT JOIN services s ON so.service_id = s.id
WHERE NOT EXISTS (
  SELECT 1 FROM line_items li 
  WHERE li.source_service_option_id = so.id
);

-- Step 3: Update bundle_items for service options that have items
UPDATE line_items li
SET bundle_items = (
  SELECT jsonb_agg(
    jsonb_build_object(
      'line_item_id', soi.line_item_id,
      'quantity', soi.quantity,
      'is_optional', soi.is_optional,
      'display_order', soi.display_order
    ) ORDER BY soi.display_order
  )
  FROM service_option_items soi
  WHERE soi.service_option_id = li.source_service_option_id
)
WHERE li.source_service_option_id IS NOT NULL
AND EXISTS (
  SELECT 1 FROM service_option_items soi 
  WHERE soi.service_option_id = li.source_service_option_id
);

-- Step 4: Create invoice templates from service packages
INSERT INTO invoice_templates (
  organization_id,
  name,
  description,
  is_active,
  created_at,
  updated_at
)
SELECT 
  sp.organization_id,
  sp.name || ' Package',
  sp.description,
  sp.is_active,
  sp.created_at,
  sp.updated_at
FROM service_packages sp
WHERE NOT EXISTS (
  SELECT 1 FROM invoice_templates it 
  WHERE it.name = sp.name || ' Package'
  AND (it.organization_id = sp.organization_id OR (it.organization_id IS NULL AND sp.organization_id IS NULL))
);

-- Step 5: Create invoice template items from package items
WITH template_mapping AS (
  SELECT 
    sp.id as package_id,
    it.id as template_id
  FROM service_packages sp
  JOIN invoice_templates it ON it.name = sp.name || ' Package'
    AND (it.organization_id = sp.organization_id OR (it.organization_id IS NULL AND sp.organization_id IS NULL))
)
INSERT INTO invoice_template_items (
  template_id,
  line_item_id,
  quantity,
  price,
  display_order,
  created_at,
  updated_at
)
SELECT 
  tm.template_id,
  li.id as line_item_id,
  spi.quantity,
  li.price::text,
  spi.display_order,
  NOW(),
  NOW()
FROM service_package_items spi
JOIN template_mapping tm ON spi.package_id = tm.package_id
JOIN service_options so ON spi.service_option_id = so.id
JOIN line_items li ON li.source_service_option_id = so.id
WHERE NOT EXISTS (
  SELECT 1 FROM invoice_template_items iti 
  WHERE iti.template_id = tm.template_id 
  AND iti.line_item_id = li.id
);

-- Step 6: Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_line_items_is_bundle ON line_items(is_bundle) WHERE is_bundle = TRUE;
CREATE INDEX IF NOT EXISTS idx_line_items_source_service_option_id ON line_items(source_service_option_id) WHERE source_service_option_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_line_items_source_service_package_id ON line_items(source_service_package_id) WHERE source_service_package_id IS NOT NULL;

-- Step 7: Create a view to help with the transition
CREATE OR REPLACE VIEW service_migration_status AS
SELECT 
  'service_options' as source_table,
  COUNT(*) as total_count,
  COUNT(DISTINCT li.source_service_option_id) as migrated_count,
  COUNT(*) - COUNT(DISTINCT li.source_service_option_id) as remaining_count
FROM service_options so
LEFT JOIN line_items li ON li.source_service_option_id = so.id
UNION ALL
SELECT 
  'service_packages' as source_table,
  COUNT(*) as total_count,
  COUNT(DISTINCT it.id) as migrated_count,
  COUNT(*) - COUNT(DISTINCT it.id) as remaining_count
FROM service_packages sp
LEFT JOIN invoice_templates it ON it.name = sp.name || ' Package'
  AND (it.organization_id = sp.organization_id OR (it.organization_id IS NULL AND sp.organization_id IS NULL));

-- Note: We're NOT dropping the service tables yet - keeping them for rollback safety
-- After confirming everything works, we can drop them with a separate migration