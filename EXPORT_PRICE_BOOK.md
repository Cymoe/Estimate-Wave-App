# 📦 Export Price Book from Supabase

Since your Supabase project is paused, here are the options to export your Price Book data:

---

## Option 1: Unpause Supabase Temporarily (Recommended)

**Cost**: Minimal (< $1 for a few hours)  
**Time**: 5-10 minutes

### Steps:

1. **Unpause your Supabase project**:
   - Go to https://supabase.com/dashboard
   - Find your project
   - Click "Resume Project"
   - Wait 2-3 minutes for it to wake up

2. **Run the export script** (I'll create this next)

3. **Pause it again** after export completes

---

## Option 2: Use Supabase SQL Editor

If you have access to Supabase Dashboard SQL editor even while paused:

1. Go to SQL Editor in Supabase Dashboard
2. Run these queries to export as JSON:

### Export Line Items:
```sql
SELECT json_agg(row_to_json(t)) 
FROM (
  SELECT 
    id,
    user_id,
    organization_id,
    name,
    description,
    base_price,
    red_line_price,
    cap_price,
    pricing_factors,
    unit,
    cost_code_id,
    service_category,
    has_override,
    markup_percentage,
    margin_percentage,
    price_position,
    applied_mode_id,
    is_package,
    is_bundle,
    package_items,
    bundle_items,
    bundle_discount_percentage,
    vendor_id,
    sku,
    materials_list,
    estimated_hours,
    skill_level,
    warranty_months,
    display_order,
    attributes,
    is_active,
    is_custom,
    favorite,
    status,
    is_taxable,
    source_service_option_id,
    source_service_package_id,
    created_at,
    updated_at
  FROM line_items
  WHERE is_active = true
) t;
```

### Export Cost Codes:
```sql
SELECT json_agg(row_to_json(t)) 
FROM (
  SELECT 
    id,
    code,
    name,
    description,
    category,
    industry_id,
    parent_id,
    is_active,
    display_order,
    created_at,
    updated_at
  FROM cost_codes
  WHERE is_active = true
) t;
```

3. Copy the JSON output
4. Save to files:
   - `line_items_export.json`
   - `cost_codes_export.json`

---

## Option 3: Use Supabase CLI

If you have Supabase CLI installed:

```bash
# Link to your project
supabase link --project-ref wnwatjwcjptwehagqiwf

# Export line items
supabase db dump --data-only --table line_items > line_items.sql

# Export cost codes
supabase db dump --data-only --table cost_codes > cost_codes.sql
```

---

## Option 4: Manual CSV Export

1. Go to Supabase Dashboard → Table Editor
2. Select `line_items` table
3. Click "Export" → "CSV"
4. Repeat for `cost_codes` table

---

## After Export: Import to MongoDB

Once you have the data, use the import script:

```bash
cd /Users/myleswebb/Apps/bills
node scripts/import-price-book.js
```

Or use the bulk API endpoint:

```bash
# Import cost codes first
curl -X POST http://localhost:3001/api/cost-codes/bulk \
  -H "Content-Type: application/json" \
  -d @cost_codes_export.json

# Then import line items
curl -X POST http://localhost:3001/api/line-items/bulk \
  -H "Content-Type: application/json" \
  -d @line_items_export.json
```

---

## Quick Export Script (If Supabase is Running)

I can create an automated export script that:
1. Connects to your Supabase database
2. Exports all line items and cost codes
3. Saves as JSON files
4. Automatically imports to MongoDB

**Would you like me to create this script?**

---

## Data Fields to Export

### Line Items (Your Price Book):
- ✅ **Core**: id, name, description, unit
- ✅ **Pricing**: base_price, red_line_price, cap_price
- ✅ **Relationships**: cost_code_id, organization_id
- ✅ **Categories**: service_category
- ✅ **Bundles**: is_package, package_items
- ✅ **Status**: is_active, is_custom, favorite

### Cost Codes:
- ✅ **Core**: code, name, category
- ✅ **Hierarchy**: parent_id
- ✅ **Industry**: industry_id
- ✅ **Status**: is_active

---

## MongoDB Import Format

The data should be in this format:

```json
{
  "items": [
    {
      "name": "Door Installation - Interior",
      "base_price": 250.00,
      "red_line_price": 175.00,
      "cap_price": 375.00,
      "unit": "each",
      "cost_code_id": "some-cost-code-id",
      "service_category": "Carpentry",
      "is_active": true,
      "organization_id": "69019f3f4a8998be12afe670"
    }
  ]
}
```

---

## Next Steps

1. **Choose an export option** above
2. **Get the data** in JSON or CSV format
3. **Import to MongoDB** using the bulk endpoint
4. **Verify** data in Price Book UI

Let me know which option works best, and I can help with the next steps!

