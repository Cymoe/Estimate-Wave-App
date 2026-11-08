# National Sales Registry: SMS screener

Texts door-to-door sales applicants (roofing first) for National Sales Registry's clients. A rep applies from an ad and gets a text within two minutes from **Jordan**, a recruiter persona played by Claude.

Jordan asks one question at a time:
- sales experience, closer or setter;
- door-to-door, and what they sold;
- real numbers;
- commission;
- a car;
- evenings and weekends;
- start date;
- Spanish, and whether they'd travel for storm season.

Jordan then scores them A, B or C. A's and B's get booked on the client's Cal.com calendar, and anything Jordan can't handle goes to Myles or a VA. Every applicant is saved with a score and notes.

Silence follow-ups, interview reminders, no-show rebooks and a weekly report to each client all run on their own.

Jordan's behavior, scoring, rules and tools live in **`screener-brief.md`**. It is the system prompt, so to change how Jordan talks or scores, edit that file and deploy (`npm run deploy`). Its last section, "How this system works", tells Jordan what the code does for it. Keep that section in step with the code.

Separate from the ad agent (next): every applicant carries the `sourceAdId` of the ad they came from, so the ad agent can learn which ads bring in A's.

Built on Convex (database, functions, HTTP endpoints, schedules), Claude through the Anthropic SDK, Twilio for SMS, Cal.com for booking and Resend for the report email. It is its own project with its own Convex deployment, separate from Estimate Wave in the same repo.

## How it works

```
Ad form ──POST /apply──▶ applicant saved (with the ad id) ──1–2 min──▶ first text
Rep texts ──Twilio──▶ POST /sms ──▶ STOP/START/HELP answered by the rules
                                 └─▶ agent turn: brief + whole thread + tools → Claude
                                       ↺ tools run until Claude answers → reply texted
Hourly ──▶ silent 4h: follow-up 1 · a day later: follow-up 2 · a day later: ghosted
Booked ──▶ reminder 8pm the night before + 1 hour before (client's timezone)
No-show ──▶ one rebook text with the booking link
Monday ──▶ each client gets their week by email
```

| File | What's in it |
|---|---|
| `screener-brief.md` | The brief: Claude's system prompt |
| `convex/schema.ts` | `clients`, `applicants`, `messages`, `optOuts` |
| `convex/http.ts` | `/apply`, `/sms`, `/cal`, and the simulator's endpoints |
| `convex/applicants.ts` | Applying, texts in and out, STOP/START/HELP |
| `convex/agent.ts` | The Claude loop |
| `convex/tools.ts` | `send_text`, `get_client_info`, `book_interview`, `save_applicant`, `flag_human` |
| `convex/followups.ts` | Silence follow-ups, reminders, no-shows, the Cal.com webhook |
| `convex/reports.ts` | The weekly email and the by-ad numbers |
| `convex/crons.ts` | Hourly sweep, Monday report |
| `scripts/simulate.ts` | Plays an applicant end to end with no real texts |

## Setup

```bash
cd screener
npm install
npx convex login        # once
npm run dev             # bundles the brief, creates the dev deployment on first run, then watches
```

`npm run dev` and `npm run deploy` bundle `screener-brief.md` into the code first: Convex functions can't read files. Use these npm scripts, not bare `npx convex …`. They also drop any `CONVEX_DEPLOY_KEY` already in your shell (Estimate Wave sets one), so the screener can never be pushed over another project. To deploy with a key, set `SCREENER_DEPLOY_KEY`.

Production: `npm run deploy`.

### Environment variables

Set them on each deployment with `npm run convex -- env set NAME value` (or in the Convex dashboard). Never commit them.

| Variable | What it's for |
|---|---|
| `ANTHROPIC_API_KEY` | Claude |
| `CLAUDE_MODEL` | Optional. Defaults to `claude-opus-5-5` |
| `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | Twilio account |
| `TWILIO_FROM` | The screener's own number, in E.164 (`+14325550100`) |
| `TWILIO_WEBHOOK_URL` | The exact URL set in Twilio, `https://<deployment>.convex.site/sms`. Signatures are checked against it |
| `TWILIO_ADVANCED_OPT_OUT` | `on` if Advanced Opt-Out is on for the Messaging Service. Twilio then answers STOP/START/HELP and we only keep the record |
| `FLAG_PHONES` | Who `flag_human` texts: comma-separated, e.g. Myles and a VA (`+14325550000,+14325550001`) |
| `MYLES_PHONE` | Used when `FLAG_PHONES` isn't set |
| `APPLY_SECRET` | Shared secret for `/apply` (and the simulator). Make it long and random |
| `SERVICE_NAME`, `HELP_CONTACT` | Optional. Go into the HELP reply. `SERVICE_NAME` defaults to "National Sales Registry" |
| `CAL_API_KEY` | Cal.com API key (Settings → Developer → API keys) |
| `CAL_PLACEHOLDER_EMAIL_DOMAIN` | Optional. Cal.com needs an attendee email, so a rep who gave none is booked as `<phone>@<this>` (default `sms.invalid`). Have the brief ask for their email |
| `CAL_WEBHOOK_SECRET` | Optional. Signing secret for the `/cal` webhook |
| `RESEND_API_KEY`, `RESEND_FROM` | The weekly report email, e.g. `Screening <reports@yourdomain.com>` |
| `SMS_MODE` | `simulate` on a dev deployment logs texts instead of sending them, and turns on the simulator's endpoints. **Never on production** |
| `CAL_MODE` | `stub` on a dev deployment fakes open times and bookings |

### Twilio

1. Buy a number for the screener. Don't reuse Estimate Wave's: its webhook goes to the office-line agent.
2. Register it for **A2P 10DLC** under a campaign for recruiting (use case "Account notifications" or "Mixed"). Describe the opt-in: reps give their number on the job application, and the first text says how to opt out. US carriers block unregistered traffic.
3. On the number (or its Messaging Service), set **A message comes in** to `POST https://<deployment>.convex.site/sms`. Set `TWILIO_WEBHOOK_URL` to exactly that.
4. Turn on **Advanced Opt-Out** on the Messaging Service and set `TWILIO_ADVANCED_OPT_OUT=on`. Twilio then blocks texts to anyone who sent STOP, even if a bug tried.

**How opt-outs work:**
- STOP, STOPALL, UNSUBSCRIBE, CANCEL, END, QUIT, REVOKE or OPTOUT, as the whole text, opts the number out of every client for good. It stops the agent, follow-ups and reminders.
- START, UNSTOP, or YES (after a STOP) opts back in.
- HELP or INFO gets the fixed help text.
- None of these go through Claude.
- A rep who asks to stop in their own words ("stop texting me") is opted out the same way, as the FCC's revocation rule requires. Jordan flags them with `stop_requested`, and nothing more is sent.
- Automated texts (follow-ups, rebooks) only go out 8am–9pm in the client's timezone. Replies to a rep's own text go out right away.

### Cal.com

- Each client has an event type for interviews.
- `calEventLink` is its public link, sent on a no-show.
- `calEventTypeId` is its number, from the event type's URL in Cal.com (`/event-types/123456`). `book_interview` books through the API with it.
- **Optional webhook:** add one pointing at `https://<deployment>.convex.site/cal`, with a secret (`CAL_WEBHOOK_SECRET`).
  - Triggers: Booking created, rescheduled, cancelled, no-show updated, and meeting ended.
  - Then a rep who books through the link gets a confirmation text, reschedules move the reminders, cancels clear them, a no-show mark sends the rebook text, and an ended meeting counts as showed.
  - Without it, mark attendance yourself (below).

## Adding a client

```bash
npm run convex -- run clients:create '{
  "name": "Acme Solar",
  "role": "Door-to-door solar sales rep",
  "city": "Midland, TX",
  "compSheet": "Commission only: $500 per install, paid weekly. Leads provided. Top reps clear $8k/month.",
  "calEventLink": "https://cal.com/acme/interview",
  "calEventTypeId": 123456,
  "timezone": "America/Chicago",
  "reportEmail": "hiring@acmesolar.com"
}'
```

It prints the `clientId`; put that in the client's ad forms. To see or change clients:

```bash
npm run convex -- run clients:list
npm run convex -- run clients:update '{"clientId":"…","compSheet":"…"}'
npm run convex -- run clients:update '{"clientId":"…","active":false}'   # stop taking applicants
```

## Sending applicants in

Post each application from the ad form (Zapier, Make, Typeform, a landing page):

```bash
curl -X POST https://<deployment>.convex.site/apply \
  -H "Authorization: Bearer $APPLY_SECRET" \
  -H "Content-Type: application/json" \
  -d '{"name":"Dana Reyes","phone":"(432) 555-0101","clientId":"<clientId>","sourceAdId":"fb-ad-7"}'
```

The responses:
- **201:** a new applicant. The first text goes out within two minutes.
- **200:** the same number already applied to this client, so nothing new happens.
- **422:** the request was refused, with the reason. It could be a bad phone, an unknown client, a missing `sourceAdId`, or a number that opted out.

**`sourceAdId` is required.** Use the ad's id from the ad platform (or a UTM), so you can see which ads bring in A's.

## Seeing results

```bash
npm run convex -- run reports:byAd '{"days":30}'                     # every client: per ad, applied / A / B / C / booked / showed
npm run convex -- run reports:byAd '{"clientId":"…","days":90}'
npm run convex -- run reports:week '{"clientId":"…"}'                # what Monday's email will say
npm run convex -- run applicants:thread '{"phone":"+14325550101"}'   # one rep's whole conversation
npm run convex -- run applicants:markShowed '{"phone":"+14325550101"}'
npm run convex -- run applicants:markNoShow '{"phone":"+14325550101"}'   # sends the rebook text
```

**The weekly report** goes out Mondays around 8am Central to every active client with a `reportEmail`. It covers:
- the week's applicants;
- A/B/C counts;
- interviews booked;
- the show rate: showed ÷ (showed + no-shows) over interviews due that week;
- a by-ad table.

## Testing the brief

**Unit tests** (no keys needed: Claude is scripted, texts are logged):

```bash
npm test
```

**The simulator** plays an applicant against your **dev** deployment with the real Claude and the real brief. Twilio and Cal.com are stubbed.

1. Set the dev deployment up for it, once:
   ```bash
   npm run convex -- env set SMS_MODE simulate
   npm run convex -- env set CAL_MODE stub
   npm run convex -- env set APPLY_SECRET <something>
   npm run convex -- env set ANTHROPIC_API_KEY <your key>
   ```
2. Put `SCREENER_SITE_URL=https://<dev-deployment>.convex.site` and the same `APPLY_SECRET` in `screener/.env.local`. `npm run dev` already wrote `CONVEX_URL` there; the site URL is the same with `.convex.site`.
3. Run a script, or type the rep's side yourself:
   ```bash
   npm run simulate -- --script happy     # D2D roofing closer with numbers, bilingual: should be an A and book
   npm run simulate -- --script c         # no car, no weekends: should be a C, kept on file
   npm run simulate -- --script stop      # STOP mid-conversation
   npm run simulate -- --script flag      # asks something Jordan can't answer
   npm run simulate -- --script angry     # upset, "stop texting me": flagged and opted out
   npm run simulate -- --script ghost     # answers twice, then goes quiet
   npm run simulate -- --interactive
   ```

The simulator creates (then reuses) a test client called "Simulation Roofing", with a roofing comp sheet. Each run uses a new 555-01xx number. At the end it prints the thread and the applicant's status, score, answers and notes.

You can also run it with no Convex account at all: `CONVEX_AGENT_MODE=anonymous npm run dev` starts a local backend at `http://127.0.0.1:3211`.
