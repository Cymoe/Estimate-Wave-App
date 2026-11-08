# Recruiting: National Sales Registry

Two agents for National Sales Registry, a recruiting service for door-to-door sales companies (roofing first). They live inside Estimate Wave's Convex deployment, kept apart by their own tables (`recruit*`) and their own Twilio number.

- **Jordan** (`agent.ts`, `tools.ts`) texts each applicant within two minutes of applying. Jordan screens them one question at a time, scores them A, B or C, books interviews on the client's Cal.com calendar, and flags anything odd to Myles or a VA.
- **The ad agent** (`adAgent.ts`, `ads.ts`) writes each client's recruiting ads every Monday. It learns which ads bring in A's, and a person approves every ad.

Everything is managed in **Ops → Recruiting** (`/ops/recruiting`, staff only):
- **Applicants:** each rep's thread, answers, score, and Showed / No-show.
- **Try it:** text Jordan as a rep. The real brief and tools run, but nothing is sent, booked or counted.
- **Ads:** approve or reject drafts. Approving gives the ad its source ad id. Also retire suggestions, spend, and the numbers.
- **Clients:** add a client and their ad inputs.
- **By ad:** which ads bring in A's.
- **Setup:** what's connected, and the addresses to give out.

## The briefs

`screener-brief.md` is Jordan's system prompt; `ad-brief.md` is the ad agent's. Convex can't read files, so they're bundled into `lib/briefs.ts`.

**After editing a brief, run `npm run recruiting:briefs` in `apps/web` and commit both files.** A test fails if they disagree, so the deploy won't ship a stale brief.

## Environment (Convex dashboard → Estimate Wave's deployment → Settings → Environment Variables)

| Variable | For |
|---|---|
| `ANTHROPIC_API_KEY` | Jordan and the ad agent (already set). This is all **Try it** needs |
| `RECRUIT_TWILIO_FROM` | Jordan's own number. Without it, no recruiting text goes out. The office line's `TWILIO_FROM` is never used |
| `RECRUIT_TWILIO_WEBHOOK_URL` | Optional. The exact URL set in Twilio, if signatures fail behind a proxy |
| `RECRUIT_APPLY_SECRET` | Ad forms send it with each applicant (`Authorization: Bearer …`) |
| `RECRUIT_FLAG_PHONES` | Who `flag_human` texts: Myles and a VA, comma-separated |
| `CAL_API_KEY`, `CAL_WEBHOOK_SECRET` | Booking through Cal.com, and its webhook (optional) |
| `RECRUIT_TWILIO_ADVANCED_OPT_OUT` | `on` when Twilio's Advanced Opt-Out answers STOP/HELP for the number |
| `RECRUIT_REVIEW_EMAIL` | Optional. Gets "new ads to review" on Mondays |
| `RECRUIT_SERVICE_NAME`, `RECRUIT_HELP_CONTACT` | Optional. Go in the HELP reply |
| `RECRUIT_CLAUDE_MODEL` | Optional. Defaults to `claude-opus-5-5` |

The Twilio account (`TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN`) and Resend are shared with Estimate Wave.

## Going live with texting

1. Buy a second Twilio number and register it for **A2P 10DLC** under a recruiting campaign.
2. Set that number's **A message comes in** webhook to `https://<deployment>.convex.site/recruiting/sms`. Ops → Recruiting → Setup shows the exact address.
3. Turn on Advanced Opt-Out, then set `RECRUIT_TWILIO_FROM` and `RECRUIT_TWILIO_ADVANCED_OPT_OUT=on`.
4. Have the ad forms POST each applicant to `/recruiting/apply` with:
   - `{"name","phone","clientId","sourceAdId"}`
   - `Authorization: Bearer <RECRUIT_APPLY_SECRET>`

## Endpoints

- `POST /recruiting/apply`: a new applicant.
- `POST /recruiting/sms`: Twilio inbound. The signature is checked.
- `POST /recruiting/cal`: Cal.com webhook. It handles link bookings, reschedules, cancels, no-shows and meetings ended.
- `POST /recruiting/ads/spend`: `{"sourceAdId","dollars"}`, the media buyer's running total.
