# Poster brief

**Date:** 24 November 2026. Written by the team leader for the poster team.

## Why this batch exists

The owner rejected the first batch of pictures: "this is not the intro to a video". They were phone selfies with caption stickers on top. They looked like video thumbnails, not advertising. The owner asked for a team of poster advertising people and a new batch.

## What we are selling

An offer, not an object: **a sponsor chosen for your small YouTube channel. Free to apply. You pay only if a deal is done.** For YouTube channels with 1,000 to 50,000 subscribers. The one action: **Apply**, at smallfold.netlify.app/apply.

Facts and hard rules are in `marketing/v2/product-brief.md` (sections 2 and 9). The short version:

- May say: for channels with 1,000 to 50,000 subscribers; a person picks a sponsor to suggest; no algorithm; you can say no; free to apply; no deal, no commission.
- Never: "you will get a sponsor" or anything that reads as a guarantee; money amounts; results, reviews, ratings or testimonials; counts of creators or deals; urgency or scarcity; the company's story or mission; other companies' logos or names (including YouTube's logo and play button); real people.
- The commission percentages and "reply in 2 working days" are not confirmed. Do not use them.

## The campaign idea: the blank

**"Sponsored by ____."** A small YouTuber does every job on the channel. The one thing they cannot give themselves is the sponsor. Every poster shows that sponsor-shaped hole and says it is something they can apply to fill, free, from 1,000 subscribers. The blank is drawn as a thick pen-blue bar and is never filled in. The owner approved this idea ("The Line").

## What a poster is (and what the last batch was not)

1. **One idea, read in one second.** If it needs a second look to understand, it is not a poster.
2. **Type is the hero or the image is the hero. Never both fighting.** Huge scale contrast: one thing is enormous, everything else is small.
3. **A designed surface.** Flat colour fields, a grid, margins, deliberate white space. No stickers on photographs, no caption plates, no chips, no pills, no interface look.
4. **Few words.** Headline of 7 words or fewer. One support line. A footer.
5. **No selfies, no phone-camera look, no faces filling the frame.** If a person appears, they are staged like a poster (small figure, graphic silhouette, or a studio shot), never a talking head.
6. **It should look good printed and pinned to a wall.**

## Fixed elements on every poster

- The headline or the visual contains the word **sponsor**, readable at a glance.
- Support line that carries the offer: **"Got 1,000 to 50,000 subs? Apply for a sponsor. It's free."** (may be re-broken or shortened to "1,000 to 50,000 subs? Free to apply for a sponsor.")
- A quiet footer strip, set small like the legal line of a real poster:
  - the real Smallfold logo (`src/assets/logo/logo.svg` on light, `logo-on-ink.svg` on dark), never next to the blank
  - **Apply** and **smallfold.netlify.app/apply**
  - **Applying doesn't promise a sponsor.**
  - **Image made with AI** on any poster that uses a generated picture
- No "Pretend" tags, no "AI actor" tags: posters do not show people acting out sponsor reads.

## Formats

- **4:5, 1080 x 1350** (the main one: Instagram and Facebook feed).
- **9:16, 1080 x 1920** (Stories and Reels placements). Keep everything important out of the top 14% and the bottom 20%.

## How the posters are made

- Built as HTML and CSS and rendered to PNG with Playwright. All type is real type; nothing typed is ever generated.
- Typefaces available as woff2 in `marketing/v2/posters/fonts/`: Anton, Archivo Black, Bebas Neue, Big Shoulders Display (800, 900), Archivo Narrow (500, 700), Space Grotesk (500, 700), DM Serif Display (regular, italic), Inter (800, 900), and the brand's own Newsreader (300, 400, with italics) and Instrument Sans (500, 600).
- **Higgsfield makes only the hero pictures**: an object or a scene with no text in it, art-directed like a poster photograph (studio seamless background in one flat colour, hard directional light, strong shadow), or a cut-out object on a transparent background. No people's faces.
- Budget for pictures: **4.16 Higgsfield credits in total.** Quotes so far: a cut-out or simple image about 0.75 credits; a top-quality 2K image about 2. So the whole batch can use about four generated pictures. Posters that need no picture cost nothing, and several of the strongest poster ideas are pure type.

## Brand anchors

- Pen blue `#2B44D6` (light backgrounds) and `#A8B4FF` (dark backgrounds): the blank and the Apply mark.
- Ink `#0E0E0E`, cream `#F1EFEB`.
- The series may add its own loud poster colours, as long as blue stays the colour of the blank.

## Seed ideas from the team leader (to beat, not to obey)

1. **The monument.** The sentence set enormous: "THIS VIDEO IS SPONSORED BY" and then a giant blue bar where the name should be. Pure type.
2. **The film poster.** A cinema one-sheet for a one-person channel, with a tall condensed billing block: "WRITTEN BY YOU. FILMED BY YOU. EDITED BY YOU. SPONSORED BY ____."
3. **The checklist.** "First video. First comment. First 1,000 subs." all ticked, then an empty box: "First sponsor."
4. **Not 100K.** A giant "100K" struck through by hand, "1K" beside it: you can apply for a sponsor from 1,000 subscribers.
5. **The name tag.** A "HELLO, my sponsor is ____" badge.
6. **The packshot.** A plain white blank box photographed like a luxury product on a flat colour: "Today's sponsor: ____".
7. **The wanted notice.** "WANTED: a sponsor. For one small YouTube channel."
8. **The empty plinth.** A museum plinth under a spotlight with nothing on it: "First sponsor: ____".
