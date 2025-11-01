# 🎯 Starting Fresh - Build Your Price Book in MongoDB

Since Supabase is locked, let's build your Price Book fresh in MongoDB!

---

## Quick Start: 3 Ways to Add Data

### Option 1: Use the UI (Easiest)
1. Open http://localhost:3000/price-book
2. Click "+ New Line Item"
3. Fill in:
   - Name (e.g., "Door Installation - Interior")
   - Base Price: $250
   - Red Line: $175 (your minimum)
   - Cap: $375 (your maximum)
   - Unit: "each"
4. Save!

### Option 2: API Calls (Quick Bulk Add)

I can help you create a bulk import with your most common items:

```bash
# First, add a cost code
curl -X POST http://localhost:3001/api/cost-codes \
  -H "Content-Type: application/json" \
  -d '{
    "code": "02100",
    "name": "Carpentry",
    "category": "Construction",
    "is_active": true
  }'
```

### Option 3: Sample Data Script (Fastest)

I'll create a script with common construction items to get you started.

---

## Do You Remember Your Key Items?

If you can tell me your **top 10-20 most used services/items**, I can:
1. Create a JSON file with them
2. Bulk import them into MongoDB
3. Get your Price Book running in minutes

**Example items I can add:**
- Door installations (interior/exterior)
- Trim/molding work
- Cabinet installation
- Flooring
- Painting
- Drywall
- Electrical work
- Plumbing
- HVAC
- etc.

---

## Sample Data Template

If you want to start with some defaults, here's a template:

```json
{
  "items": [
    {
      "name": "Door Installation - Interior",
      "description": "Standard interior door with hardware",
      "base_price": 250.00,
      "red_line_price": 175.00,
      "cap_price": 375.00,
      "unit": "each",
      "service_category": "Carpentry",
      "organization_id": "69019f3f4a8998be12afe670",
      "user_id": "dev-user-123",
      "is_active": true
    }
  ]
}
```

---

## What to Do Now

**Tell me:**
1. What are your most common services/items?
2. Typical price ranges?
3. Any specific categories you work in?

I'll create a starter price book for you that we can import right now! 🚀

