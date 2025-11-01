# 🎯 RedCap Backend Setup

**RedCap** - Your sales pricing engine with cap & redline pricing strategy.

## What is Cap & Red Line Pricing?

**RedCap** implements a strategic pricing model for sales:

- **🔴 Red Line** = Minimum acceptable price (floor) - Never go below this
- **🎩 Cap** = Maximum price (ceiling) - The highest price you can charge
- **💰 Sweet Spot** = Negotiate anywhere between red line and cap to maximize margin

This gives your sales team:
- ✅ Pricing flexibility to close deals
- ✅ Protection against underpricing
- ✅ Clear margin targets
- ✅ Confidence in negotiations

---

## 🚀 Quick Start

### 1. MongoDB Connection

Your `Cluster0` will now have:
- `fb-group-ads-manager` (existing)
- `redcap` (new) ← **This is your sales pricing database**

**Get connection string:**
```
mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/redcap?retryWrites=true&w=majority
                                                                    ^^^^^^
                                                            Database name: redcap
```

### 2. Install & Configure

```bash
cd apps/backend
npm install

# Create .env
cat > .env << 'EOF'
MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/redcap?retryWrites=true&w=majority
PORT=3001
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
DB_NAME=redcap
EOF

# Start server
npm run dev
```

### 3. Expected Output

```
✅ MongoDB connected successfully
📦 Database: redcap
🌍 Host: cluster0-xxxxx.mongodb.net
🚀 Server running on http://localhost:3001
🔄 Starting MongoDB Change Stream for activity_logs...
```

---

## 📊 RedCap Data Model

### Core Collections

1. **organizations** - Companies using RedCap
2. **clients** - Your customers
3. **estimates** - Quotes with cap/redline pricing
4. **invoices** - Finalized sales
5. **projects** - Job tracking
6. **activity_logs** - Real-time sales activity

### Pricing Fields (in estimates/invoices)

```typescript
{
  items: [
    {
      description: "Premium Installation",
      quantity: 1,
      
      // RedCap Pricing Strategy
      redLinePrice: 1500,    // 🔴 Don't go below this
      capPrice: 3000,        // 🎩 Maximum you can charge
      unitPrice: 2200,       // 💰 Actual negotiated price
      
      margin: 700,           // Profit over red line
      marginPercent: 31.8    // % margin
    }
  ]
}
```

---

## 🎯 API Endpoints

All pricing endpoints support cap/redline:

```bash
# Create estimate with pricing boundaries
POST /api/estimates
{
  "items": [
    {
      "description": "Labor",
      "redLinePrice": 500,
      "capPrice": 1000,
      "unitPrice": 750  // Negotiated price
    }
  ]
}

# Update pricing mid-negotiation
PATCH /api/estimates/:id
{
  "items[0].unitPrice": 800  // Adjust within red line to cap
}
```

---

## 💡 Real-time Sales Tracking

Watch negotiations happen in real-time:

```typescript
import { realtimeClient } from '@/lib/realtime';

realtimeClient.connect(organizationId);

realtimeClient.subscribe((event) => {
  if (event.resourceType === 'estimate') {
    console.log('💰 New estimate created:', event.details);
  }
  if (event.action === 'price_updated') {
    console.log('📊 Price negotiation:', event.details);
  }
});
```

---

## 🔥 Why RedCap?

**For Sales Teams:**
- Know your pricing boundaries instantly
- Negotiate with confidence
- Never leave money on the table
- Never go below acceptable margins

**For Managers:**
- Track pricing patterns
- See margin trends
- Identify top performers
- Optimize pricing strategy

**For Business:**
- Maximize revenue
- Protect margins
- Data-driven pricing
- Scale with confidence

---

## 📈 Next Steps

1. ✅ Backend is running
2. 🎨 Build sales UI with red line/cap visualizations
3. 📊 Add pricing analytics dashboard
4. 🤖 Add AI-powered pricing suggestions
5. 📱 Mobile app for field sales

---

**RedCap: Where smart pricing meets real revenue.** 🚀

