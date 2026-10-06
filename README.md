# FieldQuote

Estimating, pricing and invoicing for contractors and trade businesses
(roofing, painting, carpentry, drywall, concrete and more). The core idea is
**Sales Mode**: every job and price-book item has a **Redline** (the lowest
price you'll accept) and a **Cap** (the highest you'll quote), so you can
price confidently on site.

## Stack

| Part | Tech |
|---|---|
| `apps/web` | React 18 + TypeScript + Vite + Tailwind |
| `apps/web/convex` | [Convex](https://convex.dev) database and backend functions |
| Sign-in | Convex Auth: Google and email/password |
| `apps/blog` | Astro marketing blog (no database) |

`apps/backend` (Express + MongoDB) is the previous backend. Nothing in the
web app calls it any more; it is kept only until the Convex deployment is
live, then it can be deleted.

## Data model (Convex)

| Table | Holds |
|---|---|
| `organizations`, `memberships` | Companies, and which users belong to which (owner / admin / member) |
| `users` (+ Convex Auth tables) | Accounts; `role: super_admin` can edit the shared catalog |
| `clients`, `projects` | A company's customers and jobs |
| `estimates`, `invoices` | Documents with their line items; totals and tax are computed on the server |
| `industries`, `organizationIndustries` | Trades (by slug), and which ones each company works in |
| `lineItems`, `costCodes` | Price book with Redline/Cap pricing. Rows without an organization are the shared industry catalog every company sees |
| `pricingModes` | Preset and custom price adjustments ("Busy Season" +15%, …) |
| `activityLogs` | Who did what; the activity feed updates live |

Every function checks that the signed-in user belongs to the organization
whose data it reads or writes.

## Getting started

```bash
npm install
cd apps/web

# 1. Create/link a Convex project. Writes VITE_CONVEX_URL to .env.local
#    and keeps the backend in sync while it runs.
npx convex dev

# 2. In another terminal, one-time auth setup (generates signing keys and
#    sets SITE_URL on the deployment):
npx @convex-dev/auth

# 3. Load the shared catalog (pricing presets + every trade's cost codes
#    and price book):
npm run convex:seed

# 4. Start the app on http://localhost:3000
npm run dev
```

### Google sign-in (optional)

Create an OAuth client in Google Cloud Console with the redirect URI
`https://<your-deployment>.convex.site/api/auth/callback/google`, then:

```bash
npx convex env set AUTH_GOOGLE_ID <client id>
npx convex env set AUTH_GOOGLE_SECRET <client secret>
```

Email/password sign-in works without this.

### Making yourself an admin

```bash
npx convex run seed:makeSuperAdmin '{"email":"you@example.com"}'
```

## Deploying

**GitHub Actions:** `.github/workflows/convex-deploy.yml` deploys the Convex
backend whenever `apps/web/convex` changes on `main` (or when run manually).
It needs a `CONVEX_DEPLOY_KEY` repository secret, and optionally a `SITE_URL`
repository variable. It runs the backend tests, pushes the functions, sets up
Convex Auth keys if they're missing, loads the shared catalog, and then
smoke-tests sign-up and the main functions against the live deployment.

**Manually:**

1. `npx convex deploy` pushes the backend to your production deployment.
   Repeat steps 2–3 above against production (`--prod` flags), and set
   `SITE_URL` to your live site URL.
2. `apps/web/.env.production` holds the Convex URL that Vercel builds use by
   default. To point production at a different deployment, set
   `VITE_CONVEX_URL` in Vercel (it overrides the file) and redeploy. To deploy the backend from Vercel too, set `CONVEX_DEPLOY_KEY`
   and use `npx convex deploy --cmd 'npm run build'` as the build command.

## Tests

```bash
cd apps/web
npm run test:convex   # Convex backend + data layer (vitest + convex-test)
npm test              # React components (jest)
```

## Migration status

- **Done (Phase 1):** organizations, users and sign-in, clients, projects,
  estimates, invoices, price book (line items, cost codes, pricing modes),
  activity feed. Sales Mode and the Price Book list run on Convex.
- **Starter catalog:** `convex/catalog/starterCatalog.ts` holds 59 trades,
  their cost codes and about 730 price-book items, rebuilt from the old
  Supabase migrations and seed scripts (the live database itself wasn't
  available). Rows are tagged `catalog_source: "starter"`, so an export of
  the real database can replace them later.
- **Phase 2:** screens still written against the old Supabase client (it now
  returns empty data): expenses, vendors, subcontractors, team members, work
  packs, service options/packages, templates, price-book overrides. Their
  table definitions are in `apps/web/supabase/` and `apps/web/scripts/*.sql`.
