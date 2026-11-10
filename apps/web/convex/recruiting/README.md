# Recruiting: National Sales Registry

Two agents for National Sales Registry, a recruiting service for door-to-door sales companies (roofing first). They live inside Estimate Wave's Convex deployment, kept apart by their own tables (`recruit*`) and their own Twilio number.

- **Jordan** (`agent.ts`, `tools.ts`) texts each applicant within two minutes of applying. Jordan screens them one question at a time, scores them A, B or C, books interviews on the client's Cal.com calendar, and flags anything odd to Myles or a VA.
- **The ad agent** (`adAgent.ts`, `ads.ts`) writes each client's recruiting ads every Monday. It learns which ads bring in hires and A's per dollar, and a person approves every ad.

Two public pages, no login (`public.ts`):
- **The apply page**, `/jobs/<slug>?ad=<source ad id>`: what every ad links to. A rep leaves a name and cell and checks the box agreeing to texts; the exact words and the time are saved with them (proof of opt-in for A2P 10DLC). Jordan texts within two minutes. Approving an ad in Ops gives its link.
- **The hires link**, `/hires/<token>`: private to each client and in their weekly report. They mark who they hired; hires lead the ad numbers.

Everything is managed in **Ops → Recruiting** (`/ops/recruiting`, staff only):
- **Applicants:** each rep's thread, answers, score, Showed / No-show, and Hired / Not hired. Staff can text a rep themselves (from Jordan's number, logged on the thread under their name): that takes the conversation from Jordan, the rep's replies are texted to the flag phones, and **Hand back to Jordan** lets the agent pick up again (`people.ts`).
- **Try it:** text Jordan as a rep. The real brief and tools run, but nothing is sent, booked or counted.
- **Ads:** approve or reject drafts. Approving gives the ad its source ad id. Also retire suggestions, spend, and the numbers.
- **Clients:** add a client and their ad inputs; each shows its apply page and hires link.
- **By ad:** which ads bring in A's.
- **Setup:** what's connected, and the addresses to give out.

## Billing clients and the sales page

- **Billing** (`billing.ts`): each client gets a plan in Ops → Recruiting → Clients: a monthly retainer and a fee per hire. **Send payment link** makes a Stripe Checkout subscription and emails it to the client's report email. Stripe's webhook (`/stripe/webhook`, shared with the lead balance) marks them Paying, Payment failed (staff are told) or Canceled. Each rep marked hired adds the hire fee to their next monthly invoice, once; un-marking it before the invoice takes it off. Test and demo reps are never billed. Needs `STRIPE_SECRET_KEY` and `STRIPE_WEBHOOK_SECRET`, and the webhook must send `checkout.session.completed`, `invoice.paid`, `invoice.payment_failed` and `customer.subscription.deleted`.
- **The sales page**, `/recruit`: the offer, a scripted screening playing as texts, the prices and Book a call. Set `RECRUIT_PRICE_MONTHLY` and `RECRUIT_PRICE_PER_HIRE` (dollars; default 2500 and 250), `RECRUIT_SALES_BOOKING_URL` (else `RECRUIT_SALES_PHONE` by text, else email).

## The demo

Ops → Recruiting → Setup → Demo (`demo.ts`): **Load demo data** makes Demo Roofing Co with 14 applicants in every state, threads, ads with spend, a batch of drafts to approve (two with warnings) and two hires. **Watch a live conversation** plays a rep from first text to hired in about a minute and a half. Applying at `/jobs/demo` runs the same script with your own name. All scripted: no Claude, Twilio or Cal.com, and nothing is texted. **Remove demo data** takes it all out. From a terminal: `npx convex run recruiting/demo:seed` (or `:live`, `:clear`).

## The briefs

`screener-brief.md` is Jordan's system prompt; `ad-brief.md` is the ad agent's. Convex can't read files, so they're bundled into `lib/briefs.ts`.

**After editing a brief, run `npm run recruiting:briefs` in `apps/web` and commit both files.** A test fails if they disagree, so the deploy won't ship a stale brief.

## Environment (Convex dashboard → Estimate Wave's deployment → Settings → Environment Variables)

| Variable | For |
|---|---|
| `ANTHROPIC_API_KEY` | Jordan and the ad agent (already set). This is all **Try it** needs |
| `RECRUIT_TWILIO_FROM` | Jordan's own number. Without it, no recruiting text goes out. The office line's `TWILIO_FROM` is never used |
| `RECRUIT_TWILIO_ACCOUNT_SID`, `RECRUIT_TWILIO_AUTH_TOKEN` | Jordan's own Twilio account (the number is in it). Without them, the office line's account is used |
| `RECRUIT_TWILIO_WEBHOOK_URL` | Optional. The exact URL set in Twilio, if signatures fail behind a proxy |
| `RECRUIT_APPLY_SECRET` | Optional. Only for ad forms that post applicants straight to `/recruiting/apply` (`Authorization: Bearer …`); the apply page doesn't need it |
| `RECRUIT_FLAG_PHONES` | Who `flag_human` texts: Myles and a VA, comma-separated |
| `CAL_API_KEY`, `CAL_WEBHOOK_SECRET` | Booking through Cal.com, and its webhook (optional) |
| `RECRUIT_TWILIO_ADVANCED_OPT_OUT` | `on` when Twilio's Advanced Opt-Out answers STOP/HELP for the number |
| (per client) Report email | Set on the client: a note for each interview booked or moved (who's coming, their score and answers, the hires link), and the weekly report |
| `RECRUIT_REVIEW_EMAIL` | Optional. Gets "new ads to review" on Mondays |
| `RECRUIT_SERVICE_NAME`, `RECRUIT_HELP_CONTACT` | Optional. Go in the HELP reply |
| `RECRUIT_CLAUDE_MODEL` | Optional. Defaults to `claude-opus-5-5` |

Resend is shared with Estimate Wave. Twilio is too, unless `RECRUIT_TWILIO_ACCOUNT_SID` and `RECRUIT_TWILIO_AUTH_TOKEN` point at Jordan's own account; then sending and the `/recruiting/sms` signature check both use that account.

## Going live with texting

1. Buy a second Twilio number and register it for **A2P 10DLC** under a recruiting campaign.
2. Set that number's **A message comes in** webhook to `https://<deployment>.convex.site/recruiting/sms`. Ops → Recruiting → Setup shows the exact address.
3. Turn on Advanced Opt-Out, then set `RECRUIT_TWILIO_FROM` and `RECRUIT_TWILIO_ADVANCED_OPT_OUT=on`.
4. On the registration, give the opt-in page (`/jobs/<slug>`, which shows the consent wording) and the privacy policy (`/privacy#recruiting`, the National Sales Registry section, with the no-sharing line for mobile numbers and consent).
5. Point each ad at its apply link (Ops → Recruiting → Ads, once approved). The A2P campaign's opt-in proof is the apply page: give the registration a client's `/jobs/<slug>` address.
6. Or, for a form that posts applicants itself: POST `/recruiting/apply` with `{"name","phone","clientId","sourceAdId"}` and `Authorization: Bearer <RECRUIT_APPLY_SECRET>`.

## Endpoints

- `POST /recruiting/apply`: a new applicant.
- `POST /recruiting/sms`: Twilio inbound. The signature is checked.
- `POST /recruiting/cal`: Cal.com webhook. It handles link bookings, reschedules, cancels, no-shows and meetings ended.
- `POST /recruiting/ads/spend`: `{"sourceAdId","dollars"}`, the media buyer's running total.
