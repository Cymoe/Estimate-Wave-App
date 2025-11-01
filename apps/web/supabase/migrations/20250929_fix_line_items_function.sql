-- Fix the get_organization_line_items function to include price range fields
DROP FUNCTION IF EXISTS get_organization_line_items(UUID);

CREATE OR REPLACE FUNCTION get_organization_line_items(p_organization_id UUID)
RETURNS TABLE (
    id UUID,
    name TEXT,
    description TEXT,
    price DECIMAL(10,2),
    base_price DECIMAL(10,2),
    red_line_price DECIMAL(10,2),
    cap_price DECIMAL(10,2),
    unit TEXT,
    cost_code_id UUID,
    vendor_id UUID,
    status TEXT,
    favorite BOOLEAN,
    created_at TIMESTAMP WITH TIME ZONE,
    updated_at TIMESTAMP WITH TIME ZONE,
    organization_id UUID,
    user_id UUID,
    has_override BOOLEAN,
    pricing_factors JSONB,
    price_position NUMERIC,
    applied_mode_id UUID,
    applied_mode_name TEXT,
    cost_code_name TEXT,
    cost_code_code TEXT,
    markup_percentage DECIMAL(5,2),
    margin_percentage DECIMAL(5,2)
) 
LANGUAGE plpgsql
AS $$
BEGIN
    RETURN QUERY
    SELECT 
        li.id,
        li.name,
        li.description,
        COALESCE(
            lio.custom_price,
            CASE 
                WHEN lio.markup_percentage IS NOT NULL THEN 
                    li.base_price * (1 + lio.markup_percentage / 100)
                ELSE 
                    li.base_price
            END
        ) as price,
        li.base_price,
        li.red_line_price,
        li.cap_price,
        li.unit,
        li.cost_code_id,
        li.vendor_id,
        'published'::TEXT as status,
        li.favorite,
        li.created_at,
        li.updated_at,
        li.organization_id,
        li.user_id,
        CASE 
            WHEN lio.custom_price IS NOT NULL OR lio.markup_percentage IS NOT NULL THEN true 
            ELSE false 
        END as has_override,
        li.pricing_factors,
        li.price_position,
        lio.applied_mode_id,
        pm.name as applied_mode_name,
        cc.name as cost_code_name,
        cc.code::text as cost_code_code,
        lio.markup_percentage,
        -- Calculate margin percentage if markup exists
        CASE 
            WHEN lio.markup_percentage IS NOT NULL THEN
                (lio.markup_percentage / (100 + lio.markup_percentage)) * 100
            ELSE NULL
        END as margin_percentage
    FROM line_items li
    JOIN cost_codes cc ON li.cost_code_id = cc.id
    LEFT JOIN line_item_overrides lio ON li.id = lio.line_item_id AND lio.organization_id = p_organization_id
    LEFT JOIN pricing_modes pm ON lio.applied_mode_id = pm.id
    WHERE 
        -- Include organization-owned line items
        (li.organization_id = p_organization_id)
        OR 
        -- Include shared line items only if their cost code's industry matches organization's industries
        (li.organization_id IS NULL AND cc.industry_id IN (
            SELECT oi.industry_id 
            FROM organization_industries oi
            WHERE oi.organization_id = p_organization_id
        ))
    ORDER BY cc.code, li.name;
END;
$$;