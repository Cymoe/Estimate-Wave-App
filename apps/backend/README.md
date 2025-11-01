# RedCap Backend

MongoDB + Express backend for the RedCap Sales & Pricing System.

## 🚀 Quick Start

### 1. Install Dependencies

```bash
cd apps/backend
npm install
```

### 2. Configure Environment

Create a `.env` file in `apps/backend/`:

```env
# MongoDB Connection (use your Atlas connection string)
MONGODB_URI=mongodb+srv://username:password@cluster0.xxxxx.mongodb.net/redcap?retryWrites=true&w=majority

# Server Configuration
PORT=3001
NODE_ENV=development

# CORS (add your frontend URLs)
ALLOWED_ORIGINS=http://localhost:5173,http://localhost:3000

# Database Name
DB_NAME=redcap
```

### 3. Start Development Server

```bash
npm run dev
```

The server will start on `http://localhost:3001`

## 📡 API Endpoints

### Core Resources

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/organizations` | List all organizations |
| GET | `/api/organizations/:id` | Get organization by ID |
| POST | `/api/organizations` | Create new organization |
| PATCH | `/api/organizations/:id` | Update organization |
| DELETE | `/api/organizations/:id` | Delete organization (soft) |
| | | |
| GET | `/api/clients?organizationId=xxx` | List clients |
| POST | `/api/clients` | Create client |
| PATCH | `/api/clients/:id` | Update client |
| DELETE | `/api/clients/:id` | Delete client |
| | | |
| GET | `/api/estimates?organizationId=xxx` | List estimates |
| POST | `/api/estimates` | Create estimate |
| PATCH | `/api/estimates/:id` | Update estimate |
| POST | `/api/estimates/:id/sign` | Sign estimate |
| DELETE | `/api/estimates/:id` | Delete estimate |
| | | |
| GET | `/api/invoices?organizationId=xxx` | List invoices |
| POST | `/api/invoices` | Create invoice |
| PATCH | `/api/invoices/:id` | Update invoice |
| POST | `/api/invoices/:id/pay` | Mark invoice as paid |
| DELETE | `/api/invoices/:id` | Delete invoice |
| | | |
| GET | `/api/projects?organizationId=xxx` | List projects |
| POST | `/api/projects` | Create project |
| PATCH | `/api/projects/:id` | Update project |
| DELETE | `/api/projects/:id` | Delete project |
| | | |
| GET | `/api/activity-logs?organizationId=xxx` | List activity logs |
| POST | `/api/activity-logs` | Create activity log |

### Real-time Updates

| Method | Endpoint | Description |
|--------|----------|-------------|
| GET | `/api/realtime/activity-logs?organizationId=xxx` | SSE stream for activity logs |

## 🔄 Real-time Features

The backend uses **MongoDB Change Streams** to provide real-time updates via Server-Sent Events (SSE).

### Client-side Usage:

```javascript
const eventSource = new EventSource(
  'http://localhost:3001/api/realtime/activity-logs?organizationId=YOUR_ORG_ID'
);

eventSource.onmessage = (event) => {
  const data = JSON.parse(event.data);
  console.log('New activity:', data);
};

eventSource.onerror = (error) => {
  console.error('SSE error:', error);
};

// Close connection when done
eventSource.close();
```

## 🗄️ MongoDB Schema

### Collections

- **organizations** - Company/organization data
- **clients** - Customer information
- **estimates** - Project estimates with line items
- **invoices** - Invoices with line items
- **projects** - Project management
- **activity_logs** - Audit trail and real-time events

## 🏗️ Project Structure

```
apps/backend/
├── src/
│   ├── config/
│   │   └── database.ts         # MongoDB connection
│   ├── models/
│   │   ├── Organization.ts     # Organization schema
│   │   ├── Client.ts           # Client schema
│   │   ├── Estimate.ts         # Estimate schema
│   │   ├── Invoice.ts          # Invoice schema
│   │   ├── Project.ts          # Project schema
│   │   ├── ActivityLog.ts      # Activity log schema
│   │   └── index.ts            # Export all models
│   ├── routes/
│   │   ├── organizations.ts    # Organization routes
│   │   ├── clients.ts          # Client routes
│   │   ├── estimates.ts        # Estimate routes
│   │   ├── invoices.ts         # Invoice routes
│   │   ├── projects.ts         # Project routes
│   │   ├── activityLogs.ts     # Activity log routes
│   │   ├── realtime.ts         # SSE realtime routes
│   │   └── index.ts            # Mount all routes
│   ├── services/
│   │   └── changeStreams.ts    # MongoDB change streams
│   └── index.ts                # Express app entry
├── package.json
├── tsconfig.json
└── README.md
```

## 🔧 Development

### Build for Production

```bash
npm run build
```

### Run Production Build

```bash
npm start
```

## 📝 Notes

- **Authentication**: Not implemented yet - add JWT middleware when ready
- **Rate Limiting**: Add rate limiting for production
- **Validation**: Add request validation middleware (e.g., Zod, Joi)
- **Testing**: Add unit and integration tests
- **Logging**: Add structured logging (e.g., Winston, Pino)

## 🎯 Next Steps

1. Add JWT authentication middleware
2. Connect React frontend to this backend
3. Migrate existing Supabase data to MongoDB
4. Add data validation
5. Add comprehensive error handling
6. Add API documentation (Swagger/OpenAPI)

