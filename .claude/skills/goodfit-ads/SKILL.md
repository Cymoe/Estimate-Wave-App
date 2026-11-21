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

- The voice is **Chris** (ElevenLabs, set in Ops → Ads → Settings), about 45 to 55 words, sentences of 6 to 12
  words, the brand name only in the last line.
- **Reels:**
  - The first frame is the before, with the title.
  - Each later line gets a 3 to 7 word headline, so the ad can be followed with the sound off.
  - Captions show short phrases.
  - There is one sound on the reveal.
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

## Running things from a cloud session

- Local `npx convex run` doesn't work here. To run a function on the live deployment, dispatch the
  `convex-deploy.yml` workflow with inputs `function` (for example `ads:lastBatch`) and `args` (a JSON string).
  Run one at a time, and wait for a push's own deploy to finish first.
- To read a function's result, list the run's jobs, get the job's log URL, download it, and pull out the JSON it
  printed. The log only exists once the job has finished.
- **Drawing never starts on its own.** After an ad is voiced, dispatch `ads-render.yml` by hand.
- `ads:lastBatch` shows the newest batch: each ad's lines, file links and the competitor ad it was built on.
- `ads:makeFromPhoto {assetId, line, opening?, scope?}` makes an ad for one job's photo.
- `ads:voiceSamples {text, voiceIds, lines}` returns a timed read, for drawing a local sample of a new kind of ad.

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
