# 🎯 Price Book is Ready for MongoDB!

**Status**: ✅ Backend complete, ready for data import

---

## What's Done

### ✅ MongoDB Models Created
- **LineItem**: Full Cap/RedLine pricing support
  - `base_price`, `red_line_price`, `cap_price`
  - Pricing factors, overrides, bundles
  - Materials lists, skill levels, warranties
- **CostCode**: Industry-standard cost code structure
  - Categories, hierarchies
  - Industry associations

### ✅ API Endpoints Working
```
GET    /api/line-items?organizationId=xxx        ✅ List price book items
GET    /api/line-items/:id                       ✅ Get single item
POST   /api/line-items                           ✅ Create new item
PUT    /api/line-items/:id                       ✅ Update item
DELETE /api/line-items/:id                       ✅ Soft delete
POST   /api/line-items/bulk                      ✅ Bulk import

GET    /api/cost-codes                           ✅ List cost codes
GET    /api/cost-codes/:id                       ✅ Get single code
POST   /api/cost-codes                           ✅ Create new code
PUT    /api/cost-codes/:id                       ✅ Update code
DELETE /api/cost-codes/:id                       ✅ Soft delete
POST   /api/cost-codes/bulk                      ✅ Bulk import
```

### ✅ Frontend Service Created
- `MongoLineItemService`: Drop-in replacement for old service
- Price calculation helpers
- Pricing recommendations based on complexity/urgency
- Price position calculator (red line to cap)

### ✅ Export/Import Tools Ready
- Supabase export script
- MongoDB import script
- Manual export instructions

---

## Next Step: Get Your Data

You have **2 options**:

### Option 1: Export from Supabase (If you have data there)

1. **Temporarily unpause Supabase** (< $1 for a few hours)
   ```bash
   # Once unpaused, run:
   node scripts/export-from-supabase.js
   ```

2. **Import to MongoDB**:
   ```bash
   node scripts/import-price-book.js \
     --cost-codes exports/cost_codes.json \
     --line-items exports/line_items.json
   ```

3. **Pause Supabase again**

### Option 2: Start Fresh (Recommended if starting new)

Create your price book from scratch in MongoDB:

1. **Add a few cost codes first**:
   ```bash
   curl -X POST http://localhost:3001/api/cost-codes \
     -H "Content-Type: application/json" \
     -d '{
       "code": "02100",
       "name": "Site Preparation",
       "category": "Construction",
       "industry_id": "general-construction",
       "is_active": true
     }'
   ```

2. **Then add line items**:
   ```bash
   curl -X POST http://localhost:3001/api/line-items \
     -H "Content-Type: application/json" \
     -d '{
       "name": "Door Installation - Interior",
       "description": "Standard interior door installation",
       "base_price": 250.00,
       "red_line_price": 175.00,
       "cap_price": 375.00,
       "unit": "each",
       "cost_code_id": "COST_CODE_ID_HERE",
       "service_category": "Carpentry",
       "organization_id": "69019f3f4a8998be12afe670",
       "user_id": "dev-user-123",
       "is_active": true
     }'
   ```

---

## Using the Price Book

### In Sales Mode:

1. Go to http://localhost:3000/sales-mode
2. Click "+ New Estimate"
3. Add line items from your price book
4. Each item shows:
   - **Red Line** (minimum price)
   - **Base Price** (standard)
   - **Cap** (maximum price)
5. Adjust pricing based on:
   - Complexity
   - Urgency
   - Client relationship
   - Market conditions

### Price Book UI (Coming Soon):

Access at: http://localhost:3000/price-book

Features:
- Browse all line items
- Filter by category/cost code
- Edit pricing (red line, base, cap)
- Create bundles/packages
- Mark favorites
- Search and sort

---

## Price Book Features

### 🎯 Cap/RedLine Pricing
```typescript
{
  "name": "Premium Door Installation",
  "base_price": 300.00,      // Your standard price
  "red_line_price": 225.00,  // NEVER go below this
  "cap_price": 450.00,       // NEVER go above this
  "price_position": 0.5      // 0 = red line, 1 = cap
}
```

### 📊 Smart Pricing Recommendations
The `MongoLineItemService` can suggest prices based on:
- **Complexity**: Low/Medium/High
- **Urgency**: Low/Medium/High
- **Client**: New/Existing/Loyal

Example:
```typescript
const recommendation = MongoLineItemService.getRecommendedPrice(lineItem, {
  complexity: 'high',     // +20% toward cap
  urgency: 'medium',      // neutral
  relationship: 'loyal'   // -5% toward red line
});

// Returns: { price: 315.00, position: 0.65, reasoning: "High complexity (+20%), Loyal client (-5%)" }
```

### 📦 Bundles/Packages
Group related items together:
```typescript
{
  "name": "Complete Door Package",
  "is_bundle": true,
  "bundle_items": [
    { "line_item_id": "...", "quantity": 1 },
    { "line_item_id": "...", "quantity": 2 }
  ],
  "bundle_discount_percentage": 10
}
```

### 🏢 Organization-Specific vs Shared
- **Shared Items** (`organization_id: null`): Industry-standard items everyone sees
- **Custom Items** (`organization_id: "xxx"`): Your organization's custom pricing

---

## Testing the Endpoints

### Test Cost Codes:
```bash
# List all
curl http://localhost:3001/api/cost-codes

# Create one
curl -X POST http://localhost:3001/api/cost-codes \
  -H "Content-Type: application/json" \
  -d '{"code":"02100","name":"Site Prep","is_active":true}'
```

### Test Line Items:
```bash
# List for your organization (includes shared items)
curl "http://localhost:3001/api/line-items?organizationId=69019f3f4a8998be12afe670"

# Search
curl "http://localhost:3001/api/line-items?organizationId=69019f3f4a8998be12afe670&search=door"

# Filter by cost code
curl "http://localhost:3001/api/line-items?costCodeId=SOME_ID"
```

---

## Architecture

```
Price Book Flow:
  
Frontend (Price Book UI)
  ↓
MongoLineItemService
  ↓
lineItemsAPI (api.ts)
  ↓
GET /api/line-items
  ↓
Express Route Handler
  ↓
LineItem MongoDB Model
  ↓
MongoDB: redcap.lineitems collection
```

---

## Files Created

### Backend:
- `apps/backend/src/models/LineItem.ts` - MongoDB model
- `apps/backend/src/models/CostCode.ts` - Cost code model
- `apps/backend/src/routes/lineItems.ts` - API routes
- `apps/backend/src/routes/costCodes.ts` - Cost code routes

### Frontend:
- `apps/web/src/services/MongoLineItemService.ts` - New service
- `apps/web/src/lib/api.ts` - Added line items & cost codes APIs

### Scripts:
- `scripts/export-from-supabase.js` - Export data from Supabase
- `scripts/import-price-book.js` - Import data to MongoDB
- `EXPORT_PRICE_BOOK.md` - Complete export guide

---

## What's Next?

1. **Get your data**:
   - Export from Supabase, OR
   - Start fresh with new items

2. **Update Price Book UI** (if needed):
   - Replace `LineItemService` with `MongoLineItemService`
   - Test the interface

3. **Connect to Sales Mode**:
   - Line items now available when creating estimates
   - Full cap/red line pricing support

---

## Questions?

**How do I export my Supabase data?**
→ See `EXPORT_PRICE_BOOK.md` for 4 different methods

**How do I import bulk data?**
→ Use `POST /api/line-items/bulk` endpoint or the import script

**Can I have custom pricing per organization?**
→ Yes! Set `organization_id` for custom items, `null` for shared

**How does Cap/RedLine pricing work?**
→ Set min (red line) and max (cap), then price anywhere in between based on factors

**Can I create bundles?**
→ Yes! Set `is_bundle: true` and add `bundle_items` array

---

## Summary

🎉 **Your Price Book is ready to go!**

- ✅ MongoDB models created
- ✅ API endpoints working
- ✅ Frontend service ready
- ✅ Export/import tools available

**Just need to add your data!**

Choose your path:
- **Have data in Supabase?** → Export and import
- **Starting fresh?** → Add items via API or UI

The RedCap sales system is ready to handle your pricing! 🎯

