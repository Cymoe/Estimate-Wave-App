-- Add CAP and RED LINE pricing to line_items table
-- This implements price ranges for dynamic pricing within boundaries

-- Step 1: Add new price columns
ALTER TABLE line_items 
ADD COLUMN IF NOT EXISTS red_line_price DECIMAL(10,2),
ADD COLUMN IF NOT EXISTS cap_price DECIMAL(10,2);

-- Step 2: Rename existing price column to base_price for clarity
ALTER TABLE line_items 
RENAME COLUMN price TO base_price;

-- Step 3: Add pricing factors metadata
ALTER TABLE line_items
ADD COLUMN IF NOT EXISTS pricing_factors JSONB DEFAULT '{}';

COMMENT ON COLUMN line_items.red_line_price IS 'Minimum price threshold - never go below this';
COMMENT ON COLUMN line_items.cap_price IS 'Maximum price ceiling - never exceed this';
COMMENT ON COLUMN line_items.base_price IS 'Standard/default price - typically middle of range';
COMMENT ON COLUMN line_items.pricing_factors IS 'Factors affecting price position: region, complexity, material grade, etc.';

-- Step 4: Populate initial values for existing items
-- Set conservative defaults: red_line at 70% and cap at 150% of base
UPDATE line_items 
SET 
  red_line_price = ROUND(base_price * 0.7, 2),
  cap_price = ROUND(base_price * 1.5, 2)
WHERE red_line_price IS NULL OR cap_price IS NULL;

-- Step 5: Add constraint to ensure price range validity
ALTER TABLE line_items 
ADD CONSTRAINT check_price_range 
CHECK (
  (red_line_price IS NULL AND cap_price IS NULL) OR 
  (red_line_price <= base_price AND base_price <= cap_price)
);

-- Step 6: Create pricing strategies table for organizations
CREATE TABLE IF NOT EXISTS pricing_strategies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id UUID REFERENCES organizations(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  price_position DECIMAL(3,2) DEFAULT 0.5 CHECK (price_position >= 0 AND price_position <= 1),
  factors JSONB DEFAULT '{}',
  is_active BOOLEAN DEFAULT true,
  is_default BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  CONSTRAINT unique_org_strategy_name UNIQUE(organization_id, name)
);

COMMENT ON COLUMN pricing_strategies.price_position IS 'Position within price range: 0.0 = red_line, 0.5 = base, 1.0 = cap';
COMMENT ON COLUMN pricing_strategies.factors IS 'Adjustment factors like urgency, season, customer_type, project_size';

-- Step 7: Create function to calculate actual price based on position
CREATE OR REPLACE FUNCTION calculate_price_from_position(
  p_red_line DECIMAL,
  p_base DECIMAL,
  p_cap DECIMAL,
  p_position DECIMAL
) RETURNS DECIMAL AS $$
BEGIN
  -- Handle NULL cases
  IF p_red_line IS NULL OR p_cap IS NULL THEN
    RETURN p_base;
  END IF;
  
  -- Ensure position is within bounds
  p_position := LEAST(GREATEST(p_position, 0), 1);
  
  -- Linear interpolation between red_line and cap
  -- 0.0 = red_line, 0.5 = base, 1.0 = cap
  IF p_position <= 0.5 THEN
    -- Between red_line and base
    RETURN ROUND(p_red_line + (p_base - p_red_line) * (p_position * 2), 2);
  ELSE
    -- Between base and cap
    RETURN ROUND(p_base + (p_cap - p_base) * ((p_position - 0.5) * 2), 2);
  END IF;
END;
$$ LANGUAGE plpgsql IMMUTABLE;

-- Step 8: Update line_item_overrides to support price position
ALTER TABLE line_item_overrides
ADD COLUMN IF NOT EXISTS price_position DECIMAL(3,2),
ADD COLUMN IF NOT EXISTS strategy_id UUID REFERENCES pricing_strategies(id);

COMMENT ON COLUMN line_item_overrides.price_position IS 'Override position within the line item price range';
COMMENT ON COLUMN line_item_overrides.strategy_id IS 'Applied pricing strategy';

-- Step 9: Create view for line items with calculated prices
CREATE OR REPLACE VIEW line_items_with_range AS
SELECT 
  li.*,
  COALESCE(li.red_line_price, li.base_price * 0.7) as effective_red_line,
  COALESCE(li.cap_price, li.base_price * 1.5) as effective_cap,
  (li.cap_price - li.red_line_price) as price_range,
  ROUND(((li.base_price - li.red_line_price) / NULLIF(li.cap_price - li.red_line_price, 0)), 2) as base_position
FROM line_items li;

-- Step 10: Add indexes for performance
CREATE INDEX IF NOT EXISTS idx_pricing_strategies_org ON pricing_strategies(organization_id);
CREATE INDEX IF NOT EXISTS idx_pricing_strategies_default ON pricing_strategies(organization_id, is_default) WHERE is_default = true;
CREATE INDEX IF NOT EXISTS idx_line_item_overrides_strategy ON line_item_overrides(strategy_id);

-- Step 11: Create RLS policies for pricing_strategies
ALTER TABLE pricing_strategies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view their organization's pricing strategies"
  ON pricing_strategies FOR SELECT
  USING (
    organization_id IN (
      SELECT organization_id FROM user_organizations 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can create pricing strategies for their organization"
  ON pricing_strategies FOR INSERT
  WITH CHECK (
    organization_id IN (
      SELECT organization_id FROM user_organizations 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can update their organization's pricing strategies"
  ON pricing_strategies FOR UPDATE
  USING (
    organization_id IN (
      SELECT organization_id FROM user_organizations 
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Users can delete their organization's pricing strategies"
  ON pricing_strategies FOR DELETE
  USING (
    organization_id IN (
      SELECT organization_id FROM user_organizations 
      WHERE user_id = auth.uid()
    )
  );

-- Step 12: Create trigger to update timestamps
CREATE TRIGGER update_pricing_strategies_timestamp
  BEFORE UPDATE ON pricing_strategies
  FOR EACH ROW
  EXECUTE FUNCTION update_updated_at_column();