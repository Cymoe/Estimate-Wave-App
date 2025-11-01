# 🎯 Accessing Your RedCap UI

You already have a **fully-functional cap/redline pricing interface** built! Here's how to access it:

---

## 🚀 **Quick Access**

### **Method 1: Sidebar** ⚡ (Easiest)
1. Look at your left sidebar
2. Find the **⚡ lightning bolt icon**
3. Click **"Sales Mode"**

### **Method 2: Keyboard Shortcut** ⌨️
- **Mac:** Press `⌘⇧Q`
- **Windows:** Press `Ctrl+Shift+Q`

### **Method 3: Direct URL** 🔗
Navigate to: `http://localhost:5173/sales-mode`

---

## 📋 **What's In The UI**

### **Sales Mode Page** (`/sales-mode`)

#### **Screen 1: Project Selection**
Choose from 6 preset project templates:
- 🏠 Kitchen Remodel - Basic ($12K-$18K)
- 💧 Bathroom Renovation - Midrange ($8K-$12K)
- 🏠 Roof Replacement - Asphalt ($15K-$22K)
- 🌲 Deck Construction - Composite ($10K-$15K)
- ⚡ HVAC System Replacement ($8K-$12K)
- 🚗 Garage Door Replacement ($2K-$3.5K)

Each shows:
- 🔴 **Redline Price** (minimum)
- 🟢 **Cap Price** (maximum)
- 📝 **Description**

#### **Screen 2: Pricing Interface**
After selecting a project:

**Left Side - Price Slider:**
```
┌─────────────────────────────────────┐
│  Current Price: $15,000             │
│                                     │
│  🔴────────●──────────🟢            │
│  $12K   $15K      $18K              │
│                                     │
│  [Preset Dropdown ▼]                │
│   - CAP (100%)                      │
│   - Busy Season (60%)               │
│   - Competitive (35%)               │
│   - Slow Season (25%)               │
│   - Need Job (10%)                  │
│   - Redline (0%)                    │
│                                     │
│  [Set to Redline] [Set to Cap]      │
└─────────────────────────────────────┘
```

**Right Side - Add-ons:**
```
┌─────────────────────────────────────┐
│  Common Add-ons                     │
│  ☑ Premium Countertops (+$2K)       │
│  ☐ Custom Cabinets (+$3K)           │
│  ☐ Island Addition (+$1.5K)         │
└─────────────────────────────────────┘
```

**Top Right - Margin Indicator:**
- 🟢 **Good Margin** (20%+ above redline)
- 🟡 **Tight Margin** (10-20% above redline)
- 🔴 **Low Margin** (<10% above redline)

**Bottom:**
- [💵 Generate Quote] - Creates estimate and opens detail view
- [📈 Save as Template] - Save for future use

---

## 📊 **Estimates Detail View**

When viewing any estimate (`/estimates/:id`):

### **Airtable Sidebar** (Left Side)

Click on any pricing strategy to adjust **ALL line items** at once:

```
Views
├── 🎯 CAP Price (100%)          $18,000
├── 📅 Busy Season (60%)         $15,600
├── 📋 Competitive (35%)         $14,400
├── 📅 Slow Season (25%)         $13,800
├── 🔍 Need Job (10%)            $12,600
└── 👥 Redline (0%)              $12,000
    └─ Commission: $0
```

**Shows:**
- Current Total
- CAP Total (max you could charge)
- Redline Total (min you can go)
- Commission (margin above redline)

### **Price Range Display** (In Line Items)

Each line item shows:
```
🔴 Red: $500  |  Base: $750  |  🎩 Cap: $1,000

───●─────────────────── 
50% (between red and cap)
```

---

## 💡 **Pricing Strategy Examples**

### **Scenario 1: Kitchen Remodel**
- **Redline:** $12,000 (your absolute minimum)
- **Base:** $15,000 (standard price)
- **Cap:** $18,000 (maximum you can charge)

**Preset Strategies:**
- **CAP (100%)** → $18,000 → 🟢 Good Margin (50%)
- **Busy Season (60%)** → $15,600 → 🟢 Good Margin (30%)
- **Competitive (35%)** → $14,400 → 🟡 Tight Margin (20%)
- **Slow Season (25%)** → $13,800 → 🟡 Tight Margin (15%)
- **Need Job (10%)** → $12,600 → 🔴 Low Margin (5%)
- **Redline (0%)** → $12,000 → 🔴 $0 commission

### **Scenario 2: Field Sales**
Sales rep on-site with customer:

1. Navigate to Sales Mode (`⌘⇧Q`)
2. Select project type (e.g., "Bathroom Renovation")
3. Adjust price slider based on:
   - Customer budget
   - Competition
   - Urgency
   - Season
4. Add/remove add-ons
5. Watch margin indicator
6. Click "Generate Quote" when ready
7. Estimate auto-creates with pricing

---

## 🎨 **Visual Design**

Your UI uses your design system:
- **Professional Blue** (#336699) - Active states, primary actions
- **Action Yellow** (#EAB308) - Generate Quote button
- **Success Green** (#10B981) - Good margins, cap prices
- **Warning Red** (#EF4444) - Low margins, redline prices
- **Slate Gray** (#1F2937) - Cards, backgrounds

---

## 🔥 **Features You Have**

✅ **Visual price slider** (red to green gradient)  
✅ **6 preset pricing strategies**  
✅ **Real-time margin calculations**  
✅ **Visual margin indicators** (Good/Tight/Low)  
✅ **Quick project templates**  
✅ **Add-on selections**  
✅ **Bulk price adjustments** (all items at once)  
✅ **Commission tracking**  
✅ **Airtable-style estimate view**  
✅ **Price range display on every line item**  

---

## 📱 **Keyboard Shortcuts**

- `⌘⇧Q` - Open Sales Mode (Quick Quote)
- `⌘⇧E` - Open Full Estimate View
- `C` - Set to CAP (when in Airtable view)
- `B` - Set to Busy Season
- `P` - Set to Competitive
- `S` - Set to Slow Season
- `N` - Set to Need Job
- `R` - Set to Redline

---

## 🚀 **Try It Now!**

1. Start your frontend: `npm run dev` (in `/apps/web`)
2. Navigate to: `http://localhost:5173/sales-mode`
3. Or click the ⚡ icon in your sidebar

**Your cap/redline pricing UI is already built and ready to use!** 🎉

---

## 📝 **Next Steps**

Now that you know where it is:

### **Option A: Connect to MongoDB**
Update the Sales Mode components to use your new MongoDB API instead of Supabase:
- Replace `EstimateService.create()` with `estimatesAPI.create()`
- Use `useEstimates()` hook
- Add real-time updates with `useRealtime()`

### **Option B: Enhance the UI**
- Add more project templates
- Customize pricing strategies
- Add customer-specific pricing rules
- Build pricing analytics dashboard

### **Option C: Test With Real Data**
- Use the existing UI with your MongoDB backend
- Create test estimates
- Adjust pricing strategies
- Track margins and commissions

---

**Your RedCap UI is production-ready!** 🎯

