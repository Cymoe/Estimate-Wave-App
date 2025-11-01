# MongoDB Migration Guide - RedCap

Complete guide for migrating RedCap from Supabase to MongoDB.

## 📋 Overview

This migration replaces:
- **Supabase Auth** → Keep for now (add JWT later)
- **Supabase Database** → MongoDB Atlas
- **Supabase Realtime** → MongoDB Change Streams + SSE
- **Supabase Storage** → Keep for now (or migrate to S3)

---

## 🚀 Setup Instructions

### 1. Set Up MongoDB Atlas

1. **Create MongoDB Atlas Account** (if you don't have one):
   - Go to [mongodb.com/cloud/atlas](https://www.mongodb.com/cloud/atlas)
   - Sign up for free (M0 tier is free forever)

2. **Use Your Existing Cluster** (`Cluster0`):
   - You already have `fb-group-ads-manager` database
   - We'll create a new `redcap` database in the same cluster

3. **Get Connection String**:
   - In Atlas → Click "Connect" on your cluster
   - Choose "Connect your application"
   - Copy the connection string:
   ```
   mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
   - Replace `<password>` with your actual password
   - Add database name: change to end with `/redcap?retryWrites=true&w=majority`

4. **Network Access**:
   - Atlas → Network Access
   - Add IP: `0.0.0.0/0` (allow from anywhere) for development
   - For production: Add specific IPs only

5. **Database User**:
   - Atlas → Database Access
   - Ensure you have a user with read/write permissions

---

### 2. Configure Backend

```bash
cd apps/backend

# Install dependencies
npm install

# Create .env file
cp .env.example .env
```

Edit `.env`:
```env
MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/redcap?retryWrites=true&w=majority
PORT=3001
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

**Start the backend:**
```bash
npm run dev
```

You should see:
```
✅ MongoDB connected successfully
📦 Database: redcap
🚀 Server running on http://localhost:3001
```

---

### 3. Configure Frontend

```bash
cd apps/web

# Create .env.local file
echo "VITE_API_URL=http://localhost:3001/api" > .env.local
```

**Restart your frontend:**
```bash
npm run dev
```

---

## 🔄 Migration Strategy

### Phase 1: Parallel Running (Current State) ✅

Backend is ready! You can now:

1. **Test the API** with Postman/Thunder Client:
   ```
   GET http://localhost:3001/api/health
   GET http://localhost:3001/api/organizations
   ```

2. **Use both systems** during migration:
   - Old components still use Supabase
   - New components can use MongoDB API

---

### Phase 2: Data Migration

#### Option A: Manual Migration (Recommended for small datasets)

1. **Export from Supabase**:
   ```bash
   # From Supabase dashboard, use the SQL Editor:
   COPY (SELECT * FROM organizations) TO STDOUT WITH CSV HEADER;
   COPY (SELECT * FROM clients) TO STDOUT WITH CSV HEADER;
   # etc...
   ```

2. **Import to MongoDB** using a script:
   ```typescript
   // Create: apps/backend/scripts/import-from-supabase.ts
   import { Client } from '../src/models';
   import * as fs from 'fs';
   import * as csv from 'csv-parser';

   async function importClients() {
     const clients = [];
     fs.createReadStream('clients.csv')
       .pipe(csv())
       .on('data', (row) => clients.push(row))
       .on('end', async () => {
         await Client.insertMany(clients);
         console.log('Imported', clients.length, 'clients');
       });
   }
   ```

#### Option B: Automated Migration Script

Create: `apps/backend/scripts/migrate-from-supabase.ts`

```typescript
import { createClient } from '@supabase/supabase-js';
import { connectDatabase } from '../src/config/database';
import { Organization, Client, Estimate, Invoice, Project } from '../src/models';

const supabase = createClient(
  process.env.SUPABASE_URL!,
  process.env.SUPABASE_SERVICE_KEY! // Use service key for full access
);

async function migrateOrganizations() {
  const { data, error } = await supabase.from('organizations').select('*');
  if (error) throw error;

  for (const org of data) {
    await Organization.create({
      _id: org.id,
      name: org.name,
      slug: org.slug,
      // Map other fields...
    });
  }
  console.log(`✅ Migrated ${data.length} organizations`);
}

async function migrateClients() {
  // Similar pattern...
}

async function main() {
  await connectDatabase();
  await migrateOrganizations();
  await migrateClients();
  await migrateEstimates();
  await migrateInvoices();
  await migrateProjects();
  console.log('🎉 Migration complete!');
  process.exit(0);
}

main();
```

Run with:
```bash
SUPABASE_URL=xxx SUPABASE_SERVICE_KEY=xxx tsx scripts/migrate-from-supabase.ts
```

---

### Phase 3: Update React Components

#### Before (Supabase):
```typescript
import { supabase } from '@/lib/supabase';

const { data, error } = await supabase
  .from('clients')
  .select('*')
  .eq('organization_id', orgId);
```

#### After (MongoDB):
```typescript
import { clientsAPI } from '@/lib/api';

const clients = await clientsAPI.list(orgId);
```

#### Update files systematically:

1. **Database access files**:
   - `src/lib/database.ts` - Replace Supabase calls with API calls
   
2. **Component files** (search for `supabase.from()`):
   ```bash
   cd apps/web
   grep -r "supabase.from" src/
   ```

3. **Update each file** one at a time

---

### Phase 4: Real-time Updates

#### Before (Supabase Realtime):
```typescript
const channel = supabase
  .channel('activity_logs')
  .on('postgres_changes', {
    event: 'INSERT',
    schema: 'public',
    table: 'activity_logs'
  }, (payload) => {
    console.log('New activity:', payload.new);
  })
  .subscribe();
```

#### After (MongoDB Change Streams + SSE):
```typescript
import { realtimeClient } from '@/lib/realtime';

// Connect once when app loads
realtimeClient.connect(organizationId);

// Subscribe to updates
const unsubscribe = realtimeClient.subscribe((event) => {
  console.log('New activity:', event);
});

// Cleanup on unmount
return () => unsubscribe();
```

---

## 📊 Database Comparison

| Feature | Supabase (PostgreSQL) | MongoDB |
|---------|----------------------|---------|
| **Schema** | Strict (tables/columns) | Flexible (documents) |
| **IDs** | UUID | ObjectId (or custom) |
| **Relationships** | Foreign keys | References |
| **Queries** | SQL | MongoDB queries |
| **Indexes** | Built-in | Define in schemas |
| **Realtime** | Built-in | Change Streams |

---

## 🔑 Key Differences

### IDs

**Supabase:**
```typescript
id: "550e8400-e29b-41d4-a716-446655440000" // UUID
```

**MongoDB:**
```typescript
_id: "507f1f77bcf86cd799439011" // ObjectId
// or
_id: "custom-id" // String (if specified)
```

### Field Names

**Supabase:** `snake_case`
```typescript
organization_id
created_at
```

**MongoDB:** `camelCase` (JavaScript convention)
```typescript
organizationId
createdAt
```

Our models handle this automatically!

### Nested Data

**MongoDB** makes it easy to embed arrays/objects:

```typescript
// Estimates with items in one document
{
  _id: "...",
  estimateNumber: "EST-2025-001",
  items: [
    { description: "Labor", quantity: 1, unitPrice: 500 },
    { description: "Materials", quantity: 10, unitPrice: 50 }
  ]
}
```

**Supabase** requires separate `estimate_items` table.

---

## ✅ Testing Checklist

- [ ] Backend runs without errors (`npm run dev` in `apps/backend`)
- [ ] Can connect to MongoDB Atlas
- [ ] API endpoints respond correctly
   - [ ] GET `/api/organizations`
   - [ ] GET `/api/clients?organizationId=xxx`
   - [ ] POST `/api/clients`
- [ ] Real-time connection works
   - [ ] Connect to SSE: `http://localhost:3001/api/realtime/activity-logs?organizationId=xxx`
   - [ ] Receives events when data changes
- [ ] Frontend connects to backend
- [ ] Data CRUD operations work
- [ ] Real-time updates appear in UI

---

## 🚨 Rollback Plan

If something goes wrong:

1. **Keep Supabase running** during migration
2. **Switch back** by commenting out new API calls
3. **Uncomment** old Supabase calls
4. **Fix issues** in MongoDB backend
5. **Try again**

---

## 📝 Next Steps

### Now:
1. ✅ Backend is set up
2. ✅ API client is ready
3. ✅ Realtime is configured
4. 🔄 **Start updating components** to use new API

### Soon:
- Add JWT authentication
- Migrate existing Supabase data
- Update all React components
- Remove Supabase dependencies

### Later:
- Add API validation (Zod)
- Add rate limiting
- Add logging (Winston)
- Deploy backend to production
- Add file storage (S3)

---

## 🆘 Troubleshooting

### Backend won't start

**Check MongoDB connection string:**
```bash
cd apps/backend
cat .env
```

Ensure:
- Password is correct (no special chars need URL encoding)
- Database name is `bills`
- Network access allows your IP

### "Connection refused"

Backend not running:
```bash
cd apps/backend
npm run dev
```

### CORS errors in frontend

Add your frontend URL to backend `.env`:
```env
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
```

### Real-time not working

1. Check backend console for change stream errors
2. Ensure MongoDB version supports change streams (4.0+)
3. Test SSE directly in browser:
   ```
   http://localhost:3001/api/realtime/activity-logs?organizationId=test
   ```

---

## 📚 Resources

- [MongoDB Atlas Docs](https://docs.atlas.mongodb.com/)
- [Mongoose Docs](https://mongoosejs.com/docs/)
- [MongoDB Change Streams](https://www.mongodb.com/docs/manual/changeStreams/)
- [Server-Sent Events (SSE)](https://developer.mozilla.org/en-US/docs/Web/API/Server-sent_events)

---

**Need help?** The backend is fully set up and ready to use! 🎉

