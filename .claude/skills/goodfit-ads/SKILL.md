---
name: goodfit-ads
description: How to work on the GoodFit Pros ad maker (Ops → Ads). Use whenever you change how ads are written, checked or drawn, make or remake an ad, or show ads to the owner. Covers the honesty rules, the look, how to run the ad maker from a cloud session, and how to check an ad before anyone sees it.
---

# GoodFit Pros ads

The ad maker writes, voices and draws short Facebook and Instagram ads for **GoodFit Pros**, the homeowner-facing
brand. The ads speak **as the painters** ("we", "our crew"), the way the competitor ads do. The only offer is a
**free quote from GoodFit Pros**. Never say GoodFit Pros matches or connects anyone with a pro: the owner doesn't
want that line. The trades are painting and hardscaping (`outdoor-construction`).

## Where things live

| What | Where |
| --- | --- |
| Writer instructions, plan checks, banned words | `apps/web/convex/lib/ads.ts` (`motionPrompt`, `motionPlanProblems`, `FORBIDDEN`) |
| The weekly run, voice, renders, Meta | `apps/web/convex/ads.ts` |
| Tests | `apps/web/convex/ads.test.ts` (`npx vitest run --config vitest.convex.config.ts convex/ads.test.ts` from `apps/web`) |
| The screen | `apps/web/src/components/ops/AdsCard.tsx` |
| The drawing (Remotion) | `ads-video/src` — `reel/` for photo reels, `formats/Still.tsx` for before/after stills, `formats/Explainer.tsx` for checklists over photos |

## Honesty rules (never break these)

- **Real job photos only.** No AI people, no AI-made "after", no AI photo motion.
- **No prices, dollar amounts, discounts, guarantees or warranties.** Don't promise how fast anyone answers.
- **Never say vetted, screened, top-rated or "the best"** about the pros.
- **No made-up customers, reviews or testimonials.** GoodFit Pros speaks as the company doing the work ("We took
  every door off"), never as a homeowner or customer.
- **Only facts you can see.** Use only facts visible in the photos or written in their descriptions. Never invent
  an age, a street or a town for a job. Never say or hint where a pictured job was.
- **One job per story.**
  - An ad made for one photo (`makeFromPhoto`) shows that job only.
  - A before/after shows one job, before first.
  - Never open or close on a before.
- **Every ad is built on a real competitor ad.** It must be a long-running one from the competitor table
  (`adSwipes`).
  - When the ad has a real script (its transcript or copy, at least 12 words once repeats are taken out by
    `onceOnly`), the writer follows that script line by line, in its voice, **at its full length**: as many words
    as they said (`scriptLength`, capped at 150), up to 14 lines of up to 28 words, and primary text as long as
    their written copy (up to 1,500 characters). A summary of a long script is rejected by `motionPlanProblems`.
    The quick offer is the one deliberate short version (hook and strongest point).
  - Change only what isn't true for us: their name, prices, discounts, warranties or guarantees, awards, review
    counts, years in business, licensed or insured claims, and deadlines.
  - With only a headline's worth of words, keep its angle and kind of opening.
  - If a trade has no competitor ads on file, make no ads for it.
- **The repo is public.** Never commit job photos, voice files or music. Samples go in `ads-video/public/sample`
  (gitignored).

## The look

- The voice is **Chris** (ElevenLabs, set in Ops → Ads → Settings). The length follows the competitor script; sentences of 6 to 12
  words, the brand name only in the last line.
- **Reels:**
  - The first frame is the before, with the title.
  - Each later line gets a 3 to 7 word headline, so the ad can be followed with the sound off.
  - Captions show short phrases.
  - There is one sound on the reveal.
  - **Steady photos** (the owner chose this over the old cut-and-zoom look, Nov 2026): each photo is up once
    while its line is said, shown whole (a soft, dark copy of it fills the edges) and drifts in only about 3%.
    Photos change with a soft fade. Never cut from a photo to the same photo, never zoom or pan hard, no opening
    flashes. `steady: false` draws the old look, for comparison only.
- **Stills:** the before and the after of the same job, side by side or stacked, with Before/After chips.
- **Checklists (explainers):** made for cost-education ideas, over the job's own photos.
  - Each line's photo fills the screen and moves in slowly. A tagged title opens the ad over finished work.
  - Each point sits low in its own dark box, numbered, then ticked (or crossed for what a quote leaves out) once
    it has been said.
  - Each point's photo must show what the point says. Never a before, and never dollar numbers.
  - The owner said graphics alone aren't enough: always use photos.
  - **Prep vs no prep** (prep or process ideas): each point first shows the corner a no-prep quote cuts, crossed
    out in red, then the prepped way ticked over a real prep photo. The no-prep side is words only: we have no
    photos of bad work, so never show or call a photo the no-prep way, and never blame damage on skipped prep.
    Make one with `ads:weeklyRun {force, only:[hookId], trade, style:"explainer"}`.
- **Looks for checklists** (`design.look`, same words, voice and photos):
  - none: the dark-box look (`Explainer.tsx`);
  - `"collage"`: printed cards, stickers and a hand-drawn ring (`Collage.tsx`);
  - `"markup"`: the photo marked up with a pen (`Markup.tsx`). Brackets snap onto the spot the writer's x/y
    names, a ring draws round it, the label types on, and the no-prep note is scribbled out. The x/y must be on
    the real detail the point names.
  - `"versus"`: a face-off (`Versus.tsx`). The no-prep words fill the screen in red, then the prep photo pushes
    them up with a VS, strikes them and shoves them off.

  Renderer-only looks the owner turned down: swiss, kinetic, slices, and the `snappy` dark-box mode.

  Copy a made checklist into another look with `ads:addLook {name, look}`. It copies only the original ads of
  that name in the newest batch, never earlier copies, as `<name>_<look>`, and starts their drawing (dispatch
  `ads-render.yml`). Run looks side by side to see which costs less per lead.
- Moves are timed to Chris's words (`line.words`) and the music's beats (`sound.beats`). The motion helpers are
  in `ads-video/src/parts/motion.ts`.
- **Three angles, each with a job** (research, Nov 2026):
  - **Story:** one job, problem, the turn, the after. It stops strangers. Story ads were about 2x as effective as
    feature ads in a 15,000-ad study.
  - **Lesson:** checklist, marked-up or face-off. It earns trust with people who have seen us.
  - **Quick offer** (`design.quick`): about 9 seconds and 3 lines on one job's photos (a before and its after, or
    one finished photo).
    - The hook speaks to the area ("Midland homeowners, look at this."), never placing the job.
    - Then the one thing we did, then the free quote. Checked in `motionPlanProblems(plan, photos, { town })`.

  Each week: a lesson comes second, and a quick offer is made on one job from the week's story (setting
  `quickOffer`, on by default). Make one on demand with
  `ads:weeklyRun {force, only:[hookId], trade, style:"quick"}`. Cards say Story, Lesson (look) or Quick offer.
  Meta favours many truly different ads in one ad set, so keep the angles varied. Judge by cost per booked job,
  not just cost per lead.
- **Sharper moves** (`punch` prop, sample only until the owner says yes):
  - photos ramp in fast and then drift, with a kick on each music beat;
  - the music drops out about half a second before the ask, then the end card slams in;
  - a spotlight in Markup dims and greys the rest of the photo.
- **Remotion license:** free only for companies of 3 people or fewer; above that it's $25 per seat per month.
  HyperFrames (HeyGen, Apache-2.0) is the free alternative, and the fastest-growing Claude video tool.
- **Never change the look of live ads without showing the owner a sample first and getting a yes.**

## A real voice actor (Bunny Studio)

- Ops → Ads → Settings → Voice picks who reads: the ElevenLabs voice (default) or a real voice actor from
  Bunny Studio. With a voice actor, the voice step (`ads.ts` `voice`) hands the lines to `voiceActors.ts`
  `order` instead of ElevenLabs. The ad waits as **recording** ("With the voice actor").
- `voiceActors:checkOrders` runs every 30 minutes, and on "Check now". When the read is back it is downloaded,
  ElevenLabs speech-to-text times each word, and `lib/voiceActors.ts` `alignmentFromWords` turns that into the
  same character timing ElevenLabs' voice gives. The ad is then timed and drawn exactly as before
  (`lib/adVoice.ts` `useRead`), and the read is approved at Bunny Studio.
- A read with under 80% of the script's words is held back, with the reason on the card. The owner asks for a
  revision in Bunny Studio, and the redo is taken when it comes.
- Env on the deployment: `BUNNY_STUDIO_TOKEN` (or `BUNNY_STUDIO_EMAIL` + `BUNNY_STUDIO_PASSWORD`).
  `BUNNY_STUDIO_TEST=1` orders test projects that aren't recorded or billed. Bunny Studio has to enable API
  access on the account first. `ELEVENLABS_API_KEY` is still needed for the timing.
- **Webhook:** Bunny Studio can call `POST <site>/bunny-studio/notify` (http.ts), so a read is taken in at once
  (`voiceActors:checkProject`) instead of on the half-hourly check, which stays as the safety net. Bunny Studio
  sets it up on their side and signs its calls with HTTP basic auth. Give them the URL plus the user and password
  set as `BUNNY_STUDIO_WEBHOOK_USER` and `BUNNY_STUDIO_WEBHOOK_PASSWORD` on the deployment. With either unset,
  every call is refused.

## An on-camera creator

- No creator marketplace takes orders by API. Each ad card has "Copy on-camera brief": the lines and how to film
  them on a green screen, to send to a creator by hand.
- The take comes back by hand too: "Add on-camera take" on the ad card (`onCamera:addTake`). It goes on both sizes
  of the idea, and the ad waits as "Timing the take". The take is timed and checked against the script like a
  voice actor's read (under 80% of the words fails the ad, with the reason). Then it becomes the voice: its own
  sound is the ad's audio.
- The renderer stands the creator low on the right in front of the photos (`ads-video/src/parts/Presenter.tsx`).
  Each frame is keyed in the page (`keyGreen`): any pixel the green dominates goes see-through and green spill
  is pulled back. No key colour has to be picked, but green clothes vanish too: the brief says so. The end card
  covers the creator at the ask.
- An ad already in Meta can't take one: reject it, make it again, and add the take to the new one.
- A creator on camera must speak as the company's spokesperson, never as a customer or as the person who did
  the work. Real people only: never an AI presenter.
- **The on-camera look is new: show the owner a sample with a real take before any of these ads go live.**

## Job site videos

- A clip the crew shot on the job runs as the ad, as it was shot. "Make a job site ad" on a video in Ops → Ads →
  Library (`footage:make`) starts its own batch. Clips over 90 seconds are refused: trim them first.
- ElevenLabs hears the clip, and what is said becomes the captions (`lib/footage.ts` `linesFromHeard`).
  Claude writes the title, headline and primary text from what is heard and seen, following the trade's best
  competitor ad that is itself work on camera (`pickFootageSwipe`, `isWorkFootage`: swipes tagged "process", or
  described as a process or spraying video), else the best of any kind. Spray Tex's plain process videos (guys
  spraying, no talking) have run well over a year: people watch work being done.
- A clip nobody talks in plays the active music track under the job site's own sound, fuller than under a voice. The text goes through the same banned claims
  (`forbiddenIn`), with one retry. No competitor ad on file means no ad.
- It is stored as design style `"footage"` (card label "Job site video"), two sizes, status voiced. The clip
  itself is the audio. Its hook is inactive, so the weekly run never drafts it on its own.
- The renderer (`ads-video/src/parts/Footage.tsx`) shows the clip whole over a soft, dark copy of itself, muted
  (its sound is the levelled voice track). **No title or text across the top** (the owner said job site videos need
  none, Nov 2026): only the small brand tag, captions of what is said, and the end card after the clip ends. A clip with no sound plays silent.
- **Short text** (the owner found competitor-length text ridiculous, Nov 2026): the text above a job site video
  is at most 150 characters, one or two plain sentences ending on the free quote, with no emoji or check-mark lists
  (`FOOTAGE_PRIMARY_MAX`). It follows the competitor ad's angle and opening, not its length.
- **Songs in the clip:** Claude names what speech-to-text heard as `crew`, `song` or `none`. Only `crew` words
  become captions. With `song` (lyrics of a radio or song in the background, e.g. "Wicked Game"), there are no
  captions and the clip plays silent under our music (`design.muteClip`): a copyrighted song gets an ad muted or
  blocked.
- Real footage only, as with photos: never AI-made or AI-moved. Captions come from what is heard, so check a
  name or a word that could be misheard before approving.

## Tesseract test (job site videos)

- The owner asked to try Tesseract (Mirage's local video engine, CLI `tsrct`) on job site videos (Nov 2026).
  Each job site ad is also made as a Tesseract pair (`design.engine: "tesseract"`, names end `_tx`, card
  "Job site video (Tesseract)") beside the Remotion pair: same clip, words, captions and end card. Settings →
  "Also draw job site videos with Tesseract" switches it off.
- The renderer sends those to `ads-video/scripts/tesseract.mjs`: a fixed recipe of Tesseract actions (no model in
  the loop) applied with `tsrct project apply`, exported with the runner's FFmpeg. About 20 to 30 seconds per ad
  on CPU.
- The workflow installs the pinned CLI (0.8.0, its SHA-256 checked), Mesa lavapipe (software Vulkan, no GPU),
  fonts-inter and FFmpeg, and turns telemetry off. If that step fails, only the Tesseract copies fail. A push
  that changes the renderer also draws a made-up Tesseract job site video (`fixtures/tesseract.json`).
- **Licence:** free, but commercial use by a business with US$1M or more in yearly revenue (with affiliates) needs
  a written agreement with Mirage (terms s.2.2.3). The owner confirmed they are under it (Nov 2026). Recheck
  if that changes. The terms also bar automated systems other than AI agents (s.3.1.1(f)); a scripted render in
  CI is a grey area worth asking Mirage about before relying on it.
- Judge the two by cost per booked job, as with looks. Remove whichever loses.

## Running things from a cloud session

- Local `npx convex run` doesn't work here. To run a function on the live deployment, dispatch the
  `convex-deploy.yml` workflow with inputs `function` (for example `ads:lastBatch`) and `args` (a JSON string).
  Run one at a time, and wait for a push's own deploy to finish first.
- To read a function's result, list the run's jobs, get the job's log URL, download it, and pull out the JSON it
  printed. The log only exists once the job has finished.
- **Drawing starts on its own.** `ads-render-timer.yml` on the default branch (`main`) is a watcher. Every minute it
  asks `ads:waitingCount`; when an ad waits and no drawing is under way, it starts `ads-render.yml` on
  `fieldquote-convex` with `timed: true`. Each run watches for almost six hours, then starts the next. A timer every
  three hours restarts it if a hand-off is missed. (GitHub never ran a plain five-minute timer here, so don't go back
  to one.) To draw at once, dispatch `ads-render.yml` by hand (no inputs). If the watcher has stopped, dispatch
  `ads-render-timer.yml` on `main`.
- `ads:lastBatch` shows the newest batch: each ad's lines, file links and the competitor ad it was built on.
  `ads:lastBatch {names:[…]}` shows the named ads from any batch, to check a redraw.
- `ads:makeFromPhoto {assetId, line, opening?, scope?}` makes an ad for one job's photo.
- `ads:voiceSamples {text, voiceIds, lines}` returns a timed read, for drawing a local sample of a new kind of ad.

## Jobs: one job's photos together

A story shows one real job, before to finish, so no other job's work passes for it. The library groups photos
into jobs (`adJobs`; `adAssets.jobId`):
- **Filing photos under a job:**
  - In Ops → Ads → Library a job is a tag: the purple job tags on each photo card (and on "Tags for the next
    upload"). Tap one to tag the photo, tap again to take it off; "+ job" names a new one (`addJob`, `setAssetJob`).
    From the deployment, `groupIntoJob {ids, name|jobId}` files many at once.
  - From a project, staff press "Use these photos for ads" on its Photos tab (`PhotosForAds`). The browser copies
    each project photo through the normal upload, so it gets its JPEG still and Claude's tags.
  - `jobForProject` returns the job and the project photos already copied (`adAssets.jobPhotoId`), so sending again
    adds only new photos.
- **Labels say what a photo shows** (`adAssets.items`, from the trade's `items` list: doors, trim, front door,
  fence...). Claude picks them in the same look that describes an upload (`describePrompt`, `cleanItems`). A
  person's fix (`setItems`) sticks. `ads:labelLibrary` labels files that have none (3 s apart; a look Claude
  turns away with 429/5xx is retried by itself). If a file still has none, `ads:lookOnce {"id":...,"save":true}`
  runs the real look and says what came of it (a cut-off reply once left busy photos unlabelled).
  - When an idea names a label (`itemsIn`, e.g. "front door painting"), `pickAssets`/`pickJob` offer those photos
    first, and the writer sees each photo's labels.
  - The Library has a filter row by label.
- **Pairs are automatic.** Nobody types a pair key. Within a job, Claude matches each before with the after of the
  same spot (`pairJob`, `pairingPrompt`/`readPairing`). It runs 20 seconds after the job's photos or their
  before/after tags change, and only the latest ask runs. Moving a photo out of a job drops its pair.
  `ads:pairAllJobs` asks for every job at once.
- **The job's name is private.** It is the owner's own and can say where the job was. It goes to the request reader
  only, never to the writer, an ad or the private page.
- **A story or quick offer** is told from one job when one fits: 3 or more photos (`JOB_MIN`), one of them of the
  idea's kind, and none used this week. `pickJob` prefers a job with a before and an after, then the least used.
  `jobInOrder` offers the job's photos as befores, then work, then finishes. With no job that fits, photos are picked
  across the library as before.
  - The quick offer uses the story's job.
  - A checklist may still mix jobs.
- **A job named in the line** ("an ad from the Smith kitchen"): the reader is shown the jobs by name and answers with
  a number. `adRequests.jobId` is set and every version, the checklist too, uses only that job's photos.

## "Make an ad for X"

When the owner says "spin up a FB ad for …" (in chat, or in the box at the top of Ops → Ads), one line becomes three
versions of the same offer, each in both sizes:
- a story;
- a lesson (checklist);
- a quick offer on the story's job.

How it works:
- `ads:makeFor {ask}` (the Ops box) or `ads:makeForInternal {ask}` (from a cloud session, through
  `convex-deploy.yml`) saves an `adRequests` row and returns `{link}`. That is the private page `/ads/<token>` on
  the backend's own address (`<deployment>.convex.site`, served by `convex/lib/adRoutes.ts` with its data at
  `/ads/<token>.json`). It needs no login, and updates itself as each step finishes. The app's preview address asks
  for a Vercel sign-in, so links never point there.
- `ads:readRequest` asks Claude for the trade, the kind of job (`trade.scopes`, else general), the town, and a
  one-line idea. Then `startRequestAds` builds two hooks (off, so Monday never repeats them):
  - the story on the best competitor ad with a script for that kind of job;
  - the lesson on a different one, a teaching ad first (`pickRequestSwipes`).
- It then runs `weeklyRun {only, requestId, town, quickToo}`. The quick offer speaks to the town the line named.
  A request skips the live-ads cap.
- `requestView {token}` is the page's data. The stage (`requestStage`) is worked out from the request, its batch and
  its ads: reading, writing, voicing, drawing, ready or failed.

From a cloud session:
1. Dispatch `ads:makeForInternal {"ask":"…"}`.
2. Read the link from the log and send it to the owner straight away.
3. When the page says Ready, check every frame and the loudness as below.
4. If something is wrong, tell the owner, and fix the cause.

## Before the owner sees any ad

1. Download every video and still.
2. Pull frames (`ffmpeg -vf fps=1`), make a contact sheet, and **look at every frame**. Check that:
   - the photos are of the same job;
   - nothing is blurry, blank, or cut so it shows the wrong half;
   - the headline is true of the picture under it;
   - nothing breaks a rule above.
3. Check the loudness: about −18 LUFS (`ffmpeg -af ebur128`).
4. If anything is wrong, fix the cause in the ad maker (prompt, checks or drawing), add a test, push, and make
   the ad again. Don't hand-patch one ad.

## Showing the owner

- The owner is not technical and works on an iPad. Write short, plain words. No code, file paths or jargon in
  messages to them.
- Files sent as attachments don't show on their iPad. Put samples on a private web page (an Artifact) with the
  video and still embedded, and for each ad show the competitor ad it was built on beside ours.
- Say where the ad is waiting (Ops → Ads → This week) and that nothing runs until they approve it.
