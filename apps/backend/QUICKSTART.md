# 🚀 RedCap Backend - 5 Minute Setup

## Step 1: Get MongoDB Connection String

1. Go to [MongoDB Atlas](https://cloud.mongodb.com)
2. Click **"Connect"** on your `Cluster0`
3. Choose **"Connect your application"**
4. Copy connection string - should look like:
   ```
   mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/?retryWrites=true&w=majority
   ```
5. Replace `<password>` with your actual password
6. Add `/redcap` before the `?`:
   ```
   mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/redcap?retryWrites=true&w=majority
   ```

## Step 2: Install & Run

```bash
cd apps/backend

# Install dependencies
npm install

# Create .env file (paste your connection string from above)
cat > .env << 'EOF'
MONGODB_URI=mongodb+srv://YOUR_CONNECTION_STRING_HERE
PORT=3001
NODE_ENV=development
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000
DB_NAME=redcap
EOF

# Start the server
npm run dev
```

## Step 3: Verify It Works

You should see:
```
✅ MongoDB connected successfully
📦 Database: redcap
🚀 Server running on http://localhost:3001
🔄 Starting MongoDB Change Stream for activity_logs...
```

Test it:
```bash
curl http://localhost:3001/api/health
# Should return: {"status":"ok","timestamp":"..."}
```

## Done! 🎉

Your RedCap backend is running. Now:

1. **Frontend setup**: Add `VITE_API_URL=http://localhost:3001/api` to `apps/web/.env.local`
2. **Create test data**: Use the API or import from Supabase
3. **Start building**: Update React components to use the new API

See `REDCAP_SETUP.md` for full docs and `REDCAP_VISION.md` for the product vision.

---

**Your Cluster0 now has:**
- `fb-group-ads-manager` (existing)
- `redcap` (new) ← Your sales pricing database

Both completely isolated, one connection, zero extra cost! 💪

