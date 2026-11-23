# 5. Next First, static only (38 as a video; kept as a still)

Still image for the Meta feed, in 1:1 (1080 x 1080) and 9:16 (1080 x 1920). One image per format, no motion. Style: see `style.md`. All words are graphics added over the picture; none is generated.

## Pitch and promise

- **Pitch:** A shelf of a small creator's milestones, each with a handmade trophy, and one stand left empty.
- **Promise:** After your first 1,000 subscribers, the next first is one you can apply for, free.
- **Picture to generate:** one image of a sunny shelf in a creator's room: a wooden star, a paper star and a tiny gold-painted cup (all handmade, no engraving, no plaque, no lettering), and one plain empty stand in a patch of sun. No person, so no "AI actor" label. Nothing in the picture says or implies a sponsor.
- **Fix applied:** the clay play-shape trophy is now a plain wooden star, because the play shape imitates another company's mark.
- **The blank:** "____" on the label over the empty stand, in pen blue, never filled. The stand stays empty.

## Layout 9:16 (1080 x 1920)

Safe zones kept clear of text: top 10%, bottom 20%, and the right 12% of the lower half. Text column is x 6% to 86%. The shelf has four tiers; the first three each hold a trophy and its label, the fourth is the empty stand.

| Element | Position (from top-left, % of frame) | Size | Exact words |
|---|---|---|---|
| label | x 6%, y 10.5% | 2.1% of height (about 40 px) | "Made with AI" |
| logo | x 62%, y 10.5% | box 32% wide, 4.5% high | "LOGO (real file)" |
| headline | x 6%, y 15.5% | 5% of height (about 96 px) | "1,000 to 50,000 subs? Free to apply." |
| picture: wooden star | x 8%, y 37.6%, 15% wide, 5.6% high | (image) | none |
| shelf label | x 24%, y 38.3% | 2.8% of height (about 54 px) | "First video" |
| picture: paper star | x 8%, y 45%, 15% wide, 5.6% high | (image) | none |
| shelf label | x 24%, y 45.7% | 2.8% of height (about 54 px) | "First comment" |
| picture: gold-painted cup | x 8%, y 52.4%, 15% wide, 5.6% high | (image) | none |
| shelf label | x 24%, y 53.1% | 2.8% of height (about 54 px) | "First 1,000 subs" |
| picture: sun patch | x 5%, y 58.8%, 90% wide, 7.4% high | (image) | none |
| picture: empty stand | x 8%, y 59.8%, 15% wide, 5.6% high | (image) | none |
| headline | x 24%, y 60.5% | 2.8% of height (about 54 px) | "First sponsor: ____" |
| button | x 6%, y 68.3% | pill 56% wide, 6.5% high; word 4.2% of height | "Apply" |
| small print | x 6%, y 76.2% | 2.2% of height (about 42 px) | "Applying doesn't promise a sponsor." |

## Layout 1:1 (1080 x 1080)

Five percent margin on all sides. The shelf runs left to right with four slots; each label sits above its trophy and wraps to two lines.

| Element | Position (from top-left, % of frame) | Size | Exact words |
|---|---|---|---|
| label | x 5%, y 5% | 3% of height (about 32 px) | "Made with AI" |
| logo | x 72%, y 5% | box 23% wide, 6% high | "LOGO (real file)" |
| headline | x 5%, y 14% | 6.2% of height (about 67 px) | "1,000 to 50,000 subs? Free to apply." |
| picture: wooden star | x 9%, y 50%, 12% wide, 14% high | (image) | none |
| shelf label | x 5%, y 38% | 3% of height (about 32 px) | "First video" |
| picture: paper star | x 32%, y 50%, 12% wide, 14% high | (image) | none |
| shelf label | x 28%, y 38% | 3% of height (about 32 px) | "First comment" |
| picture: gold-painted cup | x 55%, y 50%, 12% wide, 14% high | (image) | none |
| shelf label | x 51%, y 38% | 3% of height (about 32 px) | "First 1,000 subs" |
| picture: sun patch | x 72%, y 36%, 24% wide, 32% high | (image) | none |
| picture: empty stand | x 77%, y 50%, 12% wide, 14% high | (image) | none |
| headline | x 73%, y 38% | 3% of height (about 32 px) | "First sponsor: ____" |
| button | x 5%, y 76% | pill 34% wide, 11% high; word 5% of height | "Apply" |
| small print | x 5%, y 91% | 2.8% of height (about 30 px) | "Applying doesn't promise a sponsor." |

Colours: background cream-yellow `#FFF3CF`; label plates cream `#F1EFEB` with ink text, the label over the empty stand on yellow `#FFD21F`; headline on a yellow plate; Apply button pen blue `#2B44D6` with cream word; blank pen blue.

## Muted and glance read

Fully readable without sound: "1,000 to 50,000 subs? Free to apply." is the first thing read, then three labels the right viewer recognises (First video, First comment, First 1,000 subs), then the empty stand "First sponsor: ____".

## Two alternative layouts for tests

1. **Blank first.** Crop tight on the empty stand and its label "First sponsor: ____" at 5% of height, the other three labels cropped out; headline and button unchanged.
2. **Headline lower.** Move the headline under the shelf (9:16: y 66%, button y 74%) so the picture leads. Check that nothing crosses y 80%.

## Risks for AI generation and how the design avoids them

| Risk | How the design avoids it |
|---|---|
| Letters or engraving on trophies | Prompt for no text, no plaque, no engraving. Every label is a graphic. Reject any image with marks. |
| The empty stand gets filled | The stand is described as empty in the prompt and checked; if anything appears on it, paint it out in the edit. It must stay empty. |
| Play-button look | No triangle, no play shape anywhere. The star is plain wood. |
| Handmade look turns to a real award | Trophies are small, wobbly and painted cardboard, wood and paper. No ribbons, no medals, no podium. |
| Labels crossing the safe zones in 9:16 | All labels are inside x 6% to 86% and y 10% to 80% (checked). |

## Honesty check

- No sponsor, brand, money, result or celebration anywhere; the stand stays empty and the blank stays blank.
- "Made with AI" is on the image. No person, so no "AI actor" and no "Pretend".
- "Applying doesn't promise a sponsor." is on both formats at 2.2% (9:16) and 2.8% (1:1) of height.
