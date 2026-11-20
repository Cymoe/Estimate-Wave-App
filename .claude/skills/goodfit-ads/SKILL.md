---
name: goodfit-ads
description: How to work on the GoodFit Pros ad maker (Ops → Ads). Use whenever you change how ads are written, checked or drawn, make or remake an ad, or show ads to the owner. Covers the honesty rules, the look, how to run the ad maker from a cloud session, and how to check an ad before anyone sees it.
---

# GoodFit Pros ads

The ad maker writes, voices and draws short Facebook and Instagram ads for **GoodFit Pros**, the homeowner-facing
brand. GoodFit Pros matches a homeowner with **one local pro** for a **free quote**. That is the only offer. The
trades are painting and hardscaping (`outdoor-construction`).

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
- **No made-up customers, reviews or testimonials.** GoodFit Pros speaks as itself and talks about the pro in the
  third person. It never speaks as the contractor or as a homeowner.
- **Only facts you can see.** Use only facts visible in the photos or written in their descriptions. Never invent
  an age, a street or a town for a job. Never say or hint where a pictured job was.
- **One job per story.**
  - An ad made for one photo (`makeFromPhoto`) shows that job only.
  - A before/after shows one job, before first.
  - Never open or close on a before.
- **Every ad is built on a real competitor ad.** It must be a long-running one from the competitor table. Keep its
  shape and kind of opening, never its claims. If a trade has no competitor ads on file, make no ads for it.
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
